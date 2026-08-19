import json
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
        self.assertEqual(15, len(payload['items']))
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
            self.assertEqual(15, len(baseline['items']))

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
            self.assertEqual(16, len(added['items']))
            added_item = next(item for item in added['items'] if item['id'] == 'zouguo:pipeline-acceptance')
            self.assertEqual('第一次生成。', added_item['summary'])

            synthetic.write_text(
                synthetic.read_text(encoding='utf-8').replace('第一次生成。', '修改后重新生成。'),
                encoding='utf-8',
            )
            modified = self.build_with_content(content_dir, destination)
            modified_item = next(item for item in modified['items'] if item['id'] == 'zouguo:pipeline-acceptance')
            self.assertEqual('修改后重新生成。', modified_item['summary'])

            synthetic.unlink()
            deleted = self.build_with_content(content_dir, destination)
            self.assertEqual(15, len(deleted['items']))
            self.assertNotIn('zouguo:pipeline-acceptance', {item['id'] for item in deleted['items']})


if __name__ == '__main__':
    unittest.main()
