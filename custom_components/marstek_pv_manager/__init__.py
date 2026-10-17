"""Marstek PV Manager - control existing Home Assistant entities."""
from __future__ import annotations

import asyncio
from datetime import timedelta
import logging
import math
from collections.abc import Callable

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import DEFAULTS, PARAMETERS
from .logic import Decision, Inputs, Settings, evaluate

_LOGGER = logging.getLogger(__name__)
PLATFORMS = [Platform.NUMBER, Platform.SENSOR, Platform.SWITCH]


class MarstekController:
    """Serialized 7-second control loop. Never opens a Modbus connection itself."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.enabled = bool(entry.options.get("enabled", False))
        self.emergency_enabled = False  # Never resume grid charge automatically after restart
        self.decision = Decision("disabled", None, None, 0, 0, 0, "disabled")
        self._listeners: list[Callable[[], None]] = []
        self._busy = False
        self._write_lock = asyncio.Lock()

    def entity(self, key: str) -> str:
        value = self.entry.options.get(key, DEFAULTS[key])
        # Older entries could contain an empty optional SoC mapping.
        if key == "marstek_soc" and not value:
            return str(DEFAULTS[key])
        return str(value)

    def _device_max(self, *keys: str) -> int | None:
        """Read numeric upper bounds advertised by the source Number entities."""
        maxima = []
        for key in keys:
            state = self.hass.states.get(self.entity(key))
            if state is None:
                continue
            raw = state.attributes.get("max")
            if raw is None:
                continue
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if math.isfinite(value) and value >= 0:
                maxima.append(int(value))
        return min(maxima) if maxima else None

    def requested_power_limit(self, key: str) -> int:
        return max(0, min(2500, int(self.entry.options.get(key, DEFAULTS[key]))))

    def settings(self) -> Settings:
        values = {key: int(self.entry.options.get(key, DEFAULTS[key]))
                  for key in PARAMETERS}
        values["max_charge_w"] = self.requested_power_limit("max_charge_w")
        values["max_discharge_w"] = self.requested_power_limit("max_discharge_w")
        values["emergency_charge_w"] = self.requested_power_limit("emergency_charge_w")
        values["emergency_soc_target"] = self.requested_emergency_soc_target()
        charge_cap = self._device_max("charge_setpoint")
        discharge_cap = self._device_max("discharge_setpoint", "max_discharge")
        if charge_cap is not None:
            values["max_charge_w"] = min(values["max_charge_w"], charge_cap)
            values["emergency_charge_w"] = min(values["emergency_charge_w"], charge_cap)
        if discharge_cap is not None:
            values["max_discharge_w"] = min(values["max_discharge_w"], discharge_cap)
        return Settings(**values)

    def requested_emergency_soc_target(self) -> int:
        return max(50, min(100, int(self.entry.options.get(
            "emergency_soc_target", DEFAULTS["emergency_soc_target"]))))

    async def async_set_emergency(self, enabled: bool) -> None:
        """Single controller owns both normal and emergency control paths."""
        if enabled:
            if not self.enabled:
                raise HomeAssistantError("Zuerst 'Regelung aktiv' einschalten")
            if self._boolean("night") is not False:
                raise HomeAssistantError("10%-Nachtladung aktiv/Status unbekannt; keine Übernahme")
            if self._float("marstek_soc") is None:
                raise HomeAssistantError("Marstek-SoC fehlt; Netzladung wird nicht gestartet")
        self.emergency_enabled = enabled
        for listener in list(self._listeners):
            listener()
        if self.enabled:
            self.hass.async_create_task(self.async_tick())

    async def async_set_power_limit(self, key: str, value: int) -> None:
        """Persist dashboard control values and apply them in the next cycle."""
        if key == "emergency_soc_target":
            if value < 50 or value > 100:
                raise ValueError("Emergency target SoC must be 50..100%")
        elif key in ("max_charge_w", "max_discharge_w", "emergency_charge_w"):
            if value < 0 or value > 2500 or value % 100:
                raise ValueError("Power limit must be 0..2500 W in 100-W steps")
        else:
            raise ValueError(f"Unknown limit: {key}")
        if int(self.entry.options.get(key, DEFAULTS[key])) == value:
            return
        self.hass.config_entries.async_update_entry(
            self.entry, options={**self.entry.options, key: value}
        )
        # The 7-second interval reads the new limit; trigger a faster cycle.
        self.hass.async_create_task(self.async_tick())
        for listener in list(self._listeners):
            listener()

    @callback
    def subscribe(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener) if listener in self._listeners else None

    @callback
    def _publish(self, decision: Decision) -> None:
        self.decision = decision
        for listener in list(self._listeners):
            listener()

    def _raw(self, key: str) -> str | None:
        state = self.hass.states.get(self.entity(key))
        if state is None or state.state in ("unknown", "unavailable"):
            return None
        return state.state

    def _float(self, key: str) -> float | None:
        value = self._raw(key)
        if value is None:
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number if math.isfinite(number) else None

    def _boolean(self, key: str) -> bool | None:
        state = self._raw(key)
        return {"on": True, "off": False}.get(state)

    def _inputs(self) -> Inputs:
        return Inputs(
            pv_total=self._float("pv_total"), grid=self._float("grid"),
            solax_battery=self._float("solax_battery"),
            solax_soc=self._float("solax_soc"),
            wallbox=self._float("wallbox"),
            necharge_power=self._float("necharge_power"),
            necharge_active=self._boolean("necharge_active"),
            heaters=tuple(self._boolean(f"heater_{i}") for i in range(1, 7)),
            marstek_ac=self._float("marstek_ac"),
            charge_setpoint=self._float("charge_setpoint"),
            discharge_setpoint=self._float("discharge_setpoint"),
            max_discharge=self._float("max_discharge"),
            user_mode=self._raw("user_mode"),
            forced_mode=self._raw("forced_mode"),
            rs485=self._boolean("rs485"),
            night=self._boolean("night"),
            marstek_soc=self._float("marstek_soc"),
        )

    @callback
    def refresh_options(self) -> None:
        self.enabled = bool(self.entry.options.get("enabled", False))
        if not self.enabled:
            self.emergency_enabled = False
            self._publish(Decision("disabled", None, None, 0, 0, 0, "disabled"))

    async def async_set_enabled(self, enabled: bool) -> None:
        was_emergency = self.emergency_enabled
        if not enabled:
            # Stop ALL new controller writes before zeroing setpoints: a pending
            # cycle must not restore forced grid charging after switch-off.
            self.enabled = False
            self.emergency_enabled = False
            if was_emergency:
                await self._force_stop_emergency()
        else:
            self.enabled = True
        self.hass.config_entries.async_update_entry(
            self.entry, options={**self.entry.options, "enabled": enabled}
        )
        if enabled:
            self.hass.async_create_task(self.async_tick())
        else:
            self._publish(Decision("disabled", None, None, 0, 0, 0, "disabled"))

    def _can_write(self) -> bool:
        """Recheck night-charge ownership before every command."""
        return self.enabled and self._boolean("night") is False

    async def _call(self, domain: str, service: str, target: str,
                    **service_data: object) -> None:
        async with self._write_lock:
            if not self._can_write():
                return
            await self.hass.services.async_call(
                domain, service, {"entity_id": target, **service_data}, blocking=True
            )

    async def _force_stop_emergency(self) -> None:
        """After controller shutdown, set both powers to zero; do not race writes."""
        async with self._write_lock:
            if self._boolean("night") is not False:
                _LOGGER.warning("Night control owns Modbus; cannot zero emergency setpoint")
                return
            for key in ("charge_setpoint", "discharge_setpoint"):
                await self.hass.services.async_call(
                    "number", "set_value",
                    {"entity_id": self.entity(key), "value": 0}, blocking=True,
                )

    async def _set_number(self, key: str, value: int) -> None:
        current = self._float(key)
        if current is None or abs(current - value) > 1:
            # A configured 2500-W UI ceiling does not override device limits.
            state = self.hass.states.get(self.entity(key))
            if state is not None:
                for bound, name in (("min", "minimum"), ("max", "maximum")):
                    limit = state.attributes.get(bound)
                    if limit is None:
                        continue
                    try:
                        limit = float(limit)
                    except (TypeError, ValueError):
                        continue
                    if math.isfinite(limit) and (
                        (bound == "min" and value < limit)
                        or (bound == "max" and value > limit)
                    ):
                        raise HomeAssistantError(
                            f"{key}: {value} W outside device {name} {limit:g} W"
                        )
            await self._call("number", "set_value", self.entity(key), value=value)

    async def _set_select(self, key: str, value: str) -> None:
        if self._raw(key) != value:
            await self._call("select", "select_option", self.entity(key), option=value)

    async def _turn_on_rs485(self) -> None:
        if self._boolean("rs485") is not True:
            await self._call("switch", "turn_on", self.entity("rs485"))

    def _evaluate(self) -> Decision:
        return evaluate(
            self._inputs(), self.settings(), dt_util.now().hour,
            self.enabled, self.emergency_enabled,
        )

    async def _apply(self, d: Decision) -> None:
        """Respect ordering and 1-second reverse-power delay in the YAML."""
        if d.mode in ("charge", "emergency_charge"):
            raw = self._float("discharge_setpoint")
            if raw is not None and raw > 1:
                await self._set_number("discharge_setpoint", 0)
                await asyncio.sleep(1)
            await self._set_select("user_mode", "anti_feed")
            await self._set_select("forced_mode", "charge")
            await self._turn_on_rs485()
            # Only charge if reverse setpoint is confirmed zero and charge is still allowed.
            reverse = self._float("discharge_setpoint")
            latest = self._evaluate()
            if reverse is not None and reverse <= 1 and latest.mode in ("charge", "emergency_charge"):
                # Use the FRESH decision, not the pre-await value: slider may
                # have been lowered while we were switching modes.
                await self._set_number("charge_setpoint", latest.charge_w or 0)
            elif latest.mode == "idle":
                await self._set_number("charge_setpoint", 0)
        elif d.mode == "discharge":
            raw = self._float("charge_setpoint")
            if raw is not None and raw > 1:
                await self._set_number("charge_setpoint", 0)
                await asyncio.sleep(1)
            # Recheck immediate blockers before activating discharge.
            latest = self._inputs()
            latest_decision = self._evaluate()
            if latest_decision.mode != "discharge":
                return
            await self._set_select("user_mode", "anti_feed")
            await self._set_select("forced_mode", "discharge")
            await self._turn_on_rs485()
            if self._float("max_discharge") != self.settings().max_discharge_w:
                await self._set_number("max_discharge", self.settings().max_discharge_w)
            reverse = self._float("charge_setpoint")
            latest = self._evaluate()
            if reverse is not None and reverse <= 1 and latest.mode == "discharge":
                await self._set_number("discharge_setpoint", latest.discharge_w or 0)
            elif latest.mode == "idle":
                await self._set_number("discharge_setpoint", 0)
        elif d.mode in ("idle", "emergency_hold", "emergency_blocked"):
            errors = []
            for key in ("charge_setpoint", "discharge_setpoint"):
                try:
                    await self._set_number(key, 0)
                except HomeAssistantError as exc:
                    errors.append(str(exc))
            if errors:
                raise HomeAssistantError("; ".join(errors))
        # disabled, night and unavailable: never write.

    async def async_tick(self) -> None:
        if self._busy:
            return  # equivalent to YAML mode: single/max_exceeded: silent
        self._busy = True
        try:
            d = self._evaluate()
            self._publish(d)
            await self._apply(d)
        except (HomeAssistantError, ValueError, TypeError) as exc:
            _LOGGER.warning("Marstek rule cycle failed: %s", exc)
            self._publish(Decision("unavailable", None, None, 0, 0, 0, "service_error"))
        finally:
            self._busy = False


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Apply changed options without tearing down timers or entities."""
    entry.runtime_data.refresh_options()


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    controller = MarstekController(hass, entry)
    entry.runtime_data = controller
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    @callback
    def _on_interval(_now: object) -> None:
        hass.async_create_task(controller.async_tick())

    entry.async_on_unload(async_track_time_interval(hass, _on_interval, timedelta(seconds=7)))
    hass.async_create_task(controller.async_tick())
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Avoid orphaned forced grid charge when unloading/reloading integration."""
    controller = entry.runtime_data
    was_emergency = controller.emergency_enabled
    controller.enabled = False
    controller.emergency_enabled = False
    if was_emergency:
        try:
            await controller._force_stop_emergency()
        except (HomeAssistantError, ValueError) as exc:
            _LOGGER.error("Unable to stop emergency charge on unload: %s", exc)
            return False
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
