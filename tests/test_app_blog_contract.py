"""Consumer contract for synthetic JSON uploaded by the Laodao App.

The fixture mirrors WorkoutRecord.CodingKeys and WorkoutRouteStatus. It contains
no real HealthKit identity, location, or track data.
"""

import copy
import json
import unittest
from pathlib import Path

import process_activities
from jingzhe.monthly_stats import source_data_hash
from tools import jingzhe


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests/fixtures/laodao_app_activity_upload.json'
SCHEMA = ROOT / 'schemas/data/activities.schema.json'

APP_REQUIRED_FIELDS = {
    'run_id', 'name', 'type', 'distance', 'moving_time', 'start_date_local',
    'average_heartrate', 'pace_num', 'pace_unit', 'total_elevation_gain',
    'calories', 'source_id', 'start_date_utc', 'route_status', 'is_indoor'
}
APP_OPTIONAL_FIELDS = {
    'summary_polyline', 'energy_title', 'food_key', 'food_title_version',
    'distance_title', 'distance_title_key', 'distance_title_version',
    'route_title', 'route_title_version'
}
APP_ROUTE_STATUSES = {'available', 'unavailable', 'pending', 'privacy_hidden'}


class LaodaoAppBlogContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = json.loads(FIXTURE.read_text(encoding='utf-8'))

    def test_synthetic_upload_matches_the_app_owned_wire_contract(self):
        self.assertEqual(
            APP_ROUTE_STATUSES,
            {item['route_status'] for item in self.raw}
        )
        for item in self.raw:
            self.assertTrue(APP_REQUIRED_FIELDS.issubset(item))
            self.assertTrue(set(item).issubset(APP_REQUIRED_FIELDS | APP_OPTIONAL_FIELDS))
            if item['route_status'] != 'available':
                self.assertNotIn('summary_polyline', item)

    def test_blog_schema_accepts_every_app_route_status(self):
        schema = json.loads(SCHEMA.read_text(encoding='utf-8'))
        blog_statuses = set(
            schema['items']['properties']['route_status']['enum']
        )

        self.assertTrue(APP_ROUTE_STATUSES.issubset(blog_statuses))

    def test_app_upload_survives_processing_validation_and_privacy_rules(self):
        def unexpected_route_lookup(_activity):
            self.fail('the synthetic custom public name must not trigger a network lookup')

        processed, changed = process_activities.process_activity_data(
            copy.deepcopy(self.raw),
            public_route_resolver=unexpected_route_lookup,
            logger=lambda _message: None
        )

        self.assertTrue(changed)
        self.assertEqual([], jingzhe.validate_activity_items(processed))
        self.assertEqual(source_data_hash(self.raw), source_data_hash(processed))

        by_status = {item['route_status']: item for item in processed}
        self.assertEqual('pending', by_status['pending']['route_status'])
        self.assertIn('distance_title', by_status['pending'])
        self.assertIn('display_name', by_status['pending'])
        self.assertEqual(
            'synthetic-app-source-pending',
            by_status['pending']['source_id']
        )
        for status in ('pending', 'unavailable', 'privacy_hidden'):
            self.assertNotIn('summary_polyline', by_status[status])


if __name__ == '__main__':
    unittest.main()
