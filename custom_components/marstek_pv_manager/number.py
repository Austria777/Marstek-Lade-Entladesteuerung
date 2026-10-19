"""Dashboard-adjustable charge and discharge power ceilings."""
from __future__ import annotations

from homeassistant.components.number import NumberDeviceClass, NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfPower
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo

from .const import DEFAULTS, DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    async_add_entities([
        MarstekPowerLimit(entry.runtime_data, entry, "max_charge_w", "Maximale Ladeleistung"),
        MarstekPowerLimit(entry.runtime_data, entry, "max_discharge_w", "Maximale Entladeleistung"),
        MarstekPowerLimit(entry.runtime_data, entry, "emergency_charge_w", "Notfall Ladeleistung"),
        MarstekPowerLimit(entry.runtime_data, entry, "emergency_soc_target", "Notfall Ziel SoC"),
        MarstekPowerLimit(entry.runtime_data, entry, "night_start_soc", "Nachtladung Start-SoC"),
        MarstekPowerLimit(entry.runtime_data, entry, "night_target_soc", "Nachtladung Ziel-SoC"),
        MarstekPVDisplayMax(entry.runtime_data, entry),
    ])


class MarstekPowerLimit(NumberEntity):
    """Limit in W, NOT the actual output power or a device bypass."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_device_class = NumberDeviceClass.POWER
    _attr_native_min_value = 0
    _attr_native_max_value = 2500
    _attr_native_step = 100
    _attr_native_unit_of_measurement = UnitOfPower.WATT
    _attr_mode = NumberMode.SLIDER
    _attr_icon = "mdi:flash"

    def __init__(self, controller, entry: ConfigEntry, key: str, label: str) -> None:
        self.controller = controller
        self.key = key
        self._attr_name = label
        if key == "emergency_soc_target":
            self._attr_device_class = None
            self._attr_native_unit_of_measurement = "%"
            self._attr_native_min_value = 50
            self._attr_native_max_value = 100
            self._attr_native_step = 1
            self._attr_icon = "mdi:battery-check"
        elif key in ("night_start_soc", "night_target_soc"):
            self._attr_device_class = None
            self._attr_native_unit_of_measurement = "%"
            self._attr_native_min_value = 9 if key == "night_start_soc" else 10
            self._attr_native_max_value = 50 if key == "night_start_soc" else 100
            self._attr_native_step = 1
            self._attr_icon = ("mdi:battery-arrow-down-outline"
                               if key == "night_start_soc" else "mdi:battery-check")
        elif key == "emergency_charge_w":
            self._attr_icon = "mdi:transmission-tower-import"
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Custom integration",
            model="Marstek PV rule controller",
        )

    @property
    def native_value(self) -> float:
        if self.key == "emergency_soc_target":
            return self.controller.requested_emergency_soc_target()
        if self.key == "night_start_soc":
            return self.controller.night_levels()[0]
        if self.key == "night_target_soc":
            return self.controller.night_levels()[1]
        return self.controller.requested_power_limit(self.key)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.controller.subscribe(self.async_write_ha_state))

    async def async_set_native_value(self, value: float) -> None:
        await self.controller.async_set_power_limit(self.key, int(value))
        self.async_write_ha_state()


class MarstekPVDisplayMax(NumberEntity):
    """Saved presentation scale for PV signal bars; never a device power limit."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_device_class = NumberDeviceClass.POWER
    _attr_native_min_value = 8000
    _attr_native_max_value = 14000
    _attr_native_step = 100
    _attr_native_unit_of_measurement = UnitOfPower.WATT
    _attr_mode = NumberMode.SLIDER
    _attr_icon = "mdi:signal"

    def __init__(self, controller, entry: ConfigEntry) -> None:
        self.controller = controller
        self._attr_name = "PV-Anzeige Maximum"
        self._attr_unique_id = f"{entry.entry_id}_pv_display_max_w"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Custom integration",
            model="Marstek PV rule controller",
        )

    @property
    def native_value(self) -> float:
        return self.controller.requested_pv_display_max()

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.controller.subscribe(self.async_write_ha_state))

    async def async_set_native_value(self, value: float) -> None:
        await self.controller.async_set_pv_display_max(int(value))
        self.async_write_ha_state()
