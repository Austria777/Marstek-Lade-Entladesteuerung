"""Pure calculation logic: faithful port of the supplied YAML.

This module intentionally has no Home Assistant imports so it can be tested alone.
Sign convention from the supplied setup: grid +export/-import;
SolaX battery +charge/-discharge. Marstek AC uses original entity sign.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import floor, isfinite


@dataclass(frozen=True)
class Settings:
    max_charge_w: int = 2000
    max_discharge_w: int = 1800
    step_w: int = 100
    export_reserve_w: int = 100
    minimum_charge_w: int = 100
    minimum_pv_total_w: int = 200
    start_import_w: int = 80
    discharge_increase_w: int = 100
    discharge_decrease_w: int = 25
    wallbox_limit_w: int = 50  # YAML: 0.05 kW
    start_hour: int = 6
    end_hour: int = 21
    solax_charge_soc: int = 95
    solax_discharge_soc: int = 11
    emergency_charge_w: int = 500
    emergency_soc_target: int = 90
    night_start_soc: int = 9
    night_target_soc: int = 11


@dataclass(frozen=True)
class Inputs:
    pv_total: float | None = None
    grid: float | None = None
    solax_battery: float | None = None
    solax_soc: float | None = None
    wallbox: float | None = None  # kW, same as original YAML
    necharge_power: float | None = None
    necharge_active: bool | None = None
    heaters: tuple[bool | None, ...] = (None,) * 6
    marstek_ac: float | None = None
    charge_setpoint: float | None = None
    discharge_setpoint: float | None = None
    max_discharge: float | None = None
    user_mode: str | None = None
    forced_mode: str | None = None
    rs485: bool | None = None
    night: bool | None = None
    marstek_soc: float | None = None


@dataclass(frozen=True)
class Decision:
    mode: str  # charge / discharge / idle / night / disabled / unavailable
    charge_w: int | None
    discharge_w: int | None
    charge_target_w: int
    discharge_target_w: int
    pv_total_w: float
    reason: str


def _valid(*values: object) -> bool:
    return all(
        value is not None and (not isinstance(value, float) or isfinite(value))
        for value in values
    )


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def evaluate(data: Inputs, s: Settings, hour: int, enabled: bool,
             emergency: bool = False) -> Decision:
    """Calculate command for one cycle, without performing any I/O."""
    empty = Decision("unavailable", None, None, 0, 0, 0, "missing_data")
    if not enabled:
        return Decision("disabled", None, None, 0, 0, 0, "disabled")
    if data.night is True:
        return Decision("night", None, None, 0, 0, 0, "night_control")
    # If the guard is unavailable we must not interfere with night charging.
    if data.night is None:
        return empty

    # Explicit emergency grid charging: independent of PV production, SolaX SoC,
    # charging windows and the normal maximum PV-charge limit. The SoC sensor and
    # controllable register states must be available, otherwise NO grid charge.
    if emergency:
        required = _valid(
            data.marstek_soc, data.grid, data.charge_setpoint,
            data.discharge_setpoint, data.user_mode, data.forced_mode, data.rs485,
        )
        if not required or not (0 <= data.marstek_soc <= 100):
            return Decision("emergency_blocked", 0, 0, 0, 0, 0,
                            "emergency_missing_data")
        if data.marstek_soc >= s.emergency_soc_target:
            return Decision("emergency_hold", 0, 0, 0, 0, 0,
                            "emergency_target_reached")
        limit = max(0, min(2500, s.emergency_charge_w))
        if limit == 0:
            return Decision("emergency_hold", 0, 0, 0, 0, 0,
                            "emergency_zero_power")
        # Ramp up gradually. Reductions are applied immediately.
        current = _clamp(round(data.charge_setpoint / s.step_w) * s.step_w,
                         0, limit)
        requested = int(min(limit, current + s.step_w))
        return Decision("emergency_charge", requested, 0, limit, 0, 0,
                        "emergency_grid_charge")

    common = _valid(
        data.grid, data.solax_battery, data.solax_soc, data.marstek_ac,
        data.charge_setpoint, data.discharge_setpoint,
        data.user_mode, data.forced_mode, data.rs485,
    )
    if not common:
        # With known night-charge guard, clear setpoints on telemetry failures.
        return Decision("idle", 0, 0, 0, 0, 0, "missing_data")

    assert data.grid is not None
    assert data.solax_battery is not None
    assert data.solax_soc is not None
    assert data.marstek_ac is not None
    assert data.charge_setpoint is not None
    assert data.discharge_setpoint is not None

    charge_valid = _valid(data.pv_total)
    discharge_valid = _valid(
        data.wallbox, data.necharge_power, data.necharge_active,
        *data.heaters, data.max_discharge,
    )
    # Single existing production sensor; never add its component sensors again.
    pv_total = max(0.0, data.pv_total or 0.0)
    solax_discharge = max(0.0, -data.solax_battery)
    solax_charge = max(0.0, data.solax_battery)

    # Jinja's round(0, 'common') matches Python round-to-even.
    current_charge = int(_clamp(round(data.charge_setpoint / s.step_w) * s.step_w,
                                0, s.max_charge_w))
    current_discharge = int(_clamp(round(data.discharge_setpoint / s.step_w) * s.step_w,
                                   0, s.max_discharge_w))
    reconstructed_surplus = data.grid - data.marstek_ac - solax_discharge
    usable = min(pv_total, reconstructed_surplus)
    limited = _clamp(usable - s.export_reserve_w, 0, s.max_charge_w)
    charge_target = floor(limited / s.step_w) * s.step_w

    charge_allowed = (
        charge_valid
        and s.start_hour <= hour < s.end_hour
        and data.solax_soc >= s.solax_charge_soc
        and pv_total >= s.minimum_pv_total_w
        and charge_target >= s.minimum_charge_w
    )
    if not charge_allowed:
        next_charge = 0
    elif charge_target > current_charge:
        next_charge = min(charge_target, current_charge + s.step_w, s.max_charge_w)
    else:
        next_charge = max(0, charge_target)

    wallbox_active = data.wallbox is not None and data.wallbox > s.wallbox_limit_w / 1000
    necharge_on = (data.necharge_active is True or
                   (data.necharge_power is not None and data.necharge_power > 50))
    heating_on = any(on is True for on in data.heaters)
    discharge_blocked = (
        not discharge_valid or data.solax_soc >= s.solax_discharge_soc
        or wallbox_active or necharge_on or heating_on
    )
    discharge_raw = _clamp(
        data.marstek_ac - data.grid - solax_charge, 0, s.max_discharge_w
    )
    discharge_target = floor(discharge_raw / s.step_w) * s.step_w

    if discharge_blocked:
        next_discharge = 0
    elif current_discharge <= 0:
        next_discharge = (
            s.step_w
            if data.grid < -s.start_import_w and discharge_target >= s.step_w
            else 0
        )
    elif discharge_raw < current_discharge - s.discharge_decrease_w:
        next_discharge = max(0, discharge_target)
    elif discharge_raw >= current_discharge + s.discharge_increase_w:
        next_discharge = min(s.max_discharge_w, current_discharge + s.step_w)
    else:
        next_discharge = current_discharge

    if charge_allowed and next_charge > 0:
        return Decision("charge", next_charge, 0, charge_target,
                        discharge_target, pv_total, "pv_surplus")
    if not discharge_blocked and next_discharge > 0:
        return Decision("discharge", 0, next_discharge, charge_target,
                        discharge_target, pv_total, "cover_import")
    if not charge_valid and not discharge_valid:
        reason = "invalid_inputs"
    elif discharge_blocked:
        reason = (
            "ev_charging" if wallbox_active or necharge_on
            else "heating_active" if heating_on
            else "soc_or_inputs"
        )
    else:
        reason = "no_demand"
    return Decision("idle", 0, 0, charge_target, discharge_target, pv_total, reason)



@dataclass(frozen=True)
class NightPlan:
    """Pure state-machine output for the integrated night reserve charger."""
    action: str  # off, wait, external, start, charge, stop, invalid
    reason: str


def evaluate_night(*, enabled: bool, active: bool, guard: bool | None,
                   soc: float | None, hour: int, control_valid: bool,
                   start_soc: int = 9, target_soc: int = 11) -> NightPlan:
    """Night hysteresis 00:00–06:00; configurable displayed SoC band.

    A start setting of 9% includes the 9.0–9.99% band, retaining v0.5.2
    behavior (start below 10%). Never start if the target is already reached.
    """
    window = 0 <= hour < 6
    valid_levels = (9 <= start_soc <= 50 and 10 <= target_soc <= 100
                    and start_soc < target_soc)
    if active:
        if not enabled or not window:
            return NightPlan("stop", "night_window_ended")
        if not valid_levels:
            return NightPlan("invalid", "night_config_invalid")
        if not control_valid or soc is None or not isfinite(soc) or not 0 <= soc <= 100:
            return NightPlan("invalid", "night_missing_data")
        if soc >= target_soc:
            return NightPlan("stop", "night_target_reached")
        if guard is not True:
            return NightPlan("invalid", "night_guard_lost")
        return NightPlan("charge", "night_reserve_charge")
    if not enabled:
        return NightPlan("off", "night_off")
    if guard is None:
        return NightPlan("wait", "night_guard_unknown")
    if guard is True:
        return NightPlan("external", "night_external_owner")
    if not window:
        return NightPlan("wait", "night_outside_window")
    if not valid_levels:
        return NightPlan("wait", "night_config_invalid")
    if soc is None or not isfinite(soc) or not 0 <= soc <= 100 or not control_valid:
        return NightPlan("wait", "night_missing_data")
    # e.g. "start 9%" begins at 9.x%, matching what HA users read onscreen.
    if soc < min(start_soc + 1, target_soc):
        return NightPlan("start", "night_reserve_charge")
    return NightPlan("wait", "night_soc_ok")

def discharge_lock_reason(data: Inputs, s: Settings, enabled: bool, emergency: bool = False) -> str:
    """Human-readable explanation why discharge is currently locked."""
    if not enabled:
        return "Regelung ausgeschaltet"
    if data.night is True:
        return "Nachtladung hat Vorrang"
    if data.night is None:
        return "Nachtladungsstatus unbekannt"
    if emergency:
        return "Notfall-Netzladung aktiv – Entladung gesperrt"
    if not _valid(data.grid, data.solax_soc, data.solax_battery,
                  data.marstek_ac, data.charge_setpoint, data.discharge_setpoint,
                  data.user_mode, data.forced_mode, data.rs485):
        return "Wichtige Messwerte fehlen"
    if not _valid(data.wallbox, data.necharge_power, data.necharge_active,
                  data.max_discharge, *data.heaters):
        return "Verbraucher-Messwerte fehlen"
    if data.wallbox > s.wallbox_limit_w / 1000:
        return "Delta-Wallbox lädt"
    if data.necharge_active or data.necharge_power > 50:
        return "NeCharge lädt"
    if any(data.heaters):
        return "Puffer-/Warmwasserheizung aktiv"
    if data.solax_soc >= s.solax_discharge_soc:
        return "SolaX-SoC über Entladeschwelle"
    if s.max_discharge_w == 0:
        return "Maximale Entladeleistung auf 0 W"
    return "Freigegeben"
