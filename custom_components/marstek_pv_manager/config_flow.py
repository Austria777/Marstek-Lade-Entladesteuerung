"""UI configuration and editable entity mappings for Marstek PV Manager."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    DEFAULTS, DOMAIN, ENTITY_FIELDS, MARSTEK_FIELDS, PARAMETERS, SOURCE_FIELDS,
)


def _entities_schema(keys: tuple[str, ...], current: dict[str, Any]) -> vol.Schema:
    """One entity selector per field, with a suggested Marstek SoC."""
    fields = {}
    for key in keys:
        select = selector.EntitySelector(
            selector.EntitySelectorConfig(domain=ENTITY_FIELDS[key][1])
        )
        if key == "marstek_soc":
            # Preselect the provided Marstek SoC sensor for existing and new entries.
            selected = current.get(key) or DEFAULTS[key]
            hint = {"suggested_value": selected}
            fields[vol.Optional(key, description=hint)] = select
        else:
            fields[vol.Required(key, default=current.get(key, DEFAULTS[key]))] = select
    return vol.Schema(fields)


def _limits_schema(current: dict[str, Any]) -> vol.Schema:
    fields = {}
    for key, (_, minimum, maximum) in PARAMETERS.items():
        step = 100 if key in ("max_charge_w", "max_discharge_w", "emergency_charge_w") else 1
        value = int(current.get(key, DEFAULTS[key]))
        value = max(minimum, min(maximum, value))
        if step == 100:
            value = (value // step) * step
        fields[vol.Required(key, default=value)] = selector.NumberSelector(
            selector.NumberSelectorConfig(
                min=minimum, max=maximum, step=step,
                mode=selector.NumberSelectorMode.BOX,
            )
        )
    return vol.Schema(fields)


class MarstekPVManagerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Singleton control instance prevents accidental multiple controllers."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        await self.async_set_unique_id("marstek_pv_manager_primary")
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(
                title=user_input["name"], data={"name": user_input["name"]}
            )
        schema = vol.Schema({vol.Required("name", default="Marstek PV Manager"): str})
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return MarstekOptionsFlow()


class MarstekOptionsFlow(config_entries.OptionsFlow):
    """Configure entity mappings or numerical thresholds in UI."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        return self.async_show_menu(
            step_id="init", menu_options=["sources", "marstek", "limits"]
        )

    async def _save(self, user_input: dict[str, Any]):
        options = {**self.config_entry.options, **user_input}
        return self.async_create_entry(data=options)

    async def async_step_sources(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            return await self._save(user_input)
        return self.async_show_form(
            step_id="sources",
            data_schema=_entities_schema(SOURCE_FIELDS, dict(self.config_entry.options)),
        )

    async def async_step_marstek(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            # Empty optional mapping removes an older mapping.
            return await self._save({"marstek_soc": "", **user_input})
        return self.async_show_form(
            step_id="marstek",
            data_schema=_entities_schema(MARSTEK_FIELDS, dict(self.config_entry.options)),
        )

    async def async_step_limits(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            start = int(user_input.get("night_start_soc",
                                       self.config_entry.options.get("night_start_soc",
                                                                     DEFAULTS["night_start_soc"])))
            target = int(user_input.get("night_target_soc",
                                        self.config_entry.options.get("night_target_soc",
                                                                      DEFAULTS["night_target_soc"])))
            if start >= target:
                return self.async_show_form(
                    step_id="limits",
                    data_schema=_limits_schema({**self.config_entry.options, **user_input}),
                    errors={"base": "night_soc_order"},
                )
            return await self._save(user_input)
        return self.async_show_form(
            step_id="limits",
            data_schema=_limits_schema(dict(self.config_entry.options)),
        )
