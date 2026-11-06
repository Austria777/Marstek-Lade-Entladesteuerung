"""Translation regression checks: Tesla options must be visible, not blank."""
from pathlib import Path
import json
import unittest

BASE = Path(__file__).resolve().parents[1] / "custom_components" / "marstek_pv_manager"

class TeslaOptionsTranslationsTests(unittest.TestCase):
    def test_tesla_option_menu_and_eight_input_labels_in_both_languages(self):
        for lang in ("de", "en"):
            with self.subTest(lang=lang):
                data = json.loads((BASE / "translations" / f"{lang}.json").read_text(encoding="utf-8"))
                options = data["options"]["step"]
                self.assertTrue(options["init"]["menu_options"]["tesla"].strip())
                self.assertTrue(options["tesla"]["title"].strip())
                for key in ("model3_soc", "model3_range", "model3_awake", "model3_sync_target",
                            "modely_soc", "modely_range", "modely_awake", "modely_sync_target"):
                    self.assertTrue(options["tesla"]["data"][key].strip(), f"missing {lang}: {key}")

    def test_tesla_configuration_flow_lists_translated_step(self):
        source = (BASE / "config_flow.py").read_text(encoding="utf-8")
        self.assertIn('"tesla"', source)
        self.assertIn('async def async_step_tesla(', source)

if __name__ == "__main__":
    unittest.main()
