import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import activitySyncWorker, {
  activitySyncContract,
  applySyncPayload,
  validateStoredActivityStore,
  validateSyncPayload
} from '../workers/activity-sync/src/index.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const origin = 'https://koobai.com';
const env = {
  ALLOWED_ORIGINS: origin,
  SYNC_TOKEN: 'local-sync-token',
  GH_TOKEN: 'local-github-token',
  GITHUB_OWNER: 'koobai',
  GITHUB_REPO: 'blog',
  GITHUB_BRANCH: 'main',
  GITHUB_ACTIVITY_PATH: 'data/exercise/activities.json'
};
const githubUrl = 'https://api.github.com/repos/koobai/blog/contents/data/exercise/activities.json';

function activity(externalId, overrides = {}) {
  return {
    external_id: externalId,
    name: '晚间行走',
    type: 'Walk',
    started_at: '2026-08-15T20:00:00+08:00',
    duration_seconds: 1800,
    distance_km: 2.5,
    is_indoor: false,
    route_status: 'privacy_hidden',
    ...overrides
  };
}

function payload(overrides = {}) {
  return {
    schema_version: 1,
    source: 'apple_health',
    producer: 'laodao_app',
    mode: 'delta',
    request_id: 'request-001',
    upsert: [activity('activity-1')],
    ...overrides
  };
}

function store(sources = {}) {
  return { schema_version: 1, sources };
}

