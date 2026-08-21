import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import commentsWorker from '../workers/comments/src/index.js';
import draftsWorker from '../workers/drafts/src/index.js';
import likesWorker from '../workers/likes/src/index.js';
import publisherWorker from '../workers/publisher/src/index.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const origin = 'https://koobai.com';

async function responseJson(response) {
  const body = await response.json();
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  return body;
}

async function testCommentsHideEmail() {
  const stored = {
    id: 7,
    url: '/hello/',
    author: '访客',
    email: 'reader@example.org',
    website: 'https://example.org',
    content: '你好',
    parent_id: null,
    created_at: '2026-08-14 12:00:00'
  };
  const env = {
    ALLOWED_ORIGINS: origin,
    DB: {
      prepare(sql) {
        assert.match(sql, /SELECT id, url, author, email, website, content/);
        assert.doesNotMatch(sql, /SELECT\s+\*/i);
        return {
          bind(value) {
            assert.equal(value, '/hello/');
            return { all: async () => ({ results: [stored] }) };
          }
        };
      }
    }
  };
  const request = new Request('https://comments.example.org/api/comments?url=/hello/', {
    headers: { Origin: origin }
  });
  const response = await commentsWorker.fetch(request, env);
  assert.equal(response.status, 200);
  const comments = await responseJson(response);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].author, stored.author);
  assert.equal(comments[0].content, stored.content);
  assert.equal('email' in comments[0], false, 'public comment response must not expose email');
  assert.match(comments[0].avatar_hash, /^[a-f0-9]{64}$/);
}

async function testCommentsRejectForeignOrigin() {
  const request = new Request('https://comments.example.org/api/comments?url=/hello/', {
    headers: { Origin: 'https://attacker.example' }
  });
  const response = await commentsWorker.fetch(request, {
    ALLOWED_ORIGINS: origin,
    DB: { prepare() { throw new Error('database must not be reached'); } }
  });
  assert.equal(response.status, 403);
}

async function testDraftAuthenticationAndShape() {
  const env = {
    ALLOWED_ORIGINS: origin,
    ADMIN_TOKEN: 'local-test-token',
    DB: {
      prepare(sql) {
        assert.match(sql, /FROM laodao_drafts/);
        return {
          all: async () => ({
            results: [{
              id: 'draft-1',
              kind: 'laodao',
              payload_json: '{}',
              content: '未发布内容',
              location_name: '杭州',
              lat: 30.2,
              lng: 120.1,
              created_at: '2026-08-14 12:00:00'
            }]
          })
        };
      }
    }
  };
  const unauthorized = await draftsWorker.fetch(
    new Request('https://drafts.example.org/api/drafts', { headers: { Origin: origin } }),
    env
  );
  assert.equal(unauthorized.status, 401);

  const authorized = await draftsWorker.fetch(new Request('https://drafts.example.org/api/drafts', {
    headers: { Origin: origin, 'x-admin-token': 'local-test-token' }
  }), env);
  assert.equal(authorized.status, 200);
  const drafts = await responseJson(authorized);
  assert.deepEqual(drafts[0], {
    id: 'draft-1',
    kind: 'laodao',
    date: '2026-08-14 12:00:00',
    payload: {
      content: '未发布内容',
      images: [],
      locationName: '杭州',
      lat: 30.2,
      lng: 120.1,
      url: ''
    },
    content: '未发布内容',
    images: [],
    locationName: '杭州',
    lat: 30.2,
    lng: 120.1,
    url: ''
  });
}

