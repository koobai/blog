import json
import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class HeadMetadataParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = []
        self.links = []
        self.scripts = []
        self.schemas = []
        self._schema_chunks = None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "meta":
            self.meta.append(values)
        elif tag == "link":
            self.links.append(values)
        elif tag == "script" and values.get("type") == "application/ld+json":
            self._schema_chunks = []
        elif tag == "script" and values.get("src"):
            self.scripts.append(values.get("src"))

    def handle_data(self, data):
        if self._schema_chunks is not None:
            self._schema_chunks.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._schema_chunks is not None:
            self.schemas.append(json.loads("".join(self._schema_chunks)))
            self._schema_chunks = None

    def named_meta(self, key, value):
        return [item for item in self.meta if item.get(key) == value]

    def canonical(self):
        links = [item for item in self.links if item.get("rel") == "canonical"]
        return links[0].get("href") if links else None

    def is_redirect(self):
        return any(item.get("http-equiv") == "refresh" for item in self.meta)


class SeoOutputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="jingzhe-seo-output-")
        cls.output = Path(cls.temp.name)
        subprocess.run(
            [
                "hugo",
                "--minify",
                "--panicOnWarning",
                "--destination",
                str(cls.output),
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def parse(cls, relative):
        parser = HeadMetadataParser()
        parser.feed((cls.output / relative).read_text(encoding="utf-8"))
        return parser

    def test_every_canonical_page_has_complete_nonempty_metadata(self):
        canonical_pages = 0
        article_pages = 0
        for path in self.output.rglob("*.html"):
            parser = HeadMetadataParser()
            parser.feed(path.read_text(encoding="utf-8"))
            canonical = parser.canonical()
            if not canonical or parser.is_redirect():
                continue
            canonical_pages += 1

            for key, value in (
                ("name", "description"),
                ("property", "og:title"),
                ("property", "og:type"),
                ("property", "og:url"),
                ("property", "og:description"),
                ("name", "twitter:card"),
                ("name", "twitter:title"),
                ("name", "twitter:description"),
            ):
                matches = parser.named_meta(key, value)
                self.assertEqual(1, len(matches), f"{path}: {value}")
                self.assertTrue((matches[0].get("content") or "").strip(), f"{path}: {value}")

            og_url = parser.named_meta("property", "og:url")[0]["content"]
            self.assertEqual(canonical, og_url, str(path))

            og_type = parser.named_meta("property", "og:type")[0]["content"]
            self.assertIn(og_type, ("article", "website"), str(path))
            article_pages += og_type == "article"

            card = parser.named_meta("name", "twitter:card")[0]["content"]
            twitter_images = parser.named_meta("name", "twitter:image")
            if card == "summary_large_image":
                self.assertEqual(1, len(twitter_images), str(path))
            else:
                self.assertEqual("summary", card, str(path))
                self.assertEqual([], twitter_images, str(path))

            self.assertEqual(1, len(parser.schemas), str(path))
            self.assertEqual(canonical, parser.schemas[0]["url"], str(path))

        self.assertGreater(canonical_pages, 300)
        self.assertGreater(article_pages, 200)

    def test_post_keeps_existing_image_and_article_semantics(self):
        parser = self.parse("sports/index.html")
        self.assertEqual("article", parser.named_meta("property", "og:type")[0]["content"])
        self.assertEqual(
            "https://img.koobai.com/article/map.webp",
            parser.named_meta("property", "og:image")[0]["content"],
        )
        self.assertEqual(
            "summary_large_image",
            parser.named_meta("name", "twitter:card")[0]["content"],
        )
        self.assertTrue(parser.named_meta("property", "article:published_time"))
        self.assertTrue(parser.named_meta("property", "article:tag"))
        self.assertEqual("BlogPosting", parser.schemas[0]["@type"])
        self.assertEqual("Koobai", parser.schemas[0]["author"]["name"])

    def test_laodao_uses_date_title_body_summary_and_small_card(self):
        parser = self.parse("laodao/2025/03/20250322-113012/index.html")
        self.assertEqual(
            "唠叨 · 2025-03-22 11:30",
            parser.named_meta("property", "og:title")[0]["content"],
        )
        self.assertIn(
            "Certimate",
            parser.named_meta("name", "description")[0]["content"],
        )
        self.assertEqual("article", parser.named_meta("property", "og:type")[0]["content"])
        self.assertEqual("summary", parser.named_meta("name", "twitter:card")[0]["content"])
        self.assertEqual("BlogPosting", parser.schemas[0]["@type"])

    def test_independent_page_and_list_are_not_articles(self):
        about = self.parse("about/index.html")
        posts = self.parse("posts/index.html")
        for parser in (about, posts):
            self.assertEqual("website", parser.named_meta("property", "og:type")[0]["content"])
            self.assertEqual("WebPage", parser.schemas[0]["@type"])
            self.assertTrue(parser.named_meta("name", "description")[0]["content"])

    def test_admin_pages_are_noindex_without_changing_content_front_matter(self):
        for relative in ("newlaodao/index.html", "newsuibi/index.html"):
            parser = self.parse(relative)
            robots = parser.named_meta("name", "robots")
            self.assertEqual(1, len(robots), relative)
            self.assertEqual("noindex, nofollow, noarchive", robots[0]["content"])

    def test_project_javascript_uses_fingerprinted_hugo_resources(self):
        pages = {
            "index.html": ("likes-core", "laodao"),
            "movies/index.html": ("movies",),
            "exercise/index.html": ("exercise-ui", "exercise-map"),
            "newlaodao/index.html": ("jingzhe-message", "editor-core", "editor-laodao"),
            "newsuibi/index.html": ("jingzhe-message", "editor-core", "editor-post"),
        }
        for relative, names in pages.items():
            parser = self.parse(relative)
            for name in names:
                matches = [src for src in parser.scripts if f"/{name}.min." in src]
                self.assertEqual(1, len(matches), f"{relative}: {name}")
                self.assertRegex(matches[0], r"\.[0-9a-f]{64}\.js$")
                self.assertNotIn("?v=", matches[0])
        for name in (
            "about-photo.js",
            "comments.js",
            "editor-core.js",
            "exercise-map.js",
            "exercise-ui.js",
            "jingzhe-message.js",
            "laodao.js",
            "likes-core.js",
            "movies.js",
        ):
            self.assertFalse((self.output / "js" / name).exists(), name)


if __name__ == "__main__":
    unittest.main()
