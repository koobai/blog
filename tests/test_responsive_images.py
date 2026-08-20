import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ResponsiveImageContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.partial = (
            ROOT
            / "themes/jingzhe_v3/layouts/_partials/jingzhe/responsive-image.html"
        ).read_text(encoding="utf-8")
        cls.render_hook = (
            ROOT / "themes/jingzhe_v3/layouts/_markup/render-image.html"
        ).read_text(encoding="utf-8")
        cls.home = (
            ROOT / "themes/jingzhe_v3/layouts/home.html"
        ).read_text(encoding="utf-8")
        cls.post_list = (
            ROOT / "themes/jingzhe_v3/layouts/posts/list.html"
        ).read_text(encoding="utf-8")
        cls.post_single = (
            ROOT / "themes/jingzhe_v3/layouts/posts/single.html"
        ).read_text(encoding="utf-8")
        cls.zouguo_image = (
            ROOT / "themes/jingzhe_v3/layouts/_partials/zouguo/image.html"
        ).read_text(encoding="utf-8")
        cls.zouguo_feed = (
            ROOT / "themes/jingzhe_v3/layouts/_partials/zouguo/feed.html"
        ).read_text(encoding="utf-8")

    def test_core_and_development_are_disabled_while_production_is_enabled(self):
        default_config = (ROOT / "config/_default/params.toml").read_text(
            encoding="utf-8"
        )
        self.assertIn("[services.images]\n  enabled = false", default_config)

        production = (ROOT / "config/production/params.toml").read_text(
            encoding="utf-8"
        )
        development = (ROOT / "config/development/params.toml").read_text(
            encoding="utf-8"
        )
        self.assertIn("[services.images]\n  enabled = true", production)
        self.assertIn("[services.images]\n  enabled = false", development)
        for config in (production, development):
            self.assertIn('sourceOrigin = "https://img.koobai.com"', config)

    def test_transform_is_fixed_scoped_and_has_original_fallback(self):
        self.assertIn('default 128 $config.thumbWidth', self.partial)
        self.assertIn('default 640 $config.smallWidth', self.partial)
        self.assertIn('default 960 $config.largeWidth', self.partial)
        self.assertIn('default 75 $config.quality', self.partial)
        self.assertIn('fit=scale-down,format=auto,onerror=redirect', self.partial)
        self.assertIn('(eq (lower $sourceURL.Host)', self.partial)
        self.assertIn('(not (in $src "?"))', self.partial)
        self.assertIn('"original" $src', self.partial)
        self.assertNotIn('".svg"', self.partial)

    def test_reader_images_use_srcset_while_src_remains_original(self):
        for template in (
            self.render_hook,
            self.home,
            self.post_list,
            self.post_single,
        ):
            self.assertIn('partial "jingzhe/responsive-image.html"', template)
            self.assertIn('src="{{ $image.original | safeURL }}"', template)
            self.assertIn('srcset="{{ $image.small | safeURL }}', template)
            self.assertIn("sizes=", template)

        self.assertIn('class="laodao-photo" loading="lazy"', self.render_hook)
        self.assertIn('loading="lazy"', self.home)
        self.assertIn('loading="lazy"', self.post_list)
        self.assertIn('fetchpriority="high"', self.post_single)

    def test_zouguo_reuses_shared_transformer_and_keeps_original(self):
        self.assertIn('partial "jingzhe/responsive-image.html"', self.zouguo_image)
        for key in ('"url" $image.original', '"original" $image.original', '"thumb" $image.thumb', '"small" $image.small', '"large" $image.large'):
            self.assertIn(key, self.zouguo_image)
        self.assertIn('partial "zouguo/image.html"', self.zouguo_feed)


if __name__ == "__main__":
    unittest.main()
