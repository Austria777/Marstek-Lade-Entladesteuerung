"""Run with: python -m unittest discover -s tests -v"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

# Import standalone logic without a Home Assistant Python installation.
module_path = Path(__file__).parents[1] / "custom_components" / "marstek_pv_manager" / "logic.py"
spec = importlib.util.spec_from_file_location("marstek_logic", module_path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
Inputs = module.Inputs
Settings = module.Settings
evaluate = module.evaluate


def base(**overrides):
    values = dict(
        pv_total=2300, grid=1000,
        solax_battery=150, solax_soc=99, wallbox=0, necharge_power=0,
        necharge_active=False, heaters=(False,) * 6,
        marstek_ac=0, charge_setpoint=0, discharge_setpoint=0,
        max_discharge=1800, user_mode="anti_feed", forced_mode="charge",
        rs485=True, night=False,
    )
    values.update(overrides)
    return Inputs(**values)


class RuleTests(unittest.TestCase):
    def setUp(self):
        self.s = Settings()

    def check(self, data, hour=12, enabled=True):
        return evaluate(data, self.s, hour, enabled)

    def test_charge_ramps_at_100w(self):
        result = self.check(base())
        self.assertEqual((result.mode, result.charge_w, result.discharge_w),
                         ("charge", 100, 0))
        self.assertEqual(result.charge_target_w, 900)

    def test_charge_decreases_immediately(self):
        result = self.check(base(grid=310, charge_setpoint=700))
        self.assertEqual((result.mode, result.charge_w), ("charge", 200))

    def test_no_charging_outside_hours(self):
        self.assertEqual(self.check(base(), hour=22).mode, "idle")
        self.assertEqual(self.check(base(), hour=5).mode, "idle")

    def test_high_soc_required_to_charge(self):
        self.assertEqual(self.check(base(solax_soc=94)).mode, "idle")

    def test_zero_when_no_pv_surplus(self):
        result = self.check(base(grid=-300, charge_setpoint=500))
        self.assertEqual((result.mode, result.charge_w), ("idle", 0))

    def test_night_charge_exclusive_control(self):
        d = self.check(base(night=True))
        self.assertEqual((d.mode, d.charge_w, d.discharge_w), ("night", None, None))

    def test_missing_night_guard_no_writes(self):
        self.assertEqual(self.check(base(night=None)).mode, "unavailable")

    def test_disabled_no_writes(self):
        d = self.check(base(), enabled=False)
        self.assertEqual((d.charge_w, d.discharge_w), (None, None))

    def test_discharge_starts_on_import(self):
        d = self.check(base(solax_soc=10, grid=-300, pv_total=0))
        self.assertEqual((d.mode, d.discharge_w), ("discharge", 100))

    def test_discharge_is_possible_at_night(self):
        d = self.check(base(solax_soc=10, grid=-300), hour=2)
        self.assertEqual((d.mode, d.discharge_w), ("discharge", 100))

    def test_discharge_reduction(self):
        d = self.check(base(solax_soc=10, grid=-50, discharge_setpoint=500))
        self.assertEqual((d.mode, d.discharge_w), ("idle", 0))

    def test_discharge_increase_100(self):
        d = self.check(base(solax_soc=10, grid=-500, discharge_setpoint=300, solax_battery=0))
        self.assertEqual((d.mode, d.discharge_w), ("discharge", 400))

    def test_ev_and_heating_block_discharge(self):
        common = dict(solax_soc=10, grid=-500, discharge_setpoint=300)
        self.assertEqual(self.check(base(wallbox=1.1, **common)).mode, "idle")
        self.assertEqual(self.check(base(necharge_active=True, **common)).mode, "idle")
        self.assertEqual(self.check(base(necharge_power=90, **common)).mode, "idle")
        self.assertEqual(self.check(base(heaters=(True, False, False, False, False, False), **common)).mode, "idle")

    def test_missing_heater_signal_blocks_discharge(self):
        d = self.check(base(solax_soc=10, grid=-500,
                            heaters=(None, False, False, False, False, False)))
        self.assertEqual((d.mode, d.discharge_w), ("idle", 0))

    def test_no_solax_discharge_charging(self):
        d = self.check(base(grid=500, solax_battery=-400))
        self.assertEqual(d.charge_target_w, 0)

    def test_no_solax_charge_discharging(self):
        d = self.check(base(solax_soc=10, grid=-300, solax_battery=400))
        self.assertEqual(d.discharge_w, 0)

    def test_missing_common_telemetry_requests_zero(self):
        d = self.check(base(grid=None))
        self.assertEqual((d.mode, d.charge_w, d.discharge_w), ("idle", 0, 0))

    def test_sign_convention(self):
        # Marstek discharge at 200 W and grid import 300 W => target 500 W.
        d = self.check(base(solax_soc=10, grid=-300, marstek_ac=200,
                            solax_battery=0, discharge_setpoint=200))
        self.assertEqual(d.discharge_target_w, 500)
        self.assertEqual(d.discharge_w, 300)


if __name__ == "__main__":
    unittest.main()

class ConfigurablePowerLimitsTests(unittest.TestCase):
    """Power sliders must affect the actual calculation, including zero."""

    def test_zero_charge_limit_disables_charging(self):
        d = evaluate(base(grid=4500, charge_setpoint=1000),
                     Settings(max_charge_w=0), 12, True)
        self.assertEqual((d.mode, d.charge_w, d.discharge_w), ("idle", 0, 0))

    def test_zero_discharge_limit_disables_discharging(self):
        d = evaluate(base(solax_soc=10, grid=-900, discharge_setpoint=500),
                     Settings(max_discharge_w=0), 12, True)
        self.assertEqual((d.mode, d.discharge_w), ("idle", 0))

    def test_charge_limit_allows_up_to_2500w(self):
        d = evaluate(base(pv_total=4000, grid=3500,
                          charge_setpoint=2400), Settings(max_charge_w=2500), 12, True)
        self.assertEqual((d.mode, d.charge_w, d.charge_target_w),
                         ("charge", 2500, 2500))

    def test_discharge_limit_allows_up_to_2500w(self):
        d = evaluate(base(solax_soc=10, grid=-3000, marstek_ac=2400,
                          discharge_setpoint=2400, solax_battery=0),
                     Settings(max_discharge_w=2500), 12, True)
        self.assertEqual((d.mode, d.discharge_w, d.discharge_target_w),
                         ("discharge", 2500, 2500))

    def test_reducing_charge_cap_reduces_current_setpoint(self):
        d = evaluate(base(grid=2000, charge_setpoint=2400),
                     Settings(max_charge_w=800), 12, True)
        self.assertLessEqual(d.charge_w or 0, 800)

    def test_reducing_discharge_cap_reduces_current_setpoint(self):
        d = evaluate(base(solax_soc=10, grid=-3000, discharge_setpoint=2200),
                     Settings(max_discharge_w=900), 12, True)
        self.assertLessEqual(d.discharge_w or 0, 900)


class EmergencyGridChargingTests(unittest.TestCase):
    def check(self, data=None, settings=None, hour=2, enabled=True, emergency=True):
        return evaluate(data or base(marstek_soc=20), settings or Settings(), hour,
                        enabled, emergency)

    def test_grid_import_no_pv_needed(self):
        d = self.check(base(pv_total=None,
                            grid=-600, solax_soc=None, solax_battery=None,
                            marstek_soc=20))
        self.assertEqual((d.mode, d.charge_w, d.discharge_w),
                         ("emergency_charge", 100, 0))

    def test_increase_only_100_per_cycle(self):
        d = self.check(base(marstek_soc=20, charge_setpoint=300),
                       Settings(emergency_charge_w=1800))
        self.assertEqual(d.charge_w, 400)

    def test_lower_slider_clamps_immediately(self):
        d = self.check(base(marstek_soc=20, charge_setpoint=2100),
                       Settings(emergency_charge_w=500))
        self.assertEqual(d.charge_w, 500)

    def test_emergency_independent_of_pv_charge_limit(self):
        d = self.check(base(marstek_soc=20),
                       Settings(max_charge_w=0, emergency_charge_w=1800))
        self.assertEqual((d.mode, d.charge_w), ("emergency_charge",100))

    def test_hold_reserve_at_target(self):
        d = self.check(base(marstek_soc=90, charge_setpoint=500),
                       Settings(emergency_soc_target=90))
        self.assertEqual((d.mode, d.charge_w, d.discharge_w),
                         ("emergency_hold", 0, 0))

    def test_emergency_off_restores_normal_logic(self):
        d = self.check(base(marstek_soc=40, grid=-500, solax_soc=10,
                            pv_total=0), emergency=False)
        self.assertEqual(d.mode, "discharge")

    def test_night_always_wins(self):
        d = self.check(base(night=True, marstek_soc=20))
        self.assertEqual((d.mode, d.charge_w), ("night", None))

    def test_unknown_night_never_writes(self):
        d = self.check(base(night=None, marstek_soc=20))
        self.assertEqual((d.mode, d.charge_w), ("unavailable", None))

    def test_soc_missing_blocks_grid_charge(self):
        d = self.check(base(marstek_soc=None))
        self.assertEqual((d.mode, d.charge_w), ("emergency_blocked", 0))

    def test_mode_register_missing_blocks_grid_charge(self):
        d = self.check(base(marstek_soc=25, forced_mode=None))
        self.assertEqual(d.mode, "emergency_blocked")

    def test_zero_power_keeps_reserve(self):
        d = self.check(base(marstek_soc=20), Settings(emergency_charge_w=0))
        self.assertEqual((d.mode,d.charge_w,d.discharge_w),
                         ("emergency_hold",0,0))

    def test_main_switch_off_blocks_grid_charge(self):
        d = self.check(base(marstek_soc=20), enabled=False)
        self.assertEqual((d.mode,d.charge_w), ("disabled",None))

class EmergencyDischargeLockTests(unittest.TestCase):
    def test_lock_status_with_emergency_on(self):
        d = base(marstek_soc=25)
        reason = module.discharge_lock_reason(d,Settings(),True,True)
        self.assertIn("Entladung gesperrt",reason)

    def test_night_lock_precedes_emergency(self):
        d = base(marstek_soc=25,night=True)
        reason = module.discharge_lock_reason(d,Settings(),True,True)
        self.assertEqual(reason,"Nachtladung hat Vorrang")


class AggregatePvSensorTests(unittest.TestCase):
    def test_uses_aggregate_pv_without_doubling(self):
        d = evaluate(base(pv_total=900, grid=2000), Settings(), 12, True)
        self.assertEqual(d.pv_total_w, 900)
        self.assertEqual(d.charge_target_w, 800)

    def test_missing_aggregate_sensor_prevents_pv_charge(self):
        d = evaluate(base(pv_total=None, grid=3000), Settings(), 12, True)
        self.assertEqual(d.mode, "idle")
        self.assertEqual(d.charge_w, 0)

    def test_missing_pv_does_not_prevent_discharge(self):
        d = evaluate(base(pv_total=None, grid=-400, solax_soc=10), Settings(), 12, True)
        self.assertEqual(d.mode, "discharge")


class IntegratedNightReserveTests(unittest.TestCase):
    def plan(self, hour=2, soc=9.9, enabled=True, active=False, guard=False,
             control_valid=True):
        return module.evaluate_night(
            hour=hour, soc=soc, enabled=enabled, active=active,
            guard=guard, control_valid=control_valid,
        )

    def test_disabled_never_starts(self):
        self.assertEqual(self.plan(enabled=False).action, "off")

    def test_only_00_to_06(self):
        self.assertEqual(self.plan(hour=0).action, "start")
        self.assertEqual(self.plan(hour=5).action, "start")
        self.assertEqual(self.plan(hour=6).action, "wait")
        self.assertEqual(self.plan(hour=23).action, "wait")

    def test_start_below_10_only(self):
        self.assertEqual(self.plan(soc=9.99).action, "start")
        self.assertEqual(self.plan(soc=10).action, "wait")
        self.assertEqual(self.plan(soc=10.5).action, "wait")

    def test_charge_through_hysteresis_band(self):
        self.assertEqual(self.plan(active=True, guard=True, soc=10.8).action, "charge")
        self.assertEqual(self.plan(active=True, guard=True, soc=10.0).action, "charge")

    def test_stop_at_11(self):
        self.assertEqual(self.plan(active=True, guard=True, soc=11).action, "stop")
        self.assertEqual(self.plan(active=True, guard=True, soc=12).action, "stop")

    def test_stop_at_06_even_below_11(self):
        self.assertEqual(self.plan(hour=6, active=True, guard=True).action, "stop")

    def test_disable_stops_active_reserve(self):
        self.assertEqual(self.plan(enabled=False, active=True, guard=True).action, "stop")

    def test_missing_soc_never_starts(self):
        self.assertEqual(self.plan(soc=None).action, "wait")
        self.assertEqual(self.plan(soc=float('nan')).action, "wait")

    def test_missing_soc_during_active_charge_must_abort(self):
        self.assertEqual(self.plan(active=True, guard=True, soc=None).action, "invalid")

    def test_missing_control_never_starts(self):
        self.assertEqual(self.plan(control_valid=False).action, "wait")

    def test_lost_guard_aborts_active_control(self):
        self.assertEqual(self.plan(active=True, guard=False).action, "invalid")

    def test_unknown_guard_blocks_activation(self):
        self.assertEqual(self.plan(guard=None).action, "wait")

    def test_external_owner_is_not_overwritten(self):
        self.assertEqual(self.plan(guard=True).action, "external")

    def test_active_night_ignores_main_manager_switch(self):
        # The separate night-enabled flag, not main enabled, drives charging.
        self.assertEqual(self.plan(enabled=True, active=True, guard=True).action, "charge")


class ConfigurableNightThresholdTests(unittest.TestCase):
    """Start threshold is an integer displayed SoC band; target is exact."""

    def plan(self, *, start=9, target=11, soc=9.5, active=False, guard=False, hour=2):
        return module.evaluate_night(
            enabled=True, active=active, guard=guard,
            control_valid=True, soc=soc, hour=hour,
            start_soc=start, target_soc=target,
        )

    def test_preserve_legacy_defaults_for_9_point_x(self):
        self.assertEqual(self.plan(soc=9.99).action, "start")
        self.assertEqual(self.plan(soc=10.0).action, "wait")

    def test_user_sets_30_to_80(self):
        self.assertEqual(self.plan(start=30, target=80, soc=30.75).action, "start")
        self.assertEqual(self.plan(start=30, target=80, soc=31).action, "wait")
        self.assertEqual(self.plan(start=30, target=80, soc=79, active=True, guard=True).action,
                         "charge")
        self.assertEqual(self.plan(start=30, target=80, soc=80, active=True, guard=True).action,
                         "stop")

    def test_9_to_10_is_valid_and_no_premature_stop(self):
        self.assertEqual(self.plan(start=9, target=10, soc=9.9).action, "start")
        self.assertEqual(self.plan(start=9, target=10, soc=9.9, active=True, guard=True).action,
                         "charge")
        self.assertEqual(self.plan(start=9, target=10, soc=10, active=True, guard=True).action,
                         "stop")

    def test_equal_levels_are_invalid(self):
        self.assertEqual(self.plan(start=50, target=50, soc=49.9).action, "wait")
        self.assertEqual(self.plan(start=50, target=50, soc=49.9, active=True, guard=True).action,
                         "invalid")

    def test_start_range_9_to_50_and_goal_up_to_100(self):
        self.assertEqual(self.plan(start=50, target=100, soc=50.9).action, "start")
        self.assertEqual(self.plan(start=50, target=100, soc=51).action, "wait")
        self.assertEqual(self.plan(start=51, target=100, soc=30).action, "wait")
        self.assertEqual(self.plan(start=51, target=100, soc=30, active=True, guard=True).action,
                         "invalid")

    def test_six_am_stops_even_far_below_target(self):
        self.assertEqual(self.plan(start=50, target=100, soc=52, hour=6,
                                   active=True, guard=True).action, "stop")

    def test_invalid_order_never_starts_and_aborts_active(self):
        self.assertEqual(self.plan(start=90, target=80).action, "wait")
        self.assertEqual(self.plan(start=90, target=80, active=True, guard=True).action, "invalid")

    def test_missing_soc_at_high_target_stops(self):
        self.assertEqual(self.plan(start=50, target=80, soc=None, active=True, guard=True).action,
                         "invalid")

    def test_daytime_never_starts_even_with_high_target(self):
        self.assertEqual(self.plan(start=50, target=90, soc=50, hour=12).action, "wait")
