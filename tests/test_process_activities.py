import unittest

import process_activities


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


if __name__ == '__main__':
    unittest.main()
