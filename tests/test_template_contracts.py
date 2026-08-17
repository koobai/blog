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
        cls.comments_partial = (
            ROOT / 'themes/jingzhe_v3/layouts/_partials/comments.html'
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

    def test_public_comment_actions_use_delegated_events(self):
        combined = self.comments_partial + self.frontend
        self.assertNotIn('onclick=', combined)
        for action in ('reply', 'delete', 'load-more', 'cancel-reply'):
            self.assertIn(f'data-comment-action="{action}"', combined)
        self.assertIn("closest('[data-comment-action]')", self.frontend)

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
        cls.header = (ROOT / 'themes/jingzhe_v3/layouts/_partials/header.html').read_text(encoding='utf-8')
        cls.laodao_card = (ROOT / 'themes/jingzhe_v3/layouts/_partials/laodao-card.html').read_text(encoding='utf-8')
        cls.post_single = (ROOT / 'themes/jingzhe_v3/layouts/posts/single.html').read_text(encoding='utf-8')
        cls.site_script = (ROOT / 'themes/jingzhe_v3/assets/js/scripts.js').read_text(encoding='utf-8')
        cls.theme_script = (ROOT / 'themes/jingzhe_v3/assets/js/theme.js').read_text(encoding='utf-8')
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

    def test_reader_interactions_use_native_buttons(self):
        for mode in ('light', 'dark', 'auto'):
            self.assertIn(
                f'<button type="button" class="theme-item" data-mode="{mode}">',
                self.header,
            )
        self.assertNotIn('<span class="theme-item"', self.header)
        self.assertIn('class="theme-dropdown-button"', self.header)
        self.assertIn('class="koobai-like-trigger"', self.laodao_card)
        self.assertIn('class="koobai-comment-trigger"', self.laodao_card)
        self.assertNotIn('<span class="koobai-like-trigger"', self.laodao_card)
        self.assertNotIn('<span class="koobai-comment-trigger"', self.laodao_card)
        self.assertIn("event.target.closest('.theme-item')", self.theme_script)

    def test_each_laodao_gallery_is_its_own_image_viewer_group(self):
        self.assertIn('class="laodao-gallery" view-image', self.laodao_card)

    def test_laodao_date_link_is_relative_to_the_current_site(self):
        self.assertIn('<a href="{{ .RelPermalink }}">', self.laodao_card)
        self.assertNotIn('<a href="{{ .Permalink }}">', self.laodao_card)

    def test_article_back_button_uses_a_script_listener(self):
        self.assertNotIn('onclick=', self.post_single)
        self.assertIn('data-fallback-url="{{ site.Home.RelPermalink }}"', self.post_single)
        self.assertIn("backButton?.addEventListener('click'", self.site_script)
        self.assertIn("backButton.dataset.fallbackUrl || '/'", self.site_script)

    def test_image_viewer_is_scoped_and_cached_by_page_shape(self):
        self.assertIn('$needsImageViewer', self.footer)
        self.assertIn('(eq .Type "laodao")', self.footer)
        self.assertIn('(and .IsPage (eq .Type $postType))', self.footer)
        self.assertIn('(eq .Layout "about")', self.footer)
        self.assertIn('{{ if $needsImageViewer }}', self.footer)
        self.assertIn('partialCached "footer.html" . .Kind .Type .Layout', self.base)

    def test_all_local_javascript_sources_are_referenced(self):
        layouts = ROOT / 'themes/jingzhe_v3/layouts'
        combined = '\n'.join(
            path.read_text(encoding='utf-8') for path in layouts.rglob('*.html')
        )
        vendor_names = {path.name for path in (ROOT / 'static/js').glob('*.js')}
        page_names = {
            path.name for path in (ROOT / 'themes/jingzhe_v3/assets/js/pages').glob('*.js')
        }
        exercise_names = {
            path.name for path in (ROOT / 'themes/jingzhe_v3/assets/js/exercise').glob('*.js')
        }
        self.assertEqual(
            sorted(name for name in vendor_names if name not in combined),
            [],
        )
        self.assertEqual(
            sorted(name for name in page_names if name not in combined),
            [],
        )
        self.assertEqual(
            sorted(name for name in exercise_names if name not in combined),
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


class DatePresentationTests(unittest.TestCase):
    def test_public_dates_share_one_partial(self):
        layouts = ROOT / 'themes/jingzhe_v3/layouts'
        date_partial = (layouts / '_partials/jingzhe/date.html').read_text(encoding='utf-8')
        self.assertIn('$date.Format "01-02"', date_partial)
        self.assertIn('$date.Format "2006-01-02"', date_partial)

        expected_uses = {
            'home.html': 1,
            'list.html': 1,
            'posts/list.html': 2,
            'posts/single.html': 1,
            '_partials/laodao-card.html': 1,
            'movies.html': 1,
        }
        for relative_path, expected_count in expected_uses.items():
            source = (layouts / relative_path).read_text(encoding='utf-8')
            self.assertEqual(source.count('partial "jingzhe/date.html"'), expected_count)


class MoviesLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = (
            ROOT / 'themes/jingzhe_v3/layouts/movies.html'
        ).read_text(encoding='utf-8')
        cls.styles = (
            ROOT / 'themes/jingzhe_v3/assets/css/movies.css'
        ).read_text(encoding='utf-8')
        cls.script = (
            ROOT / 'themes/jingzhe_v3/assets/js/pages/movies.js'
        ).read_text(encoding='utf-8')

    def test_movies_remain_available_without_javascript(self):
        self.assertNotIn('{{ if ge $index 16 }}is-hidden{{ end }}', self.template)
        self.assertIn('aria-controls="movie-list" aria-live="polite" hidden', self.template)
        self.assertIn("movie.classList.toggle('is-hidden'", self.script)
        self.assertIn('class="movie-btn-more-label">再翻一叠</span>', self.template)
        self.assertIn('class="movie-btn-more-progress"', self.template)
        self.assertIn("btnLoadMore.disabled = isComplete", self.script)
        self.assertIn("isComplete ? '票夹见底' : '再翻一叠'", self.script)
        self.assertIn('`${currentIndex} / ${allMovies.length}`', self.script)
        self.assertIn('.movie-btn-more.is-complete', self.styles)

    def test_masonry_uses_native_layout_with_a_local_fallback(self):
        self.assertIn('@supports (display: grid-lanes)', self.styles)
        self.assertIn('.ticket-layout.is-js-masonry', self.styles)
        self.assertIn("CSS.supports('display', 'grid-lanes')", self.script)
        self.assertIn("layout.classList.add('is-js-masonry')", self.script)
        self.assertIn('const column = index % 2', self.script)
        self.assertIn('.ticket-item:nth-child(odd)', self.styles)
        self.assertIn('.ticket-item:nth-child(even)', self.styles)
        self.assertIn('requestAnimationFrame(layoutMasonry)', self.script)
        self.assertIn('new ResizeObserver', self.script)
        self.assertIn("window.scrollTo({ top: scrollTop, behavior: 'auto' })", self.script)
        self.assertIn('overflow-anchor: none', self.styles)

    def test_movie_ratings_use_one_accessible_css_element(self):
        self.assertNotIn('icon-star-', self.template)
        self.assertNotIn('<svg class=', self.template)
        self.assertIn('class="rc-stars" role="img"', self.template)
        self.assertIn('aria-label="评分 {{ $rating }} 星，满分 5 星"', self.template)
        self.assertIn('--movie-rating-width:', self.template)
        self.assertIn('.rc-stars::after', self.styles)
        self.assertIn('--movie-star-shape: url("data:image/svg+xml,', self.styles)
        self.assertIn('mask-repeat: repeat-x', self.styles)
        self.assertNotIn('content: "★★★★★"', self.styles)

    def test_ticket_details_are_css_only_and_keep_the_markup_compact(self):
        self.assertIn('NO. {{ $movie.id }}', self.template)
        self.assertNotIn('REF:{{ $movie.id }}', self.template)
        self.assertNotIn('.ticket-body::before', self.styles)
        self.assertIn('"1" "劝退"', self.template)
        self.assertIn('"2" "平平"', self.template)
        self.assertIn('"3" "尚可"', self.template)
        self.assertIn('"4" "推荐"', self.template)
        self.assertIn('"5" "必看"', self.template)
        self.assertIn('data-cert="{{ . }}"', self.template)
        self.assertNotIn('data-cert-en', self.template)
        self.assertNotIn('"MUST"', self.template)
        self.assertIn('.ticket-body[data-cert]::after', self.styles)
        self.assertIn('content: attr(data-cert) / ""', self.styles)
        self.assertIn('font-size: 0.56rem', self.styles)
        self.assertIn('padding: 5px 7px', self.styles)
        self.assertIn('white-space: nowrap', self.styles)
        self.assertIn('--stamp-rotate: {{ sub (mod $barcodeSeed 13) 7 }}deg', self.template)
        self.assertIn('rotate(var(--stamp-rotate, -7deg))', self.styles)
        self.assertIn('var(--stamp-opacity, 17%)', self.styles)
        self.assertIn('var(--stamp-dark-opacity, 24%)', self.styles)
        self.assertIn('--stamp-opacity: {{ add 15 (mod $barcodeSeed 5) }}%', self.template)
        self.assertIn('--stamp-dark-opacity: {{ add 22 (mod $barcodeSeed 5) }}%', self.template)
        self.assertIn('var(--movie-main-dark-color, var(--text-highlight-dark-color)) 55%, white', self.styles)
        self.assertIn('color-mix(in srgb, currentColor 58%, transparent)', self.styles)
        self.assertIn('z-index: 2', self.styles)
        self.assertNotIn('.ticket-item:hover', self.styles)
        self.assertNotIn('content: "DATE"', self.styles)
        self.assertIn('white-space: nowrap', self.styles)
        self.assertIn('circle at left bottom', self.styles)
        self.assertIn('circle at left top', self.styles)
        self.assertNotIn('.ticket-stub::before', self.styles)
        self.assertIn('--bc-a: {{ add 1 (mod $barcodeSeed 2) }}px', self.template)
        self.assertIn('--bc-s:', self.template)
        self.assertIn('--bc-x:', self.template)
        self.assertIn('repeating-linear-gradient', self.styles)
        self.assertEqual(self.styles.count('color: #ad9258;'), 2)


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
            ROOT / 'themes/jingzhe_v3/assets/js/exercise/mapbox-adapter.js'
        ).read_text(encoding='utf-8')
        exercise_poster = (
            ROOT / 'themes/jingzhe_v3/assets/js/exercise/poster.js'
        ).read_text(encoding='utf-8')

        self.assertIn('followfeedid', rss)
        self.assertNotIn('52982633250295857', rss)
        for field in ('MAP_STYLE_LIGHT', 'MAP_STYLE_DARK', 'MAP_CENTER', 'POSTER_FILE_PREFIX'):
            self.assertIn(field, exercise)
        for field in ('MAP_STYLE_LIGHT', 'MAP_STYLE_DARK', 'MAP_CENTER'):
            self.assertIn(field, exercise_map)
        self.assertIn('POSTER_FILE_PREFIX', exercise_poster)
        self.assertNotIn('mapbox://styles/koobai', exercise_map)
        self.assertNotIn('[120.1551, 30.2741]', exercise_map)


class ExerciseDisplayPipelineTests(unittest.TestCase):
    def test_template_consumes_processed_display_fields(self):
        template = (ROOT / 'themes/jingzhe_v3/layouts/exercise.html').read_text(encoding='utf-8')
        exercise_ui = (
            ROOT / 'themes/jingzhe_v3/assets/js/exercise/ui.js'
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

    def test_private_routes_never_read_their_original_polyline(self):
        routes = (
            ROOT / 'themes/jingzhe_v3/assets/js/exercise/routes.js'
        ).read_text(encoding='utf-8')

        self.assertIn("run.route_status === 'available' && run.summary_polyline", routes)
        self.assertIn('Privacy invariant', routes)


if __name__ == '__main__':
    unittest.main()
