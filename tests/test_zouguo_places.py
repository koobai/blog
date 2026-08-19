import json
import unittest
from pathlib import Path

from jingzhe.zouguo_places import (
    group_by_place_id,
    public_coordinates,
    resolve_admin_codes,
)


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / 'data/jingzhe/zouguo_boundary_catalog.json'


class ZouguoPlaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))

    def test_catalog_covers_world_countries_and_all_china_provinces(self):
        countries = {
            feature['properties']['groupCode']
            for feature in self.catalog['features']
            if feature['properties']['level'] == 'country'
        }
        provinces = {
            feature['properties']['groupCode']
            for feature in self.catalog['features']
            if feature['properties']['level'] == 'province'
        }
        self.assertGreaterEqual(len(countries), 170)
        self.assertTrue({'CN', 'AE', 'KW', 'JP', 'US', 'FR'}.issubset(countries))
        self.assertEqual(35, len(provinces))
        self.assertTrue({'110000', '330000', '440000', '650000'}.issubset(provinces))

    def test_place_id_is_the_only_merge_key(self):
        same_place = [
            {'place': {'id': 'cn-zj-hz-lake', 'name': '青山湖'}},
            {'place': {'id': 'cn-zj-hz-lake', 'name': '临安 · 青山湖'}},
        ]
        grouped = group_by_place_id(same_place)
        self.assertEqual(['cn-zj-hz-lake'], list(grouped))
        self.assertEqual(2, len(grouped['cn-zj-hz-lake']))

        nearby_places = [
            {'place': {'id': 'cn-zj-hz-lake-east', 'longitude': 119.80, 'latitude': 30.25}},
            {'place': {'id': 'cn-zj-hz-lake-west', 'longitude': 119.80001, 'latitude': 30.25001}},
        ]
        self.assertEqual(2, len(group_by_place_id(nearby_places)))

    def test_reduced_privacy_discards_coordinate_detail(self):
        public = public_coordinates(119.725494963, 30.227075994, 'poi', 'public')
        reduced = public_coordinates(119.725494963, 30.227075994, 'poi', 'reduced')
        self.assertEqual([119.72549, 30.22708], public)
        self.assertEqual([119.73, 30.23], reduced)

    def test_public_coordinate_can_resolve_known_admin_codes(self):
        resolved = resolve_admin_codes(self.catalog, 120.1536, 30.2875)
        self.assertEqual('CN', resolved['countryCode'])
        self.assertEqual('330000', resolved['regionCode'])
        self.assertEqual('330100', resolved['localityCode'])


if __name__ == '__main__':
    unittest.main()
