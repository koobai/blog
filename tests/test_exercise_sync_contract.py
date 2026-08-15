import copy
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

from jingzhe.exercise_sync_contract import (
    ACTIVITY_FIELDS,
    ROUTE_STATUSES,
    SCHEMA,
    SUPPORTED_TYPES,
    exercise_identity,
    validate_exercise_sync_payload,
)


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'tests/fixtures'


def moving_time_seconds(value):
    hours, minutes, seconds = (int(part) for part in value.split(':'))
    return hours * 3600 + minutes * 60 + seconds


def app_record_to_v1(record):
    local_time = record['start_date_local']
    if local_time[-1:] not in ('Z',) and '+' not in local_time[10:] and '-' not in local_time[10:]:
        local_time += '+08:00'
    activity = {
        'external_id': record['source_id'],
        'name': record['name'],
        'type': record['type'],
        'started_at': local_time,
        'duration_seconds': moving_time_seconds(record['moving_time']),
        'distance_km': record['distance'],
        'average_heartrate_bpm': record['average_heartrate'],
        'elevation_gain_m': record['total_elevation_gain'],
        'calories_kcal': record['calories'],
        'is_indoor': record['is_indoor'],
        'route_status': record['route_status'],
    }
    if record.get('summary_polyline'):
        activity['summary_polyline'] = record['summary_polyline']
    return activity


