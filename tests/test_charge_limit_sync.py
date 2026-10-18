"""Safety regressions for optional physical maximum-charge register synchronization."""
from datetime import datetime
import unittest
from unittest.mock import patch
from test_night_controller import const, module, setup


def charge_setup(*, desired=2500, device_current=2000, device_max=2500, sync=False, emergency=False):
    hass, controller = setup(soc=50, night_enabled=False, main_enabled=True)
    states = hass._states
    states[const.ENTITY_FIELDS["max_charge"][0]].state = str(device_current)
    states[const.ENTITY_FIELDS["max_charge"][0]].attributes["max"] = device_max
    states[const.ENTITY_FIELDS["charge_setpoint"][0]].state = '1900'
    states[const.ENTITY_FIELDS["pv_total"][0]].state = '5000'
    states[const.ENTITY_FIELDS["grid"][0]].state = '4500'
    states[const.ENTITY_FIELDS["solax_soc"][0]].state = '99'
    states[const.ENTITY_FIELDS["solax_battery"][0]].state = '0'
    states[const.ENTITY_FIELDS["wallbox"][0]].state = '0'
    states[const.ENTITY_FIELDS["max_discharge"][0]].state = '1800'
    controller.entry.options["max_charge_w"] = desired
    controller.entry.options["emergency_charge_w"] = desired
    controller.entry.options["sync_charge_limit"] = sync
    controller.sync_charge_limit = sync
    controller.emergency_enabled = emergency
    return hass, controller


class PhysicalChargeLimitTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.clock = patch.object(module.dt_util, "now", lambda: datetime(2026, 10, 18, 12, 0))
        self.clock.start()
        self.addCleanup(self.clock.stop)

    async def test_old_2000w_device_cap_limits_effective_slider_without_opt_in(self):
        hass, controller = charge_setup()
        self.assertEqual(controller.settings().max_charge_w, 2000)
        self.assertEqual(controller.settings().emergency_charge_w, 2000)
        await controller.async_tick()
        self.assertEqual(hass._states[const.ENTITY_FIELDS["max_charge"][0]].state, '2000')
        self.assertEqual(controller.decision.mode, "charge")
        self.assertFalse(any(x[2] == const.ENTITY_FIELDS["max_charge"][0] for x in hass.calls))

    async def test_opt_in_sets_hw_limit_before_charge_setpoint(self):
        hass, controller = charge_setup()
        await controller.async_set_charge_limit_sync(True)
        await controller.async_tick()
        self.assertEqual(controller.settings().max_charge_w, 2500)
        max_id = const.ENTITY_FIELDS["max_charge"][0]
        charge_id = const.ENTITY_FIELDS["charge_setpoint"][0]
        hw_indices = [i for i,x in enumerate(hass.calls) if x[2] == max_id]
        charge_indices = [i for i,x in enumerate(hass.calls) if x[2] == charge_id]
        self.assertTrue(hw_indices)
        self.assertTrue(charge_indices)
        self.assertLess(hw_indices[0], charge_indices[0])
        self.assertEqual(hass._states[max_id].state, '2500')

    async def test_optin_rejects_unadvertised_hardware_limit(self):
        hass, controller = charge_setup(device_max=2000, sync=True)
        await controller.async_tick()
        self.assertEqual(controller.decision.reason, "service_error")
        self.assertFalse(any(x[2] == const.ENTITY_FIELDS["max_charge"][0] for x in hass.calls))

    async def test_no_hardware_sync_when_main_off(self):
        hass, controller = charge_setup(sync=True)
        await controller.async_set_enabled(False)
        await controller.async_tick()
        self.assertFalse(any(x[2] == const.ENTITY_FIELDS["max_charge"][0] for x in hass.calls))

    async def test_integrated_night_charge_never_syncs_hardware_limit(self):
        hass, controller = charge_setup(sync=True, device_current=2000)
        controller.night_enabled=True
        hass._states[const.ENTITY_FIELDS["marstek_soc"][0]].state='9.5'
        with patch.object(module.dt_util, "now", lambda: datetime(2026, 10, 18, 2, 0)):
            await controller.async_tick()
        self.assertEqual(controller.decision.mode, 'night_charge')
        self.assertFalse(any(x[2] == const.ENTITY_FIELDS["max_charge"][0] for x in hass.calls))
        self.assertEqual(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state, '400')

    async def test_unconfirmed_hardware_limit_defers_charge_increase(self):
        hass, controller = charge_setup(sync=True)
        cap_id = const.ENTITY_FIELDS["max_charge"][0]
        charge_id = const.ENTITY_FIELDS["charge_setpoint"][0]
        original = hass.async_call
        async def delayed_cap(domain, service, data, blocking=True):
            if data["entity_id"] == cap_id:
                hass.calls.append((domain, service, cap_id, data.copy()))
                return  # physical register has not reported new maximum yet
            await original(domain, service, data, blocking)
        hass.async_call = delayed_cap
        await controller.async_tick()
        self.assertEqual(hass._states[cap_id].state, "2000")
        self.assertEqual(hass._states[charge_id].state, "1900")

    async def test_slider_reduction_is_applied_even_if_device_sync_is_delayed(self):
        hass, controller = charge_setup(sync=True, emergency=True)
        controller.entry.options["emergency_charge_w"] = 700
        cap_id = const.ENTITY_FIELDS["max_charge"][0]
        charge_id = const.ENTITY_FIELDS["charge_setpoint"][0]
        original = hass.async_call
        async def delayed_cap(domain, service, data, blocking=True):
            if data["entity_id"] == cap_id:
                hass.calls.append((domain, service, cap_id, data.copy()))
                return
            await original(domain, service, data, blocking)
        hass.async_call = delayed_cap
        await controller.async_tick()
        self.assertEqual(hass._states[cap_id].state, "2000")
        self.assertEqual(hass._states[charge_id].state, "700")

    async def test_emergency_uses_own_limit_for_sync(self):
        hass, controller = charge_setup(sync=True, desired=2500, emergency=True)
        controller.entry.options['emergency_charge_w']=700
        await controller.async_tick()
        self.assertEqual(controller.decision.mode, 'emergency_charge')
        self.assertEqual(hass._states[const.ENTITY_FIELDS["max_charge"][0]].state,'700')
        self.assertLessEqual(float(hass._states[const.ENTITY_FIELDS["charge_setpoint"][0]].state),700)


if __name__ == '__main__':
    unittest.main()
