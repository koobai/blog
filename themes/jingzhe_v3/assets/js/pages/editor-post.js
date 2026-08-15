(function () {
    'use strict';

    const CONFIG = window.JINGZHE_EDITOR_CONFIG;
    const CACHE_KEY = 'koobai_article_draft';

    let isPreviewMode = false;
    let emojiDiv = null;
    let hasFetchedRecent = false;
    window.STATE = { sha: null, path: null, date: null };

    // 标签选择器状态存储
    let cachedTags = [];
    let filteredTags = [];
    let currentTagIndex = -1;

    const $ = JingzheEditor.byId;
    const getAdminToken = JingzheEditor.getAdminToken;
    const utf8_to_b64 = JingzheEditor.utf8ToBase64;
    const b64_to_utf8 = JingzheEditor.base64ToUtf8;
    const dirtyState = JingzheEditor.createDirtyTracker();

    // 🚀 终极优化 2：全局彻底缓存高频访问的 DOM 节点
    const postTagsEl = $('postTags');
    const tagSelector = $('tagSelector');
    const postTitleEl = $('postTitle');
    const postFilenameEl = $('postFilename');
    const postSlugEl = $('postSlug');
    const postDescEl = $('postDesc');
    const postContentEl = $('postContent');

    tagSelector.style.display = 'none';

    function getFormattedTime() {
        const d = new Date();
        return {
            year: d.getFullYear(), month: String(d.getMonth() + 1).padStart(2, '0'), day: String(d.getDate()).padStart(2, '0'),
            hour: String(d.getHours()).padStart(2, '0'), min: String(d.getMinutes()).padStart(2, '0'), sec: String(d.getSeconds()).padStart(2, '0')
        };
    }

    const secureFetch = JingzheEditor.secureFetch;

    // 抓取随笔专属标签库
    async function fetchAllTags() {
        if (cachedTags.length > 0) return;
        try {
            cachedTags = await JingzheEditor.fetchTagTitles('/tags/index.xml');
        } catch(e) {
            console.log("长文标签拉取失败", e);
        }
    }

    window.addEventListener('scroll', () => {
        const bar = $('stickyToolbar');
        if (!bar) return;
        if (bar.getBoundingClientRect().top <= 0) {
            bar.classList.add('is-sticky');
        } else {
            bar.classList.remove('is-sticky');
        }
    }, { passive: true });

    let draftTimer;
    function scheduleSaveDraft() {
        if (window.STATE.sha) return;
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => {
            // 直接读取缓存好的节点，快如闪电
            const draft = { title: postTitleEl.value, filename: postFilenameEl.value, slug: postSlugEl.value, tags: postTagsEl.value, desc: postDescEl.value, content: postContentEl.value };
            JingzheEditor.saveDraft(CACHE_KEY, draft);
        }, 1000);
    }

    function loadDraft() {
        if (window.STATE.sha) return false;
        let loaded = false;
        const draft = JingzheEditor.loadDraft(CACHE_KEY);
        if (draft) {
            try {
                if (draft.title) { postTitleEl.value = draft.title; loaded = true; }
                if (draft.filename) { postFilenameEl.value = draft.filename; loaded = true; }
                if (draft.slug) { postSlugEl.value = draft.slug; loaded = true; }
                if (draft.tags) { postTagsEl.value = draft.tags; loaded = true; }
                if (draft.desc) { postDescEl.value = draft.desc; postDescEl.dispatchEvent(new Event('input')); loaded = true; }
                if (draft.content) { postContentEl.value = draft.content; postContentEl.dispatchEvent(new Event('input')); loaded = true; }
            } catch(e) {}
        }
        if (loaded) dirtyState.mark();
        return loaded;
    }

    [postTitleEl, postFilenameEl, postSlugEl, postTagsEl, postDescEl, postContentEl].forEach(el => {
        if(el) el.addEventListener('input', () => { scheduleSaveDraft(); dirtyState.mark(); });
    });

    function wrapText(prefix, suffix, placeholder, selectPlaceholder = true) {
        if(isPreviewMode) togglePreviewMode();
        postContentEl.focus({ preventScroll: true });

        const start = postContentEl.selectionStart; const end = postContentEl.selectionEnd;
        const sel = postContentEl.value.substring(start, end);
        if (sel) {
            postContentEl.setRangeText(`${prefix}${sel}${suffix}`, start, end, 'end');
        } else {
            postContentEl.setRangeText(`${prefix}${placeholder}${suffix}`, start, end, 'end');
            if (selectPlaceholder) {
                postContentEl.setSelectionRange(start + prefix.length, start + prefix.length + placeholder.length);
            }
        }
        postContentEl.dispatchEvent(new Event('input'));
    }

    function insertBold() {
        if(isPreviewMode) togglePreviewMode();
        postContentEl.focus({ preventScroll: true });
        const start = postContentEl.selectionStart;
        const end = postContentEl.selectionEnd;
        const sel = postContentEl.value.substring(start, end);

        if (sel) {
            postContentEl.setRangeText(` **${sel}** `, start, end, 'end');
        } else {
            postContentEl.setRangeText(` **加粗文字** `, start, end, 'end');
            postContentEl.setSelectionRange(start + 3, start + 7);
        }
        postContentEl.dispatchEvent(new Event('input'));
    }

    function insertLink() {
        if(isPreviewMode) togglePreviewMode();
        postContentEl.focus({ preventScroll: true });
        const start = postContentEl.selectionStart;
        const end = postContentEl.selectionEnd;
        const sel = postContentEl.value.substring(start, end);

        if (sel) {
            postContentEl.setRangeText(`[${sel}]()`, start, end, 'end');
            postContentEl.setSelectionRange(start + sel.length + 3, start + sel.length + 3);
        } else {
            postContentEl.setRangeText(`[]()`, start, end, 'end');
            postContentEl.setSelectionRange(start + 3, start + 3);
        }
        postContentEl.dispatchEvent(new Event('input'));
    }

    const renderer = {
        image({ href, title, text }) {
            if (text) { return `<figure class="post-figure"><img src="${href}" alt="${text}" title="${title || text}"><figcaption class="post-figcaption">${text}</figcaption></figure>`; }
            return `<img src="${href}" alt="">`;
        }
    };
    marked.use({ renderer, breaks: true, gfm: true });

    function togglePreviewMode() {
        const previewArea = $('previewContent'); const btn = $('modeToggleBtn');
        isPreviewMode = !isPreviewMode;
        if (isPreviewMode) {
            postContentEl.style.display = 'none'; previewArea.innerHTML = JingzheEditor.renderMarkdown(marked, postContentEl.value); previewArea.style.display = 'block';
            btn.style.color = "var(--text-highlight-color)"; btn.style.opacity = "1";
        } else {
            previewArea.style.display = 'none'; postContentEl.style.display = 'block';
            btn.style.color = ""; btn.style.opacity = "0.5";
        }
    }

    $('imageInput').addEventListener('change', async function(e) {
        const files = e.target.files; if (!files.length) return;
        if(isPreviewMode) togglePreviewMode();
        let uploadMsg = cocoMessage.info("正在压缩并上传", 0);
        for (let file of files) {
            if (!file.type.startsWith('image/')) continue;
            try {
                const uploaded = await JingzheEditor.uploadImage(file, CONFIG, 'article');
                wrapText('![', `](${uploaded.url})\n`, '');
            } catch (err) {
                if (typeof uploadMsg === 'function') uploadMsg();
                if (err.message === "401" || err.message === "UPLOAD_401") return logout(); return cocoMessage.error("图片上传失败");
            }
        }
        if (typeof uploadMsg === 'function') uploadMsg();
        cocoMessage.success("图片准备就绪！"); this.value = '';
    });

    async function showEmoji(btn) {
        if (emojiDiv) { emojiDiv.remove(); emojiDiv = null; return; }
        if (!window.emojisData) { try { window.emojisData = (await fetch('/suju/owo.json').then(r => r.json())).Emoji.container; } catch { return cocoMessage.error("获取表情失败"); } }

        emojiDiv = document.createElement('div');
        emojiDiv.className = 'emoji-selector';
        emojiDiv.style.width = '100%'; emojiDiv.style.flex = '0 0 100%';
        emojiDiv.innerHTML = window.emojisData.map(e => `<div class="emoji-item" title="${e.text}">${e.icon}</div>`).join('');
        emojiDiv.onclick = (e) => { const item = e.target.closest('.emoji-item'); if (item) { if(isPreviewMode) togglePreviewMode(); wrapText('', '', item.innerText, false); } };

        btn.closest('.admin-publish-bar').appendChild(emojiDiv);
    }

    function autoResizeTextarea(el) {
        window.requestAnimationFrame(() => {
            const currentScrollY = window.scrollY;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
            window.scrollTo(window.scrollX, currentScrollY);
        });
    }

    postDescEl.addEventListener('input', function() { autoResizeTextarea(this); });
    postContentEl.addEventListener('input', function() { autoResizeTextarea(this); });
    postContentEl.addEventListener('paste', async function(e) {
        if (e.clipboardData.files.length > 0) { e.preventDefault(); $('imageInput').files = e.clipboardData.files; $('imageInput').dispatchEvent(new Event('change')); }
    });

    async function toggleRecentList() {
        const wrap = $('recentListWrap');
        if (wrap.style.display === 'block') { wrap.style.display = 'none'; return; }
        if (!hasFetchedRecent) {
            let loadMsg = cocoMessage.info("正在获取最新一篇随笔", 0);
            const success = await fetchRecent();
            if (typeof loadMsg === 'function') loadMsg();
            if (!success) return;
        }
        wrap.style.display = 'block';
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }

    async function fetchRecent() {
        const commitsUrl = JingzheEditor.commitsUrl(CONFIG, 'content/posts');
        try {
            const res = await secureFetch(`${CONFIG.workerUrl}/api/github`, { headers: { 'x-target-url': commitsUrl } });
            if (!res.ok) { cocoMessage.warning("暂无提交记录"); return false; }
            const commits = await res.json();

            let latestFile = null;

            for (const commit of commits) {
                const detailRes = await secureFetch(`${CONFIG.workerUrl}/api/github`, { headers: { 'x-target-url': commit.url } });
                const detail = await detailRes.json();
                if (!detail.files) continue;

                latestFile = detail.files.find(f => f.filename.startsWith('content/posts/') && f.filename.endsWith('.md'));
                if (latestFile) break;
            }

            if (!latestFile) { cocoMessage.warning("近期没有文章被修改"); return false; }

            hasFetchedRecent = true;

            const filenameOnly = latestFile.filename.split('/').pop();
            const fileUrl = JingzheEditor.contentsUrl(CONFIG, latestFile.filename, true);

            $('recentList').innerHTML = `
            <div class="laodao-card admin-recent-card" onclick="fetchAndLoadForEdit('${latestFile.filename}', '${fileUrl}')">
                <div class="laodao-content datacont admin-recent-content" style="margin: 0;">
                    ${filenameOnly}
                </div>
            </div>`;
            return true;
        } catch(err) {
            if (err.message === "401") return logout();
            cocoMessage.error("网络异常，拉取失败"); return false;
        }
    }

    function getYamlValue(yaml, key) {
        return JingzheEditor.frontMatterScalar(yaml, key);
    }

    async function fetchAndLoadForEdit(path, url) {
        let loadMsg = cocoMessage.info("正在加载随笔内容", 0);
        try {
            const fRes = await secureFetch(`${CONFIG.workerUrl}/api/github`, { headers: { 'x-target-url': url } });
            const json = await fRes.json();
            const rawText = b64_to_utf8(json.content);
            const sha = json.sha;

            const fmMatch = rawText.match(/^---\n([\s\S]*?)\n---/);
            let title = '', slug = '', tagsStr = '', desc = '', date = '', image = '';
            let bodyContent = rawText;

            if (fmMatch) {
                const fm = fmMatch[1];
                title = getYamlValue(fm, 'title');
                slug = getYamlValue(fm, 'slug');
                desc = getYamlValue(fm, 'description');
                date = getYamlValue(fm, 'date');
                image = getYamlValue(fm, 'image');

                const tagsBlock = fm.match(/(?:^|\n)tags:\s*([\s\S]*?)(?=\n[A-Za-z0-9_-]+:|$)/);
                if (tagsBlock) {
                    const rawTags = tagsBlock[1].replace(/[-[\]"'\n,，]/g, ' ').trim().split(/\s+/).filter(Boolean);
                    tagsStr = rawTags.map(t => `#${t}`).join(' ');
                }
                bodyContent = rawText.replace(/^---\n[\s\S]*?\n---/, '').trimStart();
            }

            const filename = path.split('/').pop().replace('.md', '');
            if (!slug) slug = filename;
            if (image) { bodyContent = `![](${image})\n\n` + bodyContent; }

            window.STATE = { path: path, sha: sha, date: date };

            postTitleEl.value = title;
            postFilenameEl.value = filename;
            postSlugEl.value = slug;
            postTagsEl.value = tagsStr;
            postDescEl.value = desc;
            postContentEl.value = bodyContent;

            postFilenameEl.readOnly = true;
            postFilenameEl.style.opacity = '0.3';
            postFilenameEl.title = "文件名在发布后不可更改，以免引起仓库文件错乱";

            $('submitBtn').innerText = "修改";
            $('cancelBtn').style.display = 'inline-block';

            if (isPreviewMode) togglePreviewMode();

            postDescEl.dispatchEvent(new Event('input'));
            postContentEl.dispatchEvent(new Event('input'));
            dirtyState.clear();
            window.scrollTo({ top: 0, behavior: 'smooth' });

            if (typeof loadMsg === 'function') loadMsg();
            cocoMessage.success("文章加载完毕，已暂停自动存稿");
        } catch (err) {
            if (typeof loadMsg === 'function') loadMsg();
            if (err.message === "401") return logout();
            cocoMessage.error("文章内容加载失败");
        }
    }

    function cancelEdit(showMsg = true) {
        postTitleEl.value = ''; postFilenameEl.value = ''; postSlugEl.value = ''; postTagsEl.value = ''; postDescEl.value = ''; postContentEl.value = '';
        postContentEl.style.height = '60vh'; postDescEl.style.height = 'auto';
        window.STATE = { sha: null, path: null, date: null };

        postFilenameEl.readOnly = false;
        postFilenameEl.style.opacity = '0.6';
        postFilenameEl.title = "";

        $('submitBtn').innerText = "写好啦";
        $('cancelBtn').style.display = 'none';
        postContentEl.dispatchEvent(new Event('input'));
        const restoredDraft = loadDraft();
        restoredDraft ? dirtyState.mark() : dirtyState.clear();
        if (showMsg) cocoMessage.info("已取消修改");
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function initApp() {
        if (getAdminToken()) {
            $('loginOverlay').style.display = 'none'; $('adminPanel').style.display = 'block';
            fetchAllTags();
            loadDraft(); setTimeout(() => postContentEl.focus(), 100);
        } else {
            $('loginOverlay').style.display = 'flex'; $('adminPanel').style.display = 'none';
            setTimeout(() => $('adminTokenInput').focus(), 100);
        }
    }

    async function verifyToken() {
        const token = $('adminTokenInput').value.trim();
        if (!token) return cocoMessage.warning("请输入密钥");
        JingzheEditor.setAdminToken(token);
        try {
            await secureFetch(`${CONFIG.workerUrl}/api/github`, { headers: { 'x-target-url': JingzheEditor.repositoryUrl(CONFIG) } });
            $('loginOverlay').style.display = 'none'; $('adminPanel').style.display = 'block';
            cocoMessage.success("验证成功");
            fetchAllTags();
            loadDraft(); postContentEl.focus();
        } catch (e) {
            logout(false); cocoMessage.error("密钥错误，请重新输入");
        }
    }

    function logout(reload = true) {
        JingzheEditor.clearAdminToken();
        reload ? location.reload() : ($('loginOverlay').style.display = 'flex', $('adminPanel').style.display = 'none');
    }

    async function publishPost() {
        const title = postTitleEl.value.trim();
        const filenameInput = postFilenameEl.value.trim();
        const slug = postSlugEl.value.trim();
        const tagsVal = postTagsEl.value.trim();
        const desc = postDescEl.value.trim();
        let contentVal = postContentEl.value.trim();

        if (!title) return cocoMessage.warning("忘写标题啦！");
        if (!contentVal) return cocoMessage.warning("正文还是空的哦！");
        const filenameValidation = JingzheEditor.validateFilename(filenameInput);
        if (!filenameValidation.ok) return cocoMessage.warning(filenameValidation.error);
        const slugValidation = JingzheEditor.validateSlug(slug);
        if (!slugValidation.ok) return cocoMessage.warning(slugValidation.error);

        $('submitBtn').disabled = true;
        let pubMsg = cocoMessage.info("正在推送至 GitHub", 0); // 提示语保持一致

        // --- 处理封面图与时间 ---
        let coverUrl = '';
        const topImageRegex = /^\s*!\[(.*?)\]\((.*?)\)/;
        const match = contentVal.match(topImageRegex);
        if (match) {
            coverUrl = match[2];
            contentVal = contentVal.replace(topImageRegex, '').trimStart();
        }

        const { year, month, day, hour, min, sec } = getFormattedTime();
        const finalTime = window.STATE.date ? window.STATE.date : `${year}-${month}-${day}T${hour}:${min}:${sec}+08:00`;
        const safeSlug = slugValidation.value || `${year}${month}${day}-${hour}${min}${sec}`;
        const safeFilename = filenameValidation.value || safeSlug;
        const tags = tagsVal.split(/[,，\s]+/).map(t => t.replace(/^#/, '')).filter(Boolean);
        const finalMD = JingzheEditor.buildPostMarkdown({
            title,
            date: finalTime,
            slug: safeSlug,
            image: coverUrl,
            description: desc,
            tags,
            content: contentVal
        });
        const path = window.STATE.path ? window.STATE.path : `content/posts/${safeFilename}.md`;
        const targetUrl = JingzheEditor.contentsUrl(CONFIG, path);

        try {
            // 🚀 核心防 422 优化：修改旧文章前，精准拉取当前分支下该文件的最新 SHA
            if (window.STATE.sha || window.STATE.path) {
                const checkUrl = `${targetUrl}?ref=${CONFIG.branch}`; // 加上分支参数，查询更稳
                const checkRes = await secureFetch(`${CONFIG.workerUrl}/api/github`, { headers: { 'x-target-url': checkUrl } });
                if (checkRes.ok) {
                    const fileData = await checkRes.json();
                    window.STATE.sha = fileData.sha;
                } else if (checkRes.status === 404) {
                    window.STATE.sha = null; // 文件不存在则当做新建
                }
            }

            // --- 构建提交 Payload ---
            const payload = {
                message: window.STATE.sha ? `修改随笔: ${title}` : `新一篇随笔: ${title}`,
                content: utf8_to_b64(finalMD),
                branch: CONFIG.branch
            };
            if (window.STATE.sha) payload.sha = window.STATE.sha;

            // --- 正式发起提交 ---
            const res = await secureFetch(`${CONFIG.workerUrl}/api/github`, {
                method: 'PUT',
                headers: { 'x-target-url': targetUrl, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("API_REJECTED");

            if (typeof pubMsg === 'function') pubMsg();
            cocoMessage.success(window.STATE.sha ? "修改成功！" : "发布成功！");

            // 发布成功后清理缓存和状态
            if (!window.STATE.sha) JingzheEditor.removeDraft(CACHE_KEY);
            if ($('recentListWrap').style.display === 'block') { hasFetchedRecent = false; fetchRecent(); }

            cancelEdit(false);

        } catch (err) {
            console.error("提交报错详情:", err); // 打印排错信息，方便日后维护
            if (typeof pubMsg === 'function') pubMsg();
            err.message === "401" ? (cocoMessage.error("登录失效，请重新验证"), logout()) : cocoMessage.error("发布失败，请检查网络或配置");
        } finally {
            $('submitBtn').disabled = false;
        }
    }

    // ==========================================
    // 🚀 长文专属：带 # 号触发的标签选择器逻辑
    // ==========================================
    function updateTagHighlight(items) {
        items.forEach((item, i) => {
            if (i === currentTagIndex) item.classList.add('active');
            else item.classList.remove('active');
        });
    }

    function insertSelectedTag(tag, keywordLength, cursorStart) {
        const before = postTagsEl.value.substring(0, cursorStart - keywordLength - 1);
        const after = postTagsEl.value.substring(cursorStart);
        const insertText = `#${tag} `;

        // 🚀 终极优化 1：先 focus，再设定光标位置，彻底解决选完标签光标乱飞的问题
        postTagsEl.focus();

        postTagsEl.value = before + insertText + after;
        // 把光标精准定位到刚才插入的那个空格后面
        postTagsEl.setSelectionRange(before.length + insertText.length, before.length + insertText.length);

        tagSelector.style.display = 'none';
        postTagsEl.dispatchEvent(new Event('input'));
    }

    tagSelector.addEventListener('mousedown', function(e) {
        const item = e.target.closest('.tag-item');
        if (!item) return;
        e.preventDefault();

        const cursorPosition = postTagsEl.selectionStart;
        const match = postTagsEl.value.substring(0, cursorPosition).match(/(?:^|\s)#([^\s]*)$/);

        if (match) {
            insertSelectedTag(filteredTags[item.dataset.index], match[1].length, cursorPosition);
        }
    });

    function checkTagTrigger() {
        const cursorPosition = postTagsEl.selectionStart;
        const textBeforeCursor = postTagsEl.value.substring(0, cursorPosition);
        const match = textBeforeCursor.match(/(?:^|\s)#([^\s]*)$/);

        if (match) {
            const keywordLower = match[1].toLowerCase();
            filteredTags = cachedTags.filter(t => t.toLowerCase().includes(keywordLower));

            if (filteredTags.length > 0) {
                tagSelector.innerHTML = filteredTags.map((t, i) => `<div class="tag-item" data-index="${i}"># ${t}</div>`).join('');
                tagSelector.style.display = 'grid';
                currentTagIndex = -1;
            } else {
                tagSelector.style.display = 'none';
            }
        } else {
            tagSelector.style.display = 'none';
        }
    }

    postTagsEl.addEventListener('input', function() {
        checkTagTrigger();
    });

    postTagsEl.addEventListener('keyup', function(e) {
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tagSelector.style.display === 'none') {
             checkTagTrigger();
        }
    });

    postTagsEl.addEventListener('keydown', function(e) {
        if (tagSelector.style.display === 'grid') {
            const items = tagSelector.querySelectorAll('.tag-item');
            const total = items.length;
            const cols = 5;

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                currentTagIndex = currentTagIndex === -1 ? 0 : Math.min(currentTagIndex + 1, total - 1);
                updateTagHighlight(items);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                currentTagIndex = currentTagIndex === -1 ? 0 : Math.max(currentTagIndex - 1, 0);
                updateTagHighlight(items);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentTagIndex = currentTagIndex === -1 ? 0 : Math.min(currentTagIndex + cols, total - 1);
                updateTagHighlight(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentTagIndex = currentTagIndex === -1 ? 0 : Math.max(currentTagIndex - cols, 0);
                updateTagHighlight(items);
            } else if (e.key === 'Enter') {
                if (currentTagIndex >= 0) {
                    e.preventDefault();
                    items[currentTagIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                } else {
                    tagSelector.style.display = 'none';
                }
            } else if (e.key === ' ' || e.key === 'Escape' || e.key === ',' || e.key === '，') {
                tagSelector.style.display = 'none';
            }
        }
    });

    Object.assign(window, {
        cancelEdit,
        fetchAndLoadForEdit,
        insertBold,
        insertLink,
        logout,
        publishPost,
        showEmoji,
        togglePreviewMode,
        toggleRecentList,
        verifyToken,
        wrapText
    });
    initApp();
})();
