// ==========================
// 🚀 1. 现代事件代理：处理手风琴点击
// ==========================
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.koobai-comment-trigger');
  if (!trigger) return;

  const systemDom = document.getElementById('custom-comment-system');
  const card = trigger.closest('.laodao-card');
  const targetContainer = card.querySelector('.laodao-comment-container');
  
  if (!targetContainer || !systemDom) return;

  if (targetContainer.contains(systemDom) && systemDom.style.display !== 'none') {
      systemDom.style.display = 'none';
      return;
  }

  systemDom.style.display = 'block';
  targetContainer.appendChild(systemDom);

  // 🚀 优化：强制去除 URL 参数，防止 SEO 污染
  const rawUrl = trigger.getAttribute('data-url');
  window.KOOBAI_CURRENT_URL = rawUrl.split('?')[0]; 
  
  if (typeof window.cancelReply === 'function') window.cancelReply();
  const listDom = document.getElementById('comments-list');
  if (listDom) listDom.innerHTML = ''; // 保持极简无加载状态

  if (typeof window.fetchKoobaiComments === 'function') {
      window.fetchKoobaiComments();
  }
});

// ==========================
// 🚀 2. 评论系统核心逻辑
// ==========================
document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = "https://comments.koobai.com/api"; 
  const ADMIN_EMAIL = "hi@koobai.com";
  const PAGE_SIZE = 12;

  let adminPass = localStorage.getItem('koobai_admin_pass');
  if (adminPass) document.body.classList.add('admin-mode');

  const savedUser = JSON.parse(localStorage.getItem('koobai_user') || '{}');
  if (savedUser.author) {
    document.getElementById('cmt-author').value = savedUser.author;
    document.getElementById('cmt-email').value = savedUser.email;
    document.getElementById('cmt-website').value = savedUser.website;
  }

  // 安全过滤
  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
  }

  // 🚀 优化：XSS 防护，安全的 URL
  function safeUrl(url) {
    try {
      const u = new URL(url);
      return ['http:', 'https:'].includes(u.protocol) ? url : '#';
    } catch {
      return '#';
    }
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr + "Z");
    const currentYear = new Date().getFullYear();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return (yyyy === currentYear) ? `${mm}-${dd} ${hh}:${min}` : `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }

  // 🚀 优化：Gravatar 缓存机制
  const avatarCache = new Map();
  async function getGravatarUrlCached(email) {
    const key = email.trim().toLowerCase();
    if (avatarCache.has(key)) return avatarCache.get(key);
    
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const url = `https://weavatar.com/avatar/${hashHex}?s=50&d=mp`;
    
    avatarCache.set(key, url);
    return url;
  }

  function insertTextToTextarea(text) {
    const contentEl = document.getElementById('cmt-content');
    contentEl.focus({ preventScroll: true });
    const start = contentEl.selectionStart;
    const end = contentEl.selectionEnd;
    const before = contentEl.value.substring(0, start);
    const after = contentEl.value.substring(end);
    contentEl.value = before + text + after;
    contentEl.setSelectionRange(start + text.length, start + text.length);
    contentEl.dispatchEvent(new Event('input'));
  }

  document.getElementById('cmt-email').addEventListener('blur', async function(e) {
    if (e.target.value.trim().toLowerCase() === ADMIN_EMAIL && !document.body.classList.contains('admin-mode')) {
      const pass = prompt("输入密码开启管理模式");
      if (pass) {
        try {
          const res = await fetch(`${API_BASE}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass }) });
          if (res.ok) { localStorage.setItem('koobai_admin_pass', pass); adminPass = pass; document.body.classList.add('admin-mode'); } 
          else { alert("密码错误"); }
        } catch (err) { alert("网络错误"); }
      }
    }
  });

  function buildFlatTree(comments) {
    const map = {}; const roots = []; const childrenMap = {};
    comments.forEach(c => map[c.id] = c);
    function getRootId(id) { let curr = map[id]; while (curr && curr.parent_id) { curr = map[curr.parent_id]; } return curr ? curr.id : id; }
    comments.forEach(c => {
      if (!c.parent_id) { roots.push(c); childrenMap[c.id] = []; } 
      else {
        const rootId = getRootId(c.id);
        if (childrenMap[rootId]) {
          c.replyToName = map[c.parent_id].author;
          c.showTarget = c.parent_id !== rootId; 
          childrenMap[rootId].push(c);
        }
      }
    });
    return { roots, childrenMap };
  }

  let allRoots = [];
  let childrenMapGlobal = {};
  let currentRenderedCount = 0;

  // 🚀 优化：完全剥离了 await 的纯同步递归渲染，极速执行！
  function generateHtmlSync(nodeList) {
    let html = '';
    for (const node of nodeList) {
      const avatarUrl = avatarCache.get(node.email.trim().toLowerCase()) || 'https://weavatar.com/avatar/?d=mp';
      // 使用 safeUrl 防止 XSS
      const authorHtml = node.website ? `<a href="${safeUrl(node.website)}" target="_blank" rel="nofollow" class="cmt-author">${escapeHTML(node.author)}</a>` : `<span class="cmt-author">${escapeHTML(node.author)}</span>`;
      const targetHtml = node.showTarget ? `<span class="reply-arrow">▸</span><span class="cmt-target">${escapeHTML(node.replyToName)}</span>` : '';
      
      html += `
        <div class="cmt-node" id="cmt-${node.id}">
          <div class="cmt-body">
            <img src="${avatarUrl}" class="cmt-avatar" alt="avatar">
            <div class="cmt-main" id="main-${node.id}">
              <div class="cmt-meta">${authorHtml} ${targetHtml} <span class="cmt-date">${formatDate(node.created_at)}</span></div>
              <p class="cmt-text">${escapeHTML(node.content)}</p>
              <div class="cmt-actions">
                <button type="button" class="cmt-btn" onclick="replyTo(${node.id}, '${escapeHTML(node.author).replace(/'/g, "\\'")}')">回复</button>
                <button type="button" class="cmt-btn delete" onclick="deleteCmt(${node.id})">删除</button>
              </div>
            </div>
          </div>
          ${childrenMapGlobal[node.id] && childrenMapGlobal[node.id].length > 0 ? `<div class="cmt-children">${generateHtmlSync(childrenMapGlobal[node.id])}</div>` : ''}
        </div>`;
    }
    return html;
  }

  window.loadMoreComments = async function() {
    const listDom = document.getElementById('comments-list');
    const oldBtn = document.getElementById('load-more-cmt-btn');
    if (oldBtn) oldBtn.remove();
    const nextBatch = allRoots.slice(currentRenderedCount, currentRenderedCount + PAGE_SIZE);
    if (nextBatch.length === 0) return;
    
    // 🚀 优化：渲染前，先批量并发获取本批次所有未缓存的头像
    const uniqueEmails = [...new Set(nextBatch.map(c => c.email))];
    await Promise.all(uniqueEmails.map(getGravatarUrlCached));

    // 头像全部就绪，瞬间同步组装 DOM
    const html = generateHtmlSync(nextBatch);
    listDom.insertAdjacentHTML('beforeend', html); 
    currentRenderedCount += nextBatch.length;
    
    if (currentRenderedCount < allRoots.length) {
      listDom.insertAdjacentHTML('beforeend', `<div id="load-more-cmt-btn"><button type="button" onclick="loadMoreComments()" class="load-more-btn">加载更多</button></div>`);
    }
  };

  async function renderCommentsList(comments) {
    const listDom = document.getElementById('comments-list');
    if (comments.length === 0) { listDom.innerHTML = ''; return; }
    
    // 🚀 优化：渲染前一次性并发处理这棵树里所有相关联的人的头像（包括子评论）
    const allUniqueEmails = [...new Set(comments.map(c => c.email))];
    await Promise.all(allUniqueEmails.map(getGravatarUrlCached));

    const { roots, childrenMap } = buildFlatTree(comments);
    roots.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    allRoots = roots; childrenMapGlobal = childrenMap; currentRenderedCount = 0;
    listDom.innerHTML = ''; 
    await window.loadMoreComments(); 
  }

  window.fetchKoobaiComments = async function() {
    try {
      // 🚀 优化：强制去除原生 URL 的参数，保证干净
      let targetUrl = window.KOOBAI_CURRENT_URL || window.location.pathname;
      targetUrl = targetUrl.split('?')[0];
      
      const res = await fetch(`${API_BASE}/comments?url=${encodeURIComponent(targetUrl)}`);
      if (res.ok) renderCommentsList(await res.json());
    } catch (err) { document.getElementById('comments-list').innerHTML = ''; }
  }

  const textareaEl = document.getElementById('cmt-content');
  if (textareaEl) {
      textareaEl.addEventListener('input', function() {
        this.style.height = 'auto'; 
        this.style.height = this.scrollHeight + 'px'; 
      });
  }

  window.replyTo = function(parentId, authorName) {
    document.getElementById('main-' + parentId).appendChild(document.getElementById('main-form-wrap'));
    document.getElementById('cmt-parent-id').value = parentId;
    document.getElementById('reply-target-name').innerText = authorName;
    document.getElementById('replying-to-badge').style.display = 'flex';
    document.getElementById('cmt-content').focus();
  };
  
  window.cancelReply = function() {
    document.getElementById('form-placeholder').appendChild(document.getElementById('main-form-wrap'));
    document.getElementById('cmt-parent-id').value = '';
    document.getElementById('replying-to-badge').style.display = 'none';
    document.getElementById('cmt-content').style.height = 'auto';
  };

  const formEl = document.getElementById('comment-form');
  if (formEl) {
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('cmt-submit-btn'), msgDom = document.getElementById('cmt-status-msg');
        btn.disabled = true; msgDom.innerText = '发送中...'; msgDom.className = 'status-loading'; 
        
        let submitUrl = window.KOOBAI_CURRENT_URL || window.location.pathname;
        submitUrl = submitUrl.split('?')[0];

        const payload = {
          url: submitUrl,
          author: document.getElementById('cmt-author').value,
          email: document.getElementById('cmt-email').value,
          website: document.getElementById('cmt-website').value,
          content: document.getElementById('cmt-content').value,
          parent_id: document.getElementById('cmt-parent-id').value || null
        };

        try {
          // 🚀 终极完美版：通过 Promise 动态封装隐形发卡器
          if (!window.getTurnstileToken) {
            window.getTurnstileToken = function(action) {
              return new Promise((resolve, reject) => {
                if (typeof turnstile === 'undefined') return reject(new Error('人机验证超时，刷新重试。'));
                const div = document.createElement('div');
                document.body.appendChild(div);
                const wId = turnstile.render(div, {
                  sitekey: '0x4AAAAAACw0z9xeBryoGaUA',
                  size: 'invisible', 
                  action: action,
                  callback: t => { resolve(t); setTimeout(() => { turnstile.remove(wId); div.remove(); }, 1000); },
                  'error-callback': () => { reject(new Error('人机验证超时，刷新重试。')); setTimeout(() => { turnstile.remove(wId); div.remove(); }, 1000); }
                });
              });
            };
          }

          // 召唤盾牌获取通行证
          const token = await window.getTurnstileToken('submit_comment');
          
          // 再带着通行证发送评论请求 (下面是你原本的代码)
          const res = await fetch(`${API_BASE}/comments/submit`, {
            method: 'POST', 
            headers: { 
              'Content-Type': 'application/json',
              'CF-Turnstile-Response': token 
            }, 
            body: JSON.stringify(payload) 
          });

          if (res.ok) {
            msgDom.innerText = '发送成功！'; msgDom.className = 'status-success'; 
            localStorage.setItem('koobai_user', JSON.stringify({ author: payload.author, email: payload.email, website: payload.website }));
            document.getElementById('cmt-content').value = ''; cancelReply(); window.fetchKoobaiComments(); 
          } else { 
            const err = await res.json(); 
            // 如果后端 Worker 拦截了，提示文字就会在这里被精准展示出来
            msgDom.innerText = err.error || '发送失败。'; msgDom.className = 'status-error'; 
          }
        } catch (err) { 
          // 优雅捕获网络错误和验证超时
          msgDom.innerText = err.message === '人机验证超时，刷新重试。' ? err.message : '网络错误。'; 
          msgDom.className = 'status-error'; 
        } 
        finally { 
          btn.disabled = false; 
          setTimeout(() => { msgDom.innerText = ''; msgDom.className = ''; }, 3000); 
        }
      }); 
  } 
  
  window.deleteCmt = async function(id) {
    if (!confirm('确定要删除这条评论吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/comments`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password: adminPass }) });
      if (res.ok) { document.getElementById(`cmt-${id}`).style.display = 'none'; } 
      else { alert("删除失败，可能是密码错误或已失效。"); localStorage.removeItem('koobai_admin_pass'); document.body.classList.remove('admin-mode'); }
    } catch(e) { alert("网络错误！"); }
  };

  const emojiBtn = document.getElementById('cmt-emoji-btn');
  let emojiPanel = null;
  if (emojiBtn) {
    emojiBtn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (emojiPanel) { emojiPanel.remove(); emojiPanel = null; return; }
      if (!window.emojisData) {
        try { window.emojisData = (await (await fetch('/suju/owo.json')).json()).Emoji.container; } 
        catch (err) { alert("获取表情失败"); return; }
      }
      emojiPanel = document.createElement('div');
      emojiPanel.className = 'emoji-selector';
      emojiPanel.innerHTML = window.emojisData.map(e => `<div class="emoji-item" title="${e.text}">${e.icon}</div>`).join('');
      emojiPanel.onclick = (ev) => {
        ev.stopPropagation(); const item = ev.target.closest('.emoji-item');
        if (item) insertTextToTextarea(item.innerText);
      };
      emojiBtn.closest('.form-actions').after(emojiPanel);
    });
  }

  // ==========================
  // 🚀 3. 初始加载逻辑
  // ==========================
  const systemDom = document.getElementById('custom-comment-system');
  if (!systemDom) return;

  if (document.querySelector('.article-comments')) {
      systemDom.style.display = 'block';
      if (typeof window.fetchKoobaiComments === 'function') {
          window.fetchKoobaiComments();
      }
  } 
  else if (document.querySelector('.laodao-main-card')) {
      const mainCardTrigger = document.querySelector('.laodao-main-card .koobai-comment-trigger');
      if (mainCardTrigger) {
          mainCardTrigger.click();
      }
  }
}); 