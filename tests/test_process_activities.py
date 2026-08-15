import copy
import json
import os
import tempfile
import unittest
from pathlib import Path

import process_activities


FIXTURES = Path(__file__).parent / 'fixtures'


class ActivityPipelineCharacterizationTests(unittest.TestCase):
    def test_fixture_output_and_serialization_remain_exact(self):
        with (FIXTURES / 'activity_pipeline_input.json').open(encoding='utf-8') as file:
            source = json.load(file)
        expected_path = FIXTURES / 'activity_pipeline_expected.json'
        with expected_path.open(encoding='utf-8') as file:
            expected = json.load(file)

        route_calls = []

        def resolve_public_route(activity):
            route_calls.append(activity['run_id'])
            return '骑过长沙 · 湘江中路'

        actual, changed = process_activities.process_activity_data(
            copy.deepcopy(source),
            public_route_resolver=resolve_public_route,
            logger=lambda _message: None
        )
        self.assertTrue(changed)
        self.assertEqual([2], route_calls)
        self.assertEqual(expected, actual)

        handle, output_path = tempfile.mkstemp(suffix='.json')
        os.close(handle)
        try:
            process_activities.write_activity_data(actual, output_path)
            with open(output_path, encoding='utf-8') as file:
                rendered = file.read()
            self.assertEqual(expected_path.read_text(encoding='utf-8').rstrip('\n'), rendered)
        finally:
            os.unlink(output_path)


class FoodConversionContractTests(unittest.TestCase):
    def test_chocolate_uses_a_normal_piece_instead_of_a_tiny_piece(self):
        chocolate = next(
            item for item in process_activities.FOOD_EQUIVALENTS
            if item['key'] == 'chocolate'
        )
        self.assertEqual(43, chocolate['kcal'])

    def test_food_titles_use_the_new_contract(self):
        self.assertEqual(6, process_activities.FOOD_TITLE_VERSION)
        self.assertEqual(0.12, process_activities.MAX_FOOD_RELATIVE_ERROR)

    def test_current_calorie_range_has_a_natural_food_candidate(self):
        for calories in (33.3, 60.6, 134.5, 330.4, 800.7):
            errors = []
            for food in process_activities.FOOD_EQUIVALENTS:
                count = max(1, int(calories / food['kcal'] + 0.5))
                errors.append(abs(count * food['kcal'] - calories) / calories)

            self.assertLessEqual(
                min(errors),
                process_activities.MAX_FOOD_RELATIVE_ERROR,
                f'{calories} kcal has no food conversion within tolerance'
            )

    def test_very_low_calories_use_an_accurate_half_portion(self):
        title, key = process_activities.generate_energy_title(24, 1)
        self.assertEqual('燃掉一块半方糖', title)
        self.assertEqual('sugar_cube', key)


class LandmarkRouteContractTests(unittest.TestCase):
    def test_route_library_is_the_single_source_for_selection_rules(self):
        library = process_activities.load_landmark_route_library()
        self.assertEqual(20, len(library))
        self.assertEqual(
            {item['key'] for item in library if item['kind'] == 'distance'},
            {item['key'] for item in process_activities.DISTANCE_EQUIVALENTS}
        )
        self.assertEqual(
            {item['key'] for item in library if item['kind'] == 'elevation'},
            {item['key'] for item in process_activities.ELEVATION_EQUIVALENTS}
        )
        process_activities.validate_landmark_route_library([])


class ActivityDisplayContractTests(unittest.TestCase):
    def test_display_names_preserve_custom_names_and_resolve_defaults(self):
        custom = {
            'name': '岳麓山夜骑', 'type': 'Ride', 'route_status': 'available',
            'route_title': '骑过长沙 · 湘江中路'
        }
        private = {
            'name': '晚间行走', 'type': 'Walk', 'route_status': 'privacy_hidden',
            'distance_title': '走了两趟白堤'
        }
        indoor = {
            'name': 'Morning Run', 'type': 'Run', 'route_status': 'indoor',
            'is_indoor': True
        }

        self.assertEqual(('岳麓山夜骑', '骑行'), process_activities.activity_display_fields(custom))
        self.assertEqual(('走了两趟白堤', '步行'), process_activities.activity_display_fields(private))
        self.assertEqual(('跑起来', '室内跑步'), process_activities.activity_display_fields(indoor))

    def test_achievement_fields_are_stable_and_keep_existing_semantics(self):
        activities = [
            {'run_id': 1, 'name': 'Run', 'type': 'Run', 'distance': 5,
             'start_date_local': '2026-01-01T08:00:00', 'route_status': 'privacy_hidden'},
            {'run_id': 2, 'name': 'Run', 'type': 'Run', 'distance': 10,
             'start_date_local': '2026-01-02T08:00:00', 'route_status': 'privacy_hidden'},
            {'run_id': 3, 'name': 'Run', 'type': 'Run', 'distance': 6,
             'start_date_local': '2026-02-01T08:00:00', 'route_status': 'privacy_hidden'},
            {'run_id': 4, 'name': 'Ride', 'type': 'Ride', 'distance': 20,
             'start_date_local': '2026-01-01T09:00:00', 'route_status': 'privacy_hidden'},
            {'run_id': 5, 'name': 'Swim', 'type': 'Swim', 'distance': 1,
             'start_date_local': '2026-01-01T07:00:00', 'route_status': 'indoor'}
        ]

        self.assertTrue(process_activities.apply_activity_display_fields(activities))
        by_id = {item['run_id']: item for item in activities}
        self.assertEqual('year', by_id[2]['card_achievement']['level'])
        self.assertEqual('month', by_id[3]['card_achievement']['level'])
        self.assertEqual('year', by_id[4]['card_achievement']['level'])
        self.assertEqual(
            {'ride'},
            {item['group'] for item in by_id[1]['calendar_achievements']}
        )
        self.assertEqual(
            {'ride'},
            {item['group'] for item in by_id[5]['calendar_achievements']}
        )
        self.assertEqual(
            {'run_walk'},
            {item['group'] for item in by_id[2]['calendar_achievements']}
        )
        self.assertFalse(process_activities.apply_activity_display_fields(activities))


