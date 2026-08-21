const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_CONTENT_LENGTH = 200000;
const IDENTIFIER_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;
const LAODAO_PATH_RE = /^content\/laodao\/\d{4}\/\d{2}\/[A-Za-z0-9._-]+\.md$/;
const ZOUGUO_PATH_RE = /^content\/zouguo\/[a-z0-9][a-z0-9._-]{0,199}\.md$/;
const POST_PATH_RE = /^content\/posts\/[^/\\]{1,240}\.md$/u;

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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token, x-target-url, idempotency-key',
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
  return /^(?:memos|article|apps|zouguo)\/[A-Za-z0-9._/-]+$/.test(filename);
}

function uploadContentType(filename, requestedContentType) {
  const extension = String(filename).split('.').pop()?.toLowerCase();
  const knownTypes = {
    avif: 'image/avif',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  };
  if (knownTypes[extension]) return knownTypes[extension];
  return /^image\/[a-z0-9.+-]+$/i.test(String(requestedContentType || ''))
    ? requestedContentType
    : 'application/octet-stream';
}

function contentPathAllowed(path, kind) {
  if (!path || path.includes('..')) return false;
  return kind === 'laodao' ? LAODAO_PATH_RE.test(path) : ZOUGUO_PATH_RE.test(path);
}

function sourceContentPathAllowed(path, type) {
  if (!path || path.includes('..') || path.includes('\\')) return false;
  if (type === 'laodao') return LAODAO_PATH_RE.test(path);
  return type === 'post' && POST_PATH_RE.test(path);
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''));
}

