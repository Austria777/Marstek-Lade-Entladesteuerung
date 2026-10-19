"""Mocked Home Assistant night-controller I/O and handoff tests.

Only the actual Home Assistant runtime can validate real service responses and timing.
"""
import asyncio
from datetime import datetime
import importlib
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1] / "custom_components" / "marstek_pv_manager"
PREFIX = "custom_components.marstek_pv_manager"


def install_stubs():
    # These stubs implement just the HA interfaces exercised by controller.
    for name in ["homeassistant", "homeassistant.config_entries", "homeassistant.const",
                 "homeassistant.core", "homeassistant.exceptions", "homeassistant.helpers",
                 "homeassistant.helpers.event", "homeassistant.util", "homeassistant.util.dt"]:
        module = types.ModuleType(name)
        module.__path__ = []
        sys.modules.setdefault(name, module)
    ha = sys.modules["homeassistant"]
    core = sys.modules["homeassistant.core"]
    core.HomeAssistant = object
    core.callback = lambda func: func
    sys.modules["homeassistant.config_entries"].ConfigEntry = object
    sys.modules["homeassistant.const"].Platform = types.SimpleNamespace(NUMBER=1, SENSOR=2, SWITCH=3)
    class HomeAssistantError(Exception):
        pass
    sys.modules["homeassistant.exceptions"].HomeAssistantError = HomeAssistantError
    sys.modules["homeassistant.helpers.event"].async_track_time_interval = lambda *args: lambda: None
    sys.modules["homeassistant.util.dt"].now = lambda: datetime(2026, 10, 18, 2, 0)
    pkg = types.ModuleType(PREFIX)
    pkg.__path__ = [str(BASE)]
    sys.modules.setdefault("custom_components", types.ModuleType("custom_components"))
    sys.modules[PREFIX] = pkg


install_stubs()
module = importlib.import_module(PREFIX + ".__init__")
const = importlib.import_module(PREFIX + ".const")


class State:
    def __init__(self, state, minimum=0, maximum=2500):
        self.state = str(state)
        self.attributes = {"min": minimum, "max": maximum}


class Hass:
    def __init__(self, states):
        self._states = states
        self.states = self
        self.services = self
        self.config_entries = self
        self.calls = []
        self.tasks = []

    def get(self, entity_id):
        return self._states.get(entity_id)

    async def async_call(self, domain, service, params, blocking=True):
        self.calls.append((domain, service, params["entity_id"], params.copy()))
        value = params.get("value", params.get("option"))
        entity = self._states[params["entity_id"]]
        entity.state = str(value if service in ("set_value", "select_option")
                           else "on" if service == "turn_on" else "off")

    def async_create_task(self, task):
        self.tasks.append(task)
        task.close()  # tests drive tick manually, no scheduled asynchronous loops

    def async_update_entry(self, entry, options):
        entry.options = options


class Entry:
    entry_id = "example"
    title = "Marstek PV Manager"

    def __init__(self, *, night_enabled=True, enabled=False):
        self.options = {"night_enabled": night_enabled, "enabled": enabled}


def setup(*, soc=9.5, hour=2, guard="off", night_enabled=True,
          main_enabled=False, max_charge=2500):
    states = {entity: State("off" if entity.startswith(("switch.", "input_boolean."))
                            else "charge" if entity.startswith("select.")
                            else 0)
              for key, (entity, _) in const.ENTITY_FIELDS.items()}
    states[const.ENTITY_FIELDS["night"][0]].state = guard
    states[const.ENTITY_FIELDS["rs485"][0]].state = "off"
    states[const.ENTITY_FIELDS["user_mode"][0]].state = "normal"
    states[const.ENTITY_FIELDS["marstek_soc"][0]].state = str(soc)
    states[const.ENTITY_FIELDS["charge_setpoint"][0]].attributes["max"] = max_charge
    hass = Hass(states)
    entry = Entry(night_enabled=night_enabled, enabled=main_enabled)
    controller = module.MarstekController(hass, entry)
    return hass, controller


class NightControllerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.clock = patch.object(module.dt_util, "now", lambda: datetime(2026, 10, 18, 2, 0))
        self.clock.start()
        self.addCleanup(self.clock.stop)

    async def test_night_start_writes_only_night_command_sequence(self):
        hass, c = setup()
        await c.async_tick()
        helper = const.ENTITY_FIELDS["night"][0]
        self.assertTrue(c._night_active)
        self.assertEqual(hass._states[helper].state, "on")
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, "400")
        self.assertEqual(hass._states[const.ENTITY_FIELDS["discharge_setpoint"][0]].state, "0")
        self.assertEqual(c.decision.mode, "night_charge")
        self.assertEqual(hass.calls[0][:2], ("input_boolean", "turn_on"))
        self.assertIn(("select", "select_option"), [(x[0], x[1]) for x in hass.calls])

    async def test_11_percent_turns_off_setpoint_before_helper(self):
        hass, c = setup()
        await c.async_tick()
        hass.calls.clear()
        hass._states[const.ENTITY_FIELDS["marstek_soc"][0]].state = "11"
        await c.async_tick()
        self.assertFalse(c._night_active)
        self.assertEqual(hass.calls[0][0:2], ("number", "set_value"))
        self.assertEqual(hass.calls[0][-1]["value"], 0)
        self.assertEqual(hass.calls[-1][:2], ("input_boolean", "turn_off"))
        self.assertEqual(hass._states[const.ENTITY_FIELDS["night"][0]].state, "off")

    async def test_main_switch_off_does_not_block_night(self):
        hass, c = setup(main_enabled=False)
        await c.async_tick()
        self.assertEqual(c.decision.mode, "night_charge")

    async def test_do_not_activate_when_new_switch_is_off(self):
        hass, c = setup(night_enabled=False)
        await c.async_tick()
        self.assertEqual(hass.calls, [])

    async def test_restore_active_on_ha_restart(self):
        hass, c = setup(guard="on", soc=10.5)
        await c.async_tick()
        self.assertTrue(c._night_active)
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, "400")

    async def test_night_outside_window_stops_latched_charge(self):
        hass, c = setup(guard="on", soc=9)
        with patch.object(module.dt_util, "now", lambda: datetime(2026, 10, 18, 6, 0)):
            await c.async_tick()
        self.assertFalse(c._night_active)
        self.assertEqual(hass._states[const.ENTITY_FIELDS["night"][0]].state, "off")

    async def test_missing_soc_stops_night(self):
        hass, c = setup()
        await c.async_tick()
        hass._states[const.ENTITY_FIELDS["marstek_soc"][0]].state = "unavailable"
        await c.async_tick()
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, "0")
        self.assertFalse(c._night_active)

    async def test_helper_owned_by_old_yaml_not_hijacked(self):
        hass, c = setup(guard="on", night_enabled=False, main_enabled=True)
        await c.async_tick()
        self.assertFalse(c._night_active)
        self.assertEqual(hass.calls, [])

    async def test_charge_below_hw_limit_aborts_safely(self):
        hass, c = setup(max_charge=300)
        await c.async_tick()
        self.assertFalse(c._night_active)
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, "0")
        self.assertEqual(hass._states[const.ENTITY_FIELDS["night"][0]].state, "off")

    async def test_manual_switch_off_clears_helper(self):
        hass, c = setup()
        await c.async_tick()
        await c.async_set_night_enabled(False)
        self.assertFalse(c._night_active)
        self.assertFalse(c.night_enabled)
        self.assertEqual(hass._states[const.ENTITY_FIELDS["night"][0]].state, "off")

    async def test_restart_resume_latch_after_graceful_unload(self):
        hass, c = setup(soc=9.5)
        await c.async_tick()
        await c._stop_night("geplanter Neustart")
        c.entry.options["night_resume_pending"] = True
        hass._states[const.ENTITY_FIELDS["marstek_soc"][0]].state = "10.5"
        reboot = module.MarstekController(hass, c.entry)
        await reboot.async_tick()
        self.assertTrue(reboot._night_active)
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, "400")
        self.assertFalse(reboot._night_resume_pending)

    async def test_unload_persists_resume_flag_for_ha_restart(self):
        hass, controller = setup(soc=9.5)
        controller.entry.runtime_data = controller
        async def unload_platforms(entry, platforms):
            return True
        hass.async_unload_platforms = unload_platforms
        await controller.async_tick()
        self.assertTrue(await module.async_unload_entry(hass, controller.entry))
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, "0")
        self.assertEqual(hass._states[const.ENTITY_FIELDS["night"][0]].state, "off")
        self.assertTrue(controller.entry.options["night_resume_pending"])

    async def test_restart_latch_discarded_at_11_or_after_06(self):
        hass, c = setup(soc=11.0)
        c.entry.options["night_resume_pending"] = True
        reboot = module.MarstekController(hass, c.entry)
        await reboot.async_tick()
        self.assertFalse(reboot._night_active)
        self.assertFalse(reboot._night_resume_pending)
        self.assertFalse(reboot.entry.options["night_resume_pending"])

    async def test_night_start_turns_off_pending_emergency(self):
        hass, c = setup(main_enabled=True)
        c.emergency_enabled = True
        await c.async_tick()
        self.assertFalse(c.emergency_enabled)
        self.assertEqual(c.decision.mode, "night_charge")


if __name__ == "__main__":
    unittest.main()


class ConfigurableNightControllerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.clock = patch.object(module.dt_util, "now", lambda: datetime(2026, 10, 18, 2, 0))
        self.clock.start()
        self.addCleanup(self.clock.stop)

    async def test_edit_levels_while_idle_then_start_at_40_percent(self):
        hass, c = setup(soc=39.5)
        c.entry.options["night_enabled"] = True
        # Target must be raised before the start slider can exceed 11%.
        await c.async_set_power_limit("night_target_soc", 80)
        await c.async_set_power_limit("night_start_soc", 40)
        await c.async_tick()
        self.assertTrue(c._night_active)
        self.assertIn("80 %", c.night_status)
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, "400")

    async def test_edit_target_during_charge_stops_zero_before_guard_release(self):
        hass, c = setup(soc=9.5)
        await c.async_tick()
        c.entry.options["night_target_soc"] = 80
        hass._states[const.ENTITY_FIELDS["marstek_soc"][0]].state = "60"
        await c.async_tick()
        self.assertTrue(c._night_active)
        hass.calls.clear()
        # Changed target (still above start) is already reached at 60%.
        await c.async_set_power_limit("night_target_soc", 40)
        await c.async_tick()
        self.assertFalse(c._night_active)
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, "0")
        self.assertEqual(hass.calls[-1][:2], ("input_boolean", "turn_off"))

    async def test_invalid_order_is_rejected_without_state_change(self):
        hass, c = setup()
        with self.assertRaises(Exception):
            await c.async_set_power_limit("night_start_soc", 15)
        self.assertNotIn("night_start_soc", c.entry.options)
        with self.assertRaises(Exception):
            await c.async_set_power_limit("night_target_soc", 9)

    async def test_100_percent_goal_allowed_with_50_percent_start(self):
        hass, c = setup(soc=50)
        await c.async_set_power_limit("night_target_soc", 100)
        await c.async_set_power_limit("night_start_soc", 50)
        await c.async_tick()
        self.assertEqual(c.decision.mode, "night_charge")
        self.assertEqual(c.night_levels(), (50, 100))

    async def test_reject_51_percent_start_and_equal_levels(self):
        hass, c = setup(soc=49)
        await c.async_set_power_limit("night_target_soc", 100)
        with self.assertRaises(Exception):
            await c.async_set_power_limit("night_start_soc", 51)
        self.assertNotIn("night_start_soc", c.entry.options)
        await c.async_set_power_limit("night_start_soc", 50)
        with self.assertRaises(Exception):
            await c.async_set_power_limit("night_target_soc", 50)
        self.assertEqual(c.night_levels(), (50, 100))

    async def test_restart_resume_with_configured_target(self):
        hass, c = setup(soc=9.3)
        c.entry.options["night_target_soc"] = 70
        await c.async_tick()
        await c._stop_night("geplanter Neustart")
        c.entry.options["night_resume_pending"] = True
        hass._states[const.ENTITY_FIELDS["marstek_soc"][0]].state = "60"
        reboot = module.MarstekController(hass, c.entry)
        await reboot.async_tick()
        self.assertTrue(reboot._night_active)
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, "400")
        self.assertFalse(reboot._night_resume_pending)

    async def test_manual_start_setting_change_does_not_break_running_charge(self):
        hass, c = setup(soc=9.5)
        c.entry.options["night_target_soc"] = 70
        await c.async_tick()
        hass._states[const.ENTITY_FIELDS["marstek_soc"][0]].state = "50"
        await c.async_set_power_limit("night_start_soc", 49)
        await c.async_tick()
        self.assertTrue(c._night_active)
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, "400")


class PVDisplayScaleTests(unittest.IsolatedAsyncioTestCase):
    """PV scale must persist while remaining entirely separate from battery control."""

    async def test_8400_default_and_saved_value_with_no_hardware_calls(self):
        hass, controller = setup(soc=50, night_enabled=False, main_enabled=True)
        self.assertEqual(controller.requested_pv_display_max(), 8400)
        original_settings = controller.settings()
        notifications = []
        controller.subscribe(lambda: notifications.append(True))
        initial_tasks = len(hass.tasks)
        await controller.async_set_pv_display_max(12500)
        self.assertEqual(controller.entry.options["pv_display_max_w"], 12500)
        self.assertEqual(controller.requested_pv_display_max(), 12500)
        self.assertEqual(len(notifications), 1)
        self.assertEqual(len(hass.tasks), initial_tasks)
        self.assertEqual(hass.calls, [])
        self.assertEqual(controller.settings(), original_settings)

        reboot = module.MarstekController(hass, controller.entry)
        self.assertEqual(reboot.requested_pv_display_max(), 12500)

    async def test_invalid_values_rejected_without_writing(self):
        hass, controller = setup(soc=50, night_enabled=False, main_enabled=True)
        for value in (0, 7900, 8010, 14001, 140100):
            with self.assertRaises(module.HomeAssistantError):
                await controller.async_set_pv_display_max(value)
        self.assertNotIn("pv_display_max_w", controller.entry.options)
        self.assertEqual(hass.calls, [])
        self.assertEqual(hass.tasks, [])
