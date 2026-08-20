import copy
import json
import unittest
from pathlib import Path

from jingzhe.zouguo_contract import (
    SCHEMA,
    SOURCE_TYPES,
    validate_zouguo_feed,
    zouguo_identity,
)


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'tests/fixtures/zouguo'


class ZouguoContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.valid_feed = json.loads(
            (FIXTURES / 'valid-feed.json').read_text(encoding='utf-8')
        )

    def test_synthetic_feed_covers_all_sources_and_is_valid(self):
        self.assertEqual([], validate_zouguo_feed(self.valid_feed))
        self.assertEqual(
            SOURCE_TYPES,
            {item['source']['type'] for item in self.valid_feed['items']},
        )

    def test_identity_is_exact_and_duplicate_ids_are_rejected(self):
        self.assertEqual('zouguo:entry-1', zouguo_identity('zouguo', 'entry-1'))
        duplicate = copy.deepcopy(self.valid_feed)
        duplicate['items'].append(copy.deepcopy(duplicate['items'][0]))
        self.assertTrue(
            any('id 重复' in error for error in validate_zouguo_feed(duplicate))
        )

    def test_missing_place_and_invalid_coordinates_are_rejected(self):
        invalid = json.loads(
            (FIXTURES / 'invalid-missing-place.json').read_text(encoding='utf-8')
        )
        self.assertTrue(
            any('place' in error for error in validate_zouguo_feed(invalid))
        )

        invalid_coordinates = copy.deepcopy(self.valid_feed)
        invalid_coordinates['items'][0]['place']['longitude'] = 181
        self.assertTrue(
            any(
                'place.longitude' in error
                for error in validate_zouguo_feed(invalid_coordinates)
            )
        )

    def test_posts_publish_only_the_title_and_images_to_the_feed(self):
        invalid = copy.deepcopy(self.valid_feed)
        post = next(item for item in invalid['items'] if item['source']['type'] == 'post')
        post['summary'] = '随笔正文不应复制到走过卡片'
        self.assertTrue(
            any('随笔来源 summary 必须为空' in error for error in validate_zouguo_feed(invalid))
        )

    def test_image_delivery_variants_are_optional_and_validated(self):
        payload = copy.deepcopy(self.valid_feed)
        image = payload['items'][0]['images'][0]
        image.update({
            'original': image['url'],
            'thumb': '/cdn-cgi/image/width=128/example.webp',
            'small': '/cdn-cgi/image/width=640/example.webp',
            'large': '/cdn-cgi/image/width=960/example.webp',
            'thumbWidth': 128,
            'smallWidth': 640,
            'largeWidth': 960,
            'transformed': True,
        })
        self.assertEqual([], validate_zouguo_feed(payload))

        image['thumbWidth'] = 0
        image['transformed'] = 'yes'
        errors = validate_zouguo_feed(payload)
        self.assertTrue(any('thumbWidth 必须是正整数' in error for error in errors))
        self.assertTrue(any('transformed 必须是布尔值' in error for error in errors))

    def test_schema_freezes_markdown_ownership_and_source_rules(self):
        metadata = SCHEMA['x-jingzhe-contract']
        self.assertEqual('markdown', metadata['source_of_truth'])
        self.assertEqual('走过', metadata['tag_trigger'])
        self.assertEqual(['source.type', 'source.id'], metadata['identity'])
        self.assertEqual(SOURCE_TYPES, set(metadata['source_types']))
        self.assertIn('never fuzzy-match', metadata['deduplication'])

    def test_front_matter_schemas_share_one_zouguo_block(self):
        frontmatter = ROOT / 'schemas/frontmatter'
        standalone = json.loads(
            (frontmatter / 'zouguo.schema.json').read_text(encoding='utf-8')
        )
        self.assertEqual('zouguo', standalone['properties']['type']['const'])
        self.assertEqual(
            'zouguo-block.schema.json',
            standalone['properties']['zouguo']['$ref'],
        )
        for name, tag_field in (('laodao.schema.json', 'laodaotags'), ('post.schema.json', 'tags')):
            schema = json.loads((frontmatter / name).read_text(encoding='utf-8'))
            self.assertEqual(
                'zouguo-block.schema.json',
                schema['properties']['zouguo']['$ref'],
            )
            condition = schema['allOf'][0]
            self.assertEqual(
                '走过',
                condition['if']['properties'][tag_field]['contains']['const'],
            )
            self.assertEqual(['zouguo'], condition['then']['required'])

    def test_route_archetype_and_content_directory_use_zouguo(self):
        page = (ROOT / 'content/zouguo/_index.md').read_text(encoding='utf-8')
        archetype = (ROOT / 'archetypes/zouguo.md').read_text(encoding='utf-8')
        self.assertIn('title: "走过"', page)
        self.assertIn('type: "zouguo"', page)
        self.assertIn('  - JSON', page)
        self.assertIn('type: "zouguo"', archetype)
        self.assertIn('zouguo:', archetype)
        self.assertTrue((ROOT / 'content/zouguo').is_dir())


if __name__ == '__main__':
    unittest.main()
