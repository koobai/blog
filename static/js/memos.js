// 首页唠叨 / 用途：个人动态发布 / 适配 MEMOS v0.26.1+ (API v1) / 20260222 / koobai.com
(function() {
    'use strict';

    // ============================================================
    // 0. 全局常量、正则与样式注入
    // ============================================================
    const REG = {
        TAG: /(?<=^|\s)#([^#\s!.,;:?"'()]+)/g,
        IMG: /\!\[(.*?)\]\((.*?)\)/g,
        LINK: /\[(.*?)\]\((.*?)\)/g
    };

    //上传图片链接替换
    function cleanImage(url) {
        if (!url || !url.includes('upyun.com')) return url;
        return url.replace(/https?:\/\/.*\.upyun\.com\/koobaiblogimg/, 'https://img.koobai.com').split('?')[0];
    }
    // ============================================================
    // 1. 核心配置与状态管理
    // ============================================================
    const lsPath = window.localStorage?.getItem("memos-access-path");
    const lsToken = window.localStorage?.getItem("memos-access-token");
    const defaultMemos = 'https://memos.koobai.com';

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

    const getResUrl = (resourceName, filename = '') => 
        `${CONFIG.memos}file/${resourceName}${filename ? `/${filename}` : ''}`;

    // 地理位置
    const GeoHelper = {
        getPosition: () => new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject("浏览器不支持定位");
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        }),
        getAddress: async (lat, lon) => {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
                headers: { 'Accept-Language': 'zh-CN' }
            });
            const data = await res.json();
            const addr = data.address;
            return addr.district || addr.county || addr.town || addr.city || addr.village || data.display_name.split(',')[0];
        }
    };

    const STATE = {
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
        tags: new Set(),
        editorLocation: null
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
        'pin': (t) => handlePinMemo(t.dataset.id, t.dataset.pinned === 'true'),
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

        const urlObj = new URL(endpoint, CONFIG.memos);

        if (method === 'GET') urlObj.searchParams.set('t', Date.now());

        try {
            const res = await fetch(urlObj.href, { method, headers, body: body ? JSON.stringify(body) : null });
            if (res.status === 401) {
                ['memos-access-path', 'memos-access-token', 'memos-editor-display', 'memos-oneday', 'memos-resource-list'].forEach(k => window.localStorage.removeItem(k));
                location.reload();
            }
            if (!res.ok) throw new Error(res.status);
            if (method === 'DELETE') return true;
            return await res.json();
        } catch (e) {
            console.error(`[Memos API Error] ${method}`, e);
            return null;
        }
    }

    // ============================================================
    // 4. 数据适配器
    // ============================================================
    function adaptMemo(memo) {
        if (!memo) return null;
        const id = memo.name ? memo.name.split('/').pop() : memo.id;

        const allImages = [];
        const memoTags = []; 
        
        // 2. 扫描一次完成：去标签、提图片、去链接
        let contentStr = (memo.content || '').replace(REG.TAG, (match, tag) => {
            STATE.tags.add(tag); 
            memoTags.push(tag);  
            return ''; 
        }).replace(REG.IMG, (match, alt, src) => {
            // 【优化点】这里也统一调用 getResUrl，保持逻辑一致
            if (src.startsWith('resources/')) {
                src = getResUrl(src); 
            }
            allImages.push(src); 
            return ''; 
        }).replace(REG.LINK, '<a href="$2" target="_blank">$1</a>');

        // 3. 处理资源列表
        const rawResources = memo.resources || memo.attachments || [];
        const resourceList = rawResources.map(r => {
            const rId = r.id || (r.name ? r.name.split('/').pop() : '');
            const rName = r.name || `resources/${rId}`;
            const rFilename = r.filename || ''; // 获取文件名
            const type = r.type || r.mimeType || 'image/*';
            
            // 核心：优先外链 -> 其次走统一生成器
            //const src = r.externalLink || getResUrl(rName, rFilename);
            const src = cleanImage(r.externalLink || getResUrl(rName, rFilename));
            
            if (type.startsWith('image')) allImages.push(src);
            return { id: rId, name: rName, filename: rFilename, externalLink: r.externalLink, type, src };
        });

        // 4. 返回处理好的对象
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
            tags: memoTags, 
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
        
        // 恢复地理位置
        if (data.location && data.location.placeholder) {
            STATE.editorLocation = data.location;
        } else {
            STATE.editorLocation = null;
        }
        if (refs.renderLocation) refs.renderLocation();
        
        // 切换按钮状态
        refs.submitBtn.classList.add("d-none");
        refs.editDom.classList.remove("d-none");
        refs.imageList.innerHTML = '';
        
        const currentResourceNames = data.resourceList ? data.resourceList.map(r => r.name) : [];
        window.localStorage?.setItem("memos-resource-list", JSON.stringify(currentResourceNames));
        
        // 渲染已有图片预览
        if (data.resourceList?.length) {
            const imgHtml = data.resourceList.map(r => `
            <div class="imagelist-item" draggable="true" data-name="${r.name || `attachments/${r.id}`}">
                <img class="memos-up-image" src="${r.src}" />
                <div class="image-delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>
            </div>`
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
    //置顶功能状态提示
    function handlePinMemo(id, isPinned) {
        const targetStatus = !isPinned;
        performAction(
            `api/v1/memos/${id}?updateMask=pinned`, 
            'PATCH', 
            { pinned: targetStatus }, 
            targetStatus ? '置顶成功' : '已取消置顶'
        );
    }
    function handleArchiveMemo(id) {
        performAction(`api/v1/memos/${id}?updateMask=state`, 'PATCH', { state: "ARCHIVED" }, '归档成功');
    }

    function handleDeleteMemo(id) {
        if (confirm("确定要删除此条唠叨吗？")) {
            performAction(`api/v1/memos/${id}`, 'DELETE', null, '删除成功');
        }
    }

    // ============================================================
    // 7. 数据加载与渲染
    // ============================================================
   function fetchMemosAndRender(params, clearDom = false) {
    const bbDom = document.querySelector(CONFIG.domId);

    if (clearDom) {
        bbDom.innerHTML = "";
        document.querySelector('.bb-load')?.remove();
    }

    const isFirst = !params.get('pageToken');

    let pinnedReq = Promise.resolve({ memos: [] });

    if (isFirst) {
        const p = new URLSearchParams(params);
        p.delete('pageToken');

        const oldFilter = p.get('filter');
        p.set('filter', oldFilter ? `(${oldFilter}) && pinned==true` : 'pinned==true');
        
        pinnedReq = memoFetch(`api/v1/memos?${p}`).catch(() => ({ memos: [] }));
    }

    return Promise.all([
        pinnedReq,
        memoFetch(`api/v1/memos?${params}`)
    ]).then(([pRes, nRes]) => {
        const pinned = pRes?.memos || [];
        const normal = nRes?.memos || [];

        const pinnedNames = new Set(pinned.map(p => p.name));
        const start = isFirst
            ? [...pinned, ...normal.filter(n => !pinnedNames.has(n.name))]
            : normal;

        start.length && updateHTMl(start.map(adaptMemo), null, isFirst);

        document.querySelector('.bb-load')?.remove();

        if (nRes?.nextPageToken) {
            STATE.nextPageToken = nRes.nextPageToken;
            bbDom.insertAdjacentHTML(
                'afterend',
                '<div class="bb-load"><button class="load-btn button-load" data-action="load-more">看更多 ...</button></div>'
            );
            !clearDom && getNextPage();
        } else {
            STATE.nextPageToken = null;
        }
    });
}

    async function getFirstList() {
        const bbDom = document.querySelector(CONFIG.domId);
        if(!document.getElementById('tag-list')) bbDom.insertAdjacentHTML('beforebegin', '<div id="tag-list"></div>');
        
        STATE.nextPageToken = "";
        const urlParams = new URLSearchParams(window.location.search);
        const targetId = urlParams.get('memo'); 

        if (targetId) {
            console.log("正在加载单条动态 UID:", targetId);
            const res = await memoFetch(`api/v1/memos/${targetId}`);
            
            if (res) {
                updateHTMl([adaptMemo(res)]);
                document.querySelector('.bb-load')?.remove();
                
                bbDom.insertAdjacentHTML('afterend', `
                    <div class="bb-load">
                        <button class="load-btn" onclick="location.href='${location.origin}${location.pathname}'">看全部唠叨...</button>
                    </div>
                `);
                
                bbDom.scrollIntoView({ behavior: 'smooth' });
                return;
            } else {
                cocoMessage.error("未找到该条动态");
            }
        }
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
        STATE.nextPageToken = "";
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
            return `<a href="?memo=${rId}" target="_blank" class="memo-relation-item"><span class="memo-relation-content text-sm">${rContent}</span></a>`;
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

    function updateHTMl(data, mode, isFirstPage = false) {
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
                const { latitude, longitude, placeholder } = item.location;
                // 生成 OpenStreetMap 的查看链接 (zoom=16 是缩放级别)
                const mapUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
                
                // 改用 <a> 标签，并加上 target="_blank" 在新标签页打开
                locationHtml = `<a href="${mapUrl}" target="_blank" class="memo-location-wrapper cursor-pointer hover:opacity-80"><svg class="memo-location-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg><span class="memo-location-text">${placeholder}</span></a>`;
            }

            const footer = (['PUBLIC', 'PROTECTED'].includes(item.visibility)) ? `<div class="talks_comments"><a data-action="load-artalk" data-id="${item.id}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21a9 9 0 1 0-8-4.873L3 21l4.873-1c1.236.639 2.64 1 4.127 1"/><path stroke-width="3" d="M7.5 12h.01v.01H7.5zm4.5 0h.01v.01H12zm4.5 0h.01v.01H12zm4.5 0h.01v.01H12zm4.5 0h.01v.01H12z"/></svg><span id="btn_memo_${item.id}"></span></a></div>` : `<div class="memos-hide" data-action="reload-private"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 14 14"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M1.68 4.206C2.652 6.015 4.67 7.258 7 7.258c2.331 0 4.348-1.243 5.322-3.052M2.75 5.596L.5 7.481m4.916-.415L4.333 9.794m6.917-4.198l2.25 1.885m-4.92-.415l1.083 2.728"/></svg></div>`;
            const editMenu = canEdit ? `
            <div class="memos-edit">
                <div class="memos-menu">...</div>
                <div class="memos-menu-d">
                    <div class="pinned-edit" data-action="pin" data-id="${item.id}" data-pinned="${item.pinned}">${item.pinned ? '取消' : '置顶'}</div>
                    <div class="edit-btn" data-action="edit" data-form="${encodeURIComponent(JSON.stringify(item))}">修改</div>
                    <div class="archive-btn" data-action="archive" data-id="${item.id}">归档</div>
                    <div class="delete-btn" data-action="delete" data-id="${item.id}">删除</div>
                </div>
            </div>` : '';
            const timeStr = typeof moment !== 'undefined' ? moment(item.createdTs * 1000).twitterLong() : new Date(item.createdTs * 1000).toLocaleString();

            let pinIcon = '';
            if (item.pinned) {
                pinIcon = `<span class="pinned">置顶</span>`;
            }
            
            result += `<li class="${STATE.isRandomRender ? "memos-oneday-li" : "bb-list-li img-hide"}" id="${item.id}"><div class="memos-pl"><div class="memos_diaoyong_time">${timeStr} ${pinIcon}</div>${editMenu}</div><div class="datacont" view-image>${item.contentHtml}${imgHtml}${outboundHtml}${inboundHtml}</div><div class="memos_diaoyong_top"><div class="memos-tag-wz">${tagHtml}</div>${locationHtml}${footer}</div><div id="memo_${item.id}" class="artalk hidden"></div></li>`;

            if (!mode && isFirstPage) {
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
        //插入内容时间显示    
        if (typeof window.formatDate === 'function') {
            bbDom.querySelectorAll('.twitter-time').forEach(el => {
                const t = el.dataset.time; 
                if (!t || el.innerText.trim()) return;
                const ts = /[-/]/.test(t) ? Math.floor(new Date(t) / 1000) : +t;
                if (ts) el.innerText = window.formatDate(ts);
            });
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
            optionPanel: container.querySelector(".memos-editor-option"),
            uploadInput: container.querySelector(".memos-upload-input"),
            locationDis: container.querySelector(".memos-location-display")
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

    // =======================================================
    // 🛠️ 核心工具 (DRY - Don't Repeat Yourself)
    // =======================================================
        
    // 1. 图片压缩并转 Base64
    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // 📐 尺寸限制：最大 1200px
                const MAX_WIDTH = 1200; 
                const MAX_HEIGHT = 1200;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedDataUrl = canvas.toDataURL('image/webp', 0.7);
                resolve(compressedDataUrl.split(',')[1]);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = reject;
    });
        
        // 1. 生成图片 HTML 片段 (上传和编辑共用)
        const getImageDom = (name, src) => `
            <div class="imagelist-item" draggable="true" data-name="${name}">
                <img class="memos-up-image" src="${src}" />
                <div class="image-delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>
            </div>`;

        // 2. 获取当前 DOM 顺序
        const getAttachmentsFromDOM = () => Array.from(refs.imageList.children)
            .map(el => ({ name: el.dataset.name }))
            .filter(item => item.name);

        // 3. 同步附件到服务器
        const syncAttachments = async (memoName) => {
            const attachments = getAttachmentsFromDOM();
            await memoFetch(`api/v1/${memoName}/attachments`, 'PATCH', { attachments });
        };

        // 4. 统一处理图片删除 (事件委托)
        // 优势：不需要给每个图片绑定 onclick，性能更好，代码更洁癖
        refs.imageList.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.image-delete');
            if (deleteBtn) {
                deleteBtn.closest('.imagelist-item').remove();
            }
        });

        // =======================================================
        // ✋ 拖拽排序系统 (无依赖版)
        // =======================================================
        const initDragSort = () => {
            const container = refs.imageList;
            let draggedItem = null;

            // PC 端
            container.addEventListener('dragstart', e => { draggedItem = e.target.closest('.imagelist-item'); draggedItem?.classList.add('dragging'); });
            container.addEventListener('dragend', () => { draggedItem?.classList.remove('dragging'); draggedItem = null; });
            container.addEventListener('dragover', e => {
                e.preventDefault();
                if (!draggedItem) return;
                const target = e.target.closest('.imagelist-item');
                if (target && target !== draggedItem && container.contains(target)) {
                    const { left, width } = target.getBoundingClientRect();
                    container.insertBefore(draggedItem, e.clientX > left + width / 2 ? target.nextSibling : target);
                }
            });

            // Mobile 端
            container.addEventListener('touchstart', e => {
                const el = e.target.closest('.imagelist-item');
                if (el) { draggedItem = el; el.classList.add('dragging'); document.body.style.overflow = 'hidden'; }
            }, { passive: false });
            
            container.addEventListener('touchend', () => {
                draggedItem?.classList.remove('dragging'); draggedItem = null; document.body.style.overflow = '';
            });
            
            container.addEventListener('touchmove', e => {
                if (!draggedItem) return;
                e.preventDefault();
                const touch = e.touches[0];
                const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.imagelist-item');
                if (target && target !== draggedItem && container.contains(target)) {
                     const { left, width } = target.getBoundingClientRect();
                     container.insertBefore(draggedItem, touch.clientX > left + width / 2 ? target.nextSibling : target);
                }
            }, { passive: false });
        };
        initDragSort();

        // =======================================================
        // ⌨️ 输入与标签逻辑
        // =======================================================
        refs.textarea.addEventListener('input', () => {
            autoHeight(refs.textarea);
            refs.submitBtn.style.opacity = refs.textarea.value.trim() ? 1 : 0.4;
            // Tag 逻辑
            const w = refs.textarea.value.slice(0, refs.textarea.selectionStart).split(/\s+/).pop();
            const matches = (w?.startsWith('#') && STATE.tags.size) ? Array.from(STATE.tags).filter(t => t.toLowerCase().includes(w.slice(1).toLowerCase())) : [];
            refs.tagMenu.innerHTML = matches.map((t, i) => `<div class="tag-option${i === 0 ? ' selected' : ''}">#${t}</div>`).join('');
            refs.tagMenu.style.display = matches.length ? 'block' : 'none';
        });

        refs.tagMenu.onclick = (e) => {
            if (e.target.classList.contains('tag-option')) {
                insertText(e.target.innerText.replace('#', '') + ' ', '', 0, true);
                refs.tagMenu.style.display = 'none';
            }
        };
        
        // 键盘选择标签
        refs.textarea.addEventListener('keydown', (e) => {
            if (refs.tagMenu.style.display !== 'block') return;
            const options = refs.tagMenu.querySelectorAll('.tag-option');
            if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
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

        // =======================================================
        // 📍 地理位置逻辑
        // =======================================================
        const renderLocation = () => {
            const loc = STATE.editorLocation;
            const el = refs.locationDis;
            el.innerHTML = loc ? `<div class="location-chip animate__animated animate__fadeIn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg><span class="location-text" title="点击修改">${loc.placeholder}</span><svg class="location-delete" title="移除" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>` : '';
            el.classList.toggle('show', !!loc);
        };
        refs.renderLocation = renderLocation;

        refs.locationDis.addEventListener('click', (e) => {
            if (e.target.closest('.location-delete')) { STATE.editorLocation = null; renderLocation(); return; }
            const textSpan = e.target.closest('.location-text');
            if (textSpan) {
                const n = prompt('修改位置:', STATE.editorLocation.placeholder);
                if (n?.trim()) { STATE.editorLocation.placeholder = n.trim(); renderLocation(); }
            }
        });

        // =======================================================
        // 📤 上传逻辑 (修复版：调用压缩函数)
        // =======================================================
        refs.uploadInput.addEventListener('change', async (e) => {
            if (!e.target.files?.length) return;
            
            for (const file of e.target.files) {
                try {
                    // 1. 本地预览 (依然用原图做瞬时预览，体验更好)
                    const localUrl = URL.createObjectURL(file);
                    
                    // 2. 核心修复：调用上面定义的【WebP压缩函数】
                    const content = await fileToBase64(file);

                    // 3. 细节优化：把文件名后缀改为 .webp
                    const newFilename = file.name.replace(/\.[^/.]+$/, "") + ".webp";

                    const uploadUrl = `${CONFIG.memos.replace(/\/$/, '')}/api/v1/attachments`;

                    const res = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: { 
                            'Authorization': `Bearer ${STATE.memosOpenId}`,
                            'Content-Type': 'application/json' 
                        },
                        body: JSON.stringify({ content, filename: newFilename })
                    });
                    
                    if (!res.ok) throw new Error('Upload Failed');
                    const data = await res.json();
                    
                    // 4. 渲染 DOM (调用工具函数)
                    refs.imageList.insertAdjacentHTML('beforeend', getImageDom(data.name, localUrl));
                    
                } catch (e) {
                    console.error(e);
                    cocoMessage.error("上传失败");
                }
            }
            // 清空输入框，确保同名文件能再次触发 change 事件
            refs.uploadInput.value = '';
        });

        // =======================================================
        // 🚀 发布与修改逻辑
        // =======================================================
        const handleSave = async (isEdit = false) => {
            if (!refs.textarea.value.trim()) return cocoMessage.info('内容不能为空');
            
            const editData = isEdit ? JSON.parse(window.localStorage?.getItem("memos-editor-dataform")) : null;
            const body = { content: refs.textarea.value, visibility: refs.visSelect.value };
            let url = `api/v1/memos`;
            let method = 'POST';

            if (STATE.editorLocation) body.location = STATE.editorLocation;

            if (isEdit) {
                // 1. 初始化需要更新的字段列表
                const masks = ["content", "visibility"];

                // 2. 🤖 智能逻辑：如果是从“私有”改成“公开”，则强制更新创建时间为“现在”
                // 这样这条动态就会像新发的一样排在最前面
                if (editData.visibility === 'PRIVATE' && body.visibility === 'PUBLIC') {
                    masks.push("create_time");
                    body.createTime = new Date().toISOString();
                }
                
                // 3. 处理地理位置逻辑
                if (STATE.editorLocation) {
                    masks.push("location");
                    body.location = STATE.editorLocation;
                } else if (editData.location) {
                    // 如果原本有位置，现在把它删了，需要传 null 并标记更新
                    masks.push("location");
                    body.location = null;
                }

                // 4. 拼接 URL
                url = `api/v1/memos/${editData.id}?updateMask=${masks.join(',')}`;
                method = 'PATCH';
            }

            try {
                const res = await memoFetch(url, method, body);
                
                // 核心：无论发布还是修改，都根据 DOM 里的最新顺序去同步附件
                if (res && res.name) {
                    await syncAttachments(res.name);
                }

                if (res) {
                    cocoMessage.success(isEdit ? '修改成功' : '唠叨成功');
                    resetEditor();
                    reloadList();
                }
            } catch (e) { console.error(e); cocoMessage.error('操作失败'); }
        };

        refs.submitBtn.addEventListener("click", () => handleSave(false));
        document.querySelector(".edit-memos-btn").addEventListener("click", () => handleSave(true));
        
        // =======================================================
        // 🔘 底部工具栏逻辑 (完整版)
        // =======================================================
        document.querySelector(".memos-editor-footer").addEventListener('click', (e) => {
            const t = e.target.closest('.action-btn, .private-btn, .oneday-btn, .switchUser-btn, .code-single, .link-img, .location-btn, .upload-image-btn');
            if (!t) return;
            
            const ACTIONS = {
                'upload-image-btn': () => refs.uploadInput.click(),
                'location-btn': async (btn) => {
                    const icon = btn.innerHTML;
                    btn.innerHTML = `<svg class="geo-loading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;
                    try {
                        const pos = await GeoHelper.getPosition();
                        const { latitude, longitude } = pos.coords;
                        const name = await GeoHelper.getAddress(latitude, longitude);
                        STATE.editorLocation = { placeholder: name, latitude, longitude };
                        renderLocation();
                    } catch (e) {
                        console.error(e);
                        cocoMessage.error(typeof e === 'string' ? e : "定位失败");
                    } finally {
                        btn.innerHTML = icon;
                    }
                },
                'switchUser-btn': () => { ['memos-access-path', 'memos-access-token', 'memos-editor-display', 'memos-oneday'].forEach(k => window.localStorage.removeItem(k)); location.reload(); },
                'private-btn': () => { const isP = t.classList.toggle("private"); refs.visSelect.value = isP ? "PRIVATE" : "PUBLIC"; STATE.viewMode = isP ? 'PRIVATE' : 'ALL'; reloadList(); },
                'oneday-btn': () => { const k = "memos-oneday"; window.localStorage.setItem(k, window.localStorage.getItem(k) ? "" : "open"); reloadList(); },
                'code-single': () => insertText("``", "`", 1),
                'link-btn': () => insertText("[]()", "[", 1),
                'link-img': () => insertText("![]()", "!", 1),
                'biao-qing': () => showEmoji(t)
            };
            
            for (const k in ACTIONS) if (t.classList.contains(k)) ACTIONS[k](t);
        });

        // =======================================================
        // 🔧 验证
        // =======================================================
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
        STATE.editorLocation = null;
        if (refs.renderLocation) refs.renderLocation();
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
                    <div class="memos-location-display"></div>
                    <div class="memos-editor-footer border-t">
                        <div class="d-flex">
                            <div class="button outline action-btn link-btn" title="链接"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M10.59 13.41c.41.39.41 1.03 0 1.42c-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0a5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24a2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24m2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0a5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24a2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24a.973.973 0 0 1 0-1.42"/></svg></div>
                            <div class="button outline action-btn upload-image-btn" title="上传图片"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M15 8h.01M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/><path d="m3 16l5-5c.928-.893 2.072-.893 3 0l5 5"/><path d="m14 14l1-1c.928-.893 2.072-.893 3 0l3 3"/></g></svg></div>
                            <div class="button outline action-btn location-btn" title="定位"><svg class="memo-location-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>
                            <div class="button outline action-btn biao-qing" title="表情"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg></div>
                            <div class="memos-more-ico"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M5 10a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4"/></g></svg>
                                <div class="memos-xiala"><div class="link-img">引图</div><div class="code-single">高亮</div><div class="private-btn">私有</div><div class="oneday-btn">穿越</div><div class="switchUser-btn">退出</div></div>
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
                    <input name="memos-token-url" class="memos-token-input input-text col-6" type="text" placeholder="访问令牌">
                    <div class="memos-open-api-submit"><div class="primary submit-openapi-btn">验证</div></div>
                </div>
            </div>
            <input type="file" class="memos-upload-input" accept="image/*" multiple style="display:none;">
        </div>`;
    }
})();