function validTimestamp(value) {
  return typeof value === 'string'
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function safeDatePath(timestamp) {
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, '0');
  return {
    year: String(date.getUTCFullYear()),
    month: pad(date.getUTCMonth() + 1),
    stamp: `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  };
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToUtf8(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function githubBase(env) {
  return `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
}

function githubHeaders(env) {
  return {
    'Authorization': `Bearer ${env.GH_TOKEN}`,
    'User-Agent': env.GITHUB_USER_AGENT || 'Jingzhe-Publisher-Worker',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

function contentUrl(env, path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${githubBase(env)}/contents/${encoded}`;
}

async function readGitHubContent(env, path) {
  const response = await fetch(`${contentUrl(env, path)}?ref=${encodeURIComponent(env.GITHUB_BRANCH || 'main')}`, {
    headers: githubHeaders(env)
  });
  if (response.status === 404) return null;
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'GitHub 读取失败');
  return payload;
}

async function putGitHubContent(env, path, markdown, message) {
  const existing = await readGitHubContent(env, path);
  if (existing?.content && base64ToUtf8(existing.content) === markdown) {
    return { success: true, path, sha: existing.sha, changed: false };
  }
  const payload = {
    message,
    content: utf8ToBase64(markdown),
    branch: env.GITHUB_BRANCH || 'main'
  };
  if (existing?.sha) payload.sha = existing.sha;
  const response = await fetch(contentUrl(env, path), {
    method: 'PUT',
    headers: githubHeaders(env),
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'GitHub 更新失败');
  return {
    success: true,
    path,
    sha: result.content?.sha || existing?.sha || '',
    changed: true
  };
}

async function deleteGitHubContent(env, path) {
  const existing = await readGitHubContent(env, path);
  if (!existing) return { success: true, path, changed: false };
  const response = await fetch(contentUrl(env, path), {
    method: 'DELETE',
    headers: githubHeaders(env),
    body: JSON.stringify({
      message: path.startsWith('content/zouguo/') ? '删除走过 (iOS API)' : '删除唠叨 (iOS API)',
      sha: existing.sha,
      branch: env.GITHUB_BRANCH || 'main'
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'GitHub 删除失败');
  return { success: true, path, changed: true };
}

function normalizeImages(images) {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > 20) throw new Error('images 必须是不超过 20 项的数组');
  return images.map((value, index) => {
    if (typeof value !== 'string' || !/^https?:\/\//.test(value) || value.length > 1000) {
      throw new Error(`images 第 ${index + 1} 项无效`);
    }
    return value;
  });
}

function normalizePlace(value) {
  const place = value && typeof value === 'object' ? value : {};
  const normalized = {
    id: String(place.id || ''),
    name: String(place.name || ''),
    longitude: Number(place.longitude),
    latitude: Number(place.latitude),
    precision: String(place.precision || 'poi'),
    privacy: String(place.privacy || 'public'),
    country: String(place.country || ''),
    countryCode: String(place.countryCode || place.country_code || ''),
    region: String(place.region || ''),
    regionCode: String(place.regionCode || place.region_code || ''),
    locality: String(place.locality || ''),
    localityCode: String(place.localityCode || place.locality_code || ''),
    provider: String(place.provider || ''),
    providerId: String(place.providerId || place.provider_id || '')
  };
  if (!IDENTIFIER_RE.test(normalized.id)) throw new Error('place.id 无效');
  if (!normalized.name || normalized.name.length > 200) throw new Error('place.name 无效');
  if (!Number.isFinite(normalized.longitude) || normalized.longitude < -180 || normalized.longitude > 180) throw new Error('place.longitude 无效');
  if (!Number.isFinite(normalized.latitude) || normalized.latitude < -90 || normalized.latitude > 90) throw new Error('place.latitude 无效');
  if (!['exact', 'poi', 'locality', 'region', 'approximate'].includes(normalized.precision)) throw new Error('place.precision 无效');
  if (!['public', 'reduced'].includes(normalized.privacy)) throw new Error('place.privacy 无效');
  if (!/^[A-Z]{2}$/.test(normalized.countryCode)) throw new Error('place.countryCode 无效');
  return normalized;
}

function appendImages(markdown, images) {
  if (!images.length) return markdown;
  return `${markdown}${images.map(url => `\n![img](${url})`).join('')}\n`;
}

function buildLaodaoMarkdown(body) {
  if (typeof body.content !== 'string' || body.content.length > MAX_CONTENT_LENGTH) throw new Error('content 无效');
  if (!validTimestamp(body.date)) throw new Error('date 必须是带时区的时间');
  const tags = [...new Set(Array.from(body.content.matchAll(/#([^\s<.,!?\'"，。！？]+)/g), match => match[1]))];
  const syncToZouguo = body.syncToZouguo === true || tags.includes('走过');
  let place = null;
  if (syncToZouguo) {
    if (!validTimestamp(body.occurredAt)) throw new Error('同步到走过必须提供 occurredAt');
    place = normalizePlace(body.place);
    if (!tags.includes('走过')) tags.push('走过');
  }
  let markdown = `---\ndate: ${body.date}\n`;
  if (tags.length) markdown += `laodaotags:\n${tags.map(tag => `  - ${yamlString(tag)}`).join('\n')}\n`;
  if (body.locationName) {
    markdown += `location: ${yamlString(body.locationName)}\n`;
    markdown += `latlng: ${yamlString(`${Number(body.lat || 0)},${Number(body.lng || 0)}`)}\n`;
  }
  if (body.device) markdown += `device: ${yamlString(body.device)}\n`;
  if (syncToZouguo) {
    const line = (key, value) => value === '' ? '' : `    ${key}: ${yamlString(value)}\n`;
    markdown += `zouguo:\n  occurred_at: ${body.occurredAt}\n  place:\n`;
    markdown += line('id', place.id);
    markdown += line('name', place.name);
    markdown += `    longitude: ${place.longitude}\n    latitude: ${place.latitude}\n`;
    markdown += line('precision', place.precision);
    markdown += line('privacy', place.privacy);
    markdown += line('country', place.country);
    markdown += line('country_code', place.countryCode);
    markdown += line('region', place.region);
    markdown += line('region_code', place.regionCode);
    markdown += line('locality', place.locality);
    markdown += line('locality_code', place.localityCode);
    markdown += line('provider', place.provider);
    markdown += line('provider_id', place.providerId);
  }
  markdown += `---\n\n${body.content}\n`;
  return appendImages(markdown, normalizeImages(body.images));
}

function buildZouguoMarkdown(body) {
  if (typeof body.content !== 'string' || body.content.length > MAX_CONTENT_LENGTH) throw new Error('content 无效');
  if (!validTimestamp(body.occurredAt)) throw new Error('occurredAt 必须是带时区的时间');
  const publishedAt = body.publishedAt || new Date().toISOString();
  if (!validTimestamp(publishedAt)) throw new Error('publishedAt 必须是带时区的时间');
  const place = normalizePlace(body.place);
  const line = (key, value) => value === '' ? '' : `    ${key}: ${yamlString(value)}\n`;
  let markdown = `---\ntitle: ${yamlString(body.title || place.name)}\ndate: ${publishedAt}\ntype: "zouguo"\ndraft: false\nzouguo:\n  occurred_at: ${body.occurredAt}\n  place:\n`;
  markdown += line('id', place.id);
  markdown += line('name', place.name);
  markdown += `    longitude: ${place.longitude}\n    latitude: ${place.latitude}\n`;
  markdown += line('precision', place.precision);
  markdown += line('privacy', place.privacy);
  markdown += line('country', place.country);
  markdown += line('country_code', place.countryCode);
  markdown += line('region', place.region);
  markdown += line('region_code', place.regionCode);
  markdown += line('locality', place.locality);
  markdown += line('locality_code', place.localityCode);
  markdown += line('provider', place.provider);
  markdown += line('provider_id', place.providerId);
  markdown += `---\n\n${body.content}\n`;
  return appendImages(markdown, normalizeImages(body.images));
}

function defaultContentPath(kind, body, request) {
  if (body.path) return String(body.path);
  if (kind === 'laodao') {
    const parts = safeDatePath(body.date);
    return `content/laodao/${parts.year}/${parts.month}/${parts.stamp}.md`;
  }
  const requestId = String(body.requestId || request.headers.get('idempotency-key') || '');
  if (!IDENTIFIER_RE.test(requestId)) throw new Error('新建走过必须提供合法 requestId 或 Idempotency-Key');
  const parts = safeDatePath(body.occurredAt);
  return `content/zouguo/${parts.stamp}-${requestId.replace(/[:]/g, '-')}.md`;
}

function parseLegacyLaodao(markdown) {
  const frontmatter = markdown.startsWith('---') ? markdown.split('---')[1] || '' : '';
  const content = markdown.startsWith('---') ? markdown.split('---').slice(2).join('---').trim() : markdown;
  const value = pattern => frontmatter.match(pattern)?.[1]?.trim() || '';
  const coordinates = value(/latlng:\s*"?([^"\n]+)"?/).split(',').map(Number);
  const syncToZouguo = /(?:^|\n)zouguo:\s*(?:\n|$)/.test(frontmatter);
  const nested = key => value(new RegExp(`(?:^|\\n)\\s{4}${key}:\\s*"?([^"\\n]+)"?`));
  const parsedPlace = syncToZouguo ? {
    id: nested('id'),
    name: nested('name'),
    longitude: Number(nested('longitude')),
    latitude: Number(nested('latitude')),
    precision: nested('precision'),
    privacy: nested('privacy'),
    country: nested('country'),
    countryCode: nested('country_code'),
    region: nested('region'),
    regionCode: nested('region_code'),
    locality: nested('locality'),
    localityCode: nested('locality_code'),
    provider: nested('provider'),
    providerId: nested('provider_id')
  } : null;
  return {
    content,
    date: value(/date:\s*"?([^"\n]+)"?/),
    locationName: value(/location:\s*"([^"]+)"/),
    lat: Number.isFinite(coordinates[0]) ? coordinates[0] : 0,
    lng: Number.isFinite(coordinates[1]) ? coordinates[1] : 0,
    device: value(/device:\s*"([^"]+)"/) || null,
    syncToZouguo,
    occurredAt: syncToZouguo ? value(/occurred_at:\s*"?([^"\n]+)"?/) : null,
    place: parsedPlace
  };
}

