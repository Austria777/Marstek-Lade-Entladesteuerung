"""Constants for Marstek PV Manager."""

DOMAIN = "marstek_pv_manager"

# Input and actuator entity IDs are supplied by the existing integrations.
ENTITY_FIELDS: dict[str, tuple[str, str]] = {
    "pv_total": ("sensor.pv_leistung_gesamt", "sensor"),
    "grid": ("sensor.solax_m_measured_power", "sensor"),
    "solax_battery": ("sensor.solax_m_battery_power_charge", "sensor"),
    "solax_soc": ("sensor.solax_m_battery_capacity_2", "sensor"),
    "wallbox": ("sensor.evcc_delta_ac_smart_wallbox_charge_power", "sensor"),
    "necharge_power": ("sensor.necharge_ladeleistung", "sensor"),
    "necharge_active": ("binary_sensor.evcc_necharge_charging", "binary_sensor"),
    "heater_1": ("switch.puffer_shellypro3_output_1", "switch"),
    "heater_2": ("switch.puffer_shellypro3_output_2", "switch"),
    "heater_3": ("switch.puffer_shellypro3_output_3", "switch"),
    "heater_4": ("switch.warmwasser_shellypro3_output_1", "switch"),
    "heater_5": ("switch.warmwasser_shellypro3_output_2", "switch"),
    "heater_6": ("switch.warmwasser_shellypro3_output_3", "switch"),
    "marstek_ac": ("sensor.marstek_venus_modbus_ac_leistung", "sensor"),
    "marstek_soc": ("sensor.marstek_venus_modbus_soc_batterie", "sensor"),  # provided by user
    "charge_setpoint": ("number.marstek_venus_modbus_ladeleistung_einstellen", "number"),
    "discharge_setpoint": ("number.marstek_venus_modbus_entladeleistung_einstellen", "number"),
    "max_discharge": ("number.marstek_venus_modbus_maximale_entladeleistung", "number"),
    "max_charge": ("number.marstek_venus_modbus_maximale_ladeleistung", "number"),
    "user_mode": ("select.marstek_venus_modbus_benutzer_modus", "select"),
    "forced_mode": ("select.marstek_venus_modbus_erzwungener_modus", "select"),
    "rs485": ("switch.marstek_venus_modbus_rs485_steuermodus", "switch"),
    "night": ("input_boolean.marstek_10_soc_nachtladung", "input_boolean"),
}

SOURCE_FIELDS = (
    "grid", "solax_battery", "solax_soc", "pv_total", "wallbox",
    "necharge_power", "necharge_active", "heater_1", "heater_2", "heater_3",
    "heater_4", "heater_5", "heater_6",
)
MARSTEK_FIELDS = (
    "marstek_ac", "marstek_soc", "charge_setpoint", "discharge_setpoint", "max_discharge", "max_charge",
    "user_mode", "forced_mode", "rs485", "night",
)

# YAML defaults, also editable from the Options UI.
PARAMETERS: dict[str, tuple[int, int, int]] = {
    "max_charge_w": (2000, 0, 2500),
    "max_discharge_w": (1800, 0, 2500),
    "emergency_charge_w": (500, 0, 2500),
    "emergency_soc_target": (90, 50, 100),
    "night_start_soc": (9, 9, 50),  # 9 means the 9.x% band, as before
    "night_target_soc": (11, 10, 100),
    "step_w": (100, 1, 1000),
    "export_reserve_w": (100, 0, 2000),
    "minimum_charge_w": (100, 0, 2000),
    "minimum_pv_total_w": (200, 0, 5000),
    "start_import_w": (80, 0, 2000),
    "discharge_increase_w": (100, 1, 2000),
    "discharge_decrease_w": (25, 0, 1000),
    "wallbox_limit_w": (50, 0, 3000),
    "start_hour": (6, 0, 23),
    "end_hour": (21, 1, 24),
    "solax_charge_soc": (95, 0, 100),
    "solax_discharge_soc": (11, 0, 100),
}
DEFAULTS: dict[str, str | int | bool] = {
    **{key: item[0] for key, item in ENTITY_FIELDS.items()},
    **{key: values[0] for key, values in PARAMETERS.items()},
    "enabled": False,
    "night_enabled": False,
    "sync_charge_limit": False,  # opt-in only, never raise hardware limits on upgrade
}
