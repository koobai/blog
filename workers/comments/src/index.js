function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function adminEmails(env) {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : (allowed[0] || 'null'),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, CF-Turnstile-Response',
    'Vary': 'Origin'
  };
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function validTargetPath(value) {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && value.length <= 2048
    && !value.includes('\0');
}

async function sha256(value) {
  const input = new TextEncoder().encode(String(value || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function publicComment(row) {
  return {
    id: row.id,
    url: row.url,
    author: row.author,
    website: row.website,
    content: row.content,
    parent_id: row.parent_id,
    created_at: row.created_at,
    avatar_hash: await sha256(row.email)
  };
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

async function sendBark(env, targetUrl, author, content) {
  if (!env.BARK_URL) return;
  const siteUrl = String(env.SITE_URL || '').replace(/\/$/, '');
  const host = targetUrl.includes('/laodao/') ? 'laodao' : 'suibi';
  const payload = { body: `${author}: ${content}` };
  if (env.APP_SCHEME && siteUrl) {
    payload.url = `${String(env.APP_SCHEME).replace(/:\/\/$/, '')}://${host}?url=${encodeURIComponent(`${siteUrl}${targetUrl}`)}`;
  }
  try {
    await fetch(env.BARK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('Bark notification failed:', error);
  }
}

async function sendReplyEmail(env, reply) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM || !reply.email) return;
  const siteUrl = String(env.SITE_URL || '').replace(/\/$/, '');
  const siteName = env.SITE_NAME || 'Jingzhe Blog';
  const year = new Date().getFullYear();
  const html = `
    <div style="font-size:14px;color:#666;padding:20px;max-width:700px;margin:0 auto;font-family:sans-serif;line-height:1.6">
      <div style="margin-bottom:20px;font-size:16px;font-weight:bold;color:#222">你好, ${escapeHtml(reply.name)}</div>
      <div style="margin-bottom:10px">你曾在 <a href="${siteUrl}${reply.targetUrl}" target="_blank" style="color:#FC9151;text-decoration:none">${escapeHtml(siteName)}</a> 中评论到：</div>
      <div style="padding:15px;background:#f6f6f6;border-radius:12px;margin-bottom:25px">${escapeHtml(reply.originalContent)}</div>
      <div style="margin-bottom:10px"><strong style="color:#222">@ ${escapeHtml(reply.author)}</strong> 回复到：</div>
      <div style="padding:15px;background:#f6f6f6;border-radius:12px;margin-bottom:25px;color:#222">${escapeHtml(reply.content)}</div>
      <div><a href="${siteUrl}${reply.targetUrl}" target="_blank" style="color:#FC9151;border:1px solid #FC9151;border-radius:4px;padding:10px 30px;text-decoration:none">继续交流</a></div>
      <div style="font-size:12px;color:#999;margin-top:40px;border-top:1px solid #eee;padding-top:20px">&copy; ${year} ${escapeHtml(siteName)}</div>
    </div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: reply.email,
        subject: env.RESEND_SUBJECT || `有人在 ${siteName} 回复了您的评论`,
        html
      })
    });
    if (!response.ok) console.error('Resend returned HTTP', response.status);
  } catch (error) {
    console.error('Reply email failed:', error);
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
    if (request.method === 'GET' && url.pathname === '/api/comments') {
      const targetUrl = url.searchParams.get('url');
      if (!validTargetPath(targetUrl)) return json({ error: '缺少或无效的 url 参数' }, 400, headers);
      try {
        const { results } = await env.DB.prepare(`
          SELECT id, url, author, email, website, content, parent_id, created_at
          FROM comments WHERE url = ? ORDER BY created_at ASC
        `).bind(targetUrl).all();
        return json(await Promise.all(results.map(publicComment)), 200, headers);
      } catch (error) {
        console.error('Comments query failed:', error);
        return json({ error: '评论服务暂时不可用' }, 500, headers);
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/comments/submit') {
      if (!env.TURNSTILE_SECRET_KEY) return json({ error: 'Worker configuration error' }, 500, headers);
      try {
        const human = await verifyTurnstile(
          request.headers.get('CF-Turnstile-Response'),
          env.TURNSTILE_SECRET_KEY,
          request.headers.get('CF-Connecting-IP')
        );
        if (!human) return json({ error: '人机验证失败，请刷新重试' }, 403, headers);

        const body = await request.json();
        const targetUrl = body.url;
        const author = String(body.author || '').trim();
        const email = String(body.email || '').trim();
        const website = String(body.website || '').trim();
        const content = String(body.content || '').trim();
        const parentId = body.parent_id || null;
        if (!validTargetPath(targetUrl) || !author || !email || !content) {
          return json({ error: '缺少必填字段' }, 400, headers);
        }
        if (author.length > 10 || email.length > 30 || website.length > 30 || content.length > 500) {
          return json({ error: '内容超出长度限制' }, 400, headers);
        }
        if ((content.match(/https?:\/\//g) || []).length > 1) {
          return json({ error: '包含过多链接' }, 403, headers);
        }

        let parent = null;
        if (parentId) {
          parent = await env.DB.prepare(
            'SELECT author, email, content FROM comments WHERE id = ? AND url = ?'
          ).bind(parentId, targetUrl).first();
          if (!parent) return json({ error: '被回复的评论不存在' }, 400, headers);
        }

        await env.DB.prepare(`
          INSERT INTO comments (url, author, email, website, content, parent_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(targetUrl, author, email, website || null, content, parentId).run();

        const admins = adminEmails(env);
        const currentIsAdmin = admins.includes(email.toLowerCase());
        if (!currentIsAdmin) await sendBark(env, targetUrl, author, content);

        if (parent && parent.email && !admins.includes(parent.email.toLowerCase())) {
          await sendReplyEmail(env, {
            email: parent.email,
            name: parent.author,
            originalContent: parent.content,
            author,
            content,
            targetUrl
          });
        }
        return json({ success: true }, 200, headers);
      } catch (error) {
        console.error('Comment submission failed:', error);
        return json({ error: '评论服务暂时不可用' }, 500, headers);
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/verify') {
      if (!env.ADMIN_PASSWORD) return json({ error: 'Worker configuration error' }, 500, headers);
      try {
        const body = await request.json();
        if (body.password === env.ADMIN_PASSWORD) return json({ success: true }, 200, headers);
        return json({ error: '密码错误' }, 401, headers);
      } catch (_error) {
        return json({ error: '请求无效' }, 400, headers);
      }
    }

    if (request.method === 'DELETE' && url.pathname === '/api/comments') {
      if (!env.ADMIN_PASSWORD) return json({ error: 'Worker configuration error' }, 500, headers);
      try {
        const body = await request.json();
        if (body.password !== env.ADMIN_PASSWORD) return json({ error: '密码错误' }, 401, headers);
        if (!body.id) return json({ error: '缺少评论 ID' }, 400, headers);
        await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(body.id).run();
        return json({ success: true }, 200, headers);
      } catch (error) {
        console.error('Comment deletion failed:', error);
        return json({ error: '删除失败' }, 500, headers);
      }
    }

    return json({ error: 'Not Found' }, 404, headers);
  }
};
