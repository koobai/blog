import json
import tempfile
import unittest
from pathlib import Path

from tools import jingzhe


class JingzheCliTests(unittest.TestCase):
    def test_hugo_version_parser_handles_extended_build(self):
        value = "hugo v0.165.0+extended+withdeploy darwin/arm64"

        self.assertEqual(jingzhe.parse_hugo_version(value), (0, 165, 0))
        self.assertGreaterEqual(jingzhe.parse_hugo_version(value), jingzhe.MINIMUM_HUGO_VERSION)

    def test_hugo_version_parser_rejects_unknown_output(self):
        self.assertIsNone(jingzhe.parse_hugo_version("hugo development build"))

    def test_replace_section_setting_preserves_following_sections(self):
        source = '[author]\nname = "old"\n\n[brand]\nname = "brand"\n'
        result = jingzhe.replace_section_setting(source, "author", "name", "new")

        self.assertIn('name = "new"', result)
        self.assertIn('[brand]\nname = "brand"', result)

    def test_activity_validator_reports_missing_and_invalid_status(self):
        errors = jingzhe.validate_activity_items([{"route_status": "secret"}])

        self.assertTrue(any("缺少" in error for error in errors))
        self.assertTrue(any("route_status" in error for error in errors))

    def test_activity_validator_accepts_pending_without_a_track(self):
        item = {
            "run_id": 1,
            "name": "Run",
            "type": "Run",
            "distance": 5,
            "moving_time": "00:30:00",
            "start_date_local": "2026-08-15T07:30:00",
            "route_status": "pending",
            "display_name": "跑起来",
            "sport_display_name": "跑步",
            "card_achievement": None,
            "calendar_achievements": [],
        }

        self.assertEqual(jingzhe.validate_activity_items([item]), [])

    def test_activity_validator_rejects_a_non_public_track(self):
        item = {
            "run_id": 1,
            "name": "Run",
            "type": "Run",
            "distance": 5,
            "moving_time": "00:30:00",
            "start_date_local": "2026-08-15T07:30:00",
            "route_status": "pending",
            "summary_polyline": "must-not-be-public",
            "display_name": "跑起来",
            "sport_display_name": "跑步",
            "card_achievement": None,
            "calendar_achievements": [],
        }

        errors = jingzhe.validate_activity_items([item])

        self.assertTrue(any("summary_polyline" in error for error in errors))

    def test_movie_validator_accepts_rating_boundaries(self):
        items = [
            {"id": "one", "title": "A", "rating": 0, "create_time": "2026-01-01"},
            {"id": "two", "title": "B", "rating": 5, "create_time": "2026-01-02"},
        ]

        self.assertEqual(jingzhe.validate_movie_items(items), [])

    def test_monthly_validator_rejects_invalid_month(self):
        errors = jingzhe.validate_monthly_items(
            {"2026-13": {"month_str": "2026-13", "stats": {}, "report_phase": "none"}}
        )

        self.assertEqual(errors, ["月份键无效：2026-13"])

    def test_exercise_contract_validator_rejects_unknown_group_member(self):
        contract = {
            "sports": {
                "Run": {
                    "name": "跑步",
                    "displayName": "跑步",
                    "color": "#F58200",
                    "fallbackTitle": "跑起来",
                }
            },
            "groups": {"run": ["Unknown"]},
            "foods": [{"key": "rice", "monthly": True}],
        }

        self.assertIn("分组 run 引用了未知运动", jingzhe.validate_exercise_contract(contract))

    def test_existing_init_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "existing"
            output.mkdir()
            marker = output / "keep.txt"
            marker.write_text("keep", encoding="utf-8")

            with self.assertRaises(ValueError):
                jingzhe.ensure_new_output(output)

            self.assertEqual(marker.read_text(encoding="utf-8"), "keep")

    def test_output_path_exists_resolves_pretty_and_static_routes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "post").mkdir()
            (root / "post/index.html").write_text("", encoding="utf-8")
            (root / "app.js").write_text("", encoding="utf-8")

            self.assertTrue(jingzhe.output_path_exists(root, "/post/"))
            self.assertTrue(jingzhe.output_path_exists(root, "/app.js"))
            self.assertFalse(jingzhe.output_path_exists(root, "/missing/"))

    def test_inline_script_collector_ignores_json_and_collects_javascript(self):
        collector = jingzhe.InlineScriptCollector()
        collector.feed(
            '<script type="application/ld+json">{"name":"site"}</script>'
            '<script>const value = 1;</script>'
            '<script src="/app.js"></script>'
            '<script type="module">export const ready = true;</script>'
        )
        self.assertEqual(
            collector.scripts,
            [("", "const value = 1;"), ("module", "export const ready = true;")],
        )

    def test_starter_marker_scan_covers_theme_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "themes/demo/layouts/index.html"
            path.parent.mkdir(parents=True)
            path.write_text("https://comments.koobai.com", encoding="utf-8")

            findings = jingzhe.scan_starter_markers(root)

            self.assertEqual(findings[0]["file"], "themes/demo/layouts/index.html")
            self.assertEqual(
                {finding["kind"] for finding in findings},
                {"production domain", "comments endpoint"},
            )

    def test_core_license_bundle_is_self_contained(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)

            jingzhe.write_core_licenses(output)

            self.assertIn("MIT License", (output / "LICENSE").read_text(encoding="utf-8"))
            self.assertTrue((output / "licenses/ViewImage-MIT.txt").is_file())
            self.assertIn("ViewImage 2.0.2", (output / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8"))

    def test_payload_has_stable_machine_fields(self):
        result = jingzhe.payload(
            "validate",
            [{"id": "demo", "ok": False, "level": "warning", "message": "warn"}],
        )

        self.assertEqual(set(("ok", "command", "checks", "errors", "warnings")) - set(result), set())
        self.assertTrue(result["ok"])
        self.assertEqual(result["warnings"], ["warn"])
        json.dumps(result)

    def test_validation_covers_repository_and_data_boundaries(self):
        checks = {item["id"]: item for item in jingzhe.validation_checks()}

        for check_id in (
            "data.catalog",
            "repository.generated-files",
            "repository.compatibility-entries",
            "data.raw-boundary",
        ):
            self.assertIn(check_id, checks)
            self.assertTrue(checks[check_id]["ok"], checks[check_id]["message"])


if __name__ == "__main__":
    unittest.main()
