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
from .logic import Decision, Inputs, Settings, NightPlan, evaluate, evaluate_night

_LOGGER = logging.getLogger(__name__)
PLATFORMS = [Platform.NUMBER, Platform.SENSOR, Platform.SWITCH]


class MarstekController:
    """Serialized 7-second control loop. Never opens a Modbus connection itself."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.enabled = bool(entry.options.get("enabled", False))
        self.emergency_enabled = False  # Never resume grid charge automatically after restart
        self.sync_charge_limit = bool(entry.options.get("sync_charge_limit", False))
        # Safe migration: existing installations cannot start the new night mode by updating.
        self.night_enabled = bool(entry.options.get("night_enabled", False))
        self._night_active = False
        self._night_restore_pending = self.night_enabled  # Re-adopt a restored guard on HA restart
        self._night_resume_pending = bool(entry.options.get("night_resume_pending", False))
        self.night_status = "Warte auf Start" if self.night_enabled else "Deaktiviert"
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
        charge_cap = self._device_max("charge_setpoint", "max_charge")
        # With automatic hardware synchronization disabled, the currently
        # programmed Modbus hardware cap is an additional hard limit.
        # Never advertise 2500 W as effective if the device is still at 2000.
        physical_charge_cap = self._float("max_charge")
        if not self.sync_charge_limit and physical_charge_cap is not None:
            charge_cap = (int(physical_charge_cap) if charge_cap is None
                          else min(charge_cap, int(physical_charge_cap)))
        discharge_cap = self._device_max("discharge_setpoint", "max_discharge")
        if charge_cap is not None:
            values["max_charge_w"] = min(values["max_charge_w"], charge_cap)
            values["emergency_charge_w"] = min(values["emergency_charge_w"], charge_cap)
        if discharge_cap is not None:
            values["max_discharge_w"] = min(values["max_discharge_w"], discharge_cap)
        return Settings(**values)

    def requested_pv_display_max(self) -> int:
        """Only the dashboard PV signal full-scale: not a charging power limit."""
        raw = self.entry.options.get("pv_display_max_w", DEFAULTS["pv_display_max_w"])
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return 8400
        return max(8000, min(14000, value))

    async def async_set_pv_display_max(self, value: int) -> None:
        """Persist display preference without triggering any physical control cycle."""
        if not 8000 <= value <= 14000 or value % 100:
            raise HomeAssistantError("PV-Anzeige Maximum: 8000–14000 W in 100-W-Schritten")
        if self.requested_pv_display_max() == value:
            return
        self.hass.config_entries.async_update_entry(
            self.entry, options={**self.entry.options, "pv_display_max_w": value}
        )
        for listener in list(self._listeners):
            listener()

    def requested_emergency_soc_target(self) -> int:
        return max(50, min(100, int(self.entry.options.get(
            "emergency_soc_target", DEFAULTS["emergency_soc_target"]))))

    def night_levels(self) -> tuple[int, int]:
        """Persisted integer SoC thresholds: start at the displayed percent."""
        start = int(self.entry.options.get("night_start_soc", DEFAULTS["night_start_soc"]))
        target = int(self.entry.options.get("night_target_soc", DEFAULTS["night_target_soc"]))
        return start, target

    def night_start_boundary(self) -> int:
        start, target = self.night_levels()
        return min(start + 1, target)

    async def async_set_emergency(self, enabled: bool) -> None:
        """Single controller owns both normal and emergency control paths."""
        if enabled:
            if not self.enabled:
                raise HomeAssistantError("Zuerst 'Regelung aktiv' einschalten")
            if self._boolean("night") is not False or self._night_active:
                raise HomeAssistantError("10%-Nachtladung aktiv/Status unbekannt; keine Übernahme")
            soc = self._float("marstek_soc")
            if (self.night_enabled and 0 <= dt_util.now().hour < 6
                    and soc is not None and soc < self.night_start_boundary()):
                raise HomeAssistantError("Mindest-SoC-Nachtladung hat Vorrang")
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
        elif key in ("night_start_soc", "night_target_soc"):
            lower = 9 if key == "night_start_soc" else 10
            upper = 50 if key == "night_start_soc" else 100
            if value < lower or value > upper:
                raise HomeAssistantError(f"{key}: erlaubter Bereich {lower}–{upper} %")
            start, target = self.night_levels()
            if key == "night_start_soc":
                start = value
            else:
                target = value
            if start >= target:
                raise HomeAssistantError(
                    "Nachtladung: Ziel-SoC muss höher als Start-SoC sein. "
                    "Bitte zuerst den Zielwert erhöhen oder den Startwert senken."
                )
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
        self.night_enabled = bool(self.entry.options.get("night_enabled", False))
        self.sync_charge_limit = bool(self.entry.options.get("sync_charge_limit", False))
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
            if was_emergency and not self._night_active:
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

    async def async_set_night_enabled(self, enabled: bool) -> None:
        """Night reserve is independent of the main PV controller switch."""
        if enabled == self.night_enabled:
            return
        if enabled:
            if self._boolean("night") is not False:
                raise HomeAssistantError(
                    "Nachtlade-Helfer ist bereits aktiv/unbekannt. Alte Nacht-YAML "
                    "deaktivieren und Helferstatus prüfen, dann erneut versuchen."
                )
            self.night_enabled = True
            self._night_restore_pending = False
        else:
            # Never release ownership until the device setpoint was stopped.
            if self._night_active:
                await self._stop_night("Nachtladung manuell beendet")
            self.night_enabled = False
            self._night_resume_pending = False
            self.night_status = "Deaktiviert"
        self.hass.config_entries.async_update_entry(
            self.entry, options={**self.entry.options,
                                 "night_enabled": enabled, "night_resume_pending": False}
        )
        for listener in list(self._listeners):
            listener()
        self.hass.async_create_task(self.async_tick())

    async def async_set_charge_limit_sync(self, enabled: bool) -> None:
        """Optional, persisted consent to adjust the physical Marstek charge cap."""
        if enabled:
            if self._float("max_charge") is None or self._device_max("max_charge") is None:
                raise HomeAssistantError("Geräte-Ladegrenze ist nicht verfügbar")
            # No automatic writes during the night owner's operation.
            if self._night_active or self._boolean("night") is not False:
                raise HomeAssistantError("Nachtladung hat Vorrang")
        self.sync_charge_limit = enabled
        self.hass.config_entries.async_update_entry(
            self.entry, options={**self.entry.options, "sync_charge_limit": enabled}
        )
        for listener in list(self._listeners):
            listener()
        if self.enabled:
            self.hass.async_create_task(self.async_tick())

    def effective_device_charge_limit(self) -> int | None:
        """Current maximum charge register value, for user diagnostics."""
        limit = self._float("max_charge")
        return int(limit) if limit is not None and limit >= 0 else None

    async def _sync_device_charge_limit(self, mode: str) -> bool:
        """Sync only during an active charge, using verified Modbus bounds.

        Returning False defers a charge-power increase until the limit register
        has been observed at the expected value. Never overrides night ownership.
        """
        if not self.sync_charge_limit:
            return True
        if not self._can_write() or mode not in ("charge", "emergency_charge"):
            return False
        target = (self.requested_power_limit("emergency_charge_w")
                  if mode == "emergency_charge" else self.requested_power_limit("max_charge_w"))
        if target <= 0:
            return True  # power setpoint=0 already disables charging
        registered = self.hass.states.get(self.entity("max_charge"))
        current = self._float("max_charge")
        if registered is None or current is None:
            raise HomeAssistantError("Geräte-Ladegrenze nicht verfügbar")
        try:
            min_limit = float(registered.attributes["min"])
            max_limit = float(registered.attributes["max"])
        except (KeyError, TypeError, ValueError) as exc:
            raise HomeAssistantError("Geräte-Ladegrenzen unbekannt") from exc
        if not (math.isfinite(min_limit) and math.isfinite(max_limit)
                and min_limit <= target <= max_limit):
            raise HomeAssistantError(
                f"Gewünschtes Gerätelimit {target} W außerhalb {min_limit}..{max_limit} W"
            )
        if abs(current - target) > 1:
            await self._set_number("max_charge", target)
        refreshed = self._float("max_charge")
        return refreshed is not None and abs(refreshed - target) <= 1

    def _night_control_valid(self) -> bool:
        return (all(self._raw(k) is not None for k in ("user_mode", "forced_mode"))
                and self._boolean("rs485") is not None
                and self._float("charge_setpoint") is not None
                and self._float("discharge_setpoint") is not None)

    async def _night_call(self, domain: str, service: str, entity_id: str,
                          **kwargs: object) -> None:
        """The night owner uses the same serialized write lock as PV/emergency."""
        async with self._write_lock:
            stopping = (domain == "number" and service == "set_value"
                        and kwargs.get("value") == 0)
            if not self._night_active or (self._boolean("night") is not True and not stopping):
                raise HomeAssistantError("Nachtladung: Besitz des Sperrhelfers verloren")
            await self.hass.services.async_call(
                domain, service, {"entity_id": entity_id, **kwargs}, blocking=True
            )

    async def _night_number(self, key: str, value: int) -> None:
        state = self.hass.states.get(self.entity(key))
        if state is None or self._float(key) is None:
            raise HomeAssistantError(f"Nachtladung: {key} nicht verfügbar")
        try:
            lo = float(state.attributes.get("min", 0))
            hi = float(state.attributes.get("max", 2500))
        except (TypeError, ValueError) as exc:
            raise HomeAssistantError(f"Ungültige Gerätegrenze: {key}") from exc
        if not lo <= value <= hi:
            raise HomeAssistantError(f"Nachtladung: {value} W außerhalb {lo}..{hi} W")
        if abs(self._float(key) - value) > 1:
            await self._night_call("number", "set_value", self.entity(key), value=value)

    async def _night_select(self, key: str, value: str) -> None:
        if self._raw(key) != value:
            await self._night_call("select", "select_option", self.entity(key), option=value)

    async def _night_apply_charge(self) -> None:
        """Mutually exclusive discharge=0, anti_feed, force charge, RS485, 400 W."""
        await self._night_number("discharge_setpoint", 0)
        reverse = self._float("discharge_setpoint")
        if reverse is None or reverse > 1:
            # Read-back must confirm discharge is zero before any charging.
            return
        await self._night_select("user_mode", "anti_feed")
        await self._night_select("forced_mode", "charge")
        if self._boolean("rs485") is not True:
            await self._night_call("switch", "turn_on", self.entity("rs485"))
        # After awaits, re-evaluate the SoC and time boundary before charging.
        soc = self._float("marstek_soc")
        _, target_soc = self.night_levels()
        if (not self.night_enabled or not 0 <= dt_util.now().hour < 6
                or soc is None or not 0 <= soc < target_soc):
            await self._stop_night("Nachtladung beendet")
            return
        await self._night_number("charge_setpoint", 400)

    async def _stop_night(self, reason: str) -> None:
        """Zero the output BEFORE releasing the old helper to the main manager."""
        if not self._night_active:
            return
        # Allow stopping at any hour, even after disabling the night switch.
        await self._night_number("charge_setpoint", 0)
        await self._night_number("discharge_setpoint", 0)
        # A service return is not necessarily a Modbus confirmation. Wait for
        # the mirrored Number entities to report zero before releasing control.
        if any(self._float(key) is None or abs(self._float(key)) > 1
               for key in ("charge_setpoint", "discharge_setpoint")):
            await asyncio.sleep(0.5)
            if any(self._float(key) is None or abs(self._float(key)) > 1
                   for key in ("charge_setpoint", "discharge_setpoint")):
                raise HomeAssistantError("Nachtladung: Null-Sollwerte noch nicht bestätigt")
        # Only release after both zero values have been confirmed.
        async with self._write_lock:
            guard = self._boolean("night")
            if guard is None:
                raise HomeAssistantError("Nachtlade-Helfer nicht verfügbar; Freigabe nicht sicher")
            if guard:
                await self.hass.services.async_call(
                    "input_boolean", "turn_off", {"entity_id": self.entity("night")},
                    blocking=True,
                )
        self._night_active = False
        self.night_status = reason
        for listener in list(self._listeners):
            listener()

    async def _night_tick(self) -> bool:
        """Return True when night owns or blocks this cycle, else run PV control."""
        guard = self._boolean("night")
        if self._night_restore_pending and guard is not None:
            self._night_restore_pending = False
            if guard:
                self._night_active = True  # Restored helper from pre-restart charge
                _LOGGER.info("Restored active integrated night reserve state")
        soc = self._float("marstek_soc")
        hour = dt_util.now().hour
        plan = evaluate_night(
            enabled=self.night_enabled, active=self._night_active,
            guard=guard, soc=soc, hour=hour,
            control_valid=self._night_control_valid(),
            start_soc=self.night_levels()[0], target_soc=self.night_levels()[1],
        )
        # A clean HA restart intentionally clears the output, but remembers a
        # running charge so it can resume below the configured target, even above start.
        if (self._night_resume_pending and self.night_enabled
                and not self._night_active and guard is False
                and 0 <= hour < 6 and soc is not None
                and 0 <= soc < self.night_levels()[1]
                and 9 <= self.night_levels()[0] <= 50
                and self.night_levels()[0] < self.night_levels()[1] <= 100
                and self._night_control_valid()):
            plan = NightPlan("start", "night_restart_resume")
        if self._night_resume_pending and (not self.night_enabled or not 0 <= hour < 6
                                           or (soc is not None and soc >= self.night_levels()[1])):
            self._night_resume_pending = False
            self.hass.config_entries.async_update_entry(
                self.entry, options={**self.entry.options, "night_resume_pending": False}
            )
        if plan.action == "start":
            # Reserve the guard first. The main PV cycle then stops writing.
            self._night_active = True
            try:
                await self.hass.services.async_call(
                    "input_boolean", "turn_on",
                    {"entity_id": self.entity("night")}, blocking=True,
                )
                if self._boolean("night") is not True:
                    raise HomeAssistantError("Nachtlade-Helfer ließ sich nicht aktivieren")
            except Exception:
                self._night_active = False
                raise
            self.emergency_enabled = False  # Do not resume emergency after 11%.
            if self._night_resume_pending:
                self._night_resume_pending = False
                self.hass.config_entries.async_update_entry(
                    self.entry, options={**self.entry.options, "night_resume_pending": False}
                )
            plan = evaluate_night(
                enabled=True, active=True, guard=self._boolean("night"),
                soc=self._float("marstek_soc"), hour=dt_util.now().hour,
                control_valid=self._night_control_valid(),
                start_soc=self.night_levels()[0], target_soc=self.night_levels()[1],
            )
        if plan.action in ("charge", "stop", "invalid"):
            if plan.action == "charge":
                self.night_status = f"Lädt mit 400 W bis {self.night_levels()[1]} %"
                self._publish(Decision("night_charge", 400, 0, 400, 0, 0,
                                       "night_reserve_charge"))
                await self._night_apply_charge()
            else:
                if plan.action == "invalid":
                    self.night_status = "Messwerte fehlen – Ladeleistung wird gestoppt"
                await self._stop_night(
                    f"{self.night_levels()[1]} % erreicht / Nachtfenster beendet" if plan.action == "stop"
                    else "Messwerte fehlen – Nachtladung beendet"
                )
                self._publish(Decision("night", None, None, 0, 0, 0, plan.reason))
            return True
        if plan.action in ("external", "wait") and guard is None:
            self.night_status = "Nachtlade-Helfer nicht verfügbar"
            self._publish(Decision("unavailable", None, None, 0, 0, 0, plan.reason))
            return True
        if plan.action == "external":
            self.night_status = "Andere Nachtladung hat die Kontrolle"
            self._publish(Decision("night", None, None, 0, 0, 0, plan.reason))
            return True
        if self.night_enabled:
            self.night_status = (
                f"Bereit 00:00–06:00 · Start {self.night_levels()[0]} %, "
                f"Ziel {self.night_levels()[1]} %"
                if plan.action == "wait" else "Deaktiviert"
            )
        return False

    def _can_write(self) -> bool:
        """Recheck night-charge ownership before every main/emergency command."""
        return self.enabled and not self._night_active and self._boolean("night") is False

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
                # Only touch the hardware maximum when the user explicitly
                # enabled synchronization. Wait for device readback before
                # increasing the charge power above its old physical cap.
                # Decrease the requested charge first if the slider was
                # lowered; a slow/failing hardware register write must never
                # leave a now-excessive charge setpoint in place.
                current = self._float("charge_setpoint")
                if (current is not None and latest.charge_w is not None
                        and latest.charge_w < current - 1):
                    await self._set_number("charge_setpoint", latest.charge_w)
                if not await self._sync_device_charge_limit(latest.mode):
                    return
                latest = self._evaluate()
                if latest.mode in ("charge", "emergency_charge") and self._can_write():
                    await self._set_number("charge_setpoint", latest.charge_w or 0)
                elif latest.mode in ("idle", "emergency_hold", "emergency_blocked"):
                    await self._set_number("charge_setpoint", 0)
            elif latest.mode in ("idle", "emergency_hold", "emergency_blocked"):
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
            if self.night_enabled or self._night_active:
                if await self._night_tick():
                    return
            d = self._evaluate()
            self._publish(d)
            await self._apply(d)
        except (HomeAssistantError, ValueError, TypeError) as exc:
            _LOGGER.warning("Marstek rule cycle failed: %s", exc)
            if self._night_active:
                self.night_status = f"Störung: {exc}"
                # Best effort: do not release guard if stopping the output fails.
                try:
                    await self._stop_night("Störung – Nachtladung gestoppt")
                except (HomeAssistantError, ValueError, TypeError) as stop_exc:
                    _LOGGER.error("Unable to safely stop integrated night charge: %s", stop_exc)
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
    if controller._night_active:
        try:
            await controller._stop_night("Integration wird entladen")
        except (HomeAssistantError, ValueError, TypeError) as exc:
            _LOGGER.error("Nachtladung konnte nicht sicher gestoppt werden: %s", exc)
            return False
        # Store just the prior active-latch, not the output power. Restart is
        # permitted only inside the 00:00-06:00 window and below the configured target.
        controller.hass.config_entries.async_update_entry(
            entry, options={**entry.options, "night_resume_pending": True}
        )
    controller.enabled = False
    controller.emergency_enabled = False
    if was_emergency:
        try:
            await controller._force_stop_emergency()
        except (HomeAssistantError, ValueError) as exc:
            _LOGGER.error("Unable to stop emergency charge on unload: %s", exc)
            return False
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
