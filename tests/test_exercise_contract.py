import unittest

import monthly_coach
import process_activities
from jingzhe import exercise_contract


class ExerciseContractTests(unittest.TestCase):
    def test_processing_and_coaching_share_sport_names(self):
        self.assertEqual(process_activities.ACTIVITY_TYPE_CN, exercise_contract.SPORT_NAMES)
        self.assertEqual(monthly_coach.SPORT_NAMES, exercise_contract.SPORT_NAMES)

    def test_every_sport_has_display_fields(self):
        for sport, values in exercise_contract.SPORTS.items():
            with self.subTest(sport=sport):
                self.assertTrue(values['name'])
                self.assertTrue(values['displayName'])
                self.assertRegex(values['color'], r'^#[0-9A-F]{6}$')
                self.assertTrue(values['fallbackTitle'])

    def test_food_keys_are_unique_and_monthly_foods_are_shared_subset(self):
        all_keys = [food['key'] for food in exercise_contract.FOOD_EQUIVALENTS]
        monthly_keys = [food['key'] for food in exercise_contract.MONTHLY_FOOD_EQUIVALENTS]

        self.assertEqual(len(all_keys), len(set(all_keys)))
        self.assertTrue(set(monthly_keys) < set(all_keys))
        self.assertEqual(15, len(all_keys))
        self.assertEqual(11, len(monthly_keys))

    def test_summary_groups_preserve_existing_contract(self):
        self.assertEqual(
            exercise_contract.RIDE_TYPES,
            {'Ride', 'VirtualRide', 'EBikeRide'}
        )
        self.assertEqual(
            exercise_contract.RUN_WALK_TYPES,
            {'Run', 'TrailRun', 'Treadmill', 'VirtualRun', 'Walk', 'Hike'}
        )
