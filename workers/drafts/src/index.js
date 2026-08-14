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

function validDraft(value) {
  if (!value || value.id === undefined || typeof value.content !== 'string') return false;
  const id = String(value.id);
  return id.length > 0 && id.length <= 100 && value.content.length <= 200000;
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
          'SELECT id, content, location_name, lat, lng, created_at FROM laodao_drafts ORDER BY created_at DESC'
        ).all();
        const drafts = results.map(row => ({
          id: row.id,
          date: row.created_at,
          content: row.content,
          images: [],
          locationName: row.location_name || '',
          lat: row.lat || 0,
          lng: row.lng || 0,
          url: ''
        }));
        return json(drafts, 200, headers);
      }

      if (request.method === 'POST') {
        const body = await request.json();
        if (!validDraft(body)) return json({ error: '草稿字段无效' }, 400, headers);
        await env.DB.prepare(`
          INSERT OR REPLACE INTO laodao_drafts (id, content, location_name, lat, lng, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now', '+8 hours'))
        `).bind(
          String(body.id),
          body.content,
          String(body.location_name || '').slice(0, 100),
          Number(body.lat || 0),
          Number(body.lng || 0)
        ).run();
        return json({ success: true }, 200, headers);
      }

      if (request.method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id || id.length > 100) return json({ error: '缺少草稿 ID' }, 400, headers);
        await env.DB.prepare('DELETE FROM laodao_drafts WHERE id = ?').bind(id).run();
        return json({ success: true }, 200, headers);
      }
    } catch (error) {
      console.error('Draft operation failed:', error);
      return json({ error: '草稿服务暂时不可用' }, 500, headers);
    }

    return json({ error: 'Method Not Allowed' }, 405, headers);
  }
};
