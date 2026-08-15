(function () {
    'use strict';

    const CONFIG = window.JINGZHE_EDITOR_CONFIG;
    const CACHE_KEY = 'koobai_laodao_draft';
    const STATE = { sha: null, path: null, date: null, emoji: null, location: null, draftId: null, device: null };
    let hasFetchedRecent = false;
    let draftTimer;
    let currentCloudDrafts = [];

    let cachedTags = [];
    let filteredTags = [];
    let currentTagIndex = -1;
    let isPreviewMode = false;

    // 初始化 Markdown 解析器
    marked.use({ breaks: true, gfm: true });

    const $ = JingzheEditor.byId;
    const contentEl = $('content');
    const getAdminToken = JingzheEditor.getAdminToken;
    const utf8_to_b64 = JingzheEditor.utf8ToBase64;
    const b64_to_utf8 = JingzheEditor.base64ToUtf8;
    const dirtyState = JingzheEditor.createDirtyTracker();

    // ==========================================
    // 💡 核心功能：极简且完美的预览渲染逻辑
    // ==========================================
    function togglePreviewMode() {
        const editorWrap = $('editorWrap');
        const previewCard = $('previewCard');
        const btn = $('modeToggleBtn');

        isPreviewMode = !isPreviewMode;

        if (isPreviewMode) {
            editorWrap.style.display = 'none';
            let rawMarkdown = contentEl.value || '*空空如也*';

            // 1. 提取并移除图片 (Markdown 格式: ![alt](url))，从正文中抽离
            let images = [];
            rawMarkdown = rawMarkdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
                images.push({ alt, url });
                return ''; // 直接挖除
            });

            // 2. 提取并移除标签 (#标签)
            let tags = [];
            rawMarkdown = rawMarkdown.replace(/(^|[\s>])#([^\s<.,!?'"，。！？]+)/g, (match, prefix, tag) => {
                tags.push(tag);
                return prefix;
            });

            // 3. ✨ 核心：解析纯净的 Markdown，并像 Hugo 一样强力剔除可能多出来的空 <p> 段落
            let finalTextHtml = JingzheEditor.renderMarkdown(marked, rawMarkdown, { trim: true, allowEmpty: true });
            finalTextHtml = finalTextHtml.replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '');

            // 4. 组装图库和标签
            let galleryHtml = '';
            if (images.length > 0) {
                galleryHtml = `<div class="laodao-gallery">` + images.map(img => `<img src="${img.url}" alt="${img.alt}">`).join('') + `</div>`;
            }

            let timeStr = STATE.date ? STATE.date.substring(5, 16).replace('T', ' ') : new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}).replace('/', '-');


            // 5. 渲染（已彻底去掉多余的评论 SVG 结构）
            previewCard.innerHTML = `
              <div class="laodao-time"><a>${timeStr}</a></div>
              <div class="laodao-content datacont">
                ${finalTextHtml}
                ${galleryHtml}
              </div>
            `;
            previewCard.style.display = 'grid';
            btn.style.color = "var(--text-highlight-color)"; btn.style.opacity = "1";
        } else {
            previewCard.style.display = 'none';
            editorWrap.style.display = '';
            btn.style.color = ""; btn.style.opacity = "0.4";
            contentEl.focus();
        }
    }

    function getFormattedTime() {
        const d = new Date(new Date().getTime() + 8 * 3600 * 1000);
        return {
            year: d.getUTCFullYear(), month: String(d.getUTCMonth() + 1).padStart(2, '0'),
            day: String(d.getUTCDate()).padStart(2, '0'), hour: String(d.getUTCHours()).padStart(2, '0'),
            min: String(d.getUTCMinutes()).padStart(2, '0'), sec: String(d.getUTCSeconds()).padStart(2, '0')
        };
    }

    const secureFetch = JingzheEditor.secureFetch;

    function scheduleSaveDraft() {
        if (STATE.sha) return;
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => {
            const draft = { content: contentEl.value, location: STATE.location };
            JingzheEditor.saveDraft(CACHE_KEY, draft);
        }, 800);
    }

    function loadDraft() {
        if (STATE.sha) return;
        const draft = JingzheEditor.loadDraft(CACHE_KEY);
        if (draft) {
            try {
                if (draft.content) { contentEl.value = draft.content; contentEl.dispatchEvent(new Event('input')); }
                if (draft.location) { STATE.location = draft.location; renderLocation(); }
            } catch(e) {}
        }
    }

    async function fetchAllTags() {
        if (cachedTags.length > 0) return;
        try {
            cachedTags = await JingzheEditor.fetchTagTitles('/laodaotags/index.xml');
        } catch(e) {}
    }

    function initApp() {
        if (getAdminToken()) {
            $('loginOverlay').style.display = 'none'; $('adminPanel').style.display = 'block';
            fetchAllTags(); loadDraft(); setTimeout(() => contentEl.focus(), 100);
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
            cocoMessage.success("验证成功"); fetchAllTags(); loadDraft(); contentEl.focus();
        } catch (e) {
            logout(false); cocoMessage.error("密钥错误，请重新输入");
        }
    }

    function logout(reload = true) {
        JingzheEditor.clearAdminToken();
        reload ? location.reload() : ($('loginOverlay').style.display = 'flex', $('adminPanel').style.display = 'none');
    }

    function insertText(text, wrap = '', offset = 0) {
        if (isPreviewMode) togglePreviewMode(); // 拦截：如果在预览，自动退出
        contentEl.focus({ preventScroll: true });
        const { selectionStart: start, selectionEnd: end } = contentEl;
        const sel = contentEl.value.substring(start, end);
        const result = sel ? `${wrap}${sel}${wrap === '[' ? ']()' : wrap}` : text;

        contentEl.setRangeText(result, start, end, 'end');
        contentEl.setSelectionRange(start + result.length - offset, start + result.length - offset);
        contentEl.dispatchEvent(new Event('input'));
    }

    const insertLink = () => insertText("[]()", "[", 1);

    function insertBold() {
        if (isPreviewMode) togglePreviewMode();
        contentEl.focus({ preventScroll: true });
        const start = contentEl.selectionStart; const end = contentEl.selectionEnd;
        const sel = contentEl.value.substring(start, end);
        const result = sel ? ` **${sel}** ` : ` **加粗文字** `;
        contentEl.setRangeText(result, start, end, 'end');
        if (!sel) contentEl.setSelectionRange(start + 3, start + 3 + 4);
        contentEl.dispatchEvent(new Event('input'));
    }

    async function showEmoji(btn) {
        if (STATE.emoji) { STATE.emoji.remove(); STATE.emoji = null; return; }
        if (!window.emojisData) {
            try { window.emojisData = (await fetch('/suju/owo.json').then(r => r.json())).Emoji.container; }
            catch { return cocoMessage.error("获取表情失败"); }
        }

        const div = document.createElement('div');
        div.className = 'emoji-selector';
        div.innerHTML = window.emojisData.map(e => `<div class="emoji-item" title="${e.text}">${e.icon}</div>`).join('');
        div.onclick = (e) => {
            const item = e.target.closest('.emoji-item');
            if (item) insertText(item.innerText);
        };
        btn.closest('.admin-publish-footer').after(div);
        STATE.emoji = div;
    }

    function renderLocation() {
        const locDiv = $('locationDisplay');
        if (STATE.location) {
            locDiv.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <span class="admin-location-text" onclick="editLocation()" title="点击可修改名称">${STATE.location.name}</span>
                <svg onclick="removeLocation()" title="移除" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5;cursor:pointer;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            `;
            locDiv.style.display = 'flex';
        } else {
            locDiv.style.display = 'none'; locDiv.innerHTML = '';
        }
    }

    function editLocation() {
        if (!STATE.location) return;
        const newName = prompt('修改你想展示的位置名称:', STATE.location.name);
        if (newName && newName.trim()) {
            STATE.location.name = newName.trim(); renderLocation(); scheduleSaveDraft(); dirtyState.mark();
        }
    }

    function removeLocation() {
        STATE.location = null; renderLocation(); scheduleSaveDraft(); dirtyState.mark();
    }

    $('imageInput').addEventListener('change', async function(e) {
        const files = e.target.files; if (!files.length) return;
        if (isPreviewMode) togglePreviewMode();
        let uploadMsg = cocoMessage.info("正在压缩并上传", 0);

        for (let file of files) {
            if (!file.type.startsWith('image/')) continue;
            try {
                const uploaded = await JingzheEditor.uploadImage(file, CONFIG, 'memos');
                insertText(`\n![img](${uploaded.url})`);
            } catch (err) {
                if (typeof uploadMsg === 'function') uploadMsg();
                if (err.message === "401" || err.message === "UPLOAD_401") return (cocoMessage.error("登录状态失效"), logout());
                return cocoMessage.error("图片上传失败");
            }
        }
        if (typeof uploadMsg === 'function') uploadMsg();
        cocoMessage.success("图片准备就绪！"); this.value = '';
    });

    async function publishPost() {
        const contentVal = contentEl.value.trim();
        if (!contentVal) return cocoMessage.warning("写点什么再发吧！");
        if (isPreviewMode) togglePreviewMode();

        $('submitBtn').disabled = true;
        let pubMsg = cocoMessage.info("正在推送至 GitHub", 0);

        const tags = [...new Set(Array.from(contentVal.matchAll(/#([^\s<.,!?'"，。！？]+)/g), m => m[1]))];
        const { year, month, day, hour, min, sec } = getFormattedTime();
        const finalTime = (STATE.sha && STATE.date) ? STATE.date : `${year}-${month}-${day}T${hour}:${min}:${sec}+08:00`;
        const finalMD = JingzheEditor.buildLaodaoMarkdown({
            date: finalTime,
            tags,
            location: STATE.location,
            device: STATE.device,
            content: contentVal
        });
        const path = STATE.path || `content/laodao/${year}/${month}/${year}${month}${day}-${hour}${min}${sec}.md`;
        const targetUrl = JingzheEditor.contentsUrl(CONFIG, path);

        try {
            if (STATE.sha || STATE.path) {
                const checkUrl = `${targetUrl}?ref=${CONFIG.branch}`;
                const checkRes = await secureFetch(`${CONFIG.workerUrl}/api/github`, { headers: { 'x-target-url': checkUrl } });
                if (checkRes.ok) {
                    const data = await checkRes.json();
                    STATE.sha = data.sha;
                }
            }

            const payload = { message: STATE.sha ? "唠叨修改" : "唠叨一下", content: utf8_to_b64(finalMD), branch: CONFIG.branch };
            if (STATE.sha) payload.sha = STATE.sha;

            const res = await secureFetch(`${CONFIG.workerUrl}/api/github`, {
                method: 'PUT', headers: { 'x-target-url': targetUrl, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("API_REJECTED");

            if (typeof pubMsg === 'function') pubMsg();
            cocoMessage.success("唠叨成功！搞定！");
            if (!STATE.sha) JingzheEditor.removeDraft(CACHE_KEY);
            if (STATE.draftId) {
                await deleteCloudDraft(STATE.draftId, true);
            }
            cancelEdit(false);
            if($('recentListWrap').style.display === 'block') { hasFetchedRecent = false; fetchRecent(); }
        } catch (err) {
            console.error("提交报错详情:", err);
            if (typeof pubMsg === 'function') pubMsg();
            err.message === "401" ? (cocoMessage.error("登录状态失效"), logout()) : cocoMessage.error("唠叨失败");
        } finally {
            $('submitBtn').disabled = false;
        }
    }

    async function toggleRecentList() {
        const wrap = $('recentListWrap');
        // 🌟 修复：区分当前展示的是最近唠叨还是云草稿
        if (wrap.style.display === 'block' && wrap.dataset.type === 'recent') { wrap.style.display = 'none'; return; }

        if (!hasFetchedRecent || wrap.dataset.type !== 'recent') {
            let loadMsg = cocoMessage.info("正在获取最新一条唠叨", 0);
            const success = await fetchRecent();
            if (typeof loadMsg === 'function') loadMsg();
            if (!success) return;
        }
        wrap.style.display = 'block';
        wrap.dataset.type = 'recent'; // 标记当前为最近修改
    }

    async function fetchRecent() {
        const commitsUrl = JingzheEditor.commitsUrl(CONFIG, 'content/laodao');
        try {
            const res = await secureFetch(`${CONFIG.workerUrl}/api/github`, { headers: { 'x-target-url': commitsUrl } });
            if (!res.ok) { cocoMessage.warning("暂无提交记录"); $('recentList').innerHTML = ''; return false; }

            const commits = await res.json();
            let latestFile = null;

            for (const commit of commits) {
                const detailRes = await secureFetch(`${CONFIG.workerUrl}/api/github`, { headers: { 'x-target-url': commit.url } });
                const detail = await detailRes.json();
                if (!detail.files) continue;
                latestFile = detail.files.find(f => f.filename.startsWith('content/laodao/') && f.filename.endsWith('.md'));
                if (latestFile) break;
            }

            if (!latestFile) { cocoMessage.warning("近期没有唠叨被修改"); $('recentList').innerHTML = ''; return false; }

            hasFetchedRecent = true;
            const fileUrl = JingzheEditor.contentsUrl(CONFIG, latestFile.filename, true);
            const fRes = await secureFetch(`${CONFIG.workerUrl}/api/github`, { headers: { 'x-target-url': fileUrl } });
            const json = await fRes.json();

            const rawText = b64_to_utf8(json.content);
            const body = rawText.replace(/---[\s\S]*?---/, '').trim();
            const previewText = body.replace(/!\[.*?\]\(.*?\)/g, '[图片]').substring(0, 20) + (body.length > 20 ? '...' : '');

            $('recentList').innerHTML = `
            <div class="card-timeline laodao-card admin-recent-card" onclick="loadForEdit('${latestFile.filename}', '${json.sha}', \`${encodeURIComponent(rawText)}\`)">
                <div class="laodao-content datacont admin-recent-content" style="margin: 0;">
                    ${previewText}
                </div>
            </div>`;
            return true;
        } catch(err) {
            $('recentList').innerHTML = '';
            err.message === "401" ? (cocoMessage.error("密钥失效，请重新登录"), logout()) : cocoMessage.error("网络异常，拉取失败");
            return false;
        }
    }
// ==========================================
    // ☁️ 云端草稿核心功能 (获取、保存、删除、加载)
    // ==========================================

    // 1. 切换/拉取草稿列表
    async function toggleDraftList(isSilentRefresh = false) {
        const wrap = $('recentListWrap');
        // 🌟 如果是静默刷新，就不要隐藏面板
        if (!isSilentRefresh && wrap.style.display === 'block' && wrap.dataset.type === 'draft') {
            wrap.style.display = 'none'; return;
        }

        let loadMsg = null;
        // 🌟 只有非静默状态才弹蓝框
        if (!isSilentRefresh) {
            loadMsg = cocoMessage.info("正在获取云草稿...", 0);
        }
        try {
            const res = await secureFetch(`${CONFIG.draftUrl}/api/drafts`);
            if (!res.ok) throw new Error("API Error");
            const drafts = await res.json();
            currentCloudDrafts = drafts; // 存入全局，防止特殊字符转义破坏 HTML

            if (typeof loadMsg === 'function') loadMsg();

            if (!drafts || drafts.length === 0) {
                $('recentList').innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无云草稿</div>';
            } else {
                let html = '';
                drafts.forEach((draft, index) => {
                    const rawText = draft.content || "";
                    const previewText = rawText.replace(/!\[.*?\]\(.*?\)/g, '[图片]').substring(0, 20) + (rawText.length > 20 ? '...' : '');

                    // 渲染卡片
                    html += `
                    <div class="draft-item-wrapper">
                        <div class="draft-content-text" onclick="loadCloudDraft(${index})">
                            ${previewText}
                        </div>
                        <div class="draft-delete-btn" onclick="deleteCloudDraft('${draft.id}')">(删除)</div>
                    </div>`;
                });
                $('recentList').innerHTML = html;
            }
            wrap.style.display = 'block';
            wrap.dataset.type = 'draft'; // 标记当前面板是草稿
        } catch(err) {
            if (loadMsg) loadMsg();
            if (!isSilentRefresh) {
                $('recentList').innerHTML = '';
                cocoMessage.error("获取云草稿失败");
            }
        }
    }

    // 2. 将选中的草稿载入编辑框
    function loadCloudDraft(index) {
        const draft = currentCloudDrafts[index];
        if (!draft) return;
        if (isPreviewMode) togglePreviewMode();

        STATE.draftId = draft.id;
        STATE.sha = null; STATE.path = null; STATE.date = null; // 清除线上修改标记

        // 兼容驼峰和下划线命名，放宽坐标值为 0 时的判断拦截
        const locName = draft.location_name || draft.locationName || "";
        if (locName !== "") {
            STATE.location = {
                name: locName,
                lat: parseFloat(draft.lat || 0),
                lng: parseFloat(draft.lng || 0)
            };
        } else {
            STATE.location = null;
        }
        renderLocation();

        contentEl.value = draft.content || '';
        $('submitBtn').innerText = "发布草稿";
        $('cancelBtn').style.display = 'inline-block';
        $('saveDraftBtn').style.display = 'inline-block';
        if (STATE.emoji) { STATE.emoji.remove(); STATE.emoji = null; }

        contentEl.dispatchEvent(new Event('input'));
        dirtyState.clear();

        // 平滑滚动到顶部方便编辑
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // 3. 手动保存到云草稿
    async function saveCloudDraft() {
        const contentVal = contentEl.value.trim();
        if (!contentVal) return cocoMessage.warning("写点什么再存吧！");

        let saveMsg = cocoMessage.info("正在保存至云端...", 0);
        const id = STATE.draftId || URL.createObjectURL(new Blob([])).slice(-36);

        const payload = {
            id: id,
            content: contentVal,
            location_name: STATE.location ? STATE.location.name : "",
            lat: STATE.location ? STATE.location.lat : 0,
            lng: STATE.location ? STATE.location.lng : 0
        };

        try {
            const res = await secureFetch(`${CONFIG.draftUrl}/api/drafts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("API Error");

            if (typeof saveMsg === 'function') saveMsg();
            cocoMessage.success("云草稿已保存");

            // 🌟 修复 2：保存成功后，强制清空输入框并重置所有状态
            cancelEdit(false);

            // 🌟 修复：不再隐藏面板，直接传 true 开启无感静默刷新
            const wrap = $('recentListWrap');
            if (wrap.style.display === 'block' && wrap.dataset.type === 'draft') {
                toggleDraftList(true);
            }
        } catch(err) {
            if (typeof saveMsg === 'function') saveMsg();
            cocoMessage.error("云草稿保存失败");
        }
    }

    // 4. 删除云草稿 (支持静默删除)
    async function deleteCloudDraft(id, isSilent = false) {
        if (!isSilent && !confirm("确定要永久删除这条草稿吗？")) return;
        try {
            const res = await secureFetch(`${CONFIG.draftUrl}/api/drafts?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("API Error");
            if (!isSilent) {
                cocoMessage.success("草稿已删除");
                // 🌟 修复：不再隐藏面板，直接传 true 开启无感静默刷新
                const wrap = $('recentListWrap');
                if (wrap.style.display === 'block' && wrap.dataset.type === 'draft') {
                    toggleDraftList(true);
                }
                // 如果删的是当前正在编辑的这篇，清空输入框
                if (STATE.draftId === id) cancelEdit(false);
            }
        } catch(err) {
            if (!isSilent) cocoMessage.error("删除草稿失败");
        }
    }
    function loadForEdit(path, sha, encodedRawText) {
        if (isPreviewMode) togglePreviewMode();
        STATE.draftId = null;
        const rawText = decodeURIComponent(encodedRawText);
        const frontMatterMatch = rawText.match(/^---\n([\s\S]*?)\n---/);
        const frontMatter = frontMatterMatch ? frontMatterMatch[1] : '';
        STATE.date = JingzheEditor.frontMatterScalar(frontMatter, 'date') || null;
        STATE.path = path; STATE.sha = sha;

        const locationName = JingzheEditor.frontMatterScalar(frontMatter, 'location');
        const latlng = JingzheEditor.frontMatterScalar(frontMatter, 'latlng');
        STATE.device = JingzheEditor.frontMatterScalar(frontMatter, 'device') || null;

        if (locationName && latlng) {
            const [lat, lng] = latlng.split(',');
            STATE.location = { name: locationName, lat: lat, lng: lng };
        } else {
            STATE.location = null;
        }
        renderLocation();

        contentEl.value = rawText.replace(/---[\s\S]*?---/, '').trim() + ' ';
        $('submitBtn').innerText = "修改";
        $('cancelBtn').style.display = 'inline-block';
        $('saveDraftBtn').style.display = 'none';
        if (STATE.emoji) { STATE.emoji.remove(); STATE.emoji = null; }

        contentEl.dispatchEvent(new Event('input'));
        dirtyState.clear();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function cancelEdit(showMsg = true) {
        if (isPreviewMode) togglePreviewMode();
        contentEl.value = ''; contentEl.style.height = 'auto';
        STATE.sha = STATE.path = STATE.date = STATE.location = STATE.draftId = STATE.device = null;
        renderLocation();

        $('submitBtn').innerText = "唠叨一下"; $('cancelBtn').style.display = 'none';
        $('saveDraftBtn').style.display = 'inline-block';
        if (STATE.emoji) { STATE.emoji.remove(); STATE.emoji = null; }
        JingzheEditor.removeDraft(CACHE_KEY);
        dirtyState.clear();

        if (showMsg) cocoMessage.info("已取消");
    }

    const tagSelector = $('tagSelector');
    tagSelector.style.display = 'none';

    function updateTagHighlight(items) {
        items.forEach((item, i) => { i === currentTagIndex ? item.classList.add('active') : item.classList.remove('active'); });
    }

    function insertSelectedTag(tag, keywordLength, cursorStart) {
        const before = contentEl.value.substring(0, cursorStart - keywordLength - 1);
        const after = contentEl.value.substring(cursorStart);
        const insertText = `#${tag} `;

        contentEl.value = before + insertText + after;
        contentEl.setSelectionRange(before.length + insertText.length, before.length + insertText.length);

        tagSelector.style.display = 'none'; contentEl.focus(); contentEl.dispatchEvent(new Event('input'));
    }

    tagSelector.addEventListener('mousedown', function(e) {
        const item = e.target.closest('.tag-item'); if (!item) return; e.preventDefault();
        const cursorPosition = contentEl.selectionStart;
        const match = contentEl.value.substring(0, cursorPosition).match(/(?:^|\s)#([^\s]*)$/);
        if (match) insertSelectedTag(filteredTags[item.dataset.index], match[1].length, cursorPosition);
    });

    function checkTagTrigger() {
        const cursorPosition = contentEl.selectionStart;
        const match = contentEl.value.substring(0, cursorPosition).match(/(?:^|\s)#([^\s]*)$/);

        if (match) {
            const keywordLower = match[1].toLowerCase();
            filteredTags = cachedTags.filter(t => t.toLowerCase().includes(keywordLower));
            if (filteredTags.length > 0) {
                tagSelector.innerHTML = filteredTags.map((t, i) => `<div class="tag-item" data-index="${i}"># ${t}</div>`).join('');
                tagSelector.style.display = 'grid'; currentTagIndex = -1;
            } else { tagSelector.style.display = 'none'; }
        } else { tagSelector.style.display = 'none'; }
    }

    contentEl.addEventListener('input', function() {
        this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px';
        checkTagTrigger(); scheduleSaveDraft(); dirtyState.mark();
    });

    contentEl.addEventListener('keyup', function(e) {
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tagSelector.style.display === 'none') checkTagTrigger();
    });

    contentEl.addEventListener('keydown', function(e) {
        if (tagSelector.style.display === 'grid') {
            const items = tagSelector.querySelectorAll('.tag-item');
            const total = items.length; const cols = 4;
            if (e.key === 'ArrowRight') { e.preventDefault(); currentTagIndex = currentTagIndex === -1 ? 0 : Math.min(currentTagIndex + 1, total - 1); updateTagHighlight(items); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); currentTagIndex = currentTagIndex === -1 ? 0 : Math.max(currentTagIndex - 1, 0); updateTagHighlight(items); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); currentTagIndex = currentTagIndex === -1 ? 0 : Math.min(currentTagIndex + cols, total - 1); updateTagHighlight(items); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); currentTagIndex = currentTagIndex === -1 ? 0 : Math.max(currentTagIndex - cols, 0); updateTagHighlight(items); }
            else if (e.key === 'Enter') {
                if (currentTagIndex >= 0) { e.preventDefault(); items[currentTagIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
                else { tagSelector.style.display = 'none'; }
            } else if (e.key === ' ' || e.key === 'Escape') { tagSelector.style.display = 'none'; }
        }
    });

    Object.assign(window, {
        cancelEdit,
        deleteCloudDraft,
        editLocation,
        insertBold,
        insertLink,
        loadCloudDraft,
        loadForEdit,
        logout,
        publishPost,
        removeLocation,
        saveCloudDraft,
        showEmoji,
        toggleDraftList,
        togglePreviewMode,
        toggleRecentList,
        verifyToken
    });
    initApp();
})();
