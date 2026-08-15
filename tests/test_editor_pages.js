const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor() {
    this.value = '';
    this.style = {};
    this.dataset = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.scrollHeight = 100;
    this.selectionStart = 0;
    this.selectionEnd = 0;
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }

  dispatch(name, event = {}) {
    for (const callback of this.listeners.get(name) || []) {
      callback.call(this, { target: this, key: '', preventDefault() {}, ...event });
    }
  }

  focus() {}
  setSelectionRange() {}
  getBoundingClientRect() { return { top: 1 }; }
}

function mountEditor(filename, config) {
  const elements = new Map();
  const byId = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const savedDrafts = [];
  let dirtyMarks = 0;
  const context = {
    console,
    document: {
      createElement: () => new FakeElement(),
      body: new FakeElement()
    },
    location: { reload() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    marked: { use() {}, parse: value => value },
    cocoMessage: new Proxy({}, { get: () => () => {} }),
    JingzheEditor: {
      byId,
      getAdminToken: () => '',
      setAdminToken() {},
      clearAdminToken() {},
      utf8ToBase64: value => value,
      base64ToUtf8: value => value,
      secureFetch: async () => ({ ok: true, json: async () => ({}) }),
      saveDraft: (key, value) => savedDrafts.push({ key, value }),
      loadDraft: () => null,
      removeDraft() {},
      fetchTagTitles: async () => [],
      renderMarkdown: (_parser, value) => value,
      uploadImage: async () => ({ url: 'https://img.example/image.webp' }),
      repositoryUrl: () => 'https://api.github.com/repos/owner/repo',
      commitsUrl: () => 'https://api.github.com/repos/owner/repo/commits',
      contentsUrl: () => 'https://api.github.com/repos/owner/repo/contents/file.md',
      buildLaodaoMarkdown: () => 'laodao',
      buildPostMarkdown: () => 'post',
      frontMatterScalar: () => '',
      validateFilename: value => ({ ok: true, value }),
      validateSlug: value => ({ ok: true, value }),
      createDirtyTracker: () => ({
        mark: () => { dirtyMarks += 1; },
        clear() {}
      })
    },
    Event: class {},
    MouseEvent: class {},
    Blob: class {},
    URL: { createObjectURL: () => 'blob:draft-id' },
    confirm: () => true,
    prompt: () => '',
    fetch: async () => ({ json: async () => ({}) }),
    setTimeout: callback => { callback(); return 1; },
    clearTimeout() {},
    requestAnimationFrame: callback => callback()
  };
  context.window = context;
  context.window.JINGZHE_EDITOR_CONFIG = config;
  context.window.addEventListener = () => {};
  context.window.scrollTo = () => {};
  context.window.requestAnimationFrame = callback => callback();

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, `../themes/jingzhe_v3/assets/js/pages/${filename}`), 'utf8');
  vm.runInContext(source, context, { filename });
  return { context, byId, savedDrafts, dirtyMarks: () => dirtyMarks };
}

function testLaodaoPage() {
  const mounted = mountEditor('editor-laodao.js', {
    workerUrl: '/worker', draftUrl: '/drafts', owner: 'owner', repo: 'repo', branch: 'main'
  });
  assert.equal(mounted.byId('loginOverlay').style.display, 'flex');
  assert.equal(mounted.byId('adminPanel').style.display, 'none');
  for (const action of ['publishPost', 'saveCloudDraft', 'toggleDraftList', 'insertLink']) {
    assert.equal(typeof mounted.context[action], 'function', action);
  }

  const content = mounted.byId('content');
  content.value = '一条本地草稿';
  content.dispatch('input');
  assert.equal(mounted.dirtyMarks(), 1);
  assert.equal(mounted.savedDrafts.at(-1).key, 'koobai_laodao_draft');
  assert.equal(mounted.savedDrafts.at(-1).value.content, '一条本地草稿');
}

function testPostPage() {
  const mounted = mountEditor('editor-post.js', {
    workerUrl: '/worker', owner: 'owner', repo: 'repo', branch: 'main'
  });
  assert.equal(mounted.byId('loginOverlay').style.display, 'flex');
  assert.equal(mounted.byId('adminPanel').style.display, 'none');
  for (const action of ['publishPost', 'fetchAndLoadForEdit', 'wrapText', 'insertLink']) {
    assert.equal(typeof mounted.context[action], 'function', action);
  }

  mounted.byId('postTitle').value = '一篇本地草稿';
  mounted.byId('postTitle').dispatch('input');
  assert.equal(mounted.dirtyMarks(), 1);
  assert.equal(mounted.savedDrafts.at(-1).key, 'koobai_article_draft');
  assert.equal(mounted.savedDrafts.at(-1).value.title, '一篇本地草稿');
}

testLaodaoPage();
testPostPage();
console.log('editor page behavior contracts: ok');