function parseYamlScalar(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('"')) {
    try { return JSON.parse(raw); } catch (_error) { return raw.replace(/^"|"$/g, ''); }
  }
  return raw.replace(/^'|'$/g, '');
}

function parseZouguoMarkdown(markdown) {
  const matched = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/);
  const frontmatter = matched?.[1] || '';
  let content = matched ? markdown.slice(matched[0].length).trim() : markdown.trim();
  const value = pattern => parseYamlScalar(frontmatter.match(pattern)?.[1]);
  const nested = key => value(new RegExp(`(?:^|\\n)\\s{4}${key}:\\s*([^\\n]+)`));
  const images = [];
  content = content.replace(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g, (_match, url) => {
    images.push(url);
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return {
    title: value(/(?:^|\n)title:\s*([^\n]+)/),
    content,
    images,
    publishedAt: value(/(?:^|\n)date:\s*([^\n]+)/),
    occurredAt: value(/(?:^|\n)\s{2}occurred_at:\s*([^\n]+)/),
    place: {
      id: nested('id'),
      name: nested('name'),
      longitude: Number(nested('longitude')),
      latitude: Number(nested('latitude')),
      precision: nested('precision'),
      privacy: nested('privacy'),
      country: nested('country'),
      countryCode: nested('country_code'),
      region: nested('region'),
      regionCode: nested('region_code'),
      locality: nested('locality'),
      localityCode: nested('locality_code'),
      provider: nested('provider'),
      providerId: nested('provider_id')
    }
  };
}

function splitMarkdownDocument(markdown) {
  const matched = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/);
  if (!matched) throw new Error('源内容缺少合法 Front Matter');
  return { frontmatter: matched[1], body: markdown.slice(matched[0].length) };
}

