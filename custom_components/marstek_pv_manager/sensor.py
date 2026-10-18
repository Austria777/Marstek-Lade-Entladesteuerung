"""Diagnostics for the 7-second PV controller."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorDeviceClass
from homeassistant.const import PERCENTAGE, UnitOfPower
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo

from .const import DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities):
    controller = entry.runtime_data
    async_add_entities([
        MarstekManagerSensor(controller, entry, "mode", "Betriebsmodus"),
        MarstekManagerSensor(controller, entry, "charge_target_w", "Ladeziel"),
        MarstekManagerSensor(controller, entry, "discharge_target_w", "Entladeziel"),
        MarstekManagerSensor(controller, entry, "pv_total_w", "PV Gesamtleistung"),
        MarstekManagerSensor(controller, entry, "reason", "Regelstatus"),
        MarstekManagerSensor(controller, entry, "discharge_lock", "Entladesperre"),
        MarstekManagerSensor(controller, entry, "effective_charge", "Wirksames Ladelimit"),
        MarstekManagerSensor(controller, entry, "effective_discharge", "Wirksames Entladelimit"),
        MarstekManagerSensor(controller, entry, "effective_emergency", "Wirksame Notfall Ladeleistung"),
        MarstekManagerSensor(controller, entry, "device_max_charge", "Hardware Ladelimit"),
        MarstekManagerSensor(controller, entry, "emergency_status", "Notfall Status"),
        MarstekManagerSensor(controller, entry, "marstek_soc", "Marstek Ladezustand"),
        MarstekManagerSensor(controller, entry, "night_status", "Nachtladung Status"),
    ])


class MarstekManagerSensor(SensorEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, controller, entry: ConfigEntry, key: str, label: str) -> None:
        self.controller = controller
        self.key = key
        self._attr_name = label
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Custom integration",
            model="Marstek PV rule controller",
        )
        if key in ("charge_target_w", "discharge_target_w", "pv_total_w",
                   "effective_charge", "effective_discharge", "effective_emergency", "device_max_charge"):
            self._attr_device_class = SensorDeviceClass.POWER
            self._attr_native_unit_of_measurement = UnitOfPower.WATT
        elif key == "marstek_soc":
            self._attr_device_class = SensorDeviceClass.BATTERY
            self._attr_native_unit_of_measurement = PERCENTAGE

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.controller.subscribe(self.async_write_ha_state))

    @property
    def native_value(self):
        d = self.controller.decision
        if self.key == "mode":
            return d.mode
        if self.key == "reason":
            return {
                "disabled": "Regelung ausgeschaltet",
                "night_control": "10-%-Nachtladung hat Vorrang",
                "missing_data": "Messwerte fehlen",
                "service_error": "Fehler beim Senden eines Befehls",
                "pv_surplus": "Laden mit PV-Überschuss",
                "cover_import": "Entladung deckt Netzbezug",
                "invalid_inputs": "Messwerte fehlen",
                "ev_charging": "Wallbox oder NeCharge aktiv",
                "heating_active": "Puffer- oder Warmwasserheizung aktiv",
                "soc_or_inputs": "SolaX-SoC oder Verbraucher-Messwerte sperren Entladung",
                "no_demand": "Kein Lade-/Entladebedarf",
                "emergency_grid_charge": "Notfall-Netzladung läuft (kein PV-Limit)",
                "emergency_target_reached": "Notfall-Ziel-SoC erreicht · Reserve wird gehalten",
                "emergency_zero_power": "Notfallmodus an, Ladeleistung 0 W",
                "emergency_missing_data": "Notfall-Netzladung blockiert: Messwerte fehlen",
                "night_reserve_charge": "Mindest-SoC-Nachtladung 400 W aktiv",
                "night_missing_data": "Nachtladung: Messwerte fehlen",
                "night_guard_lost": "Nachtladung: Sperrhelfer nicht verfügbar",
            }.get(d.reason, d.reason)
        if self.key == "discharge_lock":
            from .logic import discharge_lock_reason
            return discharge_lock_reason(self.controller._inputs(), self.controller.settings(), self.controller.enabled, self.controller.emergency_enabled)
        if self.key == "device_max_charge":
            return self.controller.effective_device_charge_limit()
        if self.key == "effective_charge":
            return self.controller.settings().max_charge_w
        if self.key == "effective_discharge":
            return self.controller.settings().max_discharge_w
        if self.key == "effective_emergency":
            return self.controller.settings().emergency_charge_w
        if self.key == "night_status":
            return self.controller.night_status
        if self.key == "emergency_status":
            if not self.controller.emergency_enabled:
                return "Aus"
            return {
                "emergency_charge": "Netzladung aktiv",
                "emergency_hold": "Reserve halten (keine Entladung)",
                "emergency_blocked": "Gesperrt: Messwerte fehlen",
                "night": "Pausiert: Nachtladung hat Vorrang",
                "unavailable": "Pausiert: Nachtlade-Status unbekannt",
                "disabled": "Regelung ausschalten nicht erlaubt",
            }.get(d.mode, "Warten")
        if self.key == "marstek_soc":
            return self.controller._float("marstek_soc") if self.controller.entity("marstek_soc") else None
        if d.mode in ("disabled", "night", "unavailable"):
            return None
        value = getattr(d, self.key)
        return round(value) if isinstance(value, float) else value

    @property
    def extra_state_attributes(self):
        if self.key == "mode":
            return {"reason": self.controller.decision.reason, "interval_s": 7}
        return None
