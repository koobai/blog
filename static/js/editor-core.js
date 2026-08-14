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
      reader.readAsDataURL(file);
      reader.onload = event => {
        const image = new global.Image();
        image.src = event.target.result;
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
          canvas.toBlob(resolve, 'image/webp', 0.75);
        };
        image.onerror = reject;
      };
      reader.onerror = reject;
    });
  }

  async function uploadImage(file, config, folder) {
    const image = await compressImage(file);
    const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webp`;
    await secureFetch(`${config.workerUrl}/api/upload?name=${filename}`, {
      method: 'POST',
      body: image
    });
    return {
      filename,
      url: `${config.upyunDomain}/${filename}`
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