function stripRootBlock(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/);
  const output = [];
  for (let index = 0; index < lines.length;) {
    if (lines[index].match(new RegExp(`^${key}:\\s*(?:#.*)?$`))) {
      index += 1;
      while (index < lines.length && (/^[ \t]/.test(lines[index]) || lines[index].trim() === '')) index += 1;
      continue;
    }
    output.push(lines[index]);
    index += 1;
  }
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function removeTag(frontmatter, key, targetTag) {
  const lines = frontmatter.split(/\r?\n/);
  const output = [];
  for (let index = 0; index < lines.length;) {
    const match = lines[index].match(new RegExp(`^${key}:\\s*(.*)$`));
    if (!match) {
      output.push(lines[index]);
      index += 1;
      continue;
    }
    const inline = match[1].trim();
    if (inline.startsWith('[') && inline.endsWith(']')) {
      const values = inline.slice(1, -1).split(',')
        .map(value => value.trim())
        .filter(value => parseYamlScalar(value) !== targetTag);
      if (values.length) output.push(`${key}: [${values.join(',')}]`);
      index += 1;
      continue;
    }
    output.push(lines[index]);
    index += 1;
    let kept = 0;
    while (index < lines.length && /^[ \t]+-/.test(lines[index])) {
      const scalar = lines[index].replace(/^[ \t]+-\s*/, '');
      if (parseYamlScalar(scalar) !== targetTag) {
        output.push(lines[index]);
        kept += 1;
      }
      index += 1;
    }
    if (!kept) output.pop();
  }
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function ensureTag(frontmatter, key, targetTag) {
  const inlinePattern = new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]$`, 'm');
  const inline = frontmatter.match(inlinePattern);
  if (inline) {
    const values = inline[1].split(',').map(value => value.trim()).filter(Boolean);
    if (!values.some(value => parseYamlScalar(value) === targetTag)) values.push(yamlString(targetTag));
    return frontmatter.replace(inlinePattern, `${key}: [${values.join(',')}]`);
  }
  const blockPattern = new RegExp(`^${key}:\\s*\\n((?:[ \\t]+-[^\\n]*(?:\\n|$))*)`, 'm');
  const block = frontmatter.match(blockPattern);
  if (block) {
    if (block[1].split(/\r?\n/).some(line => parseYamlScalar(line.replace(/^[ \t]+-\s*/, '')) === targetTag)) return frontmatter;
    return frontmatter.replace(blockPattern, `${key}:\n${block[1].replace(/\n?$/, '\n')}  - ${yamlString(targetTag)}\n`);
  }
  return `${frontmatter.trim()}\n${key}:\n  - ${yamlString(targetTag)}`;
}

function sourceZouguoBlock(occurredAt, place) {
  const line = (key, value) => value === '' ? '' : `    ${key}: ${yamlString(value)}\n`;
  let block = `zouguo:\n  occurred_at: ${occurredAt}\n  place:\n`;
  block += line('id', place.id);
  block += line('name', place.name);
  block += `    longitude: ${place.longitude}\n    latitude: ${place.latitude}\n`;
  block += line('precision', place.precision);
  block += line('privacy', place.privacy);
  block += line('country', place.country);
  block += line('country_code', place.countryCode);
  block += line('region', place.region);
  block += line('region_code', place.regionCode);
  block += line('locality', place.locality);
  block += line('locality_code', place.localityCode);
  block += line('provider', place.provider);
  block += line('provider_id', place.providerId);
  return block.trimEnd();
}

function detachSourceMarkdown(markdown, type) {
  const { frontmatter, body } = splitMarkdownDocument(markdown);
  const withoutMetadata = stripRootBlock(frontmatter, 'zouguo');
  const withoutTag = removeTag(withoutMetadata, type === 'laodao' ? 'laodaotags' : 'tags', '走过');
  return `---\n${withoutTag}\n---\n${body}`;
}

function updateSourceMetadata(markdown, type, occurredAt, placeValue) {
  if (!validTimestamp(occurredAt)) throw new Error('occurredAt 必须是带时区的时间');
  const place = normalizePlace(placeValue);
  const { frontmatter, body } = splitMarkdownDocument(markdown);
  let updated = stripRootBlock(frontmatter, 'zouguo');
  updated = ensureTag(updated, type === 'laodao' ? 'laodaotags' : 'tags', '走过');
  updated = `${updated.trim()}\n${sourceZouguoBlock(occurredAt, place)}`;
  return `---\n${updated}\n---\n${body}`;
}

async function handleDetail(env, kind, url) {
  const path = url.searchParams.get('path');
  if (!contentPathAllowed(path, kind)) throw new Error('缺少或非法文件路径');
  const file = await readGitHubContent(env, path);
  if (!file) return { error: '找不到该文件', status: 404 };
  const markdown = base64ToUtf8(file.content);
  if (kind === 'laodao') return { ...parseLegacyLaodao(markdown), sha: file.sha, path, markdown };
  return { ...parseZouguoMarkdown(markdown), sha: file.sha, path, markdown };
}

async function handlePublish(request, env, kind) {
  const body = await request.json();
  const path = defaultContentPath(kind, body, request);
  if (!contentPathAllowed(path, kind)) throw new Error('非法内容路径');
  const markdown = kind === 'laodao' ? buildLaodaoMarkdown(body) : buildZouguoMarkdown(body);
  const message = kind === 'laodao'
    ? (body.path ? '修改唠叨 (iOS API)' : '唠叨一下 (iOS API)')
    : (body.path ? '修改走过 (iOS API)' : '记录走过 (iOS API)');
  return putGitHubContent(env, path, markdown, message);
}

async function handleDelete(request, env, kind) {
  const body = await request.json();
  const path = String(body.path || '');
  if (!contentPathAllowed(path, kind)) throw new Error('缺少或非法文件路径');
  return deleteGitHubContent(env, path);
}

async function handleSourceMutation(request, env, action) {
  const body = await request.json();
  const type = String(body.type || '');
  const path = String(body.path || '');
  if (!sourceContentPathAllowed(path, type)) throw new Error('缺少或非法来源文件路径');
  const existing = await readGitHubContent(env, path);
  if (!existing) return { error: '找不到来源文件', status: 404 };
  const markdown = base64ToUtf8(existing.content);
  const updated = action === 'detach'
    ? detachSourceMarkdown(markdown, type)
    : updateSourceMetadata(markdown, type, body.occurredAt, body.place);
  const verb = action === 'detach' ? '移出走过' : '修改走过地点';
  return putGitHubContent(env, path, updated, `${verb} (${type}, iOS API)`);
}

async function handleUpload(request, env, url, headers) {
  const filename = url.searchParams.get('name');
  if (!uploadPathAllowed(filename)) return json({ error: '非法文件路径' }, 400, headers);
  if (!env.R2_BUCKET || !env.IMAGE_BASE_URL) return json({ error: 'Worker configuration error' }, 500, headers);
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_IMAGE_BYTES) return json({ error: '图片过大' }, 413, headers);
  await env.R2_BUCKET.put(filename, request.body, {
    httpMetadata: { contentType: uploadContentType(filename, request.headers.get('Content-Type')) }
  });
  return json({
    success: true,
    url: `${String(env.IMAGE_BASE_URL).replace(/\/$/, '')}/${filename}`
  }, 200, headers);
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (!originAllowed(request, env)) return json({ error: 'Forbidden origin' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { headers });

    if (!env.ADMIN_TOKEN || !env.GH_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      console.error('Publisher Worker is missing required configuration.');
      return json({ error: 'Worker configuration error' }, 500, headers);
    }
    if (request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
      return json({ error: '口令错误' }, 401, headers);
    }

    const url = new URL(request.url);
    if (['/api/upload', '/api/app/upload'].includes(url.pathname) && request.method === 'POST') {
      try {
        return await handleUpload(request, env, url, headers);
      } catch (error) {
        console.error('R2 upload failed:', error);
        return json({ error: 'R2 上传失败' }, 500, headers);
      }
    }

    if (url.pathname === '/api/github' && ['GET', 'POST', 'PUT'].includes(request.method)) {
      const target = request.headers.get('x-target-url');
      if (!repositoryTargetAllowed(target, env)) return json({ error: '非法目标地址，拒绝代理' }, 403, headers);
      try {
        const githubResponse = await fetch(target, {
          method: request.method,
          headers: githubHeaders(env),
          body: ['PUT', 'POST'].includes(request.method) ? request.body : null
        });
        const responseHeaders = new Headers(headers);
        const contentType = githubResponse.headers.get('Content-Type');
        if (contentType) responseHeaders.set('Content-Type', contentType);
        return new Response(githubResponse.body, { status: githubResponse.status, headers: responseHeaders });
      } catch (error) {
        console.error('GitHub proxy failed:', error);
        return json({ error: 'GitHub 请求失败' }, 502, headers);
      }
    }

    const match = url.pathname.match(/^\/api\/app\/(laodao|zouguo)\/(detail|publish|delete)$/);
    if (match) {
      const [, kind, action] = match;
      const expectedMethod = action === 'detail' ? 'GET' : 'POST';
      if (request.method !== expectedMethod) return json({ error: 'Method Not Allowed' }, 405, headers);
      try {
        const result = action === 'detail'
          ? await handleDetail(env, kind, url)
          : action === 'publish'
            ? await handlePublish(request, env, kind)
            : await handleDelete(request, env, kind);
        if (result.status) return json({ error: result.error }, result.status, headers);
        return json(result, 200, headers);
      } catch (error) {
        const message = String(error?.message || error || '请求失败');
        const clientError = /无效|必须|缺少|非法/.test(message);
        if (!clientError) console.error(`${kind} ${action} failed:`, error);
        return json({ error: message }, clientError ? 400 : 500, headers);
      }
    }

    const sourceMatch = url.pathname.match(/^\/api\/app\/zouguo\/source\/(detach|metadata)$/);
    if (sourceMatch) {
      if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405, headers);
      const action = sourceMatch[1];
      try {
        const result = await handleSourceMutation(request, env, action);
        if (result.status) return json({ error: result.error }, result.status, headers);
        return json(result, 200, headers);
      } catch (error) {
        const message = String(error?.message || error || '请求失败');
        const clientError = /无效|必须|缺少|非法/.test(message);
        if (!clientError) console.error(`zouguo source ${action} failed:`, error);
        return json({ error: message }, clientError ? 400 : 500, headers);
      }
    }

    return json({ error: '未找到接口' }, 404, headers);
  }
};