function githubFile(value, sha = 'file-sha') {
  return new Response(JSON.stringify({
    sha,
    encoding: 'base64',
    content: Buffer.from(JSON.stringify(value, null, 2)).toString('base64')
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function githubWrite(sha = 'commit-sha') {
  return new Response(JSON.stringify({
    content: { html_url: 'https://github.com/koobai/blog/blob/main/data/exercise/activities.json' },
    commit: { sha, html_url: `https://github.com/koobai/blog/commit/${sha}` }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function syncRequest(body, overrides = {}) {
  const headers = {
    Origin: origin,
    Authorization: `Bearer ${env.SYNC_TOKEN}`,
    'Content-Type': 'application/json',
    ...(overrides.headers || {})
  };
  return new Request(overrides.url || 'https://activity.example.org/v1/activities/sync', {
    method: overrides.method || 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function responseJson(response) {
  const body = await response.json();
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  return body;
}

function decodePutBody(options) {
  const body = JSON.parse(options.body);
  return {
    request: body,
    store: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'))
  };
}

async function withMockFetch(mock, callback) {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  globalThis.fetch = mock;
  console.error = () => {};
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
}

async function testContractMatchesSchemasAndExerciseRegistry() {
  const schema = JSON.parse(await readFile(
    new URL('../schemas/data/exercise-sync-v1.schema.json', import.meta.url), 'utf8'
  ));
  const exercise = JSON.parse(await readFile(
    new URL('../data/jingzhe/exercise.json', import.meta.url), 'utf8'
  ));
  assert.deepEqual(
    new Set(activitySyncContract.payloadFields),
    new Set(Object.keys(schema.properties))
  );
  assert.deepEqual(
    new Set(activitySyncContract.activityFields),
    new Set(Object.keys(schema.$defs.activity.properties))
  );
  assert.deepEqual(
    new Set(activitySyncContract.requiredActivityFields),
    new Set(schema.$defs.activity.required)
  );
  assert.deepEqual(new Set(activitySyncContract.supportedTypes), new Set(Object.keys(exercise.sports)));
  assert.equal(activitySyncContract.maxBatchItems, schema.properties.upsert.maxItems);
  assert.equal(activitySyncContract.commitMarker, 'Auto-sync activity facts');
}

async function testAuthenticationOriginAndPrivacyRejectBeforeGitHub() {
  let fetchCalls = 0;
  await withMockFetch(async () => {
    fetchCalls += 1;
    throw new Error('GitHub must not be reached');
  }, async () => {
    const unauthorized = await activitySyncWorker.fetch(syncRequest(payload(), {
      headers: { Authorization: 'Bearer wrong-token' }
    }), env);
    assert.equal(unauthorized.status, 401);
    assert.equal((await responseJson(unauthorized)).error.code, 'unauthorized');

    const foreign = await activitySyncWorker.fetch(new Request(
      'https://activity.example.org/v1/activities/sync',
      {
        method: 'POST',
        headers: {
          Origin: 'https://attacker.example',
          Authorization: `Bearer ${env.SYNC_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload())
      }
    ), env);
    assert.equal(foreign.status, 403);

    const privateTrack = payload({
      upsert: [activity('private-track', { summary_polyline: 'must-not-enter-git' })]
    });
    assert.ok(validateSyncPayload(privateTrack).some(error => error.includes('不得包含')));
    const rejected = await activitySyncWorker.fetch(syncRequest(privateTrack), env);
    assert.equal(rejected.status, 400);
    const rejectedBody = await responseJson(rejected);
    assert.equal(rejectedBody.error.code, 'invalid_payload');
    assert.equal(fetchCalls, 0);
  });
}

async function testSnapshotCreatesCanonicalStore() {
  const requests = [];
  await withMockFetch(async (target, options = {}) => {
    requests.push({ target: String(target), options });
    if (!options.method) return new Response('', { status: 404 });
    return githubWrite();
  }, async () => {
    const snapshot = payload({
      mode: 'snapshot',
      upsert: [
        activity('older', { started_at: '2026-08-14T20:00:00+08:00' }),
        activity('newer')
      ]
    });
    delete snapshot.delete;
    const response = await activitySyncWorker.fetch(syncRequest(snapshot), env);
    assert.equal(response.status, 200);
    const body = await responseJson(response);
    assert.equal(body.changed, true);
    assert.deepEqual(body.counts, { created: 2, updated: 0, deleted: 0, total: 2 });
    assert.equal(body.commit.sha, 'commit-sha');

    assert.equal(requests.length, 2);
    assert.equal(requests[0].target, `${githubUrl}?ref=main`);
    assert.equal(requests[0].options.headers.Authorization, 'Bearer local-github-token');
    assert.equal(requests[1].target, githubUrl);
    assert.equal(requests[1].options.method, 'PUT');
    const written = decodePutBody(requests[1].options);
    assert.equal(written.request.message, 'Auto-sync activity facts: apple_health');
    assert.deepEqual(Object.keys(written.store), ['schema_version', 'sources']);
    assert.deepEqual(
      written.store.sources.apple_health.map(item => item.external_id),
      ['newer', 'older']
    );
    assert.equal(JSON.stringify(written.store).includes('producer'), false);
    assert.equal(JSON.stringify(written.store).includes('request-001'), false);
  });
}

async function testDeltaMergesAndNoChangeSkipsCommit() {
  const existing = store({
    apple_health: [
      activity('unchanged'),
      activity('update-me', { distance_km: 1 }),
      activity('delete-me')
    ],
    keep: [activity('keep-record')]
  });
  let writtenStore;
  await withMockFetch(async (_target, options = {}) => {
    if (!options.method) return githubFile(existing);
    writtenStore = decodePutBody(options).store;
    return githubWrite('delta-commit');
  }, async () => {
    const delta = payload({
      upsert: [
        activity('update-me', { distance_km: 3 }),
        activity('created')
      ],
      delete: ['delete-me']
    });
    const response = await activitySyncWorker.fetch(syncRequest(delta), env);
    const body = await responseJson(response);
    assert.deepEqual(body.counts, { created: 1, updated: 1, deleted: 1, total: 3 });
    assert.equal(body.commit.sha, 'delta-commit');
    assert.deepEqual(writtenStore.sources.keep, existing.sources.keep);
    assert.deepEqual(
      new Set(writtenStore.sources.apple_health.map(item => item.external_id)),
      new Set(['unchanged', 'update-me', 'created'])
    );
  });

  let fetchCalls = 0;
  await withMockFetch(async (_target, options = {}) => {
    fetchCalls += 1;
    assert.equal(options.method, undefined, 'no-change request must not PUT');
    return githubFile(store({ apple_health: [activity('activity-1')] }));
  }, async () => {
    const response = await activitySyncWorker.fetch(syncRequest(payload()), env);
    const body = await responseJson(response);
    assert.equal(body.changed, false);
    assert.equal(body.commit, null);
    assert.equal(fetchCalls, 1);
  });
}

async function testShaConflictReloadsAndPreservesConcurrentData() {
  const first = store({ apple_health: [activity('old')] });
  const concurrent = store({
    apple_health: [activity('old'), activity('concurrent')],
    keep: [activity('keep-concurrent')]
  });
  const calls = [];
  let finalStore;
  await withMockFetch(async (_target, options = {}) => {
    calls.push(options.method || 'GET');
    if (calls.length === 1) return githubFile(first, 'sha-1');
    if (calls.length === 2) return new Response('{}', { status: 409 });
    if (calls.length === 3) return githubFile(concurrent, 'sha-2');
    finalStore = decodePutBody(options).store;
    assert.equal(decodePutBody(options).request.sha, 'sha-2');
    return githubWrite('retried-commit');
  }, async () => {
    const response = await activitySyncWorker.fetch(syncRequest(payload({
      upsert: [activity('incoming')]
    })), env);
    const body = await responseJson(response);
    assert.equal(body.commit.sha, 'retried-commit');
    assert.deepEqual(calls, ['GET', 'PUT', 'GET', 'PUT']);
    assert.deepEqual(new Set(finalStore.sources.apple_health.map(item => item.external_id)),
      new Set(['old', 'concurrent', 'incoming']));
    assert.equal(finalStore.sources.keep[0].external_id, 'keep-concurrent');
  });
}

function testMultipleDevicesAndPlatformsMergeWithoutReplacingSharedFacts() {
  const phoneA = activity('iphone-a-workout', {
    started_at: '2026-08-15T20:00:00+08:00'
  });
  const phoneB = activity('iphone-b-workout', {
    started_at: '2026-08-17T20:00:00+08:00'
  });
  const initial = store({ apple_health: [phoneA] });

  // 新手机当前只看得到自己的记录，也必须使用 delta；没看到 phone A 不能解释为删除。
  const secondPhone = applySyncPayload(initial, payload({
    producer: 'laodao_app_second_phone',
    mode: 'delta',
    upsert: [phoneB]
  }));
  assert.equal(secondPhone.changed, true);
  assert.deepEqual(
    new Set(secondPhone.store.sources.apple_health.map(item => item.external_id)),
    new Set(['iphone-a-workout', 'iphone-b-workout'])
  );

  // iCloud 稍后把同一对象带到另一台手机；相同 UUID 重复 upsert 不产生新提交。
  const repeated = applySyncPayload(secondPhone.store, payload({
    producer: 'laodao_app_second_phone',
    mode: 'delta',
    upsert: [phoneA]
  }));
  assert.equal(repeated.changed, false);

  // Android/Health Connect 使用独立 source，自然与 Apple Health 并存。
  const android = applySyncPayload(secondPhone.store, payload({
    source: 'health_connect',
    producer: 'laodao_android',
    mode: 'delta',
    upsert: [activity('android-workout')]
  }));
  assert.equal(android.store.sources.apple_health.length, 2);
  assert.equal(android.store.sources.health_connect.length, 1);
}

async function testInvalidStorageAndGitHubFailuresNeverOverwrite() {
  let putCalls = 0;
  await withMockFetch(async (_target, options = {}) => {
    if (options.method === 'PUT') putCalls += 1;
    return githubFile({ schema_version: 1, sources: { apple_health: [] } });
  }, async () => {
    const response = await activitySyncWorker.fetch(syncRequest(payload()), env);
    assert.equal(response.status, 502);
    assert.equal((await responseJson(response)).error.code, 'storage_invalid');
    assert.equal(putCalls, 0);
  });

  await withMockFetch(async () => new Response('{}', { status: 500 }), async () => {
    const response = await activitySyncWorker.fetch(syncRequest(payload()), env);
    assert.equal(response.status, 502);
    assert.equal((await responseJson(response)).error.code, 'github_read_failed');
  });
}

async function testSnapshotCanClearOnlyOneSource() {
  const current = store({
    apple_health: [activity('apple')],
    keep: [activity('keep')]
  });
  const snapshot = payload({ mode: 'snapshot', upsert: [] });
  const result = applySyncPayload(current, snapshot);
  assert.equal(result.changed, true);
  assert.deepEqual(result.counts, { created: 0, updated: 0, deleted: 1, total: 0 });
  assert.deepEqual(Object.keys(result.store.sources), ['keep']);
  assert.equal(result.store.sources.keep[0].external_id, 'keep');
  assert.deepEqual(validateStoredActivityStore(result.store), []);
}

await testContractMatchesSchemasAndExerciseRegistry();
await testAuthenticationOriginAndPrivacyRejectBeforeGitHub();
await testSnapshotCreatesCanonicalStore();
await testDeltaMergesAndNoChangeSkipsCommit();
await testShaConflictReloadsAndPreservesConcurrentData();
testMultipleDevicesAndPlatformsMergeWithoutReplacingSharedFacts();
await testInvalidStorageAndGitHubFailuresNeverOverwrite();
await testSnapshotCanClearOnlyOneSource();
console.log('activity sync worker tests: ok');
