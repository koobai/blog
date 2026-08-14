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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token, x-target-url',
    'Vary': 'Origin'
  };
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return !origin || allowedOrigins(env).includes(origin);
}

function repositoryTargetAllowed(target, env) {
  if (!target || !env.GITHUB_OWNER || !env.GITHUB_REPO) return false;
  try {
    const url = new URL(target);
    const repositoryPath = `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
    return url.protocol === 'https:'
      && url.hostname === 'api.github.com'
      && (url.pathname === repositoryPath || url.pathname.startsWith(`${repositoryPath}/`));
  } catch (_error) {
    return false;
  }
}

function uploadPathAllowed(filename) {
  if (!filename || filename.length > 300 || filename.includes('..')) return false;
  return /^(?:memos|article|apps)\/[A-Za-z0-9._/-]+$/.test(filename);
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (!originAllowed(request, env)) return json({ error: 'Forbidden origin' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { headers });

    if (!env.ADMIN_TOKEN || !env.GH_TOKEN) {
      console.error('Publisher Worker is missing required Secrets.');
      return json({ error: 'Worker configuration error' }, 500, headers);
    }

    if (request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
      return json({ error: '口令错误' }, 401, headers);
    }

    const url = new URL(request.url);
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      const filename = url.searchParams.get('name');
      if (!uploadPathAllowed(filename)) return json({ error: '非法文件路径' }, 400, headers);
      if (!env.R2_BUCKET || !env.IMAGE_BASE_URL) {
        console.error('Publisher Worker is missing R2_BUCKET or IMAGE_BASE_URL.');
        return json({ error: 'Worker configuration error' }, 500, headers);
      }
      const contentLength = Number(request.headers.get('Content-Length') || 0);
      if (contentLength > 12 * 1024 * 1024) return json({ error: '图片过大' }, 413, headers);

      try {
        await env.R2_BUCKET.put(filename, request.body, {
          httpMetadata: { contentType: request.headers.get('Content-Type') || 'image/webp' }
        });
        return json({
          success: true,
          url: `${String(env.IMAGE_BASE_URL).replace(/\/$/, '')}/${filename}`
        }, 200, headers);
      } catch (error) {
        console.error('R2 upload failed:', error);
        return json({ error: 'R2 上传失败' }, 500, headers);
      }
    }

    if (url.pathname === '/api/github' && ['GET', 'POST', 'PUT'].includes(request.method)) {
      const target = request.headers.get('x-target-url');
      if (!repositoryTargetAllowed(target, env)) {
        return json({ error: '非法目标地址，拒绝代理' }, 403, headers);
      }

      try {
        const githubResponse = await fetch(target, {
          method: request.method,
          headers: {
            'Authorization': `Bearer ${env.GH_TOKEN}`,
            'User-Agent': env.GITHUB_USER_AGENT || 'Jingzhe-Publisher-Worker',
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
          },
          body: ['PUT', 'POST'].includes(request.method) ? request.body : null
        });
        const responseHeaders = new Headers(headers);
        const contentType = githubResponse.headers.get('Content-Type');
        if (contentType) responseHeaders.set('Content-Type', contentType);
        return new Response(githubResponse.body, {
          status: githubResponse.status,
          headers: responseHeaders
        });
      } catch (error) {
        console.error('GitHub proxy failed:', error);
        return json({ error: 'GitHub 请求失败' }, 502, headers);
      }
    }

    return json({ error: '未找到接口' }, 404, headers);
  }
};
