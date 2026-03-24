// ==========================
// 🚀 1. 现代事件代理：处理手风琴点击 (彻底抛弃 ID 匹配)
// ==========================
document.addEventListener('click', (e) => {
  // 1. 查找被点击的触发按钮
  const trigger = e.target.closest('.koobai-comment-trigger');
  if (!trigger) return;

  const systemDom = document.getElementById('custom-comment-system');
  // 2. 向上找到当前唠叨的主卡片
  const card = trigger.closest('.laodao-card');
  // 3. 在当前卡片里找到“评论落脚点”
  const targetContainer = card.querySelector('.laodao-comment-container');
  
  if (!targetContainer || !systemDom) return;

  // 极简判断：如果已经在里面且开着，就关掉
  if (targetContainer.contains(systemDom) && systemDom.style.display !== 'none') {
      systemDom.style.display = 'none';
      return;
  }

  // DOM 瞬移：把评论系统塞进落脚点
  systemDom.style.display = 'block';
  targetContainer.appendChild(systemDom);

  // 获取该卡片的专属 URL 并拉取数据
  window.KOOBAI_CURRENT_URL = trigger.getAttribute('data-url');
  
  // 恢复状态
  if (typeof window.cancelReply === 'function') window.cancelReply();
  const listDom = document.getElementById('comments-list');
  if (listDom) listDom.innerHTML = '';

  if (typeof window.fetchKoobaiComments === 'function') {
      window.fetchKoobaiComments();
  }
});


// ==========================
// 🚀 2. 评论系统核心逻辑
// ==========================
document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = "https://c.yangle.vip/api"; 
  const ADMIN_EMAIL = "mekoobai@gmail.com"; 
  const PAGE_SIZE = 12;

  let adminPass = localStorage.getItem('koobai_admin_pass');
  if (adminPass) document.body.classList.add('admin-mode');

  const savedUser = JSON.parse(localStorage.getItem('koobai_user') || '{}');
  if (savedUser.author) {
    document.getElementById('cmt-author').value = savedUser.author;
    document.getElementById('cmt-email').value = savedUser.email;
    document.getElementById('cmt-website').value = savedUser.website;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
  }

  async function getGravatarUrl(email) {
    const encoder = new TextEncoder();
    const data = encoder.encode(email.trim().toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `https://weavatar.com/avatar/${hashHex}?s=80&d=mp`;
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
      const pass = prompt("检测到管理员邮箱，请输入操作密码开启上帝模式：");
      if (pass) {
        try {
          const res = await fetch(`${API_BASE}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass }) });
          if (res.ok) { localStorage.setItem('koobai_admin_pass', pass); adminPass = pass; document.body.classList.add('admin-mode'); } 
          else { alert("❌ 密码错误，无法开启上帝模式！"); }
        } catch (err) { alert("网络错误，无法验证密码。"); }
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

  async function generateHtml(nodeList) {
    let html = '';
    for (const node of nodeList) {
      const avatarUrl = await getGravatarUrl(node.email);
      const authorHtml = node.website ? `<a href="${node.website}" target="_blank" rel="nofollow" class="cmt-author">${escapeHTML(node.author)}</a>` : `<span class="cmt-author">${escapeHTML(node.author)}</span>`;
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
          ${childrenMapGlobal[node.id] && childrenMapGlobal[node.id].length > 0 ? `<div class="cmt-children">${await generateHtml(childrenMapGlobal[node.id])}</div>` : ''}
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
    const html = await generateHtml(nextBatch);
    listDom.insertAdjacentHTML('beforeend', html); 
    currentRenderedCount += nextBatch.length;
    if (currentRenderedCount < allRoots.length) {
      listDom.insertAdjacentHTML('beforeend', `<div id="load-more-cmt-btn"><button type="button" onclick="loadMoreComments()" class="load-more-btn">看更多...</button></div>`);
    }
  };

  async function renderCommentsList(comments) {
    const listDom = document.getElementById('comments-list');
    if (comments.length === 0) { listDom.innerHTML = ''; return; }
    const { roots, childrenMap } = buildFlatTree(comments);
    roots.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    allRoots = roots; childrenMapGlobal = childrenMap; currentRenderedCount = 0;
    listDom.innerHTML = ''; 
    await window.loadMoreComments(); 
  }

  window.fetchKoobaiComments = async function() {
    try {
      const targetUrl = window.KOOBAI_CURRENT_URL || window.location.pathname;
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
        
        const payload = {
          url: window.KOOBAI_CURRENT_URL || window.location.pathname,
          author: document.getElementById('cmt-author').value,
          email: document.getElementById('cmt-email').value,
          website: document.getElementById('cmt-website').value,
          content: document.getElementById('cmt-content').value,
          parent_id: document.getElementById('cmt-parent-id').value || null
        };

        try {
          const res = await fetch(`${API_BASE}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (res.ok) {
            msgDom.innerText = '发送成功！'; msgDom.className = 'status-success'; 
            localStorage.setItem('koobai_user', JSON.stringify({ author: payload.author, email: payload.email, website: payload.website }));
            document.getElementById('cmt-content').value = ''; cancelReply(); window.fetchKoobaiComments(); 
          } else { 
            const err = await res.json(); msgDom.innerText = err.error || '发送失败。'; msgDom.className = 'status-error'; 
          }
        } catch (err) { msgDom.innerText = '网络错误。'; msgDom.className = 'status-error'; } 
        finally { btn.disabled = false; setTimeout(() => { msgDom.innerText = ''; msgDom.className = ''; }, 3000); }
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
  // 🚀 3. 初始加载逻辑 (随笔直显，唠叨详情自动触发)
  // ==========================
  const systemDom = document.getElementById('custom-comment-system');
  if (!systemDom) return;

  if (window.KOOBAI_IS_POST) {
      // 随笔页面：直接显示并加载
      systemDom.style.display = 'block';
      window.fetchKoobaiComments();
  } else {
      // 唠叨单页：我们给唠叨加了一个专门的 wrapper .laodao-main-card
      // 直接触发主贴的点击事件，完美展开！
      const mainCardTrigger = document.querySelector('.laodao-main-card .koobai-comment-trigger');
      if (mainCardTrigger) {
          mainCardTrigger.click();
      }
  }
});