class ExerciseSyncV1ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads(
            (FIXTURES / 'exercise_sync_v1.json').read_text(encoding='utf-8')
        )

    def test_schema_freezes_identity_field_ownership_and_version(self):
        metadata = SCHEMA['x-jingzhe-contract']
        self.assertEqual(1, SCHEMA['properties']['schema_version']['const'])
        self.assertEqual(['source', 'external_id'], metadata['identity'])
        self.assertFalse(metadata['producer_participates_in_identity'])
        self.assertEqual(ACTIVITY_FIELDS, set(metadata['adapter_owned_activity_fields']))
        self.assertEqual('source_adapter', metadata['privacy_decision_owner'])
        self.assertIn('Never fuzzy-deduplicate', metadata['source_switch'])
        self.assertTrue(
            {'run_id', 'source_id'}.issubset(metadata['gateway_owned_output_fields'])
        )
        self.assertTrue(
            {
                'display_name', 'sport_display_name', 'pace_num', 'pace_unit',
                'card_achievement', 'calendar_achievements'
            }.issubset(metadata['processor_owned_output_fields'])
        )
        self.assertFalse(
            ACTIVITY_FIELDS & set(metadata['gateway_owned_output_fields'])
        )
        self.assertFalse(
            ACTIVITY_FIELDS & set(metadata['processor_owned_output_fields'])
        )

    def test_supported_types_follow_the_shared_exercise_contract(self):
        exercise = json.loads(
            (ROOT / 'data/jingzhe/exercise.json').read_text(encoding='utf-8')
        )
        self.assertEqual(set(exercise['sports']), SUPPORTED_TYPES)

    def test_synthetic_fixture_covers_every_route_status_and_is_valid(self):
        self.assertEqual([], validate_exercise_sync_payload(self.fixture))
        self.assertEqual(
            ROUTE_STATUSES,
            {item['route_status'] for item in self.fixture['upsert']}
        )

    def test_privacy_and_indoor_route_rules_are_enforced(self):
        private_track = copy.deepcopy(self.fixture)
        private = next(
            item for item in private_track['upsert']
            if item['route_status'] == 'privacy_hidden'
        )
        private['summary_polyline'] = 'must-not-be-accepted'
        self.assertTrue(any(
            '不得包含 summary_polyline' in error
            for error in validate_exercise_sync_payload(private_track)
        ))

        missing_public_track = copy.deepcopy(self.fixture)
        public = next(
            item for item in missing_public_track['upsert']
            if item['route_status'] == 'available'
        )
        del public['summary_polyline']
        self.assertTrue(any(
            'available 必须包含' in error
            for error in validate_exercise_sync_payload(missing_public_track)
        ))

        indoor_pending = copy.deepcopy(self.fixture)
        indoor = next(item for item in indoor_pending['upsert'] if item['is_indoor'])
        indoor['route_status'] = 'pending'
        self.assertEqual([], validate_exercise_sync_payload(indoor_pending))

        indoor_track = copy.deepcopy(self.fixture)
        indoor = next(item for item in indoor_track['upsert'] if item['is_indoor'])
        indoor['route_status'] = 'available'
        indoor['summary_polyline'] = 'must-not-be-accepted'
        self.assertTrue(any(
            '室内运动' in error
            for error in validate_exercise_sync_payload(indoor_track)
        ))

    def test_batch_identity_is_idempotent_and_deletion_is_explicit(self):
        duplicate = copy.deepcopy(self.fixture)
        duplicate['upsert'].append(copy.deepcopy(duplicate['upsert'][0]))
        duplicate['delete'].append(duplicate['upsert'][1]['external_id'])
        errors = validate_exercise_sync_payload(duplicate)
        self.assertTrue(any('upsert 包含重复' in error for error in errors))
        self.assertTrue(any('同时 upsert 和 delete' in error for error in errors))

        empty = {'schema_version': 1, 'source': 'synthetic_contract', 'mode': 'delta'}
        self.assertTrue(any(
            '至少有一项非空' in error
            for error in validate_exercise_sync_payload(empty)
        ))

        empty_snapshot = {
            'schema_version': 1,
            'source': 'synthetic_contract',
            'mode': 'snapshot',
            'upsert': [],
        }
        self.assertEqual([], validate_exercise_sync_payload(empty_snapshot))
        invalid_snapshot = copy.deepcopy(empty_snapshot)
        invalid_snapshot['delete'] = ['old-activity']
        self.assertTrue(any(
            'snapshot 不接受 delete' in error
            for error in validate_exercise_sync_payload(invalid_snapshot)
        ))

    def test_source_switch_keeps_namespaces_distinct_and_producer_is_diagnostic(self):
        external_id = self.fixture['upsert'][0]['external_id']
        apple_payload = copy.deepcopy(self.fixture)
        apple_payload['source'] = 'apple_health'
        apple_payload['producer'] = 'laodao_app'
        keep_payload = copy.deepcopy(self.fixture)
        keep_payload['source'] = 'keep'
        keep_payload['producer'] = 'laodao_app'

        self.assertEqual([], validate_exercise_sync_payload(apple_payload))
        self.assertEqual([], validate_exercise_sync_payload(keep_payload))
        self.assertNotEqual(
            exercise_identity(apple_payload['source'], external_id),
            exercise_identity(keep_payload['source'], external_id),
        )
        self.assertEqual(
            exercise_identity('apple_health', external_id),
            exercise_identity('apple_health', external_id),
        )

        changed_producer = copy.deepcopy(apple_payload)
        changed_producer['producer'] = 'ios_shortcut'
        self.assertEqual([], validate_exercise_sync_payload(changed_producer))
        self.assertEqual(
            exercise_identity(apple_payload['source'], external_id),
            exercise_identity(changed_producer['source'], external_id),
        )

    def test_unknown_fields_and_breaking_versions_are_rejected(self):
        future = copy.deepcopy(self.fixture)
        future['schema_version'] = 2
        future['upsert'][0]['display_name'] = '客户端不得提供展示字段'
        errors = validate_exercise_sync_payload(future)
        self.assertTrue(any('schema_version 必须为 1' in error for error in errors))
        self.assertTrue(any('display_name' in error for error in errors))

    def test_current_laodao_app_facts_map_to_v1_without_blog_fields(self):
        records = json.loads(
            (FIXTURES / 'laodao_app_activity_upload.json').read_text(encoding='utf-8')
        )
        pending_indoor = copy.deepcopy(records[1])
        pending_indoor['run_id'] = 910005
        pending_indoor['source_id'] = 'synthetic-app-source-pending-indoor'
        pending_indoor['route_status'] = 'pending'
        pending_indoor['is_indoor'] = True
        pending_indoor.pop('summary_polyline', None)
        records.append(pending_indoor)
        payload = {
            'schema_version': 1,
            'source': 'apple_health',
            'producer': 'laodao_app',
            'mode': 'snapshot',
            'upsert': [app_record_to_v1(record) for record in records],
        }
        self.assertEqual([], validate_exercise_sync_payload(payload))
        self.assertEqual(
            {record['source_id'] for record in records},
            {item['external_id'] for item in payload['upsert']}
        )
        self.assertEqual(
            {record['route_status'] for record in records},
            {item['route_status'] for item in payload['upsert']}
        )
        for record, mapped in zip(records, payload['upsert']):
            mapped_utc = datetime.fromisoformat(mapped['started_at']).astimezone(timezone.utc)
            source_utc = datetime.fromisoformat(record['start_date_utc'].replace('Z', '+00:00'))
            self.assertEqual(source_utc, mapped_utc)
            self.assertNotIn('run_id', mapped)
            self.assertNotIn('source_id', mapped)
            self.assertNotIn('pace_num', mapped)
            self.assertNotIn('display_name', mapped)


if __name__ == '__main__':
    unittest.main()
