"""Server-wide, restart-safe last valid Tesla telemetry for Energy Studio.

The cache is a Home Assistant entity (RestoreEntity), not per-browser storage.
Only data from the configured sensors is read; no Tesla wake command is sent.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import math

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import PERCENTAGE, UnitOfLength
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import dt as dt_util

from .const import DEFAULTS, DOMAIN, TESLA_STALE_SECONDS

_LOGGER = logging.getLogger(__name__)

TESLA_METRICS = (
    ("model3", "Model 3", "soc", "SoC", 100),
    ("model3", "Model 3", "range", "Reichweite", 10000),
    ("modely", "Model Y", "soc", "SoC", 100),
    ("modely", "Model Y", "range", "Reichweite", 10000),
)

def parse_valid(raw: object, maximum: float) -> float | None:
    try:
        value = float(raw)
    except (ValueError, TypeError):
        return None
    return value if math.isfinite(value) and 0 <= value <= maximum else None


def source_timestamp(state) -> datetime | None:
    if state is None:
        return None
    value = getattr(state, "last_reported", None) or getattr(state, "last_updated", None)
    if value is None:
        return None
    try:
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    except (ValueError, TypeError, AttributeError):
        return None


def awake_state(hass: HomeAssistant, entity_id: str) -> bool:
    if not entity_id:
        return True
    state = hass.states.get(entity_id)
    return state is not None and state.state.lower() in {
        "on", "awake", "online", "connected", "true",
    }


class TeslaCachedSensor(SensorEntity, RestoreEntity):
    """Last valid telemetry, shared by all dashboard clients and persisted by HA."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, vehicle: str,
                 vehicle_name: str, metric: str, label: str, maximum: float) -> None:
        self.hass = hass
        self.entry = entry
        self.vehicle = vehicle
        self.metric = metric
        self.maximum = maximum
        self._attr_name = f"Tesla {vehicle_name} {label} zuletzt"
        self._attr_unique_id = f"{entry.entry_id}_{vehicle}_{metric}_last_valid"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Custom integration",
            model="Marstek PV rule controller",
        )
        self._attr_native_unit_of_measurement = (
            PERCENTAGE if metric == "soc" else UnitOfLength.KILOMETERS
        )
        if metric == "soc":
            self._attr_device_class = SensorDeviceClass.BATTERY
        self._value: float | None = None
        self._reported_at: datetime | None = None
        self._fresh = False
        self._source_online = False

    def _option(self, field: str) -> str:
        return str(self.entry.options.get(
            f"{self.vehicle}_{field}", DEFAULTS[f"{self.vehicle}_{field}"]
        ) or "")

    @property
    def native_value(self) -> float | None:
        return self._value

    @property
    def extra_state_attributes(self) -> dict:
        return {
            "fresh": self._fresh,
            "source_online": self._source_online,
            "source_entity": self._option(self.metric),
            "reported_at": self._reported_at.isoformat() if self._reported_at else None,
        }

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        previous = await self.async_get_last_state()
        if previous is not None:
            saved = parse_valid(previous.state, self.maximum)
            if saved is not None:
                self._value = saved
                reported = previous.attributes.get("reported_at")
                if reported:
                    self._reported_at = source_timestamp(
                        type("_Time", (), {"last_reported": reported})()
                    )
        self._refresh()
        self.async_on_remove(async_track_time_interval(
            self.hass, self._on_interval, timedelta(seconds=15)
        ))

    @callback
    def _on_interval(self, _now) -> None:
        self._refresh()

    @callback
    def _refresh(self) -> None:
        source_id = self._option(self.metric)
        source = self.hass.states.get(source_id) if source_id else None
        value = parse_valid(source.state, self.maximum) if source else None
        awake = awake_state(self.hass, self._option("awake"))
        reported = source_timestamp(source) if value is not None else None
        now = dt_util.utcnow()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        valid_report = (
            awake and value is not None and reported is not None
            and reported <= now + timedelta(minutes=1)
        )
        # Never replace cached data with unknown/unavailable, out-of-range data,
        # or values while the optional vehicle state reports sleeping/offline.
        if valid_report and (
            self._value is None or self._reported_at is None
            or reported > self._reported_at
        ):
            self._value = value
            self._reported_at = reported
        online = bool(valid_report and self._reported_at == reported
                      and self._value == value)
        fresh = bool(online and now - reported <= timedelta(seconds=TESLA_STALE_SECONDS))
        if (self._source_online, self._fresh) != (online, fresh) or (
            valid_report and self._reported_at == reported and self._value == value
        ):
            self._source_online = online
            self._fresh = fresh
            self.async_write_ha_state()
