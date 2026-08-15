'use strict';

const assert = require('node:assert/strict');

const values = new Map();
const windowListeners = new Map();
global.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};
global.addEventListener = (name, listener) => windowListeners.set(name, listener);
global.removeEventListener = name => windowListeners.delete(name);

const editor = require('../themes/jingzhe_v3/assets/js/pages/editor-core.js');

async function main() {
  editor.setAdminToken('token-value');
  assert.equal(editor.getAdminToken(), 'token-value');
  assert.equal(values.get('koobai_admin_token'), 'token-value');

  const config = { owner: 'owner', repo: 'repo', branch: 'main' };
  assert.equal(editor.repositoryUrl(config), 'https://api.github.com/repos/owner/repo');
  assert.equal(
    editor.commitsUrl(config, 'content/posts'),
    'https://api.github.com/repos/owner/repo/commits?path=content/posts&per_page=3&sha=main'
  );
  assert.equal(
    editor.contentsUrl(config, 'content/posts/中文.md', true),
    'https://api.github.com/repos/owner/repo/contents/content/posts/%E4%B8%AD%E6%96%87.md?ref=main'
  );

  const text = '惊蛰 editor';
  assert.equal(editor.base64ToUtf8(editor.utf8ToBase64(text)), text);

  const parser = { parse: markdown => `<p>${markdown}</p>` };
  assert.equal(editor.renderMarkdown(parser, ''), '<p>*空空如也*</p>');
  assert.equal(
    editor.renderMarkdown(parser, '  body  ', { trim: true }),
    '<p>body</p>'
  );
  assert.equal(
    editor.renderMarkdown(parser, '', { allowEmpty: true }),
    '<p></p>'
  );

  editor.saveDraft('koobai_article_draft', { title: 'draft' });
  assert.deepEqual(editor.loadDraft('koobai_article_draft'), { title: 'draft' });
  values.set('broken', '{');
  assert.equal(editor.loadDraft('broken'), null);

  assert.equal(editor.yamlString('标题 "引用"\n下一行'), '"标题 \\"引用\\"\\n下一行"');
  assert.equal(editor.frontMatterScalar('title: "标题 \\"引用\\""', 'title'), '标题 "引用"');
  assert.deepEqual(editor.validateFilename('随笔.md'), { ok: true, value: '随笔' });
  assert.equal(editor.validateFilename('../workflow.yml').ok, false);
  assert.equal(editor.validateSlug('folder/slug').ok, false);

  const post = editor.buildPostMarkdown({
    title: '标题 "引用"',
    date: '2026-08-15T12:00:00+08:00',
    slug: 'safe-slug',
    description: '第一行\n第二行',
    image: 'https://img.example/cover.webp',
    tags: ['生活', '生活', 'A:B'],
    content: '正文'
  });
  assert.match(post, /title: "标题 \\"引用\\""/);
  assert.match(post, /description: "第一行\\n第二行"/);
  assert.equal((post.match(/  - "生活"/g) || []).length, 1);

  const laodao = editor.buildLaodaoMarkdown({
    date: '2026-08-15T12:00:00+08:00',
    tags: ['日常'],
    location: { name: '西湖 "边"', lat: 30.1, lng: 120.2 },
    device: 'iPhone "Pro"',
    content: '短文'
  });
  assert.match(laodao, /location: "西湖 \\"边\\""/);
  assert.match(laodao, /device: "iPhone \\"Pro\\""/);

  const dirty = editor.createDirtyTracker();
  const beforeUnload = windowListeners.get('beforeunload');
  const cleanEvent = { preventDefault() { this.prevented = true; }, returnValue: null };
  beforeUnload(cleanEvent);
  assert.equal(cleanEvent.prevented, undefined);
  dirty.mark();
  const dirtyEvent = { preventDefault() { this.prevented = true; }, returnValue: null };
  beforeUnload(dirtyEvent);
  assert.equal(dirtyEvent.prevented, true);
  assert.equal(dirtyEvent.returnValue, '');
  dirty.clear();
  assert.equal(dirty.isDirty(), false);

  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { status: 200 };
  };
  await editor.secureFetch('/api/github', { headers: { 'x-target-url': 'target' } });
  assert.equal(request.url, '/api/github');
  assert.deepEqual(request.options.headers, {
    'x-target-url': 'target',
    'x-admin-token': 'token-value'
  });

  global.FileReader = class {
    readAsDataURL() {
      queueMicrotask(() => this.onload({ target: { result: 'data:image/png;base64,AA==' } }));
    }
  };
  global.Image = class {
    constructor() { this.width = 100; this.height = 80; }
    set src(_value) { queueMicrotask(() => this.onload()); }
  };
  global.document = {
    getElementById: () => null,
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
      toBlob: callback => callback({ type: 'image/webp' })
    })
  };
  global.fetch = async () => ({ status: 500, ok: false });
  await assert.rejects(
    editor.uploadImage({ type: 'image/png' }, { workerUrl: '/worker', upyunDomain: 'https://img.example' }, 'article'),
    /UPLOAD_500/
  );
  global.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({ url: 'https://img.example/server-result.webp' })
  });
  assert.equal(
    (await editor.uploadImage({ type: 'image/png' }, { workerUrl: '/worker', upyunDomain: 'https://img.example' }, 'article')).url,
    'https://img.example/server-result.webp'
  );

  editor.clearAdminToken();
  assert.equal(editor.getAdminToken(), '');
  console.log('editor-core contracts: ok');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
