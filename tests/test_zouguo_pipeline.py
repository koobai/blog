import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from jingzhe.zouguo_contract import validate_zouguo_feed


ROOT = Path(__file__).resolve().parents[1]


class ZouguoPipelineTests(unittest.TestCase):
    def build_with_content(self, content_dir, destination):
        subprocess.run(
            [
                'hugo',
                '--environment',
                'production',
                '--contentDir',
                str(content_dir),
                '--destination',
                str(destination),
                '--cleanDestinationDir',
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads((destination / 'zouguo/index.json').read_text(encoding='utf-8'))

    def test_generated_feed_is_valid_and_prototype_json_is_retired(self):
        with tempfile.TemporaryDirectory(prefix='jingzhe-zouguo-feed-') as temp:
            destination = Path(temp) / 'public'
            payload = self.build_with_content(ROOT / 'content', destination)

        self.assertEqual([], validate_zouguo_feed(payload))
        self.assertGreaterEqual(len(payload['items']), 1)
        self.assertTrue(all(
            item['source']['type'] in {'zouguo', 'laodao', 'post'}
            for item in payload['items']
        ))
        self.assertFalse((ROOT / 'data/jingzhe/zouguo_prototype.json').exists())
        layout = (ROOT / 'themes/jingzhe_v3/layouts/zouguo.html').read_text(encoding='utf-8')
        self.assertNotIn('zouguo_prototype', layout)

    def test_add_modify_and_delete_markdown_changes_only_generated_feed(self):
        with tempfile.TemporaryDirectory(prefix='jingzhe-zouguo-crud-') as temp:
            temp_root = Path(temp)
            content_dir = temp_root / 'content'
            destination = temp_root / 'public'
            shutil.copytree(ROOT / 'content', content_dir)

            baseline = self.build_with_content(content_dir, destination)
            baseline_count = len(baseline['items'])

            synthetic = content_dir / 'zouguo/pipeline-acceptance.md'
            synthetic.write_text(
                '''---
title: "管线验收 · 湖边"
date: 2026-08-19T20:00:00+08:00
type: "zouguo"
layout: "single"
draft: false
zouguo:
  occurred_at: 2026-08-19T18:00:00+08:00
  place:
    id: "cn-test-pipeline-lake"
    name: "管线验收 · 湖边"
    longitude: 120.01
    latitude: 30.01
    precision: "poi"
    country: "中国"
    country_code: "CN"
    region: "测试省"
    region_code: "TEST-REGION"
    locality: "测试城"
    locality_code: "TEST-CITY"
---

第一次生成。
''',
                encoding='utf-8',
            )
            added = self.build_with_content(content_dir, destination)
            self.assertEqual(baseline_count + 1, len(added['items']))
            added_item = next(item for item in added['items'] if item['id'] == 'zouguo:pipeline-acceptance')
            self.assertEqual('第一次生成。', added_item['summary'])
            rendered = (destination / 'zouguo/index.html').read_text(encoding='utf-8')
            self.assertIn('测试省 · 测试城', rendered)

            synthetic.write_text(
                synthetic.read_text(encoding='utf-8').replace('第一次生成。', '修改后重新生成。'),
                encoding='utf-8',
            )
            modified = self.build_with_content(content_dir, destination)
            modified_item = next(item for item in modified['items'] if item['id'] == 'zouguo:pipeline-acceptance')
            self.assertEqual('修改后重新生成。', modified_item['summary'])

            synthetic.unlink()
            deleted = self.build_with_content(content_dir, destination)
            self.assertEqual(baseline_count, len(deleted['items']))
            self.assertNotIn('zouguo:pipeline-acceptance', {item['id'] for item in deleted['items']})

    def test_tagged_laodao_and_post_join_and_leave_the_same_feed(self):
        with tempfile.TemporaryDirectory(prefix='jingzhe-zouguo-sources-') as temp:
            temp_root = Path(temp)
            content_dir = temp_root / 'content'
            destination = temp_root / 'public'
            shutil.copytree(ROOT / 'content', content_dir)

            baseline = self.build_with_content(content_dir, destination)
            baseline_count = len(baseline['items'])

            laodao = content_dir / 'laodao/2026/08/20260819-180000.md'
            laodao.write_text(
                '''---
date: 2026-08-19T18:00:00+08:00
laodaotags: ["走过"]
zouguo:
  occurred_at: 2026-08-19T17:30:00+08:00
  place:
    id: "cn-test-laodao-place"
    name: "测试城 · 唠叨地点"
    longitude: 120.02
    latitude: 30.02
    precision: "poi"
    country: "中国"
    country_code: "CN"
---

一条带图片的走过唠叨。

![唠叨图片](https://example.com/lake-dusk.webp)
''',
                encoding='utf-8',
            )
            post = content_dir / 'posts/zouguo-pipeline-post.md'
            post.write_text(
                '''---
title: "一篇走过测试随笔"
date: 2026-08-19T19:00:00+08:00
slug: "zouguo-pipeline-post"
tags: ["走过"]
image: https://example.com/mountain-morning.webp
zouguo:
  occurred_at: 2026-08-18T09:00:00+08:00
  place:
    id: "cn-test-post-place"
    name: "测试城 · 随笔地点"
    longitude: 120.03
    latitude: 30.03
    precision: "approximate"
    country: "中国"
    country_code: "CN"
---

这段长文不能复制进走过卡片。

![封面重复](https://example.com/mountain-morning.webp)
![正文图片](https://example.com/coast-wind.webp)
''',
                encoding='utf-8',
            )

            joined = self.build_with_content(content_dir, destination)
            self.assertEqual(baseline_count + 2, len(joined['items']))
            laodao_item = next(item for item in joined['items'] if item['id'] == 'laodao:20260819-180000')
            self.assertEqual('一条带图片的走过唠叨。', laodao_item['summary'])
            self.assertEqual(1, len(laodao_item['images']))

            post_item = next(item for item in joined['items'] if item['id'] == 'post:zouguo-pipeline-post')
            self.assertEqual('一篇走过测试随笔', post_item['title'])
            self.assertEqual('', post_item['summary'])
            self.assertEqual('/zouguo-pipeline-post/', post_item['source']['url'])
            self.assertEqual(2, len(post_item['images']))
            rendered = (destination / 'zouguo/index.html').read_text(encoding='utf-8')
            self.assertIn('data-source-type="post"', rendered)
            self.assertIn('href="/zouguo-pipeline-post/"', rendered)
            self.assertNotIn('这段长文不能复制进走过卡片。', rendered)

            post.write_text(
                post.read_text(encoding='utf-8').replace(
                    '一篇走过测试随笔',
                    '改过标题的走过测试随笔',
                ),
                encoding='utf-8',
            )
            updated = self.build_with_content(content_dir, destination)
            updated_posts = [
                item for item in updated['items']
                if item['id'] == 'post:zouguo-pipeline-post'
            ]
            self.assertEqual(1, len(updated_posts))
            self.assertEqual('改过标题的走过测试随笔', updated_posts[0]['title'])
            self.assertEqual(2, len(updated_posts[0]['images']))

            laodao.write_text(
                laodao.read_text(encoding='utf-8').replace('["走过"]', '["日常"]'),
                encoding='utf-8',
            )
            post.write_text(
                post.read_text(encoding='utf-8').replace('["走过"]', '["生活"]'),
                encoding='utf-8',
            )
            untagged = self.build_with_content(content_dir, destination)
            ids = {item['id'] for item in untagged['items']}
            self.assertEqual(baseline_count, len(untagged['items']))
            self.assertNotIn('laodao:20260819-180000', ids)
            self.assertNotIn('post:zouguo-pipeline-post', ids)

    def test_tagged_content_without_structured_place_fails_the_build(self):
        with tempfile.TemporaryDirectory(prefix='jingzhe-zouguo-invalid-source-') as temp:
            temp_root = Path(temp)
            content_dir = temp_root / 'content'
            destination = temp_root / 'public'
            shutil.copytree(ROOT / 'content', content_dir)
            invalid = content_dir / 'laodao/2026/08/20260819-190000.md'
            invalid.write_text(
                '''---
date: 2026-08-19T19:00:00+08:00
laodaotags: ["走过"]
---

缺少地点的走过唠叨。
''',
                encoding='utf-8',
            )

            with self.assertRaises(subprocess.CalledProcessError) as raised:
                self.build_with_content(content_dir, destination)
            output = '{}\n{}'.format(raised.exception.stdout, raised.exception.stderr)
            self.assertIn('20260819-190000.md', output)
            self.assertIn('缺少 zouguo.occurred_at 或 zouguo.place', output)

    def test_new_province_and_overseas_country_boundaries_are_selected_automatically(self):
        with tempfile.TemporaryDirectory(prefix='jingzhe-zouguo-boundaries-') as temp:
            temp_root = Path(temp)
            content_dir = temp_root / 'content'
            destination = temp_root / 'public'
            shutil.copytree(ROOT / 'content', content_dir)

            cases = (
                (
                    'guangdong-auto', '广州 · 江边', '113.2644', '23.1291',
                    'CN', '广东省', '广州市', '440000', '440100',
                ),
                (
                    'beijing-auto', '北京 · 长城脚下', '116.0063', '40.3525',
                    'CN', '中国北京市', '北京市', '110000', '110000',
                ),
                (
                    'japan-auto', '东京 · 河边', '139.6917', '35.6895',
                    'JP', '东京都', '东京', '', '',
                ),
            )
            for (
                slug, name, longitude, latitude, country_code, region, locality,
                expected_region_code, expected_locality_code,
            ) in cases:
                (content_dir / 'zouguo' / '{}.md'.format(slug)).write_text(
                    '''---
title: "{name}"
date: 2026-08-19T20:00:00+08:00
type: "zouguo"
draft: false
zouguo:
  occurred_at: 2026-08-19T18:00:00+08:00
  place:
    id: "test-{slug}"
    name: "{name}"
    longitude: {longitude}
    latitude: {latitude}
    precision: "locality"
    privacy: "reduced"
    country_code: "{country_code}"
    region: "{region}"
    locality: "{locality}"
---

自动边界验收。
'''.format(
                        slug=slug,
                        name=name,
                        longitude=longitude,
                        latitude=latitude,
                        country_code=country_code,
                        region=region,
                        locality=locality,
                    ),
                    encoding='utf-8',
                )

            payload = self.build_with_content(content_dir, destination)
            items = {item['source']['id']: item for item in payload['items']}
            for (
                slug, _name, _longitude, _latitude, _country_code, _region, _locality,
                expected_region_code, expected_locality_code,
            ) in cases:
                self.assertEqual(expected_region_code, items[slug]['place']['regionCode'])
                self.assertEqual(expected_locality_code, items[slug]['place']['localityCode'])

            html = (destination / 'zouguo/index.html').read_text(encoding='utf-8')
            match = re.search(r'data-boundary-url="([^"]+)"', html)
            self.assertIsNotNone(match)
            boundary_path = destination / match.group(1).lstrip('/')
            boundaries = json.loads(boundary_path.read_text(encoding='utf-8'))
            selected = {
                (feature['properties']['level'], str(feature['properties']['groupCode']))
                for feature in boundaries['features']
            }
            self.assertIn(('province', '440000'), selected)
            self.assertIn(('city', '440100'), selected)
            self.assertIn(('province', '110000'), selected)
            self.assertIn(('city', '110000'), selected)
            self.assertIn(('country', 'JP'), selected)
            self.assertFalse((ROOT / 'data/jingzhe/zouguo_boundaries.json').exists())


if __name__ == '__main__':
    unittest.main()