async function testUnifiedZouguoDraftPreservesPayload() {
  let boundValues = null;
  const env = {
    ALLOWED_ORIGINS: origin,
    ADMIN_TOKEN: 'local-test-token',
    DB: {
      prepare(sql) {
        assert.match(sql, /INSERT OR REPLACE INTO laodao_drafts/);
        return {
          bind(...values) {
            boundValues = values;
            return { run: async () => ({ success: true }) };
          }
        };
      }
    }
  };
  const payload = {
    content: '雨停了。',
    images: ['https://img.example.org/zouguo/1.webp', 'https://img.example.org/zouguo/2.webp'],
    occurredAt: '2026-08-18T18:20:00+08:00',
    place: {
      id: 'jp-tokyo-river',
      name: '东京 · 河边',
      longitude: 139.6917,
      latitude: 35.6895
    }
  };
  const response = await draftsWorker.fetch(new Request('https://drafts.example.org/api/drafts', {
    method: 'POST',
    headers: {
      Origin: origin,
      'x-admin-token': 'local-test-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id: 'zouguo-draft-1', kind: 'zouguo', payload })
  }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), {
    success: true,
    id: 'zouguo-draft-1',
    kind: 'zouguo'
  });
  assert.equal(boundValues[0], 'zouguo-draft-1');
  assert.equal(boundValues[1], 'zouguo');
  assert.deepEqual(JSON.parse(boundValues[2]), payload);
  assert.deepEqual(JSON.parse(boundValues[2]).images, payload.images, 'image order must be stable');
}

async function testLikesReadContract() {
  const env = {
    ALLOWED_ORIGINS: origin,
    DB: {
      prepare(sql) {
        assert.match(sql, /FROM likes_count/);
        return { all: async () => ({ results: [{ url: '/hello/', count: 3 }] }) };
      }
    }
  };
  const response = await likesWorker.fetch(new Request('https://likes.example.org/api/likes', {
    headers: { Origin: origin }
  }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /s-maxage=60/);
  assert.deepEqual(await responseJson(response), {
    counts: { '/hello/': 3 },
    myLikes: []
  });
}

async function testLikesSubmitIsAtomicAndDistinguishesDuplicates() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async target => {
    assert.equal(target, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  };

  let repairRuns = 0;
  const makeRequest = () => new Request('https://likes.example.org/api/likes/submit', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'CF-Turnstile-Response': 'local-turnstile-token',
      'CF-Connecting-IP': '192.0.2.1'
    },
    body: JSON.stringify({ url: '/hello/' })
  });
  const makeEnv = ({ batchError = null, existing = null } = {}) => ({
    ALLOWED_ORIGINS: origin,
    TURNSTILE_SECRET_KEY: 'local-turnstile-secret',
    LIKE_SALT: 'local-like-salt',
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              sql,
              values,
              first: async () => existing,
              run: async () => {
                assert.match(sql, /MAX\(total_count, 1\)/);
                repairRuns += 1;
                return { success: true };
              }
            };
          }
        };
      },
      async batch(statements) {
        assert.equal(statements.length, 2);
        assert.match(statements[0].sql, /INSERT INTO likes /);
        assert.match(statements[1].sql, /INSERT INTO likes_count/);
        if (batchError) throw batchError;
        return [{ success: true }, { success: true }];
      }
    }
  });

  try {
    const created = await likesWorker.fetch(makeRequest(), makeEnv());
    assert.equal(created.status, 200);
    assert.deepEqual(await responseJson(created), { success: true });

    const duplicate = await likesWorker.fetch(
      makeRequest(),
      makeEnv({ batchError: new Error('UNIQUE constraint failed'), existing: { present: 1 } })
    );
    assert.equal(duplicate.status, 409);
    assert.deepEqual(await responseJson(duplicate), { error: 'Already liked' });
    assert.equal(repairRuns, 1);

    const databaseFailure = await likesWorker.fetch(
      makeRequest(),
      makeEnv({ batchError: new Error('database unavailable'), existing: null })
    );
    assert.equal(databaseFailure.status, 500);
    assert.deepEqual(await responseJson(databaseFailure), { error: '点赞服务暂时不可用' });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testPublisherRepositoryBoundary() {
  const env = {
    ALLOWED_ORIGINS: origin,
    ADMIN_TOKEN: 'local-test-token',
    GH_TOKEN: 'local-github-token',
    GITHUB_OWNER: 'koobai',
    GITHUB_REPO: 'blog'
  };
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async (target, options) => {
    fetchCalls += 1;
    assert.equal(target, 'https://api.github.com/repos/koobai/blog/contents/README.md');
    assert.equal(options.headers.Authorization, 'Bearer local-github-token');
    return new Response(JSON.stringify({ name: 'README.md' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const bad = await publisherWorker.fetch(new Request('https://publisher.example.org/api/github', {
      headers: {
        Origin: origin,
        'x-admin-token': 'local-test-token',
        'x-target-url': 'https://api.github.com/repos/koobai/blog-private/contents/README.md'
      }
    }), env);
    assert.equal(bad.status, 403);
    assert.equal(fetchCalls, 0);

    const good = await publisherWorker.fetch(new Request('https://publisher.example.org/api/github', {
      headers: {
        Origin: origin,
        'x-admin-token': 'local-test-token',
        'x-target-url': 'https://api.github.com/repos/koobai/blog/contents/README.md'
      }
    }), env);
    assert.equal(good.status, 200);
    assert.deepEqual(await responseJson(good), { name: 'README.md' });
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testPublisherUploadCorrectsImageContentType() {
  let storedKey = null;
  let storedMetadata = null;
  const env = {
    ALLOWED_ORIGINS: origin,
    ADMIN_TOKEN: 'local-test-token',
    GH_TOKEN: 'local-github-token',
    GITHUB_OWNER: 'koobai',
    GITHUB_REPO: 'blog',
    IMAGE_BASE_URL: 'https://img.example.org',
    R2_BUCKET: {
      async put(key, _body, options) {
        storedKey = key;
        storedMetadata = options.httpMetadata;
      }
    }
  };
  const response = await publisherWorker.fetch(new Request(
    'https://publisher.example.org/api/app/upload?name=zouguo/test-photo.jpg',
    {
      method: 'POST',
      headers: {
        Origin: origin,
        'x-admin-token': 'local-test-token',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    }
  ), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), {
    success: true,
    url: 'https://img.example.org/zouguo/test-photo.jpg'
  });
  assert.equal(storedKey, 'zouguo/test-photo.jpg');
  assert.deepEqual(storedMetadata, { contentType: 'image/jpeg' });
}

async function testPublisherZouguoIsIdempotentAndUsesSafePath() {
  const env = {
    ALLOWED_ORIGINS: origin,
    ADMIN_TOKEN: 'local-test-token',
    GH_TOKEN: 'local-github-token',
    GITHUB_OWNER: 'koobai',
    GITHUB_REPO: 'blog',
    GITHUB_BRANCH: 'main'
  };
  const originalFetch = globalThis.fetch;
  let stored = null;
  let putCalls = 0;
  globalThis.fetch = async (target, options = {}) => {
    assert.match(String(target), /^https:\/\/api\.github\.com\/repos\/koobai\/blog\/contents\/content\/zouguo\//);
    if (!options.method || options.method === 'GET') {
      if (!stored) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(stored), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(options.method, 'PUT');
    putCalls += 1;
    const body = JSON.parse(options.body);
    stored = { sha: 'sha-zouguo-1', content: body.content };
    return new Response(JSON.stringify({ content: { sha: stored.sha } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };

  const body = {
    requestId: 'ios-request-123',
    content: '傍晚走到河边。',
    occurredAt: '2026-08-18T18:20:00+08:00',
    publishedAt: '2026-08-20T08:00:00+08:00',
    images: ['https://img.example.org/zouguo/first.webp', 'https://img.example.org/zouguo/second.webp'],
    place: {
      id: 'jp-tokyo-river',
      name: '东京 · 河边',
      longitude: 139.6917,
      latitude: 35.6895,
      precision: 'locality',
      privacy: 'reduced',
      country: '日本',
      countryCode: 'JP',
      locality: '东京'
    }
  };
  const makeRequest = () => new Request('https://publisher.example.org/api/app/zouguo/publish', {
    method: 'POST',
    headers: {
      Origin: origin,
      'x-admin-token': 'local-test-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  try {
    const created = await publisherWorker.fetch(makeRequest(), env);
    assert.equal(created.status, 200);
    const createdBody = await responseJson(created);
    assert.equal(createdBody.changed, true);
    assert.equal(createdBody.path, 'content/zouguo/20260818-102000-ios-request-123.md');

    const markdown = Buffer.from(stored.content, 'base64').toString('utf8');
    assert.match(markdown, /type: "zouguo"/);
    assert.match(markdown, /country_code: "JP"/);
    assert.ok(markdown.indexOf('first.webp') < markdown.indexOf('second.webp'));

    const repeated = await publisherWorker.fetch(makeRequest(), env);
    assert.equal(repeated.status, 200);
    assert.equal((await responseJson(repeated)).changed, false);
    assert.equal(putCalls, 1, 'repeated request must not create or update another file');

    const path = 'content/zouguo/20260818-102000-ios-request-123.md';
    const detail = await publisherWorker.fetch(new Request(
      `https://publisher.example.org/api/app/zouguo/detail?path=${encodeURIComponent(path)}`,
      { headers: { Origin: origin, 'x-admin-token': 'local-test-token' } }
    ), env);
    assert.equal(detail.status, 200);
    const detailBody = await responseJson(detail);
    assert.equal(detailBody.title, '东京 · 河边');
    assert.equal(detailBody.content, '傍晚走到河边。');
    assert.deepEqual(detailBody.images, body.images);
    assert.equal(detailBody.occurredAt, body.occurredAt);
    assert.equal(detailBody.place.id, body.place.id);
    assert.equal(detailBody.place.countryCode, 'JP');
    assert.equal(detailBody.path, path);
    assert.equal(detailBody.sha, 'sha-zouguo-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testPublisherRejectsUnsafeZouguoPathBeforeGitHub() {
  const env = {
    ALLOWED_ORIGINS: origin,
    ADMIN_TOKEN: 'local-test-token',
    GH_TOKEN: 'local-github-token',
    GITHUB_OWNER: 'koobai',
    GITHUB_REPO: 'blog'
  };
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('must not reach GitHub'); };
  try {
    const response = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/zouguo/delete', {
      method: 'POST',
      headers: {
        Origin: origin,
        'x-admin-token': 'local-test-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: 'content/zouguo/../../config.toml' })
    }), env);
    assert.equal(response.status, 400);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testLegacyLaodaoCanCreateUpdateReadAndDelete() {
  const env = {
    ALLOWED_ORIGINS: origin,
    ADMIN_TOKEN: 'local-test-token',
    GH_TOKEN: 'local-github-token',
    GITHUB_OWNER: 'koobai',
    GITHUB_REPO: 'blog'
  };
  const originalFetch = globalThis.fetch;
  let stored = null;
  globalThis.fetch = async (_target, options = {}) => {
    if (!options.method || options.method === 'GET') {
      if (!stored) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(stored), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      stored = { sha: `sha-${Date.now()}`, content: body.content };
      return new Response(JSON.stringify({ content: { sha: stored.sha } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(options.method, 'DELETE');
    stored = null;
    return new Response(JSON.stringify({ commit: { sha: 'delete-sha' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const headers = {
    Origin: origin,
    'x-admin-token': 'local-test-token',
    'Content-Type': 'application/json'
  };
  const path = 'content/laodao/2026/08/20260818-102000.md';
  const requestBody = content => ({
    content,
    images: ['https://img.example.org/memos/one.webp'],
    locationName: '杭州',
    lat: 30.2,
    lng: 120.1,
    date: '2026-08-18T18:20:00+08:00',
    device: 'iPhone',
    ...(stored ? { path } : {})
  });

  try {
    const created = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/laodao/publish', {
      method: 'POST', headers, body: JSON.stringify(requestBody('旧 App 新建'))
    }), env);
    assert.equal(created.status, 200);
    assert.equal((await responseJson(created)).path, path);

    const updated = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/laodao/publish', {
      method: 'POST', headers, body: JSON.stringify(requestBody('旧 App 修改'))
    }), env);
    assert.equal(updated.status, 200);
    assert.equal((await responseJson(updated)).changed, true);

    const detail = await publisherWorker.fetch(new Request(`https://publisher.example.org/api/app/laodao/detail?path=${encodeURIComponent(path)}`, {
      headers: { Origin: origin, 'x-admin-token': 'local-test-token' }
    }), env);
    assert.equal(detail.status, 200);
    const detailBody = await responseJson(detail);
    assert.match(detailBody.content, /旧 App 修改/);
    assert.equal(detailBody.locationName, '杭州');
    assert.equal(detailBody.device, 'iPhone');

    const deleted = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/laodao/delete', {
      method: 'POST', headers, body: JSON.stringify({ path })
    }), env);
    assert.equal(deleted.status, 200);
    assert.equal((await responseJson(deleted)).changed, true);
    assert.equal(stored, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testLaodaoZouguoLinkRequiresPlaceAndCanBeRemoved() {
  const env = {
    ALLOWED_ORIGINS: origin,
    ADMIN_TOKEN: 'local-test-token',
    GH_TOKEN: 'local-github-token',
    GITHUB_OWNER: 'koobai',
    GITHUB_REPO: 'blog'
  };
  const originalFetch = globalThis.fetch;
  let stored = null;
  let githubCalls = 0;
  globalThis.fetch = async (_target, options = {}) => {
    githubCalls += 1;
    if (!options.method || options.method === 'GET') {
      if (!stored) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(stored), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(options.method, 'PUT');
    const body = JSON.parse(options.body);
    stored = { sha: `sha-${githubCalls}`, content: body.content };
    return new Response(JSON.stringify({ content: { sha: stored.sha } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const headers = {
    Origin: origin,
    'x-admin-token': 'local-test-token',
    'Content-Type': 'application/json'
  };
  const path = 'content/laodao/2026/08/20260818-112000.md';
  const place = {
    id: 'cn-zj-hz-lake',
    name: '杭州 · 湖边',
    longitude: 120.1,
    latitude: 30.2,
    precision: 'poi',
    privacy: 'public',
    country: '中国',
    countryCode: 'CN',
    region: '浙江',
    locality: '杭州'
  };

  try {
    const invalid = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/laodao/publish', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: '今天在这里 #走过',
        images: [],
        date: '2026-08-18T19:20:00+08:00'
      })
    }), env);
    assert.equal(invalid.status, 400);
    assert.equal(githubCalls, 0, 'missing structured place must fail before GitHub');

    const linked = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/laodao/publish', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: '今天在这里',
        images: [],
        date: '2026-08-18T19:20:00+08:00',
        syncToZouguo: true,
        occurredAt: '2026-08-18T18:20:00+08:00',
        place
      })
    }), env);
    assert.equal(linked.status, 200);
    const markdown = Buffer.from(stored.content, 'base64').toString('utf8');
    assert.match(markdown, /laodaotags:\n  - "走过"/);
    assert.match(markdown, /zouguo:\n  occurred_at:/);
    assert.match(markdown, /country_code: "CN"/);

    const detail = await publisherWorker.fetch(new Request(`https://publisher.example.org/api/app/laodao/detail?path=${encodeURIComponent(path)}`, {
      headers: { Origin: origin, 'x-admin-token': 'local-test-token' }
    }), env);
    assert.equal(detail.status, 200);
    const detailBody = await responseJson(detail);
    assert.equal(detailBody.syncToZouguo, true);
    assert.equal(detailBody.place.id, place.id);
    assert.equal(detailBody.occurredAt, '2026-08-18T18:20:00+08:00');

    const unlinked = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/laodao/publish', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: '改成普通唠叨',
        images: [],
        date: '2026-08-18T19:20:00+08:00',
        path,
        syncToZouguo: false
      })
    }), env);
    assert.equal(unlinked.status, 200);
    const unlinkedMarkdown = Buffer.from(stored.content, 'base64').toString('utf8');
    assert.doesNotMatch(unlinkedMarkdown, /zouguo:/);
    assert.doesNotMatch(unlinkedMarkdown, /"走过"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testAggregatedSourcesCanUpdateMetadataAndDetachSafely() {
  const env = {
    ALLOWED_ORIGINS: origin,
    ADMIN_TOKEN: 'local-test-token',
    GH_TOKEN: 'local-github-token',
    GITHUB_OWNER: 'koobai',
    GITHUB_REPO: 'blog'
  };
  const postPath = 'content/posts/一篇旅行.md';
  const laodaoPath = 'content/laodao/2026/08/20260818-120000.md';
  const files = new Map([
    [postPath, `---\ntitle: '一篇旅行'\ntags: ['生活','走过']\nzouguo:\n  occurred_at: 2024-05-02T11:00:00+08:00\n  place:\n    id: "cn-old"\n    name: "旧地点"\n    longitude: 120\n    latitude: 30\n    precision: "poi"\n    privacy: "public"\n    country: "中国"\n    country_code: "CN"\n---\n正文不能被改掉。\n`],
    [laodaoPath, `---\ndate: 2026-08-18T12:00:00+08:00\nlaodaotags:\n  - "生活"\n  - "走过"\nzouguo:\n  occurred_at: 2026-08-18T12:00:00+08:00\n  place:\n    id: "cn-old"\n    name: "旧地点"\n    longitude: 120\n    latitude: 30\n    precision: "poi"\n    privacy: "public"\n    country: "中国"\n    country_code: "CN"\n---\n唠叨正文。\n`]
  ]);
  const originalFetch = globalThis.fetch;
  let githubCalls = 0;
  globalThis.fetch = async (target, options = {}) => {
    githubCalls += 1;
    const marker = '/contents/';
    const encodedPath = String(target).split(marker)[1].split('?')[0];
    const path = encodedPath.split('/').map(decodeURIComponent).join('/');
    if (!options.method || options.method === 'GET') {
      if (!files.has(path)) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      return new Response(JSON.stringify({ sha: `sha-${path}`, content: Buffer.from(files.get(path)).toString('base64') }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    assert.equal(options.method, 'PUT');
    files.set(path, Buffer.from(JSON.parse(options.body).content, 'base64').toString('utf8'));
    return new Response(JSON.stringify({ content: { sha: `updated-${path}` } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  const headers = {
    Origin: origin,
    'x-admin-token': 'local-test-token',
    'Content-Type': 'application/json'
  };
  const place = {
    id: 'cn-zhejiang-hangzhou-park',
    name: '杭州 · 临平山公园',
    longitude: 120.2786,
    latitude: 30.4218,
    precision: 'poi',
    privacy: 'public',
    country: '中国',
    countryCode: 'CN',
    region: '浙江省',
    locality: '杭州市',
    provider: 'manual',
    providerId: 'manual:120.278600,30.421800'
  };

  try {
    const updated = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/zouguo/source/metadata', {
      method: 'POST', headers, body: JSON.stringify({ type: 'post', path: postPath, occurredAt: '2024-05-03T10:00:00+08:00', place })
    }), env);
    assert.equal(updated.status, 200);
    assert.equal((await responseJson(updated)).changed, true);
    assert.match(files.get(postPath), /title: '一篇旅行'/);
    assert.match(files.get(postPath), /occurred_at: 2024-05-03T10:00:00\+08:00/);
    assert.match(files.get(postPath), /name: "杭州 · 临平山公园"/);
    assert.match(files.get(postPath), /正文不能被改掉。/);

    const detachedPost = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/zouguo/source/detach', {
      method: 'POST', headers, body: JSON.stringify({ type: 'post', path: postPath })
    }), env);
    assert.equal(detachedPost.status, 200);
    assert.doesNotMatch(files.get(postPath), /zouguo:/);
    assert.doesNotMatch(files.get(postPath), /走过/);
    assert.match(files.get(postPath), /tags: \['生活'\]/);
    assert.match(files.get(postPath), /正文不能被改掉。/);

    const detachedLaodao = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/zouguo/source/detach', {
      method: 'POST', headers, body: JSON.stringify({ type: 'laodao', path: laodaoPath })
    }), env);
    assert.equal(detachedLaodao.status, 200);
    assert.doesNotMatch(files.get(laodaoPath), /zouguo:/);
    assert.doesNotMatch(files.get(laodaoPath), /走过/);
    assert.match(files.get(laodaoPath), /- "生活"/);
    assert.match(files.get(laodaoPath), /唠叨正文。/);

    const callsBeforeUnsafe = githubCalls;
    const unsafe = await publisherWorker.fetch(new Request('https://publisher.example.org/api/app/zouguo/source/detach', {
      method: 'POST', headers, body: JSON.stringify({ type: 'post', path: 'content/posts/../../config.toml' })
    }), env);
    assert.equal(unsafe.status, 400);
    assert.equal(githubCalls, callsBeforeUnsafe);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await testCommentsHideEmail();
await testCommentsRejectForeignOrigin();
await testDraftAuthenticationAndShape();
await testUnifiedZouguoDraftPreservesPayload();
await testLikesReadContract();
await testLikesSubmitIsAtomicAndDistinguishesDuplicates();
await testPublisherRepositoryBoundary();
await testPublisherUploadCorrectsImageContentType();
await testPublisherZouguoIsIdempotentAndUsesSafePath();
await testPublisherRejectsUnsafeZouguoPathBeforeGitHub();
await testLegacyLaodaoCanCreateUpdateReadAndDelete();
await testLaodaoZouguoLinkRequiresPlaceAndCanBeRemoved();
await testAggregatedSourcesCanUpdateMetadataAndDetachSafely();
console.log('worker contract tests: ok');
