(function(global) {
  'use strict';

  const ADMIN_TOKEN_KEY = 'koobai_admin_token';

  const byId = id => global.document.getElementById(id);

  const getAdminToken = () => global.localStorage.getItem(ADMIN_TOKEN_KEY) || '';

  const setAdminToken = token => global.localStorage.setItem(ADMIN_TOKEN_KEY, token);

  const clearAdminToken = () => global.localStorage.removeItem(ADMIN_TOKEN_KEY);

  const utf8ToBase64 = value => global.btoa(
    Array.from(new global.TextEncoder().encode(value), byte => String.fromCodePoint(byte)).join('')
  );

  const base64ToUtf8 = value => new global.TextDecoder().decode(
    Uint8Array.from(global.atob(value), character => character.charCodeAt(0))
  );

  async function secureFetch(url, options = {}) {
    options.headers = { ...options.headers, 'x-admin-token': getAdminToken() };
    const response = await global.fetch(url, options);
    if (response.status === 401) throw new Error('401');
    return response;
  }

  function saveDraft(key, value) {
    global.localStorage.setItem(key, JSON.stringify(value));
  }

  function loadDraft(key) {
    const saved = global.localStorage.getItem(key);
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch (_error) {
      return null;
    }
  }

  function removeDraft(key) {
    global.localStorage.removeItem(key);
  }

  function yamlString(value) {
    return JSON.stringify(String(value ?? ''));
  }

  function parseYamlScalar(value) {
    const source = String(value ?? '').trim();
    if (source.startsWith('"')) {
      try {
        return JSON.parse(source);
      } catch (_error) {
        return source.replace(/(^"|"$)/g, '');
      }
    }
    if (source.startsWith("'") && source.endsWith("'")) {
      return source.slice(1, -1).replace(/''/g, "'");
    }
    return source;
  }

  function frontMatterScalar(frontMatter, key) {
    const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(frontMatter || '').match(new RegExp(`^${escapedKey}:\\s*(.*)$`, 'm'));
    return match ? parseYamlScalar(match[1]) : '';
  }

  function validatePathSegment(value, options = {}) {
    let normalized = String(value || '').trim();
    if (options.markdownFilename) normalized = normalized.replace(/\.md$/i, '');
    if (!normalized) return { ok: true, value: '' };
    const invalid = normalized === '.'
      || normalized === '..'
      || normalized.length > 180
      || /[\/\\%?#\u0000-\u001F\u007F]/.test(normalized);
    return invalid
      ? { ok: false, value: normalized, error: options.markdownFilename ? '文件名不能包含路径、URL 保留字符或控制字符' : '路径不能包含斜杠、URL 保留字符或控制字符' }
      : { ok: true, value: normalized };
  }

  function validateFilename(value) {
    return validatePathSegment(value, { markdownFilename: true });
  }

  function validateSlug(value) {
    return validatePathSegment(value);
  }

  function uniqueStrings(values) {
    return [...new Set((values || []).map(value => String(value).trim()).filter(Boolean))];
  }

  function buildPostMarkdown(values) {
    const lines = [
      '---',
      `title: ${yamlString(values.title)}`,
      `date: ${values.date}`,
      `slug: ${yamlString(values.slug)}`
    ];
    if (values.image) lines.push(`image: ${yamlString(values.image)}`);
    if (values.description) lines.push(`description: ${yamlString(values.description)}`);
    const tags = uniqueStrings(values.tags);
    if (tags.length) {
      lines.push('tags:');
      tags.forEach(tag => lines.push(`  - ${yamlString(tag)}`));
    }
    lines.push('---', '');
    return `${lines.join('\n')}\n${String(values.content || '')}`;
  }

  function buildLaodaoMarkdown(values) {
    const lines = ['---', `date: ${values.date}`];
    const tags = uniqueStrings(values.tags);
    if (tags.length) {
      lines.push('laodaotags:');
      tags.forEach(tag => lines.push(`  - ${yamlString(tag)}`));
    }
    if (values.location) {
      lines.push(`location: ${yamlString(values.location.name)}`);
      lines.push(`latlng: ${yamlString(`${values.location.lat},${values.location.lng}`)}`);
    }
    if (values.device) lines.push(`device: ${yamlString(values.device)}`);
    lines.push('---', '');
    return `${lines.join('\n')}\n${String(values.content || '')}\n`;
  }

  function createDirtyTracker() {
    let dirty = false;
    const beforeUnload = event => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('beforeunload', beforeUnload);
    }
    return {
      mark: () => { dirty = true; },
      clear: () => { dirty = false; },
      isDirty: () => dirty,
      destroy: () => {
        if (typeof global.removeEventListener === 'function') {
          global.removeEventListener('beforeunload', beforeUnload);
        }
      }
    };
  }

  async function fetchTagTitles(path) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await global.fetch(`${path}${separator}t=${Date.now()}`);
    if (!response.ok) return [];
    const text = await response.text();
    const xml = new global.DOMParser().parseFromString(text, 'text/xml');
    const titles = Array.from(xml.querySelectorAll('item title')).map(item => item.textContent);
    return [...new Set(titles)];
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new global.FileReader();
      reader.onload = event => {
        const image = new global.Image();
        image.onload = () => {
          const canvas = global.document.createElement('canvas');
          let { width, height } = image;
          const maximum = 1500;
          if (width > height) {
            if (width > maximum) {
              height *= maximum / width;
              width = maximum;
            }
          } else if (height > maximum) {
            width *= maximum / height;
            height = maximum;
          }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(image, 0, 0, width, height);
          canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('IMAGE_COMPRESSION_FAILED'));
          }, 'image/webp', 0.75);
        };
        image.onerror = reject;
        image.src = event.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(file, config, folder) {
    const image = await compressImage(file);
    const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webp`;
    const response = await secureFetch(`${config.workerUrl}/api/upload?name=${filename}`, {
      method: 'POST',
      body: image
    });
    if (!response.ok) throw new Error(`UPLOAD_${response.status || 'FAILED'}`);
    let payload = {};
    try {
      payload = await response.json();
    } catch (_error) {}
    return {
      filename,
      url: payload.url || `${String(config.upyunDomain || '').replace(/\/$/, '')}/${filename}`
    };
  }

  function renderMarkdown(parser, source, options = {}) {
    const fallback = options.fallback || '*空空如也*';
    const markdown = source || (options.allowEmpty ? '' : fallback);
    return parser.parse(options.trim ? markdown.trim() : markdown);
  }

  function repositoryUrl(config) {
    return `https://api.github.com/repos/${config.owner}/${config.repo}`;
  }

  function commitsUrl(config, path, perPage = 3) {
    return `${repositoryUrl(config)}/commits?path=${path}&per_page=${perPage}&sha=${config.branch}`;
  }

  function contentsUrl(config, path, includeRef = false) {
    const url = encodeURI(`${repositoryUrl(config)}/contents/${path}`);
    return includeRef ? `${url}?ref=${config.branch}` : url;
  }

  const api = {
    ADMIN_TOKEN_KEY,
    byId,
    getAdminToken,
    setAdminToken,
    clearAdminToken,
    utf8ToBase64,
    base64ToUtf8,
    secureFetch,
    saveDraft,
    loadDraft,
    removeDraft,
    yamlString,
    parseYamlScalar,
    frontMatterScalar,
    validateFilename,
    validateSlug,
    buildPostMarkdown,
    buildLaodaoMarkdown,
    createDirtyTracker,
    fetchTagTitles,
    compressImage,
    uploadImage,
    renderMarkdown,
    repositoryUrl,
    commitsUrl,
    contentsUrl
  };

  global.JingzheEditor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
