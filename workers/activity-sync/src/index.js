const API_PATH = '/v1/activities/sync';
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_ITEMS = 500;
const MAX_SOURCE_ITEMS = 100000;
const MAX_GITHUB_ATTEMPTS = 3;
const COMMIT_MARKER = 'Auto-sync activity facts';
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TIMEZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;

const PAYLOAD_FIELDS = new Set([
  'schema_version', 'source', 'producer', 'mode', 'request_id', 'upsert', 'delete'
]);
const ACTIVITY_FIELD_ORDER = [
  'external_id',
  'name',
  'type',
  'started_at',
  'duration_seconds',
  'distance_km',
  'is_indoor',
  'route_status',
  'average_heartrate_bpm',
  'elevation_gain_m',
  'calories_kcal',
  'summary_polyline'
];
const ACTIVITY_FIELDS = new Set(ACTIVITY_FIELD_ORDER);
const REQUIRED_ACTIVITY_FIELDS = new Set([
  'external_id',
  'type',
  'started_at',
  'duration_seconds',
  'distance_km',
  'is_indoor',
  'route_status'
]);
const SUPPORTED_TYPES = new Set([
  'Run',
  'TrailRun',
  'Treadmill',
  'VirtualRun',
  'Ride',
  'VirtualRide',
  'EBikeRide',
  'Walk',
  'Hike',
  'Swim',
  'WaterSport',
  'StairStepper'
]);
const ROUTE_STATUSES = new Set(['available', 'privacy_hidden', 'unavailable', 'pending']);

class GatewayError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
    this.code = code;
  }
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins(env).includes(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function jsonResponse(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function errorResponse(status, code, message, headers, details) {
  const body = { error: { code, message } };
  if (details && details.length) body.error.details = details.slice(0, 50);
  return jsonResponse(body, status, headers);
}

async function secureEqual(left, right) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(left))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(right)))
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validTimestamp(value) {
  return typeof value === 'string'
    && TIMEZONE_PATTERN.test(value)
    && Number.isFinite(Date.parse(value));
}

function validateActivity(activity, prefix) {
  const errors = [];
  if (!isObject(activity)) return [`${prefix}必须是对象`];

  const unknown = Object.keys(activity).filter(field => !ACTIVITY_FIELDS.has(field)).sort();
  if (unknown.length) errors.push(`${prefix}包含未知字段：${unknown.join(', ')}`);
  const missing = [...REQUIRED_ACTIVITY_FIELDS].filter(field => !(field in activity)).sort();
  if (missing.length) errors.push(`${prefix}缺少：${missing.join(', ')}`);

  if (typeof activity.external_id !== 'string'
      || activity.external_id.length < 1
      || activity.external_id.length > 200) {
    errors.push(`${prefix} external_id 必须是 1-200 位字符串`);
  }
  if (activity.name !== undefined
      && (typeof activity.name !== 'string' || activity.name.length > 200)) {
    errors.push(`${prefix} name 最多 200 位`);
  }
  if (!SUPPORTED_TYPES.has(activity.type)) errors.push(`${prefix} type 不受支持`);
  if (!validTimestamp(activity.started_at)) {
    errors.push(`${prefix} started_at 必须是带时区的 RFC 3339 时间`);
  }
  if (!Number.isInteger(activity.duration_seconds)
      || activity.duration_seconds < 1
      || activity.duration_seconds > 604800) {
    errors.push(`${prefix} duration_seconds 必须是 1-604800 的整数`);
  }
  if (!isFiniteNumber(activity.distance_km) || activity.distance_km < 0) {
    errors.push(`${prefix} distance_km 数值无效`);
  }
  for (const field of ['elevation_gain_m', 'calories_kcal']) {
    if (activity[field] !== undefined
        && (!isFiniteNumber(activity[field]) || activity[field] < 0)) {
      errors.push(`${prefix} ${field} 数值无效`);
    }
  }
  if (activity.average_heartrate_bpm !== undefined
      && (!isFiniteNumber(activity.average_heartrate_bpm)
        || activity.average_heartrate_bpm < 0
        || activity.average_heartrate_bpm > 300)) {
    errors.push(`${prefix} average_heartrate_bpm 数值无效`);
  }
  if (typeof activity.is_indoor !== 'boolean') errors.push(`${prefix} is_indoor 必须是布尔值`);
  if (!ROUTE_STATUSES.has(activity.route_status)) errors.push(`${prefix} route_status 无效`);

  const polyline = activity.summary_polyline;
  if (polyline !== undefined && (typeof polyline !== 'string' || polyline.length > 500000)) {
    errors.push(`${prefix} summary_polyline 无效`);
  }
  if (activity.route_status === 'available' && !polyline) {
    errors.push(`${prefix} available 必须包含 summary_polyline`);
  }
  if (activity.route_status !== 'available' && polyline) {
    errors.push(`${prefix} 非公开轨迹状态不得包含 summary_polyline`);
  }
  if (activity.is_indoor === true
      && !['unavailable', 'pending'].includes(activity.route_status)) {
    errors.push(`${prefix} 室内运动的 route_status 必须是 unavailable 或 pending`);
  }
  return errors;
}

