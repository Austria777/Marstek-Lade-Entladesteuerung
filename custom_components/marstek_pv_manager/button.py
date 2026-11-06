"""Two user-triggered Tesla telemetry sync requests (without charging controls)."""
from __future__ import annotations

from datetime import datetime, timezone
import logging

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity import DeviceInfo

from .const import DEFAULTS, DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    async_add_entities([
        TeslaSyncButton(hass, entry, "model3", "Model 3"),
        TeslaSyncButton(hass, entry, "modely", "Model Y"),
    ])


class TeslaSyncButton(ButtonEntity):
    """Manually request upstream data; never claim success without a fresh value."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:sync"

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry,
                 vehicle: str, vehicle_name: str) -> None:
        self.hass = hass
        self.entry = entry
        self.vehicle = vehicle
        self._attr_name = f"Tesla {vehicle_name} Sync"
        self._attr_unique_id = f"{entry.entry_id}_{vehicle}_sync"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Custom integration",
            model="Marstek PV rule controller",
        )
        self._request_type = "Noch nicht angefordert"
        self._request_at: str | None = None

    def _entity(self, suffix: str) -> str:
        key = f"{self.vehicle}_{suffix}"
        return str(self.entry.options.get(key, DEFAULTS[key]) or "")

    @property
    def extra_state_attributes(self) -> dict:
        return {
            "sync_request_type": self._request_type,
            "requested_at": self._request_at,
            "note": "Sync-Anfrage bedeutet nicht, dass der Tesla bereits geantwortet hat.",
        }

    async def async_press(self) -> None:
        target = self._entity("sync_target")
        if target:
            state = self.hass.states.get(target)
            if state is None or state.state == "unavailable":
                raise HomeAssistantError(f"{self.vehicle}: gewählter Sync-Button ist nicht erreichbar")
            # Configurable ESPHome / Tesla BLE button if exposed by the user's setup.
            try:
                await self.hass.services.async_call(
                    "button", "press", {"entity_id": target}, blocking=True
                )
            except Exception as exc:
                _LOGGER.warning("%s: ESPHome sync request failed: %s", self.vehicle, exc)
                raise HomeAssistantError("Tesla-Sync-Button konnte nicht ausgelöst werden") from exc
            self._request_type = "ESPHome-Taste ausgelöst; Fahrzeugantwort noch offen"
        else:
            sources = [self._entity("soc"), self._entity("range")]
            available = [entity_id for entity_id in sources
                         if entity_id and self.hass.states.get(entity_id) is not None]
            if not available:
                raise HomeAssistantError(
                    f"{self.vehicle}: keine Tesla-Sensoren gefunden. "
                    "Bitte Sensoren unter Energy Studio → Konfigurieren zuordnen."
                )
            # A generic HA refresh works for pull entities; it cannot force an
            # ESPHome push sensor to contact a sleeping Tesla. No success claim.
            try:
                await self.hass.services.async_call(
                    "homeassistant", "update_entity",
                    {"entity_id": available}, blocking=True
                )
            except Exception as exc:
                _LOGGER.warning("%s: entity update request failed: %s", self.vehicle, exc)
                raise HomeAssistantError("Aktualisierungsanfrage konnte nicht ausgeführt werden") from exc
            self._request_type = "HA-Update angefordert; BLE-Antwort nicht garantiert"
        self._request_at = datetime.now(timezone.utc).isoformat()
        self.async_write_ha_state()
