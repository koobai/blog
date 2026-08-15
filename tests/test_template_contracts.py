import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class EditorCompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = (
            ROOT / 'themes/jingzhe_v3/assets/js/pages/editor-core.js'
        ).read_text(encoding='utf-8')
        cls.laodao_page = (
            ROOT / 'themes/jingzhe_v3/assets/js/pages/editor-laodao.js'
        ).read_text(encoding='utf-8')
        cls.post_page = (
            ROOT / 'themes/jingzhe_v3/assets/js/pages/editor-post.js'
        ).read_text(encoding='utf-8')
        cls.laodao = (
            ROOT / 'themes/jingzhe_v3/layouts/newlaodao.html'
        ).read_text(encoding='utf-8')
        cls.post = (
            ROOT / 'themes/jingzhe_v3/layouts/newsuibi.html'
        ).read_text(encoding='utf-8')

    def test_local_storage_keys_are_unchanged(self):
        self.assertIn("'koobai_admin_token'", self.core)
        self.assertIn("'koobai_laodao_draft'", self.laodao_page)
        self.assertIn("'koobai_article_draft'", self.post_page)

    def test_worker_auth_header_and_routes_are_unchanged(self):
        self.assertIn("'x-admin-token': getAdminToken()", self.core)
        for source in (self.laodao_page, self.post_page):
            self.assertIn('`${CONFIG.workerUrl}/api/github`', source)
            self.assertIn("method: 'PUT'", source)
            self.assertIn("'Content-Type': 'application/json'", source)
        self.assertIn('`${config.workerUrl}/api/upload?name=${filename}`', self.core)

    def test_repository_paths_and_commit_messages_are_unchanged(self):
        self.assertIn('`content/laodao/${year}/${month}/${year}${month}${day}-${hour}${min}${sec}.md`', self.laodao_page)
        self.assertIn('STATE.sha ? "唠叨修改" : "唠叨一下"', self.laodao_page)
        self.assertIn('`content/posts/${safeFilename}.md`', self.post_page)
        self.assertIn('`修改随笔: ${title}`', self.post_page)
        self.assertIn('`新一篇随笔: ${title}`', self.post_page)

    def test_front_matter_fields_are_still_emitted(self):
        self.assertIn('JingzheEditor.buildLaodaoMarkdown', self.laodao_page)
        for field in ('date:', 'laodaotags:', 'location:', 'latlng:', 'device:'):
            self.assertIn(field, self.core)
        self.assertIn('JingzheEditor.buildPostMarkdown', self.post_page)
        for field in ('title:', 'date:', 'slug:', 'image:', 'description:', 'tags:'):
            self.assertIn(field, self.core)

    def test_editor_paths_are_validated_and_dirty_state_is_tracked(self):
        self.assertIn('JingzheEditor.validateFilename', self.post_page)
        self.assertIn('JingzheEditor.validateSlug', self.post_page)
        for source in (self.laodao_page, self.post_page):
            self.assertIn('JingzheEditor.createDirtyTracker()', source)
            self.assertIn('dirtyState.mark()', source)
            self.assertIn('dirtyState.clear()', source)


class WorkerPrivacyCompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frontend = (
            ROOT / 'themes/jingzhe_v3/assets/js/pages/comments.js'
        ).read_text(encoding='utf-8')
        cls.comments_worker = (
            ROOT / 'workers/comments/src/index.js'
        ).read_text(encoding='utf-8')
        cls.publisher_worker = (
            ROOT / 'workers/publisher/src/index.js'
        ).read_text(encoding='utf-8')

    def test_frontend_accepts_new_avatar_hash_and_old_email_shape(self):
        self.assertIn('comment.avatar_hash', self.frontend)
        self.assertIn('comment.email', self.frontend)
        self.assertIn("localStorage.setItem('koobai_user'", self.frontend)

    def test_public_comment_mapper_does_not_return_email_field(self):
        start = self.comments_worker.index('async function publicComment(row)')
        end = self.comments_worker.index('\n}\n\nasync function verifyTurnstile', start)
        mapper = self.comments_worker[start:end]
        self.assertNotIn('email:', mapper)
        self.assertIn('avatar_hash:', mapper)
        self.assertNotIn('SELECT *', self.comments_worker)

    def test_comment_reply_parent_is_scoped_to_same_page(self):
        self.assertIn(
            "SELECT author, email, content FROM comments WHERE id = ? AND url = ?",
            self.comments_worker,
        )

    def test_publisher_proxy_uses_exact_repository_boundary(self):
        self.assertIn("url.hostname === 'api.github.com'", self.publisher_worker)
        self.assertIn("url.pathname === repositoryPath", self.publisher_worker)
        self.assertIn("url.pathname.startsWith(`${repositoryPath}/`)", self.publisher_worker)


class ThemePipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = (ROOT / 'themes/jingzhe_v3/layouts/baseof.html').read_text(encoding='utf-8')
        cls.footer = (ROOT / 'themes/jingzhe_v3/layouts/_partials/footer.html').read_text(encoding='utf-8')
        cls.comments = (ROOT / 'themes/jingzhe_v3/layouts/_partials/comments.html').read_text(encoding='utf-8')
        cls.styles = (ROOT / 'themes/jingzhe_v3/assets/css/style.css').read_text(encoding='utf-8')

    def test_social_runtime_and_turnstile_are_scoped_to_comments(self):
        self.assertNotIn('jingzhe/runtime-config.html', self.base)
        self.assertNotIn('turnstileScriptUrl', self.footer)
        self.assertIn('jingzhe/runtime-config.html', self.comments)
        self.assertIn('turnstileScriptUrl', self.comments)

    def test_optional_styles_are_guarded_by_feature_flags(self):
        expected = {
            'movies': '@import "movies.css";',
            'exercise': '@import "exercise.css";',
            'publisher': '@import "newlaodao.css";',
            'social': '@import "comments.css";',
        }
        for feature, stylesheet_import in expected.items():
            guard = 'partial "jingzhe/feature-enabled.html" "{}"'.format(feature)
            self.assertIn(guard, self.styles)
            self.assertIn(stylesheet_import, self.styles)

    def test_native_css_pipeline_does_not_require_sass(self):
        assets = ROOT / 'themes/jingzhe_v3/assets'

        self.assertIn('css.Build', self.base)
        self.assertNotIn('toCSS', self.base)
        self.assertIn('resources.Get "css/style.css"', self.base)
        self.assertFalse((assets / 'scss').exists())
        self.assertGreater(len(list((assets / 'css').glob('*.css'))), 1)

    def test_all_local_javascript_sources_are_referenced(self):
        layouts = ROOT / 'themes/jingzhe_v3/layouts'
        combined = '\n'.join(
            path.read_text(encoding='utf-8') for path in layouts.rglob('*.html')
        )
        vendor_names = {path.name for path in (ROOT / 'static/js').glob('*.js')}
        page_names = {
            path.name for path in (ROOT / 'themes/jingzhe_v3/assets/js/pages').glob('*.js')
        }
        self.assertEqual(
            sorted(name for name in vendor_names if name not in combined),
            [],
        )
        self.assertEqual(
            sorted(name for name in page_names if name not in combined),
            [],
        )
        self.assertNotIn('?v=', combined)

    def test_laodao_recommendations_are_deterministic_and_cached(self):
        single = (ROOT / 'themes/jingzhe_v3/layouts/laodao/single.html').read_text(encoding='utf-8')
        home = (ROOT / 'themes/jingzhe_v3/layouts/home.html').read_text(encoding='utf-8')
        listing = (ROOT / 'themes/jingzhe_v3/layouts/list.html').read_text(encoding='utf-8')

        self.assertNotIn('shuffle', single)
        self.assertIn('.Site.RegularPages.Related .', single)
        self.assertIn('first 5', single)
        for source in (single, home, listing):
            self.assertIn('partialCached "laodao-card.html"', source)


class ProductionSeparationTests(unittest.TestCase):
    def test_personal_page_copy_lives_in_content_not_theme(self):
        about = (ROOT / 'themes/jingzhe_v3/layouts/about.html').read_text(encoding='utf-8')
        exercise = (ROOT / 'themes/jingzhe_v3/layouts/exercise.html').read_text(encoding='utf-8')

        self.assertIn('.Params.intro', about)
        self.assertIn('.Content', about)
        self.assertNotIn('1984 年', about)
        self.assertIn('.Params.intro', exercise)
        self.assertNotIn('二型糖尿病', exercise)

    def test_production_service_identity_is_injected_from_config(self):
        rss = (ROOT / 'themes/jingzhe_v3/layouts/home.rss.xml').read_text(encoding='utf-8')
        exercise = (ROOT / 'themes/jingzhe_v3/layouts/exercise.html').read_text(encoding='utf-8')
        exercise_map = (
            ROOT / 'themes/jingzhe_v3/assets/js/pages/exercise-map.js'
        ).read_text(encoding='utf-8')

        self.assertIn('followfeedid', rss)
        self.assertNotIn('52982633250295857', rss)
        for field in ('MAP_STYLE_LIGHT', 'MAP_STYLE_DARK', 'MAP_CENTER', 'POSTER_FILE_PREFIX'):
            self.assertIn(field, exercise)
            self.assertIn(field, exercise_map)
        self.assertNotIn('mapbox://styles/koobai', exercise_map)
        self.assertNotIn('[120.1551, 30.2741]', exercise_map)


class ExerciseDisplayPipelineTests(unittest.TestCase):
    def test_template_consumes_processed_display_fields(self):
        template = (ROOT / 'themes/jingzhe_v3/layouts/exercise.html').read_text(encoding='utf-8')
        exercise_ui = (
            ROOT / 'themes/jingzhe_v3/assets/js/pages/exercise-ui.js'
        ).read_text(encoding='utf-8')

        for field in ('display_name', 'sport_display_name', 'card_achievement', 'calendar_achievements'):
            self.assertIn(field, template)
        self.assertNotIn('findRE $pattern', template)
        self.assertNotIn('map-achieve-data', template)
        self.assertIn('primaryRun.calendar_achievements', exercise_ui)
        self.assertNotIn('calRideYDate', exercise_ui)

    def test_browser_payload_does_not_include_sync_identity(self):
        template = (ROOT / 'themes/jingzhe_v3/layouts/exercise.html').read_text(encoding='utf-8')
        self.assertNotIn('source_id', template)


if __name__ == '__main__':
    unittest.main()
