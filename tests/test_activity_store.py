import copy
import json
import unittest
from pathlib import Path

import process_activities
from jingzhe.activity_store import (
    PROCESSOR_CACHE_FIELDS,
    activity_source_id,
    load_raw_activity_store,
    materialize_activity_store,
    raw_fact_field_names,
    validate_raw_activity_store,
)


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'tests/fixtures'
RAW_ACTIVITIES = ROOT / 'data/exercise/activities.json'


class ActivityFactStoreTests(unittest.TestCase):
    def test_repository_store_contains_only_source_owned_fields(self):
        store = load_raw_activity_store(RAW_ACTIVITIES)

        self.assertEqual([], validate_raw_activity_store(store))
        self.assertEqual({'apple_health'}, set(store['sources']))
        for fact in store['sources']['apple_health']:
            self.assertEqual(set(fact) - raw_fact_field_names(), set())
            self.assertEqual(set(fact) & PROCESSOR_CACHE_FIELDS, set())
            self.assertNotIn('source_id', fact)
            self.assertNotIn('run_id', fact)
            self.assertNotIn('pace_num', fact)
            self.assertNotIn('display_name', fact)
            if fact['route_status'] != 'available':
                self.assertNotIn('summary_polyline', fact)

    def test_existing_processor_cache_prevents_reprocessing(self):
        request = json.loads(
            (FIXTURES / 'exercise_sync_v1.json').read_text(encoding='utf-8')
        )
        store = {
            'schema_version': 1,
            'sources': {request['source']: request['upsert']},
        }
        current = materialize_activity_store(store)

        def unexpected_route_lookup(_activity):
            self.fail('custom public names must not trigger route lookup')

        processed, changed = process_activities.process_activity_data(
            copy.deepcopy(current),
            public_route_resolver=unexpected_route_lookup,
            logger=lambda _message: None,
        )
        self.assertTrue(changed)

        materialized = materialize_activity_store(store, processed)
        processed_again, changed_again = process_activities.process_activity_data(
            materialized,
            public_route_resolver=unexpected_route_lookup,
            logger=lambda _message: None,
        )
        self.assertFalse(changed_again)
        self.assertEqual(
            {item['source_id']: item for item in processed},
            {item['source_id']: item for item in processed_again},
        )

    def test_source_namespaces_are_distinct_and_run_ids_are_stable(self):
        request = json.loads(
            (FIXTURES / 'exercise_sync_v1.json').read_text(encoding='utf-8')
        )
        one_fact = copy.deepcopy(request['upsert'][0])
        store = {
            'schema_version': 1,
            'sources': {
                'apple_health': [copy.deepcopy(one_fact)],
                'keep': [copy.deepcopy(one_fact)],
            },
        }

        first = materialize_activity_store(store)
        second = materialize_activity_store(store, first)
        self.assertEqual(first, second)
        self.assertEqual(2, len(first))
        source_ids = {item['source_id'] for item in first}
        self.assertEqual({
            activity_source_id('apple_health', one_fact['external_id']),
            activity_source_id('keep', one_fact['external_id']),
        }, source_ids)
        self.assertTrue(all(source_id.startswith('jingzhe-sync-') for source_id in source_ids))
        self.assertEqual(2, len({str(item['run_id']) for item in first}))

    def test_raw_update_and_delete_do_not_retain_a_private_track(self):
        request = json.loads(
            (FIXTURES / 'exercise_sync_v1.json').read_text(encoding='utf-8')
        )
        public = next(
            copy.deepcopy(item)
            for item in request['upsert']
            if item['route_status'] == 'available'
        )
        original_store = {
            'schema_version': 1,
            'sources': {'apple_health': [public]},
        }
        cache = materialize_activity_store(original_store)
        cache[0]['energy_title'] = '稳定的博客展示缓存'

        private = copy.deepcopy(public)
        private['route_status'] = 'privacy_hidden'
        private.pop('summary_polyline')
        private['distance_km'] += 1
        private_store = {
            'schema_version': 1,
            'sources': {'apple_health': [private]},
        }
        updated = materialize_activity_store(private_store, cache)

        self.assertEqual(cache[0]['run_id'], updated[0]['run_id'])
        self.assertEqual('稳定的博客展示缓存', updated[0]['energy_title'])
        self.assertEqual('privacy_hidden', updated[0]['route_status'])
        self.assertNotIn('summary_polyline', updated[0])
        self.assertNotEqual(cache[0]['pace_num'], updated[0]['pace_num'])
        self.assertEqual(
            [],
            materialize_activity_store({'schema_version': 1, 'sources': {}}, updated),
        )

    def test_private_track_is_rejected_before_storage(self):
        request = json.loads(
            (FIXTURES / 'exercise_sync_v1.json').read_text(encoding='utf-8')
        )
        private = next(
            copy.deepcopy(item)
            for item in request['upsert']
            if item['route_status'] == 'privacy_hidden'
        )
        private['summary_polyline'] = 'must-not-enter-git'
        store = {
            'schema_version': 1,
            'sources': {'apple_health': [private]},
        }

        self.assertTrue(any(
            '不得包含 summary_polyline' in error
            for error in validate_raw_activity_store(store)
        ))

if __name__ == '__main__':
    unittest.main()
