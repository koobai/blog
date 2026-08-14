'use strict';

const assert = require('node:assert/strict');

const values = new Map();
global.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};

const editor = require('../static/js/editor-core.js');

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

  editor.clearAdminToken();
  assert.equal(editor.getAdminToken(), '');
  console.log('editor-core contracts: ok');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
