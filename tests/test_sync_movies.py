import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sync_movies


class SyncMoviesTests(unittest.TestCase):
    def test_normalize_interest_keeps_public_contract(self):
        item = {
            "rating": {"value": 4},
            "comment": "重看后更新短评",
            "create_time": "2026-08-15 20:00:00",
            "subject": {
                "id": "1295644",
                "type": "movie",
                "title": "这个杀手不太冷",
                "pubdate": ["1994-09-14(法国)"],
                "url": "https://movie.douban.com/subject/1295644/",
                "color_scheme": {"primary_color_light": "#abc"},
            },
        }
        self.assertEqual(
            sync_movies.normalize_interest(item),
            {
                "id": "1295644",
                "type": "movie",
                "title": "这个杀手不太冷",
                "year": "1994",
                "rating": 4,
                "comment": "重看后更新短评",
                "link": "https://movie.douban.com/subject/1295644/",
                "create_time": "2026-08-15 20:00:00",
                "color_scheme": {"primary_color_light": "#abc"},
            },
        )

    def test_merge_adds_new_updates_existing_and_retains_unseen_local(self):
        local = [
            {"id": "1", "title": "旧标题", "rating": 3},
            {"id": "3", "title": "本地保留", "rating": 5},
        ]
        remote = [
            {"id": "2", "title": "新记录", "rating": 4},
            {"id": "1", "title": "更新后的标题", "rating": 5},
        ]

        merged, new_count, updated_count = sync_movies.merge_movies(local, remote)

        self.assertEqual([item["id"] for item in merged], ["2", "1", "3"])
        self.assertEqual(new_count, 1)
        self.assertEqual(updated_count, 1)
        self.assertEqual(merged[1]["title"], "更新后的标题")

    def test_atomic_write_replaces_valid_json_without_temp_residue(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "assets" / "movie.json"
            sync_movies.atomic_write_json(target, [{"id": "1", "title": "电影"}])
            self.assertEqual(json.loads(target.read_text(encoding="utf-8"))[0]["id"], "1")
            self.assertEqual(list(target.parent.glob(".movie.json.*.tmp")), [])

    def test_invalid_local_json_is_a_failure_not_an_empty_database(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "movie.json"
            target.write_text("{broken", encoding="utf-8")
            with self.assertRaises(ValueError):
                sync_movies.load_local_movies(target)

    def test_fetch_failure_does_not_overwrite_existing_data(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "movie.json"
            original = '[{"id":"1","title":"保留"}]\n'
            target.write_text(original, encoding="utf-8")

            def failing_fetcher(_douban_id):
                raise RuntimeError("豆瓣暂时不可用")

            with self.assertRaises(RuntimeError):
                sync_movies.synchronize_movies("tester", target, fetcher=failing_fetcher)
            self.assertEqual(target.read_text(encoding="utf-8"), original)

    def test_remote_fetch_scans_all_pages_instead_of_stopping_at_first_existing_id(self):
        first = {
            "total": 2,
            "interests": [{"subject": {"id": "1", "title": "第一页", "year": "2025"}}],
        }
        second = {
            "total": 2,
            "interests": [{"subject": {"id": "2", "title": "第二页", "year": "2024"}}],
        }
        with patch("sync_movies.fetch_page", side_effect=[first, second]) as fetch:
            movies = sync_movies.fetch_remote_movies(
                "tester", page_size=1, sleep_fn=lambda _delay: None, jitter_fn=lambda _a, _b: 0
            )
        self.assertEqual([item["id"] for item in movies], ["1", "2"])
        self.assertEqual(fetch.call_count, 2)

    def test_remote_fetch_retries_then_exits_nonzero_path(self):
        delays = []
        with patch("sync_movies.fetch_page", side_effect=OSError("offline")):
            with self.assertRaises(RuntimeError):
                sync_movies.fetch_remote_movies("tester", sleep_fn=delays.append)
        self.assertEqual(delays, [1.0, 2.0])

    def test_main_returns_nonzero_when_sync_fails(self):
        with patch.dict("os.environ", {"DOUBAN_ID": "tester"}, clear=False):
            with patch("sync_movies.synchronize_movies", side_effect=RuntimeError("offline")):
                self.assertEqual(sync_movies.main(), 1)

    def test_github_environment_keeps_has_new_data_contract(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "github.env"
            result = sync_movies.SyncResult(changed=True, new_count=2, updated_count=1, total_count=8)
            sync_movies.write_github_environment(target, result)
            values = target.read_text(encoding="utf-8")
            self.assertIn("HAS_NEW_DATA=true", values)
            self.assertIn("MOVIES_NEW_COUNT=2", values)
            self.assertIn("MOVIES_UPDATED_COUNT=1", values)
            self.assertIn("MOVIES_TOTAL_COUNT=8", values)


if __name__ == "__main__":
    unittest.main()
