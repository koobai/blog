const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { submitLike, applyOptimisticLike, applyLikeResult } = require('../themes/jingzhe_v3/assets/js/pages/likes-core.js');

async function run() {
  let request;
  const created = await submitLike({
    url: '/laodao/hello/',
    token: 'turnstile-token',
    submitUrl: 'https://likes.example.org/api/likes/submit',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    }
  });
  assert.deepEqual(created, { state: 'created', status: 200 });
  assert.equal(request.url, 'https://likes.example.org/api/likes/submit');
  assert.equal(request.options.keepalive, true);
  assert.equal(request.options.headers['CF-Turnstile-Response'], 'turnstile-token');
  assert.deepEqual(JSON.parse(request.options.body), { url: '/laodao/hello/' });

  const existing = await submitLike({
    url: '/laodao/hello/',
    token: 'turnstile-token',
    submitUrl: 'https://likes.example.org/api/likes/submit',
    fetchImpl: async () => ({ ok: false, status: 409 })
  });
  assert.deepEqual(existing, { state: 'existing', status: 409 });

  const rejected = await submitLike({
    url: '/laodao/hello/',
    token: 'turnstile-token',
    submitUrl: 'https://likes.example.org/api/likes/submit',
    fetchImpl: async () => ({ ok: false, status: 500 })
  });
  assert.deepEqual(rejected, { state: 'failed', reason: 'server', status: 500 });

  const missingToken = await submitLike({
    url: '/laodao/hello/',
    token: '',
    submitUrl: 'https://likes.example.org/api/likes/submit',
    fetchImpl: async () => { throw new Error('must not fetch'); }
  });
  assert.deepEqual(missingToken, { state: 'failed', reason: 'verification' });

  const networkFailure = await submitLike({
    url: '/laodao/hello/',
    token: 'turnstile-token',
    submitUrl: 'https://likes.example.org/api/likes/submit',
    fetchImpl: async () => { throw new Error('offline'); }
  });
  assert.deepEqual(networkFailure, { state: 'failed', reason: 'network' });

  assert.deepEqual(
    applyOptimisticLike(3),
    { liked: true, count: 4, persist: true, incremented: true }
  );
  assert.deepEqual(
    applyLikeResult(3, { state: 'created' }),
    { liked: true, count: 4, persist: true, incremented: true }
  );
  assert.deepEqual(
    applyLikeResult(3, { state: 'existing' }),
    { liked: true, count: 3, persist: true, incremented: false }
  );
  assert.deepEqual(
    applyLikeResult(3, { state: 'failed' }),
    { liked: false, count: 3, persist: false, incremented: false }
  );

  const frontend = fs.readFileSync(path.join(__dirname, '../themes/jingzhe_v3/assets/js/pages/laodao.js'), 'utf8');
  assert.equal(frontend.includes('正在悄悄记下'), false);
  assert.ok(
    frontend.indexOf('applyOptimisticLike(previousCount)') < frontend.indexOf('await getLikeVerificationToken()'),
    'optimistic feedback must happen before Turnstile and network work'
  );
  assert.ok(
    frontend.includes('await window.JingzheTurnstile.ensureReady()'),
    'likes must reuse the shared lazy Turnstile loader'
  );

  console.log('likes-core contracts: ok');
}

run();
