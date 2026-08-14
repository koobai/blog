import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class EditorCompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = (ROOT / 'static/js/editor-core.js').read_text(encoding='utf-8')
        cls.laodao = (
            ROOT / 'themes/jingzhe_v3/layouts/_default/newlaodao.html'
        ).read_text(encoding='utf-8')
        cls.post = (
            ROOT / 'themes/jingzhe_v3/layouts/_default/newsuibi.html'
        ).read_text(encoding='utf-8')

    def test_local_storage_keys_are_unchanged(self):
        self.assertIn("'koobai_admin_token'", self.core)
        self.assertIn("'koobai_laodao_draft'", self.laodao)
        self.assertIn("'koobai_article_draft'", self.post)

    def test_worker_auth_header_and_routes_are_unchanged(self):
        self.assertIn("'x-admin-token': getAdminToken()", self.core)
        for source in (self.laodao, self.post):
            self.assertIn('`${CONFIG.workerUrl}/api/github`', source)
            self.assertIn("method: 'PUT'", source)
            self.assertIn("'Content-Type': 'application/json'", source)
        self.assertIn('`${config.workerUrl}/api/upload?name=${filename}`', self.core)

    def test_repository_paths_and_commit_messages_are_unchanged(self):
        self.assertIn('`content/laodao/${year}/${month}/${year}${month}${day}-${hour}${min}${sec}.md`', self.laodao)
        self.assertIn('STATE.sha ? "唠叨修改" : "唠叨一下"', self.laodao)
        self.assertIn('`content/posts/${safeFilename}.md`', self.post)
        self.assertIn('`修改随笔: ${title}`', self.post)
        self.assertIn('`新一篇随笔: ${title}`', self.post)

    def test_front_matter_fields_are_still_emitted(self):
        for field in ('date:', 'laodaotags:', 'location:', 'latlng:', 'device:'):
            self.assertIn(field, self.laodao)
        for field in ('title:', 'date:', 'slug:', 'image:', 'description:', 'tags:'):
            self.assertIn(field, self.post)


class WorkerPrivacyCompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frontend = (ROOT / 'static/js/comments.js').read_text(encoding='utf-8')
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


if __name__ == '__main__':
    unittest.main()
