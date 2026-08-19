const MAX_DRAFT_BYTES = 200000;
const DRAFT_KINDS = new Set(['laodao', 'zouguo']);

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : (allowed[0] || 'null'),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Vary': 'Origin'
  };
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function validTimestamp(value) {
  return typeof value === 'string'
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function legacyPayload(value) {
  return {
    content: String(value.content || ''),
    images: Array.isArray(value.images) ? value.images : [],
    locationName: String(value.locationName || value.location_name || ''),
    lat: Number(value.lat || 0),
    lng: Number(value.lng || 0),
    url: String(value.url || '')
  };
}

function parsePayload(row) {
  try {
    const parsed = JSON.parse(row.payload_json || '{}');
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) return parsed;
  } catch (_error) {
    // A migrated legacy row still has enough scalar columns to recover safely.
  }
  return legacyPayload(row);
}

function validImages(images) {
  return Array.isArray(images)
    && images.length <= 20
    && images.every(value => typeof value === 'string' && /^https?:\/\//.test(value) && value.length <= 1000);
}

function normalizeDraft(value) {
  if (!value || value.id === undefined) throw new Error('缺少草稿 ID');
  const id = String(value.id);
  const kind = String(value.kind || 'laodao');
  if (!id || id.length > 100) throw new Error('草稿 ID 无效');
  if (!DRAFT_KINDS.has(kind)) throw new Error('草稿 kind 无效');

  const payload = value.payload && typeof value.payload === 'object'
    ? structuredClone(value.payload)
    : legacyPayload(value);
  if (typeof payload.content !== 'string') throw new Error('草稿 content 无效');
  if (!validImages(payload.images || [])) throw new Error('草稿 images 无效');

  if (kind === 'zouguo') {
    if (!validTimestamp(payload.occurredAt)) throw new Error('走过草稿 occurredAt 无效');
    const place = payload.place;
    if (!place || typeof place !== 'object'
      || !place.id || !place.name
      || !Number.isFinite(Number(place.longitude))
      || !Number.isFinite(Number(place.latitude))) {
      throw new Error('走过草稿 place 无效');
    }
  }

  const payloadJson = JSON.stringify(payload);
  if (payloadJson.length > MAX_DRAFT_BYTES) throw new Error('草稿过大');
  return { id, kind, payload, payloadJson };
}

function draftResponse(row) {
  const kind = DRAFT_KINDS.has(row.kind) ? row.kind : 'laodao';
  const payload = parsePayload(row);
  const legacy = legacyPayload(payload);
  return {
    id: row.id,
    kind,
    date: row.created_at,
    payload,
    ...legacy
  };
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    const origin = request.headers.get('Origin');
    if (origin && !allowedOrigins(env).includes(origin)) return json({ error: 'Forbidden origin' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { headers });

    if (!env.ADMIN_TOKEN || !env.DB) {
      console.error('Draft Worker is missing ADMIN_TOKEN or DB.');
      return json({ error: 'Worker configuration error' }, 500, headers);
    }
    if (request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
      return json({ error: '口令错误' }, 401, headers);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/drafts') return json({ error: 'Not Found' }, 404, headers);

    try {
      if (request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, kind, payload_json, content, location_name, lat, lng, created_at FROM laodao_drafts ORDER BY created_at DESC'
        ).all();
        return json(results.map(draftResponse), 200, headers);
      }

      if (request.method === 'POST') {
        const draft = normalizeDraft(await request.json());
        const legacy = legacyPayload(draft.payload);
        await env.DB.prepare(`
          INSERT OR REPLACE INTO laodao_drafts
            (id, kind, payload_json, content, location_name, lat, lng, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
        `).bind(
          draft.id,
          draft.kind,
          draft.payloadJson,
          legacy.content,
          legacy.locationName.slice(0, 100),
          legacy.lat,
          legacy.lng
        ).run();
        return json({ success: true, id: draft.id, kind: draft.kind }, 200, headers);
      }

      if (request.method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id || id.length > 100) return json({ error: '缺少草稿 ID' }, 400, headers);
        await env.DB.prepare('DELETE FROM laodao_drafts WHERE id = ?').bind(id).run();
        return json({ success: true }, 200, headers);
      }
    } catch (error) {
      const message = String(error?.message || error || '草稿服务暂时不可用');
      const clientError = /无效|缺少|过大/.test(message);
      if (!clientError) console.error('Draft operation failed:', error);
      return json({ error: clientError ? message : '草稿服务暂时不可用' }, clientError ? 400 : 500, headers);
    }

    return json({ error: 'Method Not Allowed' }, 405, headers);
  }
};
