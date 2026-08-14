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
    date: '2026-08-14 12:00:00',
    content: '未发布内容',
    images: [],
    locationName: '杭州',
    lat: 30.2,
    lng: 120.1,
    url: ''
  });
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

await testCommentsHideEmail();
await testCommentsRejectForeignOrigin();
await testDraftAuthenticationAndShape();
await testLikesReadContract();
await testPublisherRepositoryBoundary();
console.log('worker contract tests: ok');
