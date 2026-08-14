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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, CF-Turnstile-Response',
    'Vary': 'Origin'
  };
}

function json(value, status, headers, cacheControl) {
  const responseHeaders = {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (cacheControl) responseHeaders['Cache-Control'] = cacheControl;
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

function validTargetPath(value) {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && value.length <= 2048
    && !value.includes('\0');
}

async function getVisitorHash(request, salt) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const userAgent = request.headers.get('User-Agent') || '';
  const language = request.headers.get('Accept-Language') || '';
  const input = new TextEncoder().encode(ip + userAgent + language + salt);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);
}

async function verifyTurnstile(token, secret, ip) {
  if (!token || !secret) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form
    });
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error('Turnstile verification failed:', error);
    return false;
  }
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    const origin = request.headers.get('Origin');
    if (origin && !allowedOrigins(env).includes(origin)) return json({ error: 'Forbidden origin' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (!env.DB) return json({ error: 'Worker configuration error' }, 500, headers);

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/likes') {
      try {
        const { results } = await env.DB.prepare(
          'SELECT url, total_count AS count FROM likes_count'
        ).all();
        const counts = {};
        results.forEach(row => { counts[row.url] = row.count; });
        return json(
          { counts, myLikes: [] },
          200,
          headers,
          'public, s-maxage=60, stale-while-revalidate=300'
        );
      } catch (error) {
        console.error('Likes query failed:', error);
        return json({ error: '点赞服务暂时不可用' }, 500, headers);
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/likes/submit') {
      if (!env.TURNSTILE_SECRET_KEY || !env.LIKE_SALT) {
        console.error('Likes Worker is missing TURNSTILE_SECRET_KEY or LIKE_SALT.');
        return json({ error: 'Worker configuration error' }, 500, headers);
      }
      try {
        const ip = request.headers.get('CF-Connecting-IP');
        const human = await verifyTurnstile(
          request.headers.get('CF-Turnstile-Response'),
          env.TURNSTILE_SECRET_KEY,
          ip
        );
        if (!human) return json({ error: '人机验证失败' }, 403, headers);

        const body = await request.json();
        if (!validTargetPath(body.url)) return json({ error: 'Missing or invalid url' }, 400, headers);
        const visitorHash = await getVisitorHash(request, env.LIKE_SALT);

        try {
          await env.DB.prepare('INSERT INTO likes (url, ip_hash) VALUES (?, ?)')
            .bind(body.url, visitorHash).run();
          await env.DB.prepare(`
            INSERT INTO likes_count (url, total_count) VALUES (?, 1)
            ON CONFLICT(url) DO UPDATE SET total_count = total_count + 1
          `).bind(body.url).run();
        } catch (_error) {
          return json({ error: 'Already liked' }, 409, headers);
        }

        if (env.BARK_URL) {
          try {
            await fetch(env.BARK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
              body: JSON.stringify({
                body: `👍 收到新的点赞\n\n${String(env.SITE_URL || '').replace(/\/$/, '')}${body.url}`
              })
            });
          } catch (error) {
            console.error('Bark notification failed:', error);
          }
        }
        return json({ success: true }, 200, headers);
      } catch (error) {
        console.error('Like submission failed:', error);
        return json({ error: '点赞服务暂时不可用' }, 500, headers);
      }
    }

    return json({ error: 'Not Found' }, 404, headers);
  }
};