export function validateSyncPayload(payload) {
  if (!isObject(payload)) return ['请求根节点必须是对象'];
  const errors = [];
  const unknown = Object.keys(payload).filter(field => !PAYLOAD_FIELDS.has(field)).sort();
  if (unknown.length) errors.push(`请求包含未知字段：${unknown.join(', ')}`);
  if (payload.schema_version !== 1) errors.push('schema_version 必须为 1');
  if (typeof payload.source !== 'string' || !SOURCE_PATTERN.test(payload.source)) {
    errors.push('source 必须是 1-64 位小写字母、数字、点、下划线或连字符');
  }
  if (payload.producer !== undefined
      && (typeof payload.producer !== 'string' || !SOURCE_PATTERN.test(payload.producer))) {
    errors.push('producer 必须是 1-64 位小写字母、数字、点、下划线或连字符');
  }
  if (!['snapshot', 'delta'].includes(payload.mode)) errors.push('mode 必须是 snapshot 或 delta');
  if (payload.request_id !== undefined
      && (typeof payload.request_id !== 'string'
        || payload.request_id.length < 1
        || payload.request_id.length > 128)) {
    errors.push('request_id 必须是 1-128 位字符串');
  }

  let upsert = payload.upsert === undefined ? [] : payload.upsert;
  let deleted = payload.delete === undefined ? [] : payload.delete;
  if (!Array.isArray(upsert)) {
    errors.push('upsert 必须是数组');
    upsert = [];
  }
  if (!Array.isArray(deleted)) {
    errors.push('delete 必须是数组');
    deleted = [];
  }
  if (payload.mode === 'snapshot' && !Object.hasOwn(payload, 'upsert')) {
    errors.push('snapshot 必须显式提供完整 upsert 数组');
  }
  if (payload.mode === 'snapshot' && Object.hasOwn(payload, 'delete')) {
    errors.push('snapshot 不接受 delete；未出现在 upsert 的同来源记录会被删除');
  }
  if (payload.mode === 'delta' && !upsert.length && !deleted.length) {
    errors.push('upsert 和 delete 至少有一项非空');
  }
  if (upsert.length > MAX_BATCH_ITEMS) errors.push(`upsert 单次最多 ${MAX_BATCH_ITEMS} 项`);
  if (deleted.length > MAX_BATCH_ITEMS) errors.push(`delete 单次最多 ${MAX_BATCH_ITEMS} 项`);

  const upsertIds = [];
  upsert.forEach((activity, index) => {
    errors.push(...validateActivity(activity, `upsert 第 ${index} 项`));
    if (isObject(activity) && typeof activity.external_id === 'string') {
      upsertIds.push(activity.external_id);
    }
  });
  const deleteIds = [];
  deleted.forEach((externalId, index) => {
    if (typeof externalId !== 'string' || externalId.length < 1 || externalId.length > 200) {
      errors.push(`delete 第 ${index} 项必须是 1-200 位字符串`);
    } else {
      deleteIds.push(externalId);
    }
  });

  const duplicateUpserts = duplicateValues(upsertIds);
  if (duplicateUpserts.length) {
    errors.push(`upsert 包含重复 external_id：${duplicateUpserts.join(', ')}`);
  }
  const duplicateDeletes = duplicateValues(deleteIds);
  if (duplicateDeletes.length) {
    errors.push(`delete 包含重复 external_id：${duplicateDeletes.join(', ')}`);
  }
  const deleteSet = new Set(deleteIds);
  const conflicts = [...new Set(upsertIds.filter(value => deleteSet.has(value)))].sort();
  if (conflicts.length) {
    errors.push(`同一 external_id 不能同时 upsert 和 delete：${conflicts.join(', ')}`);
  }
  return errors;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function canonicalActivity(activity) {
  const result = {};
  for (const field of ACTIVITY_FIELD_ORDER) {
    if (Object.hasOwn(activity, field)) result[field] = activity[field];
  }
  return result;
}

function compareActivities(left, right) {
  if (left.started_at !== right.started_at) return left.started_at < right.started_at ? 1 : -1;
  if (left.external_id === right.external_id) return 0;
  return left.external_id < right.external_id ? 1 : -1;
}

function canonicalSource(activities) {
  return activities.map(canonicalActivity).sort(compareActivities);
}

export function validateStoredActivityStore(store) {
  if (!isObject(store)) return ['原始运动事实根节点必须是对象'];
  const errors = [];
  const unknown = Object.keys(store).filter(field => !['schema_version', 'sources'].includes(field));
  if (unknown.length) errors.push(`原始运动事实包含未知字段：${unknown.sort().join(', ')}`);
  if (store.schema_version !== 1) errors.push('原始运动事实 schema_version 必须为 1');
  if (!isObject(store.sources)) {
    errors.push('原始运动事实 sources 必须是对象');
    return errors;
  }
  for (const source of Object.keys(store.sources).sort()) {
    const activities = store.sources[source];
    if (!SOURCE_PATTERN.test(source)) {
      errors.push(`原始运动来源名称无效：${source}`);
      continue;
    }
    if (!Array.isArray(activities)) {
      errors.push(`来源 ${source} 的活动必须是数组`);
      continue;
    }
    if (!activities.length) errors.push(`来源 ${source} 不应保留空数组`);
    if (activities.length > MAX_SOURCE_ITEMS) {
      errors.push(`来源 ${source} 最多保存 ${MAX_SOURCE_ITEMS} 条活动`);
      continue;
    }
    const ids = [];
    activities.forEach((activity, index) => {
      errors.push(...validateActivity(activity, `${source} 第 ${index} 项`));
      if (isObject(activity) && typeof activity.external_id === 'string') ids.push(activity.external_id);
    });
    const duplicates = duplicateValues(ids);
    if (duplicates.length) {
      errors.push(`${source}：原始事实包含重复 external_id：${duplicates.join(', ')}`);
    }
  }
  return errors;
}

function canonicalStore(store) {
  const sources = {};
  for (const source of Object.keys(store.sources).sort()) {
    sources[source] = canonicalSource(store.sources[source]);
  }
  return { schema_version: 1, sources };
}

function sameActivity(left, right) {
  return JSON.stringify(canonicalActivity(left)) === JSON.stringify(canonicalActivity(right));
}

export function applySyncPayload(store, payload) {
  const storeErrors = validateStoredActivityStore(store);
  if (storeErrors.length) throw new GatewayError(502, 'storage_invalid', '仓库中的运动原始数据无效');
  const payloadErrors = validateSyncPayload(payload);
  if (payloadErrors.length) throw new GatewayError(400, 'invalid_payload', '同步数据不符合 v1 协议');

  const current = store.sources[payload.source] || [];
  const currentById = new Map(current.map(activity => [activity.external_id, activity]));
  const nextById = payload.mode === 'snapshot' ? new Map() : new Map(currentById);
  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (const activity of payload.upsert || []) {
    const existing = currentById.get(activity.external_id);
    if (!existing) created += 1;
    else if (!sameActivity(existing, activity)) updated += 1;
    nextById.set(activity.external_id, canonicalActivity(activity));
  }
  if (payload.mode === 'snapshot') {
    for (const externalId of currentById.keys()) {
      if (!nextById.has(externalId)) deleted += 1;
    }
  } else {
    for (const externalId of payload.delete || []) {
      if (nextById.delete(externalId)) deleted += 1;
    }
  }
  if (nextById.size > MAX_SOURCE_ITEMS) {
    throw new GatewayError(
      400,
      'source_limit_exceeded',
      `单个来源最多保存 ${MAX_SOURCE_ITEMS} 条活动`
    );
  }

  const nextStore = canonicalStore(store);
  if (nextById.size) nextStore.sources[payload.source] = canonicalSource([...nextById.values()]);
  else delete nextStore.sources[payload.source];
  const normalizedStore = canonicalStore(nextStore);
  const changed = JSON.stringify(canonicalStore(store)) !== JSON.stringify(normalizedStore);
  return {
    store: normalizedStore,
    changed,
    counts: { created, updated, deleted, total: nextById.size }
  };
}

function renderStore(store) {
  return `${JSON.stringify(canonicalStore(store), null, 2)}\n`;
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value).replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  }
  return btoa(chunks.join(''));
}

