/* Memos JS 2026 Platinum Refactor - Final BugFix (Code Block) - 2026.02.02 */

(function() {
    'use strict';

    // ============================================================
    // 1. 核心配置与状态管理
    // ============================================================
    const lsPath = window.localStorage?.getItem("memos-access-path");
    const lsToken = window.localStorage?.getItem("memos-access-token");
    
    const baseMemos = lsPath ? (lsPath.endsWith('/') ? lsPath : lsPath + '/') : 'https://memos.koobai.com/';

    const CONFIG = {
        memos: baseMemos,
        limit: 16, 
        creatorId: '1', 
        domId: '#bber', 
        editorContainer: '#memos'
    };

    if (typeof window.bbMemos !== "undefined") Object.assign(CONFIG, window.bbMemos);

    const STATE = {
        mePage: 1, offset: 0, nextLength: 0, nextDom: [],
        memosOpenId: lsToken,
        memosPath: baseMemos,
        editorDisplay: window.localStorage?.getItem("memos-editor-display"),
        cache: { posts: null, movies: null },
        domRefs: {},
        isAuthorized: !!lsToken, 
        totalCount: 0,
        viewMode: 'ALL', 
        isRandomRender: false
    };

    let activeEmojiPicker = null;

    // ============================================================
    // 2. 网络请求封装
    // ============================================================
    async function memoFetch(url, method = 'GET', body = null) {
        if (!url) return null;
        
        const headers = { 'Content-Type': 'application/json' };
        if (STATE.memosOpenId) headers['Authorization'] = `Bearer ${STATE.memosOpenId}`;
        
        let fullUrl = url.startsWith('http') ? url : `${CONFIG.memos}${url.replace(/^\//, '')}`;

        if (method === 'GET') {
            const separator = fullUrl.includes('?') ? '&' : '?';
            fullUrl += `${separator}t=${Date.now()}`;
        }

        try {
            const res = await fetch(fullUrl, { method, headers, body: body ? JSON.stringify(body) : null });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) { return null; }
    }

    // ============================================================
    // 3. 初始化与事件委托
    // ============================================================
    document.addEventListener("DOMContentLoaded", async function () {
        const bbDom = document.querySelector(CONFIG.domId);
        if (!bbDom) return;

        const p = document.getElementById('temp-posts-data'), m = document.getElementById('temp-movies-data');
        if (p) STATE.cache.posts = p.innerHTML;
        if (m) STATE.cache.movies = m.innerHTML;

        getFirstList();
        initEditorLogic();

        document.body.addEventListener('click', handleGlobalClick);

        try {
            const res = await fetch('/suju/owo.json');
            const data = await res.json();
            window.emojisData = data.Emoji.container;
        } catch (e) {}
    });

    function handleGlobalClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const id = target.dataset.id;
        const val = target.dataset.val;

        switch (action) {
            case 'load-more':
                handleLoadMore(target);
                break;
            case 'tag-filter':
                handleTagFilter(val, target.innerText);
                break;
            case 'tag-reset': 
                reloadList();
                break;
            case 'load-artalk':
                handleLoadArtalk(id);
                break;
            case 'edit':
                handleEditMemo(target);
                break;
            case 'archive':
                handleArchiveMemo(id);
                break;
            case 'delete':
                handleDeleteMemo(id);
                break;
            case 'delete-image': 
                handleDeleteImage(target, id);
                break;
            case 'reload-private': 
                STATE.viewMode = 'PRIVATE';
                reloadList();
                break;
        }
    }

    // ============================================================
    // 4. 业务逻辑处理
    // ============================================================
    
    function handleLoadMore(btn) {
        btn.textContent = '加载中……';
        if (STATE.nextDom) updateHTMl(STATE.nextDom);
        
        if (STATE.nextLength < CONFIG.limit) {
            btn.remove();
        } else {
            getNextPage();
        }
    }

    function handleTagFilter(tagName, displayText) {
        window.scrollTo({ top: document.querySelector(CONFIG.domId).offsetTop - 30, behavior: "smooth" });
        document.querySelector('#tag-list').innerHTML = `
            <div class='memos-tag-sc-2' data-action="tag-reset">
                <div class='memos-tag-sc-1'>标签筛选:</div>
                <div class='memos-tag-sc'>${displayText}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-auto ml-1 opacity-40"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                </div>
            </div>`;
        
        memoFetch(`api/v1/memo?creatorId=${CONFIG.creatorId}&tag=${tagName}&limit=20`)
            .then(res => {
                const bbDom = document.querySelector(CONFIG.domId);
                bbDom.innerHTML = "";
                updateHTMl(res);
                document.querySelector("button.button-load")?.remove();
            });
    }

    function handleLoadArtalk(id) {
        const target = document.getElementById(`memo_${id}`);
        document.querySelectorAll("[id^='memo_']").forEach(el => { 
            if (el !== target) el.classList.add('hidden'); 
        });
        target.classList.toggle('hidden');
        if (!target.classList.contains('hidden') && typeof Artalk !== 'undefined') {
            Artalk.init({ 
                el: `#memo_${id}`, 
                pageKey: `/m/${id}`, 
                server: 'https://c.koobai.com/', 
                site: '空白唠叨', 
                darkMode: 'auto' 
            });
        }
    }

    function handleEditMemo(el) {
        if (!STATE.domRefs.editDom) return;
        
        const data = JSON.parse(decodeURIComponent(el.dataset.form));
        window.localStorage?.setItem("memos-editor-dataform", JSON.stringify(data));
        
        const { visSelect, textarea, submitBtn, editDom, imageList, editor } = STATE.domRefs;
        
        if (visSelect) visSelect.value = data.visibility;
        if (textarea) {
            textarea.value = data.content;
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        }
        
        if (submitBtn) submitBtn.classList.add("d-none");
        if (editDom) editDom.classList.remove("d-none");
        
        if (imageList) {
            imageList.innerHTML = '';
            const resList = data.resourceList || [];
            const resIds = resList.map(r => r.id);
            window.localStorage?.setItem("memos-resource-list", JSON.stringify(resIds));
            
            let imgHtml = '';
            resList.forEach(r => {
                const link = r.externalLink || `${STATE.memosPath}o/r/${r.id}`;
                imgHtml += `<div data-action="delete-image" data-id="${r.id}" class="imagelist-item d-flex text-xs mt-2 mr-2"><div class="d-flex memos-up-image" style="background-image:url(${link})"></div></div>`;
            });
            imageList.insertAdjacentHTML('afterbegin', imgHtml);
        }
        
        if (editor) {
            window.scrollTo({ top: editor.getBoundingClientRect().top + window.pageYOffset - 100, behavior: "smooth" });
        }
    }

    function handleArchiveMemo(id) {
        memoFetch(`api/v1/memo/${id}`, 'PATCH', { id, rowStatus: "ARCHIVED" })
            .then(() => { reloadList(); cocoMessage.success('归档成功'); })
            .catch(() => cocoMessage.error('操作失败'));
    }

    function handleDeleteMemo(id) {
        if (confirm("确定要删除此条唠叨吗？")) {
            memoFetch(`api/v1/memo/${id}`, 'DELETE')
                .then(() => { reloadList(); cocoMessage.success('删除成功'); })
                .catch(() => cocoMessage.error('删除失败'));
        }
    }

    function handleDeleteImage(el, id) {
        id = Number(id);
        let list = JSON.parse(window.localStorage?.getItem("memos-resource-list") || "[]");
        list = list.filter(item => item !== id);
        window.localStorage?.setItem("memos-resource-list", JSON.stringify(list));
        el.remove();
    }

    // ============================================================
    // 5. 数据加载与渲染
    // ============================================================
    function getFirstList() {
        const bbDom = document.querySelector(CONFIG.domId);
        bbDom.insertAdjacentHTML('beforebegin', '<div id="tag-list"></div>');
        STATE.mePage = 1; STATE.offset = 0;
        
        memoFetch(`api/v1/memo?creatorId=${CONFIG.creatorId}&rowStatus=NORMAL&limit=${CONFIG.limit}`).then(res => {
            if (res) {
                updateHTMl(res);
                if (res.length >= CONFIG.limit) {
                    bbDom.insertAdjacentHTML('afterend', '<div class="bb-load"><button class="load-btn button-load" data-action="load-more">看更多 ...</button></div>');
                    STATE.mePage++; STATE.offset = CONFIG.limit * (STATE.mePage - 1);
                    getNextPage();
                }
            }
        });
        loadRandomMemo();
    }

    function getNextPage() {
        let url = `api/v1/memo?creatorId=${CONFIG.creatorId}&rowStatus=NORMAL&limit=${CONFIG.limit}&offset=${STATE.offset}`;
        if (STATE.viewMode === 'PRIVATE') url += `&visibility=PRIVATE`;

        memoFetch(url).then(res => {
            if (!res) return;
            const finalData = STATE.viewMode === 'PRIVATE' ? res.filter(item => item.visibility === 'PRIVATE') : res;
            STATE.nextDom = finalData; 
            STATE.nextLength = res.length;
            STATE.mePage++; STATE.offset = CONFIG.limit * (STATE.mePage - 1);
            if (STATE.nextLength < 1) document.querySelector("button.button-load")?.remove();
        });
    }

    async function loadRandomMemo() {
        const oneDay = window.localStorage?.getItem("memos-oneday");
        if (oneDay == "open") {
            if (STATE.totalCount === 0) {
                const stats = await memoFetch(`api/v1/memo/stats?creatorId=${CONFIG.creatorId}`);
                if (stats && Array.isArray(stats)) {
                    const idx = stats.indexOf("NORMAL");
                    STATE.totalCount = idx > -1 ? stats[idx + 1] : stats.length;
                } else { STATE.totalCount = 10; }
            }
            const rnd = Math.floor(Math.random() * STATE.totalCount);
            memoFetch(`api/v1/memo?creatorId=${CONFIG.creatorId}&rowStatus=NORMAL&limit=1&offset=${rnd}`).then(res => {
                if (res && res.length > 0) {
                    STATE.isRandomRender = true; updateHTMl(res, "ONEDAY"); STATE.isRandomRender = false;
                }
            });
        }
    }

    function reloadList() {
        const bbDom = document.querySelector(CONFIG.domId);
        document.querySelector(".bb-load")?.remove();
        document.querySelector("#tag-list").innerHTML = ""; 
        
        STATE.mePage = 1; STATE.offset = 0; bbDom.innerHTML = '';
        
        let url = `api/v1/memo?creatorId=${CONFIG.creatorId}&rowStatus=NORMAL&limit=${CONFIG.limit}`;
        if (STATE.viewMode === 'PRIVATE') url += `&visibility=PRIVATE`;
        
        memoFetch(url).then(res => {
            if (!res) return;
            updateHTMl(res);
            if (res.length >= CONFIG.limit) {
                bbDom.insertAdjacentHTML('afterend', '<div class="bb-load"><button class="load-btn button-load" data-action="load-more">看更多 ...</button></div>');
                STATE.mePage++; STATE.offset = CONFIG.limit * (STATE.mePage - 1);
                getNextPage();
            }
            if (window.localStorage?.getItem("memos-oneday") == "open") loadRandomMemo();
        });
    }

    // 渲染 HTML
    const REG = { TAG: /#([^#\s!.,;:?"'()]+)(?= )/g, IMG: /\!\[(.*?)\]\((.*?)\)/g, LINK: /\[(.*?)\]\((.*?)\)/g };
    if (typeof marked !== 'undefined') marked.setOptions({ breaks: false, smartypants: false, headerIds: false, mangle: false });

    function updateHTMl(data, mode) {
        if (!data || !Array.isArray(data)) return;
        let result = "";
        const bbDom = document.querySelector(CONFIG.domId);
        const canEdit = STATE.isAuthorized && STATE.editorDisplay == "show";

        data.forEach((item, i) => {
            if (!STATE.isAuthorized && item.visibility !== 'PUBLIC') return;
            if (STATE.viewMode === 'PRIVATE' && item.visibility !== 'PRIVATE') return;

            let contentStr = item.content.replace(REG.TAG, "").replace(REG.IMG, "").replace(REG.LINK, '<a href="$2" target="_blank">$1</a>');
            let content = marked.parse(contentStr);
            
            const allImages = [];
            let match;
            while ((match = REG.IMG.exec(item.content)) !== null) allImages.push(match[2]);
            if (item.resourceList?.length > 0) {
                item.resourceList.forEach(res => {
                    if (res.type.startsWith('image')) allImages.push(res.externalLink || `${CONFIG.memos}o/r/${res.id}`);
                });
            }

            let imgHtml = '';
            if (allImages.length > 0) {
                imgHtml = `<div class="resimg grid grid-${allImages.length}">${allImages.map(src => 
                    `<figure class="gallery-thumbnail"><img loading="lazy" decoding="async" class="img thumbnail-image img-hide" onload="this.classList.remove('img-hide')" src="${src}" /></figure>`
                ).join('')}</div>`;
            }

            const tagHtml = (item.content.match(REG.TAG) || []).map(t => {
                const val = t.replace(/[#]/g, '');
                return `<div class="memos-tag-dg" data-action="tag-filter" data-val="${val}">#${val}</div>`;
            }).join('') || '<div class="memos-tag-dg">#日常</div>';

            const memoString = encodeURIComponent(JSON.stringify(item));
            const liClass = STATE.isRandomRender ? "memos-oneday-li img-hide" : "bb-list-li img-hide";

            const footer = item.visibility === 'PUBLIC' 
                ? `<div class="talks_comments"><a data-action="load-artalk" data-id="${item.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21a9 9 0 1 0-8-4.873L3 21l4.873-1c1.236.639 2.64 1 4.127 1"/><path stroke-width="3" d="M7.5 12h.01v.01H7.5zm4.5 0h.01v.01H12zm4.5 0h.01v.01H12zm4.5 0h.01v.01H12zm4.5 0h.01v.01h-.01z"/></svg><span id="btn_memo_${item.id}"></span></a></div>` 
                : `<div class="memos-hide" data-action="reload-private"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 14 14"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M1.68 4.206C2.652 6.015 4.67 7.258 7 7.258c2.331 0 4.348-1.243 5.322-3.052M2.75 5.596L.5 7.481m4.916-.415L4.333 9.794m6.917-4.198l2.25 1.885m-4.92-.415l1.083 2.728"/></svg></div>`;

            const editMenu = canEdit ? `<div class="memos-edit"><div class="memos-menu">...</div><div class="memos-menu-d">
                <div class="edit-btn" data-action="edit" data-form="${memoString}">修改</div>
                <div class="archive-btn" data-action="archive" data-id="${item.id}">归档</div>
                <div class="delete-btn" data-action="delete" data-id="${item.id}">删除</div></div></div>` : '';

            result += `<li class="${liClass}" id="${item.id}">
                <div class="memos-pl"><div class="memos_diaoyong_time">${moment(item.createdTs * 1000).twitterLong()}</div>${editMenu}</div>
                <div class="datacont" view-image>${content}${imgHtml}</div>
                <div class="memos_diaoyong_top"><div class="memos-tag-wz">${tagHtml}</div>${footer}</div>
                <div id="memo_${item.id}" class="artalk hidden"></div>
            </li>`;

            if (!mode && STATE.mePage <= 2) {
                const map = { 1: 0, 4: 1, 7: 2, 9: 3 };
                if (map[i] !== undefined && STATE.cache.posts) {
                    const tempDiv = document.createElement('div'); tempDiv.innerHTML = STATE.cache.posts;
                    const html = tempDiv.querySelectorAll('.one-post-item')[map[i]]?.innerHTML;
                    if (html) result += `<div class="inserted-post-section animated-fade-in">${html}</div>`;
                }
                if (i == 1 && STATE.cache.movies) result += `<div class="inserted-movies-section animated-fade-in"><div class="movies-grid-container">${STATE.cache.movies}</div></div>`;
            }
        });

        if (mode === "ONEDAY") {
            const old = bbDom.querySelector('.memos-oneday-layout'); if (old) old.remove();
            bbDom.insertAdjacentHTML('afterbegin', `<div id='memos-oneday-wrapper' class='memos-oneday-layout'><li class='memos-oneday'><ul class='oneday-ul-fix'>${result}</ul></li></div>`);
        } else {
            let listUl = bbDom.querySelector('.bb-list-ul');
            if (!listUl) bbDom.insertAdjacentHTML('beforeend', `<section class='bb-timeline'><ul class='bb-list-ul'>${result}</ul></section>`);
            else listUl.insertAdjacentHTML('beforeend', result);
            
            const loadBtn = document.querySelector('button.button-load');
            if (loadBtn) loadBtn.textContent = '看更多 ...';
        }
        
        if (typeof window.animateSummaries === 'function') window.animateSummaries();
        setTimeout(() => { document.querySelectorAll('.img-hide').forEach(img => { if(img.complete) img.classList.remove('img-hide'); }); }, 150);
    }

    // ============================================================
    // 6. 编辑器逻辑
    // ============================================================
    function initEditorLogic() {
        const container = document.querySelector(CONFIG.editorContainer), anchor = document.querySelector('.index-laodao-titile');
        if (!container || !anchor) return;
        
        anchor.insertAdjacentHTML('afterend', "<div class='load-memos-editor'>唠叨</div>");
        container.insertAdjacentHTML('afterbegin', getEditorHtml());

        STATE.domRefs = {
            editor: container.querySelector(".memos-editor"),
            textarea: container.querySelector(".memos-editor-textarea"),
            tagMenu: document.getElementById('memos-tag-menu'),
            visSelect: container.querySelector(".select-memos-value"),
            submitBtn: container.querySelector(".submit-memos-btn"),
            editDom: container.querySelector(".edit-memos"),
            pathInp: container.querySelector(".memos-path-input"),
            tokenInp: container.querySelector(".memos-token-input"),
            imageList: container.querySelector(".memos-image-list"),
            innerPanel: container.querySelector(".memos-editor-inner"),
            optionPanel: container.querySelector(".memos-editor-option")
        };

        bindEditorEvents();

        if (STATE.editorDisplay === "show") {
            STATE.domRefs.editor.classList.remove("d-none");
            if (!STATE.isAuthorized) {
                STATE.domRefs.optionPanel.classList.remove("d-none");
                STATE.domRefs.innerPanel.classList.add("d-none");
            } else {
                STATE.domRefs.innerPanel.classList.remove("d-none");
                STATE.domRefs.optionPanel.classList.add("d-none");
                memoFetch('api/v1/tag').then(t => window.memosTags = t);
            }
        }
    }

    function bindEditorEvents() {
        const refs = STATE.domRefs;

        document.querySelector(".load-memos-editor").addEventListener("click", () => {
            const h = refs.editor.classList.toggle("d-none");
            window.localStorage?.setItem("memos-editor-display", h ? "hide" : "show");
            if (!h && !STATE.isAuthorized) {
                refs.optionPanel.classList.remove("d-none");
                refs.innerPanel.classList.add("d-none");
            }
        });

        refs.textarea.addEventListener('input', () => {
            refs.textarea.style.height = 'auto';
            refs.textarea.style.height = refs.textarea.scrollHeight + 'px';
            refs.submitBtn.style.opacity = refs.textarea.value.trim() ? 1 : 0.4;
            
            const w = refs.textarea.value.slice(0, refs.textarea.selectionStart).split(/\s+/).pop();
            if (w && w.startsWith('#') && window.memosTags) {
                const match = window.memosTags.filter(t => t.toLowerCase().includes(w.slice(1).toLowerCase()));
                if (match.length) {
                    refs.tagMenu.innerHTML = match.map(t => `<div class="tag-option">#${t}</div>`).join('');
                    refs.tagMenu.style.display = 'block';
                    refs.tagMenu.onclick = (e) => {
                        if (e.target.classList.contains('tag-option')) {
                            insertText(e.target.innerText.replace('#', '') + ' ', '', 0, true); 
                            refs.tagMenu.style.display = 'none';
                        }
                    };
                    return;
                }
            }
            refs.tagMenu.style.display = 'none';
        });

        document.querySelector(".memos-editor-footer").addEventListener('click', (e) => {
            // [Fix]: Added .code-btn to delegation
            const t = e.target.closest('.action-btn, .private-btn, .oneday-btn, .switchUser-btn, .code-btn');
            if (!t) return;

            if (t.classList.contains('code-single')) insertText("``", "`", 1);
            else if (t.classList.contains('code-btn')) insertText("```\n\n```", "", 4);
            else if (t.classList.contains('link-btn')) insertText("[]()", "[", 1);
            else if (t.classList.contains('link-img')) insertText("![]()", "!", 1);
            else if (t.classList.contains('biao-qing')) showEmoji(t);
            else if (t.classList.contains('switchUser-btn')) {
                refs.optionPanel.classList.remove("d-none");
                refs.innerPanel.classList.add("d-none");
            }
            else if (t.classList.contains('private-btn')) {
                const isP = t.classList.toggle("private");
                refs.visSelect.value = isP ? "PRIVATE" : "PUBLIC";
                STATE.viewMode = isP ? 'PRIVATE' : 'ALL';
                cocoMessage.success(isP ? "只看私有" : "显示全部");
                reloadList();
            }
            else if (t.classList.contains('oneday-btn')) {
                const isO = window.localStorage?.getItem("memos-oneday");
                if (!isO) {
                    window.localStorage?.setItem("memos-oneday", "open");
                    cocoMessage.success("已开启回忆，请刷新");
                } else {
                    window.localStorage?.removeItem("memos-oneday");
                    cocoMessage.success("已退出回忆");
                    reloadList();
                }
            }
        });

        refs.submitBtn.addEventListener("click", async () => {
            if (!refs.textarea.value) return cocoMessage.info('内容不能为空');
            const res = await memoFetch(`api/v1/memo`, 'POST', { 
                content: refs.textarea.value, 
                visibility: refs.visSelect.value,
                resourceIdList: JSON.parse(window.localStorage?.getItem("memos-resource-list") || "[]")
            });
            if (res) { 
                const tags = refs.textarea.value.match(REG.TAG);
                if(tags) tags.forEach(t => memoFetch(`api/v1/tag`, 'POST', { name: t.replace('#', '') }));
                cocoMessage.success('唠叨成功'); reloadList(); 
                resetEditor();
            }
        });

        document.querySelector(".edit-memos-btn").addEventListener("click", async () => {
            const data = JSON.parse(window.localStorage?.getItem("memos-editor-dataform"));
            if (!data) return;

            const refs = STATE.domRefs;
            const currentVisibility = refs.visSelect.value;

            const body = {
                id: data.id,
                content: refs.textarea.value,
                visibility: currentVisibility,
                resourceIdList: JSON.parse(window.localStorage?.getItem("memos-resource-list") || "[]")
            };

            // 【核心逻辑】：如果从 PRIVATE 改为 PUBLIC，更新时间戳为现在
            if (data.visibility === 'PRIVATE' && currentVisibility === 'PUBLIC') {
                // Memos API 通常使用秒级时间戳
                body.createdTs = Math.floor(Date.now() / 1000);
            }

            await memoFetch(`api/v1/memo/${data.id}`, 'PATCH', body);
            cocoMessage.success('修改成功');
            resetEditor();
            reloadList();
        });

        document.querySelector(".cancel-edit-btn").addEventListener("click", resetEditor);

        // 验证逻辑（极简修复版）
        document.querySelector(".submit-openapi-btn").addEventListener("click", async () => {
            const p = refs.pathInp.value.trim().replace(/\/$/, "");
            const t = refs.tokenInp.value.trim();
            if (!p || !t) return cocoMessage.info('请填写完整信息');
            
            const fullPath = /^http/i.test(p) ? p : `https://${p}`;
            try {
                const res = await fetch(`${fullPath}/api/v1/tag?t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${t}` } });
                
                // 【核心修复点】：强制解析 JSON。如果填的是博客首页返回了 HTML，这里会报错跳到 catch，避免假成功
                const data = await res.json(); 

                // 增加 Array.isArray(data) 判断，确保返回的是 API 数据
                if (res.ok && Array.isArray(data)) {
                    window.localStorage.setItem("memos-access-path", fullPath);
                    window.localStorage.setItem("memos-access-token", t);
                    cocoMessage.success('验证成功');
                    setTimeout(() => location.reload(), 500);
                } else {
                    cocoMessage.error('验证失败：Token 无效');
                }
            } catch { 
                // 只要不是标准的 JSON 数据（比如 404 页面或普通网页），都会触发这里
                cocoMessage.error('错误，请检查'); 
            }
        });

        document.querySelector(".image-btn").addEventListener("click", () => document.querySelector(".memos-upload-image-input").click());
        document.querySelector(".memos-upload-image-input").addEventListener("change", (e) => {
            if (e.target.files.length > 0) uploadFile(e.target.files[0]);
        });
    }

    // ------------------------------------------------------------
    // 辅助工具函数
    // ------------------------------------------------------------
    function resetEditor() {
        const refs = STATE.domRefs;
        refs.textarea.value = ''; 
        refs.imageList.innerHTML = '';
        refs.editDom.classList.add("d-none"); 
        refs.submitBtn.classList.remove("d-none"); 
        window.localStorage?.removeItem("memos-resource-list");
        window.localStorage?.removeItem("memos-editor-dataform");
    }

    function insertText(text, wrap, offset, isTag = false) {
        const el = STATE.domRefs.textarea; el.focus();
        const start = el.selectionStart;
        if (isTag) {
            const before = el.value.slice(0, start);
            const hashIdx = before.lastIndexOf('#');
            if (hashIdx !== -1) {
                el.value = el.value.slice(0, hashIdx) + `#${text}` + el.value.slice(start);
                return;
            }
        }
        const end = el.selectionEnd;
        const sel = el.value.substring(start, end);
        let result = sel ? (wrap + sel + (wrap === '[' || wrap === '!' ? ']()' : wrap)) : text;
        el.value = el.value.substring(0, start) + result + el.value.substring(end);
        const pos = start + result.length - offset;
        el.setSelectionRange(pos, pos);
        el.dispatchEvent(new Event('input'));
    }

    async function uploadFile(file) {
        const form = new FormData(); form.append('file', file);
        try {
            cocoMessage.info('图片上传中...');
            const res = await fetch(`${STATE.memosPath}api/v1/resource/blob`, { method: 'POST', headers: { 'Authorization': `Bearer ${STATE.memosOpenId}` }, body: form }).then(r => r.json());
            const list = JSON.parse(window.localStorage?.getItem("memos-resource-list") || "[]"); list.push(res.id);
            window.localStorage?.setItem("memos-resource-list", JSON.stringify(list));
            STATE.domRefs.imageList.insertAdjacentHTML('afterbegin', `<div data-action="delete-image" data-id="${res.id}" class="imagelist-item d-flex text-xs mt-2 mr-2"><div class="d-flex memos-up-image" style="background-image:url(${res.externalLink || STATE.memosPath+'o/r/'+res.id})"></div></div>`);
            cocoMessage.success('上传成功');
        } catch { cocoMessage.error('上传失败'); }
    }

    function showEmoji(btn) {
        if (activeEmojiPicker) {
            activeEmojiPicker.remove();
            activeEmojiPicker = null;
            return;
        }
        
        const div = document.createElement('div'); 
        div.className = 'emoji-selector';
        div.innerHTML = window.emojisData.map(e => `<div class="emoji-item">${e.icon}</div>`).join('');
        
        div.onclick = (e) => { 
            if (e.target.classList.contains('emoji-item')) {
                insertText(e.target.innerText, '', 0); 
                // [Fix] Removed auto-close logic
            }
        };
        
        document.querySelector(".memos-editor-footer").after(div);
        activeEmojiPicker = div;
    }

    function getEditorHtml() {
        return `
        <div class="memos-editor animate__animated animate__fadeIn d-none col-12">
            <div class="memos-editor-body">
                <div class="memos-editor-inner animate__animated animate__fadeIn d-none">
                    <div class="memos-editor-content">
                        <textarea class="memos-editor-textarea text-sm" rows="1" placeholder="唠叨点什么..."></textarea>
                    </div>
                    <div id="memos-tag-menu" style="display:none;"></div>
                    <div class="memos-image-list d-flex flex-fill line-xl"></div>
                    
                    <div class="memos-editor-footer border-t">
                        <div class="d-flex">
                            <div class="button outline action-btn code-single" title="代码块">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>
                            </div>
                            <div class="button outline action-btn link-btn" title="链接">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M10.59 13.41c.41.39.41 1.03 0 1.42c-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0a5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24a2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24m2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0a5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24a2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24a.973.973 0 0 1 0-1.42"/></svg>
                            </div>
                            <div class="button outline action-btn link-img" title="图片链接">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1 2-2V5c0-1-1-2-2-2m0 15.92c-.02.03-.06.06-.08.08H3V5.08L3.08 5h17.83c.03.02.06.06.08.08v13.84zm-10-3.41L8.5 12.5L5 17h14l-4.5-6z"/></svg>
                            </div>
                            <div class="button outline action-btn biao-qing" title="表情">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>
                            </div>
                            
                            <div class="memos-more-ico">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M5 10a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4"/></g></svg>
                                <div class="memos-xiala">
                                    <div class="code-btn">代码</div>
                                    <div class="image-btn">图片<input class="memos-upload-image-input d-none" type="file" accept="image/*"></div>
                                    <div class="switchUser-btn">帐户</div>
                                    <div class="private-btn">私有</div>
                                    <div class="oneday-btn">回忆</div>
                                </div>
                            </div>
                        </div>

                        <div class="editor-submit d-flex flex-fill justify-content-end">
                            <div class="editor-selector select outline">
                                <select class="select-memos-value">
                                    <option value="PUBLIC">公开</option>
                                    <option value="PRIVATE">私有</option>
                                </select>
                            </div>
                            <div class="edit-memos d-none">
                                <div class="primary cancel-edit-btn">取消</div>
                                <div class="primary edit-memos-btn">修改完成</div>
                            </div>
                            <div class="primary submit-memos-btn">唠叨一下</div>
                        </div>
                    </div>
                </div>

                <div class="memos-editor-option animate__animated animate__fadeIn d-none">
                    <input name="memos-path-url" class="memos-path-input input-text col-6" type="text" placeholder="Memos 地址">
                    <input name="memos-token-url" class="memos-token-input input-text col-6" type="text" placeholder="Token">
                    <div class="memos-open-api-submit">
                        <div class="primary submit-openapi-btn">保存</div>
                    </div>
                </div>
            </div>
        </div>`;
    }
})();