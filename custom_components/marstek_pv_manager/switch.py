"""Persisted enable/disable switch; initially OFF for commissioning safety."""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo

from .const import DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities):
    async_add_entities([MarstekManagerEnableSwitch(entry.runtime_data, entry), MarstekEmergencySwitch(entry.runtime_data, entry), MarstekNightSwitch(entry.runtime_data, entry), MarstekChargeLimitSyncSwitch(entry.runtime_data, entry)])


class MarstekManagerEnableSwitch(SwitchEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_name = "Regelung aktiv"
    _attr_icon = "mdi:transmission-tower"

    def __init__(self, controller, entry: ConfigEntry) -> None:
        self.controller = controller
        self._attr_unique_id = f"{entry.entry_id}_enabled"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Custom integration",
            model="Marstek PV rule controller",
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.controller.subscribe(self.async_write_ha_state))

    @property
    def is_on(self) -> bool:
        return self.controller.enabled

    async def async_turn_on(self, **kwargs) -> None:
        await self.controller.async_set_enabled(True)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs) -> None:
        await self.controller.async_set_enabled(False)
        self.async_write_ha_state()


class MarstekEmergencySwitch(SwitchEntity):
    """Opt-in emergency charge switch; always OFF after Home Assistant restart."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_name = "Notfall Netzladung"
    _attr_icon = "mdi:transmission-tower-import"

    def __init__(self, controller, entry: ConfigEntry) -> None:
        self.controller = controller
        self._attr_unique_id = f"{entry.entry_id}_emergency_enabled"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name=entry.title,
            manufacturer="Custom integration", model="Marstek PV rule controller",
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.controller.subscribe(self.async_write_ha_state))

    @property
    def is_on(self) -> bool:
        return self.controller.emergency_enabled

    async def async_turn_on(self, **kwargs) -> None:
        await self.controller.async_set_emergency(True)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs) -> None:
        await self.controller.async_set_emergency(False)
        self.async_write_ha_state()


class MarstekNightSwitch(SwitchEntity):
    """Persistent opt-in for integrated 00:00-06:00 night reserve charging."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_name = "Mindest-SoC-Nachtladung"
    _attr_icon = "mdi:weather-night"

    def __init__(self, controller, entry: ConfigEntry) -> None:
        self.controller = controller
        self._attr_unique_id = f"{entry.entry_id}_night_enabled"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name=entry.title,
            manufacturer="Custom integration", model="Marstek PV rule controller",
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.controller.subscribe(self.async_write_ha_state))

    @property
    def is_on(self) -> bool:
        return self.controller.night_enabled

    async def async_turn_on(self, **kwargs) -> None:
        await self.controller.async_set_night_enabled(True)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs) -> None:
        await self.controller.async_set_night_enabled(False)
        self.async_write_ha_state()


class MarstekChargeLimitSyncSwitch(SwitchEntity):
    """Explicit opt-in to mirror UI charge power to device hardware maximum."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_name = "Auto Ladelimit"
    _attr_icon = "mdi:battery-sync"

    def __init__(self, controller, entry: ConfigEntry) -> None:
        self.controller = controller
        self._attr_unique_id = f"{entry.entry_id}_sync_charge_limit"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name=entry.title,
            manufacturer="Custom integration", model="Marstek PV rule controller",
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.controller.subscribe(self.async_write_ha_state))

    @property
    def is_on(self) -> bool:
        return self.controller.sync_charge_limit

    async def async_turn_on(self, **kwargs) -> None:
        await self.controller.async_set_charge_limit_sync(True)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs) -> None:
        await self.controller.async_set_charge_limit_sync(False)
        self.async_write_ha_state()