function githubConfig(env) {
  const owner = String(env.GITHUB_OWNER || '').trim();
  const repo = String(env.GITHUB_REPO || '').trim();
  const branch = String(env.GITHUB_BRANCH || 'main').trim();
  const path = String(env.GITHUB_ACTIVITY_PATH || 'data/exercise/activities.json').trim();
  if (!owner || !repo || !branch || !path
      || path.startsWith('/')
      || path.includes('..')
      || path.length > 300
      || !/^[A-Za-z0-9._/-]+$/.test(path)) {
    throw new GatewayError(500, 'configuration_error', 'Gateway 配置不完整');
  }
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return {
    branch,
    path,
    url: `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`
  };
}

function githubHeaders(env) {
  return {
    'Authorization': `Bearer ${env.GH_TOKEN}`,
    'User-Agent': env.GITHUB_USER_AGENT || 'Jingzhe-Activity-Sync-Worker',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

async function readStoreFromGitHub(env, config) {
  let response;
  try {
    response = await fetch(`${config.url}?ref=${encodeURIComponent(config.branch)}`, {
      headers: githubHeaders(env)
    });
  } catch (_error) {
    throw new GatewayError(502, 'github_unavailable', 'GitHub 暂时不可用');
  }
  if (response.status === 404) {
    return { sha: null, store: { schema_version: 1, sources: {} } };
  }
  if (!response.ok) throw new GatewayError(502, 'github_read_failed', '读取 GitHub 数据失败');

  let document;
  let store;
  try {
    document = await response.json();
    if (document.encoding !== 'base64' || typeof document.content !== 'string') throw new Error('encoding');
    store = JSON.parse(decodeBase64Utf8(document.content));
  } catch (_error) {
    throw new GatewayError(502, 'storage_invalid', '仓库中的运动原始数据无法解析');
  }
  const errors = validateStoredActivityStore(store);
  if (errors.length) throw new GatewayError(502, 'storage_invalid', '仓库中的运动原始数据无效');
  return { sha: document.sha, store };
}

async function writeStoreToGitHub(env, config, sha, store, source) {
  const body = {
    message: `${COMMIT_MARKER}: ${source}`,
    content: encodeBase64Utf8(renderStore(store)),
    branch: config.branch
  };
  if (sha) body.sha = sha;

  let response;
  try {
    response = await fetch(config.url, {
      method: 'PUT',
      headers: githubHeaders(env),
      body: JSON.stringify(body)
    });
  } catch (_error) {
    throw new GatewayError(502, 'github_unavailable', 'GitHub 暂时不可用');
  }
  if (response.status === 409) return { conflict: true };
  if (!response.ok) throw new GatewayError(502, 'github_write_failed', '写入 GitHub 数据失败');
  try {
    const document = await response.json();
    return {
      conflict: false,
      commit: {
        sha: document.commit?.sha || null,
        url: document.commit?.html_url || document.content?.html_url || null
      }
    };
  } catch (_error) {
    return { conflict: false, commit: { sha: null, url: null } };
  }
}

async function synchronize(env, payload) {
  const config = githubConfig(env);
  for (let attempt = 1; attempt <= MAX_GITHUB_ATTEMPTS; attempt += 1) {
    const current = await readStoreFromGitHub(env, config);
    const result = applySyncPayload(current.store, payload);
    if (!result.changed) return { ...result, commit: null };
    const write = await writeStoreToGitHub(
      env, config, current.sha, result.store, payload.source
    );
    if (!write.conflict) return { ...result, commit: write.commit };
  }
  throw new GatewayError(409, 'concurrent_update', '数据正在被其他同步更新，请稍后重试');
}

function configured(env) {
  return Boolean(env.SYNC_TOKEN && env.GH_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO);
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new GatewayError(413, 'payload_too_large', '请求体过大');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new GatewayError(413, 'payload_too_large', '请求体过大');
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new GatewayError(400, 'invalid_json', '请求体必须是有效 JSON');
  }
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (!originAllowed(request, env)) {
      return errorResponse(403, 'forbidden_origin', '不允许此浏览器来源', headers);
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    if (url.pathname !== API_PATH || request.method !== 'POST') {
      return errorResponse(404, 'not_found', '未找到接口', headers);
    }
    if (!configured(env)) {
      console.error('Activity Sync Worker is missing required configuration.');
      return errorResponse(500, 'configuration_error', 'Gateway 配置不完整', headers);
    }

    const authorization = request.headers.get('Authorization') || '';
    const expected = `Bearer ${env.SYNC_TOKEN}`;
    if (!await secureEqual(authorization, expected)) {
      return errorResponse(401, 'unauthorized', '同步凭据无效', headers);
    }

    let payload;
    try {
      payload = await readJsonBody(request);
      const errors = validateSyncPayload(payload);
      if (errors.length) {
        return errorResponse(400, 'invalid_payload', '同步数据不符合 v1 协议', headers, errors);
      }
      const result = await synchronize(env, payload);
      return jsonResponse({
        success: true,
        changed: result.changed,
        schema_version: 1,
        source: payload.source,
        mode: payload.mode,
        request_id: payload.request_id || null,
        counts: result.counts,
        commit: result.commit
      }, 200, headers);
    } catch (error) {
      if (error instanceof GatewayError) {
        console.error(`Activity Sync failed: ${error.code}`);
        return errorResponse(error.status, error.code, error.message, headers);
      }
      console.error('Activity Sync failed unexpectedly.');
      return errorResponse(500, 'internal_error', '同步处理失败', headers);
    }
  }
};

export const activitySyncContract = Object.freeze({
  apiPath: API_PATH,
  payloadFields: [...PAYLOAD_FIELDS],
  activityFields: [...ACTIVITY_FIELDS],
  requiredActivityFields: [...REQUIRED_ACTIVITY_FIELDS],
  supportedTypes: [...SUPPORTED_TYPES],
  routeStatuses: [...ROUTE_STATUSES],
  maxBatchItems: MAX_BATCH_ITEMS,
  commitMarker: COMMIT_MARKER
});
