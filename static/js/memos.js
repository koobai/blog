// 首页唠叨 / 用途：个人动态发布 / 适配 MEMOS v0.26+ (API v1) / 20260204 / koobai.com
(function() {
    'use strict';

    // ============================================================
    // 0. 全局常量、正则与样式注入
    // ============================================================
    const REG = {
        TAG: /#([^#\s!.,;:?"'()]+)(?= )/g,
        IMG: /\!\[(.*?)\]\((.*?)\)/g,
        LINK: /\[(.*?)\]\((.*?)\)/g
    };

    // 1. 页面 footer 隐藏
    document.head.insertAdjacentHTML('beforeend', '<style>.footer-background{display:none}</style>');

    // ============================================================
    // 1. 核心配置与状态管理
    // ============================================================
    const lsPath = window.localStorage?.getItem("memos-access-path");
    const lsToken = window.localStorage?.getItem("memos-access-token");
    const defaultMemos = 'https://memos.koobai.com/';

    // 优化 3: normalizeUrl 内联
    const baseMemos = (lsPath || defaultMemos).replace(/\/?$/, '/');

    const CONFIG = {
        memos: baseMemos,
        limit: 16,
        creatorId: '1',
        domId: '#bber',
        editorContainer: '#memos',
        ...window.bbMemos
    };

    const STATE = {
        mePage: 1,
        nextPageToken: "",
        nextDom: [],
        memosOpenId: lsToken,
        editorDisplay: window.localStorage?.getItem("memos-editor-display"),
        // 优化 4: 缓存合并并直接初始化
        cache: {
            posts: document.getElementById('temp-posts-data')?.innerHTML,
            movies: document.getElementById('temp-movies-data')?.innerHTML
        },
        domRefs: {},
        isAuthorized: !!lsToken,
        viewMode: 'ALL',
        isRandomRender: false,
        tags: new Set()
    };

    let activeEmojiPicker = null;

    // ============================================================
    // 2. 静态逻辑表 (优化 8: 避免重复创建闭包)
    // ============================================================
    const ACTIONS = {
        'load-more': (t) => handleLoadMore(t),
        'tag-filter': (t) => handleTagFilter(t.dataset.val, t.innerText),
        'tag-reset': () => reloadList(),
        'load-artalk': (t) => handleLoadArtalk(t.dataset.id),
        'edit': (t) => handleEditMemo(t),
        'archive': (t) => handleArchiveMemo(t.dataset.id),
        'delete': (t) => handleDeleteMemo(t.dataset.id),
        'delete-image': (t) => handleDeleteImage(t, t.dataset.id),
        'reload-private': () => { STATE.viewMode = 'PRIVATE'; reloadList(); }
    };

    // ============================================================
    // 3. 网络请求封装
    // ============================================================
    async function memoFetch(endpoint, method = 'GET', body = null) {
        if (!endpoint) return null;
        const headers = { 'Content-Type': 'application/json' };
        if (STATE.memosOpenId) headers['Authorization'] = `Bearer ${STATE.memosOpenId}`;

        let urlObj;
        try {
            urlObj = new URL(endpoint, CONFIG.memos);
        } catch (e) {
            console.error("Invalid URL", e);
            return null;
        }

        if (method === 'GET') urlObj.searchParams.set('t', Date.now());

        try {
            const res = await fetch(urlObj.href, { method, headers, body: body ? JSON.stringify(body) : null });
            if (!res.ok) throw new Error(res.status);
            if (method === 'DELETE') return true;
            return await res.json();
        } catch (e) {
            console.error(`[Memos API Error] ${method}`, e);
            return null;
        }
    }

    // ============================================================
    // 4. 数据适配器 (优化 1: 一次正则扫描)
    // ============================================================
    function adaptMemo(memo) {
        if (!memo) return null;
        const id = memo.name ? memo.name.split('/').pop() : memo.id;

        // 优化 1: 扫描一次完成：去标签、提图片、去链接
        const allImages = [];
        const memoTags = []; // ✅ 新增：用于存储当前 Memo 的标签
        
        let contentStr = (memo.content || '').replace(REG.TAG, (match, tag) => {
            STATE.tags.add(tag); // 全局收集（给编辑器用）
            memoTags.push(tag);  // ✅ 本地收集（给显示用）
            return ''; // 移除标签
        }).replace(REG.IMG, (match, alt, src) => {
            if (src.startsWith('resources/')) src = `${CONFIG.memos}file/${src}`;
            allImages.push(src); // 收集 Markdown 图片
            return ''; // 移除图片文本
        }).replace(REG.LINK, '<a href="$2" target="_blank">$1</a>'); // 转换链接

        // 处理资源列表图片
        const rawResources = memo.resources || memo.attachments || [];
        const resourceList = rawResources.map(r => {
            const rId = r.id || (r.name ? r.name.split('/').pop() : '');
            const rName = r.name || `resources/${rId}`;
            const rFilename = r.filename || '';
            const type = r.type || r.mimeType || 'image/*';
            const suffix = rFilename ? `/${rFilename}` : '';
            const src = r.externalLink || `${CONFIG.memos}file/${rName}${suffix}`;
            if (type.startsWith('image')) allImages.push(src);
            return { id: rId, name: rName, filename: rFilename, externalLink: r.externalLink, type, src };
        });

        // 引用关系
        const relations = { inbound: [], outbound: [] };
        if (memo.relations) {
            memo.relations.forEach(rel => {
                if (rel.relatedMemo.name === memo.name) relations.inbound.push(rel.memo);
                else relations.outbound.push(rel.relatedMemo);
            });
        }

        return {
            ...memo,
            id: id,
            state: memo.state || 'NORMAL',
            createdTs: memo.createTime ? Math.floor(new Date(memo.createTime).getTime() / 1000) : Date.now() / 1000,
            contentHtml: typeof marked !== 'undefined' ? marked.parse(contentStr) : contentStr,
            contentRaw: memo.content, 
            resourceList,
            imageUrls: allImages,
            tags: memoTags, // ✅ 明确返回处理后的标签数组，防止渲染时 undefined 报错
            relations,
            location: memo.location || memo.property?.location
        };
    }

    // ============================================================
    // 5. 初始化与事件委托
    // ============================================================
    document.addEventListener("DOMContentLoaded", () => {
        const bbDom = document.querySelector(CONFIG.domId);
        if (!bbDom) return;

        const anchor = document.querySelector('.index-laodao-titile');
        if (anchor && !document.querySelector('.load-memos-editor')) {
            anchor.insertAdjacentHTML('afterend', "<div class='load-memos-editor'>唠叨</div>");
        }

        document.querySelector(".load-memos-editor")?.addEventListener('click', toggleEditor);

        if (STATE.editorDisplay === "show") initEditorLogic();

        getFirstList();

        // 全局委托
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (target && ACTIONS[target.dataset.action]) {
                e.stopPropagation();
                ACTIONS[target.dataset.action](target);
            }
        });
        
        if (typeof marked !== 'undefined') {
            marked.setOptions({ breaks: false, smartypants: false, headerIds: false, mangle: false });
        }
    });

    function toggleEditor() {
        let editor = document.querySelector(".memos-editor");
        if (!editor) {
            initEditorLogic();
            editor = document.querySelector(".memos-editor");
            editor.classList.remove("d-none");
            window.localStorage?.setItem("memos-editor-display", "show");
        } else {
            const isHiddenNow = editor.classList.toggle("d-none");
            window.localStorage?.setItem("memos-editor-display", isHiddenNow ? "hide" : "show");
        }
    }

    // ============================================================
    // 6. 业务逻辑处理
    // ============================================================
    // 优化 6: 简化 handleLoadMore
    async function handleLoadMore(btn) {
        btn.textContent = '加载中……';
        
        // 如果没有预加载数据，且有下一页token，先请求
        if (!STATE.nextDom.length && STATE.nextPageToken) {
            await getNextPage();
        }

        if (STATE.nextDom.length) {
            STATE.mePage++;
            updateHTMl(STATE.nextDom);
            STATE.nextDom = [];
            // 预加载下一页
            if (STATE.nextPageToken) {
                getNextPage();
                btn.textContent = '看更多 ...';
            } else {
                btn.remove();
            }
        } else {
            btn.remove();
        }
    }

    function handleTagFilter(tagName, displayText) {
        const top = document.querySelector(CONFIG.domId).offsetTop - 30;
        window.scrollTo({ top, behavior: "smooth" });

        document.querySelector('#tag-list').innerHTML = `
            <div class='memos-tag-sc-2' data-action="tag-reset">
                <div class='memos-tag-sc-1'>标签筛选:</div>
                <div class='memos-tag-sc'>${displayText}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-auto ml-1 opacity-40"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                </div>
            </div>`;
        
        fetchMemosAndRender(new URLSearchParams({
            filter: `'${tagName}' in tags`, 
            pageSize: 20,
            parent: `users/${CONFIG.creatorId}`
        }), true);
    }

    function handleLoadArtalk(id) {
        if (typeof Artalk === 'undefined') return;
        const target = document.getElementById(`memo_${id}`);
        document.querySelectorAll(".artalk:not(.hidden)").forEach(el => {
            if (el !== target) el.classList.add('hidden');
        });
        target.classList.toggle('hidden');
        if (!target.classList.contains('hidden')) {
            Artalk.init({ el: `#memo_${id}`, pageKey: `/memos/${id}`, server: 'https://c.koobai.com/', site: '空白唠叨', darkMode: 'auto' });
        }
    }

    function handleEditMemo(el) {
        if (!STATE.domRefs.editDom) return;
        const data = JSON.parse(decodeURIComponent(el.dataset.form));
        window.localStorage?.setItem("memos-editor-dataform", JSON.stringify(data));
        
        const refs = STATE.domRefs;
        refs.visSelect.value = data.visibility;
        refs.textarea.value = data.contentRaw || data.content;
        autoHeight(refs.textarea);
        
        refs.submitBtn.classList.add("d-none");
        refs.editDom.classList.remove("d-none");
        refs.imageList.innerHTML = '';
        
        const currentResourceIds = data.resourceList ? data.resourceList.map(r => r.id) : [];
        window.localStorage?.setItem("memos-resource-list", JSON.stringify(currentResourceIds));
        
        if (data.resourceList?.length) {
            const imgHtml = data.resourceList.map(r => 
                `<div class="imagelist-item d-flex text-xs mt-2 mr-2"><div class="d-flex memos-up-image" style="background-image:url(${r.src})"></div></div>`
            ).join('');
            refs.imageList.insertAdjacentHTML('afterbegin', imgHtml);
        }
        refs.editor?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // 优化 2: 简化 performAction
    async function performAction(url, method, body, successMsg) {
        const res = await memoFetch(url, method, body);
        if (res !== null) {
            reloadList();
            cocoMessage.success(successMsg);
        }
    }

    function handleArchiveMemo(id) {
        performAction(`api/v1/memos/${id}?updateMask=state`, 'PATCH', { state: "ARCHIVED" }, '归档成功');
    }

    function handleDeleteMemo(id) {
        if (confirm("确定要删除此条唠叨吗？")) {
            performAction(`api/v1/memos/${id}`, 'DELETE', null, '删除成功');
        }
    }

    function handleDeleteImage(el, id) {
        let list = JSON.parse(window.localStorage?.getItem("memos-resource-list") || "[]");
        list = list.filter(item => String(item) !== String(id));
        window.localStorage?.setItem("memos-resource-list", JSON.stringify(list));
        el.remove();
    }

    // ============================================================
    // 7. 数据加载与渲染
    // ============================================================
    function fetchMemosAndRender(params, clearDom = false) {
        const bbDom = document.querySelector(CONFIG.domId);
        if (clearDom) {
            bbDom.innerHTML = "";
            document.querySelector("button.button-load")?.remove();
        }

        return memoFetch(`api/v1/memos?${params.toString()}`).then(res => {
            if (res?.memos) {
                const adaptedData = res.memos.map(adaptMemo);
                updateHTMl(adaptedData);
                if (res.nextPageToken) {
                    STATE.nextPageToken = res.nextPageToken;
                    if (!document.querySelector("button.button-load")) {
                        bbDom.insertAdjacentHTML('afterend', '<div class="bb-load"><button class="load-btn button-load" data-action="load-more">看更多 ...</button></div>');
                    }
                    if(!clearDom) getNextPage();
                }
            }
        });
    }

    function getFirstList() {
        const bbDom = document.querySelector(CONFIG.domId);
        if(!document.getElementById('tag-list')) bbDom.insertAdjacentHTML('beforebegin', '<div id="tag-list"></div>');
        STATE.mePage = 1; STATE.nextPageToken = "";
        fetchMemosAndRender(new URLSearchParams({ pageSize: CONFIG.limit, parent: `users/${CONFIG.creatorId}` }));
        loadRandomMemo();
    }

    function getNextPage() {
        if (!STATE.nextPageToken) return Promise.resolve();
        return memoFetch(`api/v1/memos?${new URLSearchParams({ pageSize: CONFIG.limit, pageToken: STATE.nextPageToken, parent: `users/${CONFIG.creatorId}` }).toString()}`).then(res => {
            if (res?.memos) {
                STATE.nextDom = res.memos.map(adaptMemo);
                STATE.nextPageToken = res.nextPageToken || "";
            }
        });
    }

    function reloadList() {
        document.querySelector(".bb-load")?.remove();
        document.querySelector("#tag-list").innerHTML = "";
        STATE.mePage = 1; STATE.nextPageToken = "";
        fetchMemosAndRender(new URLSearchParams({ pageSize: CONFIG.limit, parent: `users/${CONFIG.creatorId}` }), true);
        if (window.localStorage?.getItem("memos-oneday") === "open") loadRandomMemo();
    }

    async function loadRandomMemo() {
        if (window.localStorage?.getItem("memos-oneday") !== "open") return;
        const res = await memoFetch(`api/v1/memos?${new URLSearchParams({ pageSize: 50, parent: `users/${CONFIG.creatorId}` }).toString()}`);
        if (res?.memos?.length) {
            const rnd = Math.floor(Math.random() * res.memos.length);
            STATE.isRandomRender = true;
            updateHTMl([adaptMemo(res.memos[rnd])], "ONEDAY");
            STATE.isRandomRender = false;
        }
    }

    // 优化 5: 提升 renderRelations
    function renderRelations(rels, label) {
        if (!rels || rels.length === 0) return '';
        const items = rels.map(r => {
            const rId = (r.name || r.id || '').split('/').pop();
            const rContent = r.snippet || r.content || `Memo ${rId}`;
            return `<a href="${CONFIG.memos}memos/${rId}" target="_blank" class="memo-relation-item"><span class="memo-relation-content text-sm">${rContent}</span></a>`;
        }).join('');
        return `<div class="memo-relation-wrapper"><div class="memo-relation-label"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>${label} (${rels.length})</div>${items}</div>`;
    }

    // 优化 7: 抽离 render 判断
    function canRender(item) {
        if (item.state === 'ARCHIVED') return false;
        if (!STATE.isAuthorized && !['PUBLIC', 'PROTECTED'].includes(item.visibility)) return false;
        if (STATE.viewMode === 'PRIVATE' && item.visibility !== 'PRIVATE') return false;
        return true;
    }

    function updateHTMl(data, mode) {
        if (!data?.length) return;
        const bbDom = document.querySelector(CONFIG.domId);
        const canEdit = STATE.isAuthorized && STATE.editorDisplay === "show";
        let result = "";

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            if (!canRender(item)) continue; // 优化 7

            const imgHtml = item.imageUrls.length > 0 ? `<div class="resimg grid grid-${item.imageUrls.length}">${item.imageUrls.map(src => `<figure class="gallery-thumbnail"><img loading="lazy" decoding="async" class="img thumbnail-image img-hide" onload="this.classList.remove('img-hide')" src="${src}" /></figure>`).join('')}</div>` : '';
            const tagHtml = item.tags.length > 0 ? Array.from(new Set(item.tags)).map(val => `<div class="memos-tag-dg" data-action="tag-filter" data-val="${val}">#${val}</div>`).join('') : `<div class="memos-tag-dg">#日常</div>`;
            
            const outboundHtml = renderRelations(item.relations?.outbound, "引用");
            const inboundHtml = renderRelations(item.relations?.inbound, "被引用");

            let locationHtml = '';
            if (item.location && item.location.placeholder) {
                locationHtml = `<div class="memo-location-wrapper"><svg class="memo-location-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg><span class="memo-location-text">${item.location.placeholder}</span></div>`;
            }

            const footer = (['PUBLIC', 'PROTECTED'].includes(item.visibility)) ? `<div class="talks_comments"><a data-action="load-artalk" data-id="${item.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21a9 9 0 1 0-8-4.873L3 21l4.873-1c1.236.639 2.64 1 4.127 1"/><path stroke-width="3" d="M7.5 12h.01v.01H7.5zm4.5 0h.01v.01H12zm4.5 0h.01v.01H12zm4.5 0h.01v.01H12zm4.5 0h.01v.01H12z"/></svg><span id="btn_memo_${item.id}"></span></a></div>` : `<div class="memos-hide" data-action="reload-private"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 14 14"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M1.68 4.206C2.652 6.015 4.67 7.258 7 7.258c2.331 0 4.348-1.243 5.322-3.052M2.75 5.596L.5 7.481m4.916-.415L4.333 9.794m6.917-4.198l2.25 1.885m-4.92-.415l1.083 2.728"/></svg></div>`;
            const editMenu = canEdit ? `<div class="memos-edit"><div class="memos-menu">...</div><div class="memos-menu-d"><div class="edit-btn" data-action="edit" data-form="${encodeURIComponent(JSON.stringify(item))}">修改</div><div class="archive-btn" data-action="archive" data-id="${item.id}">归档</div><div class="delete-btn" data-action="delete" data-id="${item.id}">删除</div></div></div>` : '';
            const timeStr = typeof moment !== 'undefined' ? moment(item.createdTs * 1000).twitterLong() : new Date(item.createdTs * 1000).toLocaleString();
            
            result += `<li class="${STATE.isRandomRender ? "memos-oneday-li" : "bb-list-li img-hide"}" id="${item.id}"><div class="memos-pl"><div class="memos_diaoyong_time">${timeStr}</div>${editMenu}</div><div class="datacont" view-image>${item.contentHtml}${imgHtml}${outboundHtml}${inboundHtml}</div><div class="memos_diaoyong_top"><div class="memos-tag-wz">${tagHtml}</div>${locationHtml}${footer}</div><div id="memo_${item.id}" class="artalk hidden"></div></li>`;

            if (!mode && STATE.mePage === 1) {
                if (STATE.cache.posts && [1, 4, 7, 9].includes(i)) {
                    const tmp = document.createElement('div'); tmp.innerHTML = STATE.cache.posts;
                    const html = tmp.querySelectorAll('.one-post-item')[[1, 4, 7, 9].indexOf(i)]?.innerHTML;
                    if (html) result += `<div class="inserted-post-section animated-fade-in">${html}</div>`;
                }
                if (i === 1 && STATE.cache.movies) result += `<div class="inserted-movies-section animated-fade-in"><div class="movies-grid-container">${STATE.cache.movies}</div></div>`;
            }
        }

        if (mode === "ONEDAY") {
            const old = bbDom.querySelector('.memos-oneday-layout'); if (old) old.remove();
            bbDom.insertAdjacentHTML('afterbegin', `<div id='memos-oneday-wrapper' class='memos-oneday-layout'><li class='memos-oneday img-hide'><ul class='oneday-ul-fix'>${result}</ul></li></div>`);
        } else {
            let listUl = bbDom.querySelector('.bb-list-ul');
            if (!listUl) bbDom.insertAdjacentHTML('beforeend', `<section class='bb-timeline'><ul class='bb-list-ul'>${result}</ul></section>`);
            else listUl.insertAdjacentHTML('beforeend', result);
            const loadBtn = document.querySelector('button.button-load');
            if (loadBtn) loadBtn.textContent = '看更多 ...';
        }
        
        if (typeof window.animateSummaries === 'function') window.animateSummaries();
        // 页面footer 显示
        const footerDiv = document.querySelector('.footer-background');
        if (footerDiv) footerDiv.style.display = 'block';
        setTimeout(() => { document.querySelectorAll('.img-hide').forEach(img => { if(img.complete) img.classList.remove('img-hide'); }); }, 150);
    }

    // ============================================================
    // 8. 编辑器逻辑
    // ============================================================
    function initEditorLogic() {
        const container = document.querySelector(CONFIG.editorContainer);
        if (!container || document.querySelector(".memos-editor")) return;
        
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

        const panelToShow = STATE.isAuthorized ? STATE.domRefs.innerPanel : STATE.domRefs.optionPanel;
        const panelToHide = STATE.isAuthorized ? STATE.domRefs.optionPanel : STATE.domRefs.innerPanel;
        panelToShow.classList.remove("d-none");
        panelToHide.classList.add("d-none");
        
        if (STATE.editorDisplay === "show") STATE.domRefs.editor.classList.remove("d-none");
    }

    function autoHeight(elem) {
        elem.style.height = 'auto';
        elem.style.height = elem.scrollHeight + 'px';
    }

    function bindEditorEvents() {
        const refs = STATE.domRefs;
        let tagIdx = 0;
        
        refs.textarea.addEventListener('input', () => {
            autoHeight(refs.textarea);
            refs.submitBtn.style.opacity = refs.textarea.value.trim() ? 1 : 0.4;
            const w = refs.textarea.value.slice(0, refs.textarea.selectionStart).split(/\s+/).pop();
            const tagsArr = Array.from(STATE.tags);
            const matches = (w?.startsWith('#') && tagsArr.length) ? tagsArr.filter(t => t.toLowerCase().includes(w.slice(1).toLowerCase())) : [];
            
            if (matches.length) {
                tagIdx = 0;
                refs.tagMenu.innerHTML = matches.map((t, i) => `<div class="tag-option${i === 0 ? ' selected' : ''}">#${t}</div>`).join('');
                refs.tagMenu.style.display = 'block';
            } else {
                refs.tagMenu.style.display = 'none';
            }
        });

        refs.tagMenu.onclick = (e) => {
            if (e.target.classList.contains('tag-option')) {
                insertText(e.target.innerText.replace('#', '') + ' ', '', 0, true);
                refs.tagMenu.style.display = 'none';
            }
        };

        refs.textarea.addEventListener('keydown', (e) => {
            if (refs.tagMenu.style.display !== 'block') return;
            const options = refs.tagMenu.querySelectorAll('.tag-option');
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                options[tagIdx].classList.remove('selected');
                tagIdx = (tagIdx + (e.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
                options[tagIdx].classList.add('selected');
            } else if (e.key === 'Enter') {
                e.preventDefault();
                insertText(options[tagIdx].innerText.replace('#', '') + ' ', '', 0, true);
                refs.tagMenu.style.display = 'none';
            }
        });

        document.querySelector(".memos-editor-footer").addEventListener('click', (e) => {
            const t = e.target.closest('.action-btn, .private-btn, .oneday-btn, .switchUser-btn, .code-btn');
            if (!t) return;

            // 优化 8: 使用 Object 查表替代 switch
            const EDIT_ACTIONS = {
                'code-single': () => insertText("``", "`", 1),
                'code-btn': () => insertText("```\n\n```", "", 4),
                'link-btn': () => insertText("[]()", "[", 1),
                'link-img': () => insertText("![]()", "!", 1),
                'biao-qing': () => showEmoji(t),
                'switchUser-btn': () => {
                    ['memos-access-path', 'memos-access-token', 'memos-editor-display', 'memos-oneday', 'memos-resource-list'].forEach(k => window.localStorage.removeItem(k));
                    location.reload();
                },
                'private-btn': () => {
                    const isP = t.classList.toggle("private");
                    refs.visSelect.value = isP ? "PRIVATE" : "PUBLIC";
                    STATE.viewMode = isP ? 'PRIVATE' : 'ALL';
                    cocoMessage.success(isP ? "只看私有" : "显示全部");
                    reloadList();
                },
                'oneday-btn': () => {
                    const key = "memos-oneday";
                    if (!window.localStorage.getItem(key)) {
                        window.localStorage.setItem(key, "open");
                        cocoMessage.success("已开启回忆，请刷新");
                    } else {
                        window.localStorage.removeItem(key);
                        cocoMessage.success("已退出回忆");
                        reloadList();
                    }
                }
            };
            
            // 查找匹配的 class 并执行
            for (const cls in EDIT_ACTIONS) {
                if (t.classList.contains(cls)) { EDIT_ACTIONS[cls](); break; }
            }
        });

        refs.submitBtn.addEventListener("click", async () => {
            if (!refs.textarea.value.trim()) return cocoMessage.info('内容不能为空');
            const resIds = JSON.parse(window.localStorage?.getItem("memos-resource-list") || "[]");
            const body = { 
                content: refs.textarea.value, 
                visibility: refs.visSelect.value,
                resources: resIds.map(id => ({ name: `resources/${id}` }))
            };
            const res = await memoFetch(`api/v1/memos`, 'POST', body);
            if (res) { cocoMessage.success('唠叨成功'); reloadList(); resetEditor(); }
        });

        document.querySelector(".edit-memos-btn").addEventListener("click", async () => {
            const data = JSON.parse(window.localStorage?.getItem("memos-editor-dataform"));
            if (!data) return;
            const currentVis = refs.visSelect.value;
            const updateMask = ["content", "visibility"];
            const body = { content: refs.textarea.value, visibility: currentVis };
            if (data.visibility === 'PRIVATE' && currentVis === 'PUBLIC') {
                body.createTime = new Date().toISOString();
                updateMask.push("create_time");
            }
            const res = await memoFetch(`api/v1/memos/${data.id}?updateMask=${updateMask.join(',')}`, 'PATCH', body);
            if (res) { cocoMessage.success('修改成功'); resetEditor(); reloadList(); }
            else { cocoMessage.error('修改失败'); }
        });

        document.querySelector(".cancel-edit-btn").addEventListener("click", resetEditor);

        document.querySelector(".submit-openapi-btn").addEventListener("click", async () => {
            let p = refs.pathInp.value.trim().replace(/\/$/, "");
            const t = refs.tokenInp.value.trim();
            if (!p || !t) return cocoMessage.info('请填写完整信息');
            if (!/^http/i.test(p)) p = `https://${p}`;
            try {
                const res = await fetch(`${p}/api/v1/auth/me`, { method: 'GET', headers: { 'Authorization': `Bearer ${t}` } });
                if (res.ok) {
                    window.localStorage.setItem("memos-access-path", p);
                    window.localStorage.setItem("memos-access-token", t);
                    cocoMessage.success('验证成功');
                    setTimeout(() => location.reload(), 500);
                } else {
                    cocoMessage.error('验证失败：Token 无效');
                }
            } catch { cocoMessage.error('请求出错，请检查网络'); }
        });
    }

    function resetEditor() {
        const refs = STATE.domRefs;
        refs.textarea.value = '';
        refs.textarea.style.height = 'auto';
        refs.submitBtn.style.opacity = 0.4;
        refs.imageList.innerHTML = '';
        refs.editDom.classList.add("d-none");
        refs.submitBtn.classList.remove("d-none");
        ['memos-resource-list', 'memos-editor-dataform'].forEach(k => window.localStorage.removeItem(k));
    }

    function insertText(text, wrap, offset, isTag = false) {
        const el = STATE.domRefs.textarea; el.focus();
        const start = el.selectionStart;
        if (isTag) {
            const before = el.value.slice(0, start);
            const hashIdx = before.lastIndexOf('#');
            if (hashIdx !== -1) {
                el.value = before.slice(0, hashIdx) + `#${text}` + el.value.slice(start);
                el.dispatchEvent(new Event('input'));
                return;
            }
        }
        const end = el.selectionEnd;
        const sel = el.value.substring(start, end);
        const result = sel ? `${wrap}${sel}${wrap === '[' || wrap === '!' ? ']()' : wrap}` : text;
        el.setRangeText(result, start, end, 'end');
        el.setSelectionRange(start + result.length - offset, start + result.length - offset);
        el.dispatchEvent(new Event('input'));
    }

    async function showEmoji(btn) {
        if (activeEmojiPicker) { activeEmojiPicker.remove(); activeEmojiPicker = null; return; }
        if (!window.emojisData) {
            try {
                const data = await fetch('/suju/owo.json').then(r => r.json());
                window.emojisData = data.Emoji.container;
            } catch { window.emojisData = []; }
        }
        const div = document.createElement('div');
        div.className = 'emoji-selector';
        div.innerHTML = window.emojisData.map(e => `<div class="emoji-item" title="${e.text}">${e.icon}</div>`).join('');
        div.onclick = (e) => { 
            if (e.target.classList.contains('emoji-item')) insertText(e.target.innerText, '', 0); 
        };
        document.querySelector(".memos-editor-footer")?.after(div);
        activeEmojiPicker = div;
    }

    function getEditorHtml() {
        return `
        <div class="memos-editor animate__animated animate__fadeIn d-none col-12">
            <div class="memos-editor-body">
                <div class="memos-editor-inner animate__animated animate__fadeIn d-none">
                    <div class="memos-editor-content"><textarea class="memos-editor-textarea text-sm" rows="1" placeholder="唠叨点什么..."></textarea></div>
                    <div id="memos-tag-menu" style="display:none;"></div>
                    <div class="memos-image-list d-flex flex-fill line-xl"></div>
                    <div class="memos-editor-footer border-t">
                        <div class="d-flex">
                            <div class="button outline action-btn code-single" title="代码块"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg></div>
                            <div class="button outline action-btn link-btn" title="链接"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M10.59 13.41c.41.39.41 1.03 0 1.42c-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0a5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24a2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24m2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0a5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24a2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24a.973.973 0 0 1 0-1.42"/></svg></div>
                            <div class="button outline action-btn link-img" title="图片链接"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1 2-2V5c0-1-1-2-2-2m0 15.92c-.02.03-.06.06-.08.08H3V5.08L3.08 5h17.83c.03.02.06.06.08.08v13.84zm-10-3.41L8.5 12.5L5 17h14l-4.5-6z"/></svg></div>
                            <div class="button outline action-btn biao-qing" title="表情"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg></div>
                            <div class="memos-more-ico"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M5 10a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4"/></g></svg>
                                <div class="memos-xiala"><div class="code-btn">代码</div><div class="private-btn">私有</div><div class="oneday-btn">回忆</div><div class="switchUser-btn">退出</div></div>
                            </div>
                        </div>
                        <div class="editor-submit d-flex flex-fill justify-content-end">
                            <div class="editor-selector select outline"><select class="select-memos-value"><option value="PUBLIC">公开</option><option value="PRIVATE">私有</option></select></div>
                            <div class="edit-memos d-none"><div class="primary cancel-edit-btn">取消</div><div class="primary edit-memos-btn">修改完成</div></div>
                            <div class="primary submit-memos-btn">唠叨一下</div>
                        </div>
                    </div>
                </div>
                <div class="memos-editor-option animate__animated animate__fadeIn d-none">
                    <input name="memos-path-url" class="memos-path-input input-text col-6" type="text" placeholder="Memos 地址">
                    <input name="memos-token-url" class="memos-token-input input-text col-6" type="text" placeholder="Token">
                    <div class="memos-open-api-submit"><div class="primary submit-openapi-btn">保存</div></div>
                </div>
            </div>
        </div>`;
    }
})();