class PublicRouteTitleTests(unittest.TestCase):
    class _FakeResponse:
        status_code = 200

        def __init__(self, payload):
            self.payload = payload

        def json(self):
            return self.payload

    class _FakeSession:
        def __init__(self, payloads):
            self.payloads = iter(payloads)
            self.calls = []

        def get(self, url, **kwargs):
            self.calls.append((url, kwargs))
            return PublicRouteTitleTests._FakeResponse(next(self.payloads))

    def test_osm_reverse_result_is_reduced_to_public_title_evidence(self):
        observation = process_activities.parse_nominatim_observation({
            'name': '湘江风光带',
            'category': 'leisure',
            'type': 'park',
            'address': {
                'city': '长沙市',
                'city_district': '天心区',
                'road': '湘江中路',
                'residential': '某某小区'
            }
        })
        self.assertEqual('长沙', observation['city'])
        self.assertEqual(['湘江中路'], observation['street'])
        self.assertEqual(['天心区'], observation['district'])
        self.assertEqual(['湘江风光带'], observation['scenic'])

    def test_public_title_uses_real_city_and_dominant_road(self):
        title = process_activities.choose_public_route_title(
            'Ride',
            ['湘江中路', '湘江中路', '湘江中路', '劳动西路'],
            [
                {'city': '长沙市', 'scenic': [], 'street': [], 'district': ['天心区']},
                {'city': '长沙市', 'scenic': [], 'street': [], 'district': ['天心区']},
                {'city': '长沙市', 'scenic': [], 'street': [], 'district': ['岳麓区']}
            ]
        )
        self.assertEqual('骑过长沙 · 湘江中路', title)

    def test_route_lookup_samples_three_inner_points_and_identifies_itself(self):
        session = self._FakeSession([
            {'address': {'city': '长沙市', 'road': '湘江中路'}},
            {'address': {'city': '长沙市', 'road': '湘江中路'}},
            {'address': {'city': '长沙市', 'road': '劳动西路'}}
        ])
        observations = process_activities.reverse_route_observations(
            [(28.10 + index / 100, 112.90 + index / 100) for index in range(9)],
            session=session,
            min_interval=0
        )

        self.assertEqual(3, len(session.calls))
        self.assertEqual(3, len(observations))
        self.assertTrue(all(
            call[1]['headers']['User-Agent'] == process_activities.NOMINATIM_USER_AGENT
            for call in session.calls
        ))
        self.assertEqual(
            '骑过长沙 · 湘江中路',
            process_activities.choose_public_route_title('Ride', [], observations)
        )

    def test_repeated_real_area_is_more_representative_than_a_road(self):
        title = process_activities.choose_public_route_title(
            'Walk',
            ['科荟路', '科荟路', '林萃路'],
            [
                {'city': '北京市', 'scenic': ['奥林匹克森林公园'], 'street': [], 'district': ['朝阳区']},
                {'city': '北京市', 'scenic': ['奥林匹克森林公园'], 'street': [], 'district': ['朝阳区']},
                {'city': '北京市', 'scenic': [], 'street': [], 'district': ['朝阳区']}
            ]
        )
        self.assertEqual('走过北京 · 奥林匹克森林公园', title)

    def test_single_nearby_poi_does_not_override_dominant_road(self):
        title = process_activities.choose_public_route_title(
            'Run',
            ['江南大道', '江南大道', '江南大道', '滨盛路'],
            [
                {'city': '杭州市', 'scenic': ['某某公园'], 'street': [], 'district': ['滨江区']},
                {'city': '杭州市', 'scenic': [], 'street': [], 'district': ['滨江区']},
                {'city': '杭州市', 'scenic': [], 'street': [], 'district': ['滨江区']}
            ]
        )
        self.assertEqual('跑过杭州 · 江南大道', title)

    def test_private_residential_names_are_not_scenic_candidates(self):
        self.assertFalse(process_activities.is_scenic_place('西湖花园小区'))
        self.assertTrue(process_activities.is_scenic_place('西湖风景区'))

    def test_public_title_contract_version_is_explicit(self):
        self.assertEqual(1, process_activities.PUBLIC_ROUTE_TITLE_VERSION)

    def test_only_health_generated_names_need_a_public_route_title(self):
        self.assertTrue(process_activities.is_default_activity_name('晚间行走'))
        self.assertTrue(process_activities.is_default_activity_name('Morning Ride'))
        self.assertFalse(process_activities.is_default_activity_name('岳麓山夜骑'))


if __name__ == '__main__':
    unittest.main()
