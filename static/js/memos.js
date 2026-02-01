/* Memos JS Platinum Plus - Verified 2026.02.01 */

(function() {

// ============================================================
// 1. 全局配置与状态管理
// ============================================================
const memosData = { dom: '#memos' };
const bbMemo = {
    memos: 'https://memos.koobai.com/',
    limit: '16',
    creatorId: '1',
    domId: '#bber',
};

if (typeof (window.bbMemos) !== "undefined") {
    Object.assign(bbMemo, window.bbMemos);
}

const limit = bbMemo.limit;
const memos = bbMemo.memos;
let mePage = 1, offset = 0, nextLength = 0, nextDom = [];
let bbDom = null;
const loadHtml = '<div class="bb-load"><button class="load-btn button-load">加载中……</button></div>';

const memosOpenId = window.localStorage?.getItem("memos-access-token");
const memosPath = window.localStorage?.getItem("memos-access-path");
const getEditor = window.localStorage?.getItem("memos-editor-display");
const getSelectedValue = window.localStorage?.getItem("memos-visibility-select") || "PUBLIC";

// 数据缓存池
window.memosTags = [];
let emojisData = [];
const insertedDataCache = { posts: null, movies: null };

// 编辑器 DOM 引用
let domRefs = {};

// ============================================================
// 2. 通用网络请求
// ============================================================
async function memoFetch(url, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (memosOpenId) headers['Authorization'] = `Bearer ${memosOpenId}`;
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("MemoFetch Error:", error);
        throw error;
    }
}

// ============================================================
// 3. 程序入口
// ============================================================
document.addEventListener("DOMContentLoaded", async function () {
    bbDom = document.querySelector(bbMemo.domId);

    cacheInsertedData();
    initEditorLogic();

    if (bbDom) {
        document.body.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('button-load')) {
                const btn = e.target;
                btn.textContent = '加载中……';
                updateHTMl(nextDom);
                if (nextLength < limit) {
                    btn.remove();
                } else {
                    getNextList();
                }
            }
        });
        getFirstList();
    } else {
        console.warn("Memos Container #bber not found.");
    }

    try {
        const response = await fetch('/suju/owo.json');
        const data = await response.json();
        emojisData = data.Emoji.container;
    } catch (error) {
        console.error('Failed to fetch emojis data');
    }
});

function cacheInsertedData() {
    const postsEl = document.getElementById('temp-posts-data');
    const moviesEl = document.getElementById('temp-movies-data');
    if (postsEl) insertedDataCache.posts = postsEl.innerHTML;
    if (moviesEl) insertedDataCache.movies = moviesEl.innerHTML;
}

// ============================================================
// 4. 列表加载逻辑
// ============================================================
function getFirstList() {
    bbDom.insertAdjacentHTML('afterend', loadHtml);
    bbDom.insertAdjacentHTML('beforebegin', `<div id="tag-list"></div>`);

    mePage = 1; offset = 0;

    const bbUrl = `${memos}api/v1/memo?creatorId=${bbMemo.creatorId}&rowStatus=NORMAL&limit=${limit}`;
    memoFetch(bbUrl).then(resdata => {
        updateHTMl(resdata);
        if (resdata.length < limit) {
            document.querySelector("button.button-load")?.remove();
        } else {
            mePage++;
            offset = limit * (mePage - 1);
            getNextList();
        }
    }).catch(err => console.error("List load failed:", err));

    const oneDay = window.localStorage?.getItem("memos-oneday");
    if (memosOpenId && oneDay == "open") {
        const count = window.localStorage?.getItem("memos-response-count") || 0;
        const random = count > 5 ? Math.floor(Math.random() * count) : 0;
        const randomUrl = `${memos}api/v1/memo?creatorId=${bbMemo.creatorId}&rowStatus=NORMAL&limit=1&offset=${random}`;

        memoFetch(randomUrl).then(resdata => {
            if (!resdata || resdata.length === 0) {
                return memoFetch(`${memos}api/v1/memo?creatorId=${bbMemo.creatorId}&rowStatus=NORMAL&limit=1&offset=0`);
            }
            return resdata;
        }).then(finalData => {
            if (finalData?.length > 0) updateHTMl(finalData, "ONEDAY");
        }).catch(console.error);
    }
}

function getNextList() {
    const bbUrl = `${memos}api/v1/memo?creatorId=${bbMemo.creatorId}&rowStatus=NORMAL&limit=${limit}&offset=${offset}`;
    memoFetch(bbUrl).then(resdata => {
        nextDom = resdata;
        nextLength = nextDom.length;
        mePage++;
        offset = limit * (mePage - 1);
        if (nextLength < 1) {
            document.querySelector("button.button-load")?.remove();
        }
    });
}

window.reloadList = function(mode) {
    const existBtn = document.querySelector(".button-load");
    if (existBtn) {
        existBtn.textContent = '加载中……';
    } else {
        bbDom.insertAdjacentHTML('afterend', loadHtml);
    }
    
    mePage = 1; offset = 0; nextLength = 0; nextDom = [];
    bbDom.innerHTML = '';

    let bbUrl = `${memos}api/v1/memo?creatorId=${bbMemo.creatorId}&rowStatus=NORMAL&limit=${limit}`;
    if (mode == "NOPUBLIC") bbUrl = `${memos}api/v1/memo`;
    else if (mode == "ONEDAY") {
        const count = window.localStorage?.getItem("memos-response-count") || 0;
        const rnd = count > 5 ? Math.floor(Math.random() * count) : 0;
        bbUrl = `${memos}api/v1/memo?creatorId=${bbMemo.creatorId}&rowStatus=NORMAL&limit=1&offset=${rnd}`;
    }

    memoFetch(bbUrl).then(resdata => {
        if (mode == "NOPUBLIC") {
            resdata = resdata.filter(item => item.visibility !== "PUBLIC");
        }
        
        if (mode == "ONEDAY") {
            if (!resdata || resdata.length === 0) {
                memoFetch(`${memos}api/v1/memo?creatorId=${bbMemo.creatorId}&rowStatus=NORMAL&limit=1&offset=0`)
                    .then(d => updateHTMl(d, "ONEDAY"));
            } else {
                updateHTMl(resdata, "ONEDAY");
            }
        } else {
            updateHTMl(resdata);
            if (resdata.length < limit) {
                document.querySelector("button.button-load")?.remove();
            } else {
                mePage++;
                offset = limit * (mePage - 1);
                getNextList(); 
            }
        }
    }).catch(err => {
        console.error("Reload failed", err);
        bbDom.innerHTML = '';
    });
};

// ============================================================
// 5. 渲染引擎
// ============================================================
const TAG_REG = /#([^#\s!.,;:?"'()]+)(?= )/g;
const IMG_REG = /\!\[(.*?)\]\((.*?)\)/g;
const LINK_REG = /\[(.*?)\]\((.*?)\)/g;

if (typeof marked !== 'undefined') {
    marked.setOptions({ breaks: false, smartypants: false, headerIds: false, mangle: false });
}

function updateHTMl(data, mode) {
    let result = "";
    const showEdit = (memosOpenId && getEditor == "show") ? 1 : 0;

    data.forEach((item, i) => {
        let content = item.content
            .replace(TAG_REG, "")
            .replace(IMG_REG, '')
            .replace(LINK_REG, '<a href="$2" target="_blank">$1</a>');
        content = marked.parse(content);

        // [修改 1] 图片解析 - 添加 onload 移除隐藏类
        const imgs = item.content.match(IMG_REG);
        let imgHtml = '';
        if (imgs) {
            imgs.forEach(img => {
                const src = img.replace(/!\[.*?\]\((.*?)\)/g, '$1');
                imgHtml += `<figure class="gallery-thumbnail"><img loading="lazy" decoding="async" class="img thumbnail-image img-hide" onload="this.classList.remove('img-hide')" src="${src}"/></figure>`;
            });
            content += `<div class="resimg${imgs.length > 1 ? ` grid grid-${imgs.length}` : ''}">${imgHtml}</div>`;
        }

        const tags = item.content.match(TAG_REG);
        const tagHtml = tags ? tags.map(t => {
            const txt = t.replace(/[#]/g, '');
            return `<div class="memos-tag-dg" onclick="getTagNow(this)">#${txt}</div>`;
        }).join('') : '<div class="memos-tag-dg">#日常</div>';

        // [修改 2] 资源图片解析 - 添加 onload 移除隐藏类
        if (item.resourceList?.length > 0) {
            let resImgHtml = '', resLinkHtml = '', count = 0;
            item.resourceList.forEach(res => {
                const link = res.externalLink || `${memos}o/r/${res.id}`;
                if (res.type.startsWith('image')) {
                    resImgHtml += `<figure class="gallery-thumbnail"><img loading="lazy" decoding="async" class="img thumbnail-image img-hide" onload="this.classList.remove('img-hide')" src="${link}"/></figure>`;
                    count++;
                } else {
                    resLinkHtml += `<a target="_blank" href="${link}">${res.filename}</a>`;
                }
            });
            if (resImgHtml) content += `<div class="resimg ${count > 1 ? `grid grid-${count}` : ''}">${resImgHtml}</div>`;
            if (resLinkHtml) content += `<p class="datasource">${resLinkHtml}</p>`;
        }

        const memoString = JSON.stringify(item).replace(/"/g, '&quot;');
        result += `<li class="bb-list-li img-hide" id="${item.id}">
            <div class="memos-pl"><div class="memos_diaoyong_time">${moment(item.createdTs * 1000).twitterLong()}</div>
            ${showEdit ? `<div class="memos-edit"><div class="memos-menu">...</div><div class="memos-menu-d">
                <div class="edit-btn" data-form="${memoString}" onclick="editMemo(this)">修改</div>
                <div class="archive-btn" onclick="archiveMemo('${item.id}')">归档</div>
                <div class="delete-btn" onclick="deleteMemo('${item.id}')">删除</div></div></div>` : ''}
            </div>
            <div class="datacont" view-image>${content}</div>
            <div class="memos_diaoyong_top"><div class="memos-tag-wz">${tagHtml}</div>
            ${item.visibility === 'PUBLIC' ? 
                `<div class="talks_comments"><a onclick="loadArtalk('${item.id}')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21a9 9 0 1 0-8-4.873L3 21l4.873-1c1.236.639 2.64 1 4.127 1"/><path stroke-width="3" d="M7.5 12h.01v.01H7.5zm4.5 0h.01v.01H12zm4.5 0h.01v.01h-.01z"/></svg><span id="btn_memo_${item.id}"></span></a></div>` : 
                `<div class="memos-hide" onclick="reloadList('NOPUBLIC')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 14 14"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M1.68 4.206C2.652 6.015 4.67 7.258 7 7.258c2.331 0 4.348-1.243 5.322-3.052M2.75 5.596L.5 7.481m4.916-.415L4.333 9.794m6.917-4.198l2.25 1.885m-4.92-.415l1.083 2.728"/></svg></div>`
            }
            </div><div id="memo_${item.id}" class="artalk hidden"></div>
        </li>`;

        if (!mode && typeof mePage !== 'undefined' && mePage <= 2) {
            const postMapping = { 1: 0, 4: 1, 7: 2, 9: 3 };
            if (postMapping[i] !== undefined && insertedDataCache.posts) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = insertedDataCache.posts;
                const postItems = tempDiv.querySelectorAll('.one-post-item');
                const postHTML = postItems[postMapping[i]]?.innerHTML;
                if (postHTML) result += `<div class="inserted-post-section animated-fade-in">${postHTML}</div>`;
            }
            if (i == 1 && insertedDataCache.movies) {
                result += `<div class="inserted-movies-section animated-fade-in"><div class="movies-grid-container">${insertedDataCache.movies}</div></div>`;
            }
        }
    });

    if (mode === "ONEDAY") {
        bbDom.insertAdjacentHTML('afterbegin', `<li class='memos-oneday'><ul class='bb-list-ul'>${result}</ul></li>`);
        // 手动唤醒 ONEDAY 模式下的动画
        if (typeof animateSummaries === 'function') animateSummaries();
    } else {
        let timelineContainer = bbDom.querySelector('.bb-timeline');
        if (!timelineContainer) {
            const wrap = `<section class='bb-timeline'><ul class='bb-list-ul'>${result}</ul></section>`;
            bbDom.insertAdjacentHTML('beforeend', wrap);
        } else {
            let listUl = timelineContainer.querySelector('.bb-list-ul');
            if(listUl) listUl.insertAdjacentHTML('beforeend', result);
        }
        
        // 唤醒列表动画
        if (typeof animateSummaries === 'function') animateSummaries();
        const loadBtn = document.querySelector('button.button-load');
        if (loadBtn) loadBtn.textContent = '看更多 ...';
    }
}

// 辅助函数
window.getTagNow = function(e) {
    const tagName = e.innerText.replace('#', '');
    window.scrollTo({ top: document.getElementById("bber").offsetTop - 30, behavior: "smooth" });
    document.querySelector('#tag-list').innerHTML = `<div class='memos-tag-sc-2' onclick='location.reload();'><div class='memos-tag-sc-1'>标签筛选:</div><div class='memos-tag-sc'>${e.innerText}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-auto ml-1 opacity-40"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></div></div>`;
    
    memoFetch(`${memos}api/v1/memo?creatorId=${bbMemo.creatorId}&tag=${tagName}&limit=20`)
        .then(res => {
            bbDom.innerHTML = "";
            updateHTMl(res); 
            document.querySelector("button.button-load")?.remove();
        });
};

window.loadArtalk = function(id) {
    const target = document.getElementById('memo_' + id);
    const all = document.querySelectorAll("[id^='memo_']");
    const isHidden = target.classList.contains('hidden');
    all.forEach(el => el.classList.add('hidden'));
    if (isHidden) {
        target.classList.remove('hidden');
        if (typeof Artalk !== 'undefined') {
            Artalk.init({ el: '#memo_' + id, pageKey: '/m/' + id, pageTitle: '', server: 'https://c.koobai.com/', site: '空白唠叨', darkMode: 'auto' });
        }
    }
};

window.editMemo = function(el) {
    if (!domRefs.editMemoDom) return; 
    const data = JSON.parse(el.getAttribute("data-form"));
    
    window.memosOldSelect = domRefs.visibilitySelect.value;
    window.localStorage?.setItem("memos-editor-dataform", JSON.stringify(data));
    
    domRefs.visibilitySelect.value = data.visibility;
    domRefs.textarea.value = data.content;
    domRefs.textarea.style.height = 'inherit';
    domRefs.textarea.style.height = domRefs.textarea.scrollHeight + 'px';
    
    domRefs.submitBtn.classList.add("d-none");
    domRefs.editMemoDom.classList.remove("d-none");
    
    domRefs.imageList.innerHTML = '';
    const resList = data.resourceList || [];
    const resIds = resList.map(r => r.id);
    window.localStorage?.setItem("memos-resource-list", JSON.stringify(resIds));
    
    let imgHtml = '';
    resList.forEach(r => {
        const link = r.externalLink || `${memosPath}/o/r/${r.id}`;
        imgHtml += `<div data-id="${r.id}" class="imagelist-item d-flex text-xs mt-2 mr-2" onclick="deleteImage(this)"><div class="d-flex memos-up-image" style="background-image:url(${link})"></div></div>`;
    });
    domRefs.imageList.insertAdjacentHTML('afterbegin', imgHtml);
    
    const topPos = domRefs.editor.getBoundingClientRect().top + window.pageYOffset - 100;
    window.scrollTo({ top: topPos, behavior: "smooth" });
};

window.archiveMemo = function(id) {
    memoFetch(`${memosPath}/api/v1/memo/${id}`, 'PATCH', { id, rowStatus: "ARCHIVED" })
        .then(() => { reloadList(); cocoMessage.success('归档成功'); })
        .catch(() => cocoMessage.error('操作失败'));
};

window.deleteMemo = function(id) {
    if (confirm("确定要删除此条唠叨吗？")) {
        memoFetch(`${memosPath}/api/v1/memo/${id}`, 'DELETE')
            .then(() => { reloadList(window.localStorage?.getItem("memos-mode")); cocoMessage.success('删除成功'); })
            .catch(() => cocoMessage.error('删除失败'));
    }
};

window.deleteImage = function(e) {
    const id = Number(e.getAttribute("data-id"));
    let list = JSON.parse(window.localStorage?.getItem("memos-resource-list") || "[]");
    list = list.filter(item => item !== id);
    window.localStorage?.setItem("memos-resource-list", JSON.stringify(list));
    e.remove();
};

// ============================================================
// 6. 编辑器逻辑核心 (Editor Logic)
// ============================================================
function initEditorLogic() {
    const memosDom = document.querySelector(memosData.dom);
    const titileEl = document.querySelector('.index-laodao-titile');
    
    if (!titileEl || !memosDom) return;

    titileEl.insertAdjacentHTML('afterend', "<div class='load-memos-editor'>唠叨</div>");
    memosDom.insertAdjacentHTML('afterbegin', getEditorHtml());

    domRefs = {
        editor: document.querySelector(".memos-editor"),
        textarea: document.querySelector(".memos-editor-textarea"),
        tagMenu: document.getElementById('memos-tag-menu'),
        imageList: document.querySelector(".memos-image-list"),
        visibilitySelect: document.querySelector(".select-memos-value"),
        submitBtn: document.querySelector(".submit-memos-btn"),
        editMemoDom: document.querySelector(".edit-memos"),
        uploadInput: document.querySelector(".memos-upload-image-input"),
        loadEditorBtn: document.querySelector(".load-memos-editor"),
        optionPanel: document.querySelector(".memos-editor-option"),
        innerPanel: document.querySelector(".memos-editor-inner")
    };

    bindEditorEvents();
    
    if (getEditor === "show") {
        domRefs.editor.classList.remove("d-none");
        checkToken();
    }
}

function bindEditorEvents() {
    const { textarea, tagMenu, loadEditorBtn, submitBtn, uploadInput, visibilitySelect } = domRefs;

    loadEditorBtn.addEventListener("click", () => {
        const isHidden = domRefs.editor.classList.toggle("d-none");
        window.localStorage?.setItem("memos-editor-display", isHidden ? "hide" : "show");
        if (!isHidden) checkToken();
    });

    textarea.addEventListener('input', () => {
        textarea.style.height = 'inherit';
        textarea.style.height = textarea.scrollHeight + 'px';
        submitBtn.style.opacity = textarea.value.trim() ? 1 : 0.4;
        handleTagAutocomplete();
    });

    let tagIdx = -1;
    textarea.addEventListener('keydown', (e) => {
        if (tagMenu.style.display === 'block') {
            const options = tagMenu.querySelectorAll('.tag-option');
            if (e.keyCode === 38 || e.keyCode === 40) { 
                e.preventDefault();
                tagIdx = (tagIdx + (e.keyCode === 38 ? -1 : 1) + options.length) % options.length;
                options.forEach((o, i) => o.classList.toggle('selected', i === tagIdx));
            } else if (e.keyCode === 13 && tagIdx > -1) { 
                e.preventDefault();
                insertTag(options[tagIdx].innerText.replace('#', ''));
            }
        }
    });

    tagMenu.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-option')) {
            insertTag(e.target.innerText.replace('#', ''));
        }
    });

    submitBtn.addEventListener("click", async () => {
        const content = textarea.value;
        if (!content) return cocoMessage.info('内容不能为空');
        
        const body = {
            content,
            visibility: visibilitySelect.value,
            resourceIdList: JSON.parse(window.localStorage?.getItem("memos-resource-list") || "[]")
        };

        try {
            await memoFetch(`${memosPath}/api/v1/memo`, 'POST', body);
            const tags = content.match(TAG_REG);
            if (tags) {
                tags.forEach(t => memoFetch(`${memosPath}/api/v1/tag`, 'POST', { name: t.replace('#', '') }).catch(()=>{}));
            }
            
            cocoMessage.success('唠叨成功');
            textarea.value = '';
            textarea.style.height = 'inherit';
            domRefs.imageList.innerHTML = '';
            window.localStorage?.removeItem("memos-resource-list");
            reloadList(window.localStorage?.getItem("memos-mode"));
        } catch (e) {
            cocoMessage.error('发布失败');
        }
    });

    document.querySelector(".memos-editor-footer").addEventListener('click', (e) => {
        const target = e.target.closest('.action-btn, .private-btn, .oneday-btn, .switchUser-btn');
        if (!target) return;

        if (target.classList.contains('code-single')) insertText("``", "`", 1);
        else if (target.classList.contains('code-btn')) insertText("```\n\n```", "", 4);
        else if (target.classList.contains('link-btn')) insertText("[]()", "[", 1);
        else if (target.classList.contains('link-img')) insertText("![]()", "!", 1);
        else if (target.classList.contains('biao-qing')) showEmojiPicker(target);
        else if (target.classList.contains('private-btn')) togglePrivateMode(target);
        else if (target.classList.contains('oneday-btn')) toggleOneDay(target);
        else if (target.classList.contains('switchUser-btn')) switchUser();
    });

    document.querySelector(".image-btn").addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", () => {
        if (uploadInput.files.length > 0) uploadFile(uploadInput.files[0]);
    });

    document.querySelector(".edit-memos-btn").addEventListener("click", () => {
        const data = JSON.parse(window.localStorage?.getItem("memos-editor-dataform"));
        const body = {
            id: data.id,
            content: textarea.value,
            visibility: visibilitySelect.value,
            resourceIdList: JSON.parse(window.localStorage?.getItem("memos-resource-list") || "[]")
        };
        memoFetch(`${memosPath}/api/v1/memo/${data.id}`, 'PATCH', body).then(() => {
            cocoMessage.success('修改成功');
            resetEditorState();
            reloadList(window.localStorage?.getItem("memos-mode"));
        });
    });

    document.querySelector(".cancel-edit-btn").addEventListener("click", resetEditorState);
}

function handleTagAutocomplete() {
    const val = domRefs.textarea.value;
    const start = domRefs.textarea.selectionStart;
    const lastWord = val.slice(0, start).split(/\s+/).pop();

    if (lastWord && lastWord.startsWith('#')) {
        const query = lastWord.slice(1).toLowerCase();
        const matches = window.memosTags.filter(t => t.toLowerCase().includes(query));
        
        if (matches.length > 0) {
            domRefs.tagMenu.innerHTML = matches.map(t => `<div class="tag-option">#${t}</div>`).join('');
            domRefs.tagMenu.style.display = 'block';
            return;
        }
    }
    domRefs.tagMenu.style.display = 'none';
}

function insertTag(tagName) {
    const val = domRefs.textarea.value;
    const start = domRefs.textarea.selectionStart;
    const before = val.slice(0, start);
    const hashIdx = before.lastIndexOf('#');
    
    if (hashIdx !== -1) {
        const newVal = val.slice(0, hashIdx) + `#${tagName} ` + val.slice(start);
        domRefs.textarea.value = newVal;
        const newPos = hashIdx + tagName.length + 2;
        domRefs.textarea.setSelectionRange(newPos, newPos);
        domRefs.textarea.focus();
        domRefs.tagMenu.style.display = 'none';
    }
}

function insertText(text, wrap, offset) {
    const el = domRefs.textarea;
    el.focus();
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const sel = el.value.substring(start, end);
    let result = sel ? (wrap + sel + (wrap === '[' || wrap === '!' ? ']()' : wrap)) : text;
    if (sel) offset = 0;
    
    el.value = el.value.substring(0, start) + result + el.value.substring(end);
    const pos = start + result.length - offset;
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event('input'));
}

function checkToken() {
    if (!memosOpenId) {
        domRefs.optionPanel.classList.remove("d-none");
        cocoMessage.info('请设置 Access Tokens');
    } else {
        memoFetch(`${memosPath}/api/v1/tag`).then(res => {
            window.memosTags = res;
            domRefs.innerPanel.classList.remove("d-none");
            domRefs.optionPanel.classList.add("d-none");
        }).catch(() => {
            domRefs.optionPanel.classList.remove("d-none");
            cocoMessage.error('Token 有误');
        });
    }
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
        cocoMessage.info('上传中...');
        const res = await fetch(`${memosPath}/api/v1/resource/blob`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${memosOpenId}` },
            body: formData
        }).then(r => r.json());
        
        const list = JSON.parse(window.localStorage?.getItem("memos-resource-list") || "[]");
        list.push(res.id);
        window.localStorage?.setItem("memos-resource-list", JSON.stringify(list));
        
        const link = res.externalLink || `${memosPath}/o/r/${res.id}`;
        domRefs.imageList.insertAdjacentHTML('afterbegin', 
            `<div data-id="${res.id}" class="imagelist-item d-flex text-xs mt-2 mr-2" onclick="deleteImage(this)"><div class="d-flex memos-up-image" style="background-image:url(${link})"></div></div>`
        );
        cocoMessage.success('上传成功');
    } catch (e) {
        cocoMessage.error('上传失败');
    }
}

let emojiPicker;
let emojiCloseHandler = null;
function showEmojiPicker(btn) {
    if (emojiPicker) {
        emojiPicker.remove();
        emojiPicker = null;
        if (emojiCloseHandler) {
            document.removeEventListener('click', emojiCloseHandler);
            emojiCloseHandler = null;
        }
        return;
    }
    emojiPicker = document.createElement('div');
    emojiPicker.className = 'emoji-selector';
    emojiPicker.innerHTML = emojisData.map(e => `<div class="emoji-item" title="${e.text}">${e.icon}</div>`).join('');
    
    emojiPicker.addEventListener('click', (e) => {
        if (e.target.classList.contains('emoji-item')) {
            insertText(e.target.innerText, '', 0);
        }
    });
    
    document.querySelector(".memos-editor-footer").after(emojiPicker);
    
    emojiCloseHandler = (e) => {
        if (btn.contains(e.target) || emojiPicker.contains(e.target)) return;
        emojiPicker.remove();
        emojiPicker = null;
        document.removeEventListener('click', emojiCloseHandler);
        emojiCloseHandler = null;
    };
    setTimeout(() => document.addEventListener('click', emojiCloseHandler), 0);
}

function resetEditorState() {
    domRefs.visibilitySelect.value = window.memosOldSelect;
    domRefs.textarea.value = '';
    domRefs.textarea.style.height = 'inherit';
    domRefs.imageList.innerHTML = '';
    domRefs.submitBtn.classList.remove("d-none");
    domRefs.editMemoDom.classList.add("d-none");
    window.localStorage?.removeItem("memos-resource-list");
    window.localStorage?.removeItem("memos-editor-dataform");
}

function togglePrivateMode(btn) {
    const isPrivate = btn.classList.toggle("private");
    domRefs.visibilitySelect.value = isPrivate ? "PRIVATE" : "PUBLIC";
    const mode = isPrivate ? "NOPUBLIC" : "";
    window.localStorage?.setItem("memos-mode", mode);
    reloadList(mode);
    cocoMessage.success(isPrivate ? "已进入私有浏览" : "已退出私有浏览");
}

function toggleOneDay(btn) {
    const isOneDay = window.localStorage?.getItem("memos-oneday");
    if (!isOneDay) {
        window.localStorage?.setItem("memos-oneday", "open");
        cocoMessage.success("已开启回忆，请刷新");
    } else {
        window.localStorage?.removeItem("memos-oneday");
        reloadList();
        cocoMessage.success("已退出回忆");
    }
}

function switchUser() {
    domRefs.optionPanel.classList.remove("d-none");
    domRefs.innerPanel.classList.add("d-none");
    document.querySelector(".memos-token-input").value = '';
}

function getEditorHtml() {
    return `
<div class="memos-editor animate__animated animate__fadeIn d-none col-12">
  <div class="memos-editor-body">
    <div class="memos-editor-inner animate__animated animate__fadeIn d-none">
      <div class="memos-editor-content"><textarea class="memos-editor-textarea text-sm" rows="1" placeholder="唠叨点什么..."></textarea></div>
      <div id="memos-tag-menu" style="display:none;"></div>
      <div class="memos-image-list d-flex flex-fill line-xl"></div>
      <div class="memos-editor-footer border-t"><div class="d-flex">
          <div class="button outline action-btn code-single"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg></div>
          <div class="button outline action-btn link-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M10.59 13.41c.41.39.41 1.03 0 1.42c-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0a5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24a2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24m2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0a5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24a2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24a.973.973 0 0 1 0-1.42"/></svg></div>
          <div class="button outline action-btn link-img"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1 2-2V5c0-1-1-2-2-2m0 15.92c-.02.03-.06.06-.08.08H3V5.08L3.08 5h17.83c.03.02.06.06.08.08v13.84zm-10-3.41L8.5 12.5L5 17h14l-4.5-6z"/></svg></div>
          <div class="button outline action-btn biao-qing"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg></div>
          <div class="memos-more-ico"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M5 10a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4m7 0a2 2 0 1 1 0 4a2 2 0 0 1 0-4"/></g></svg>
            <div class="memos-xiala">
              <div class="code-btn">代码</div><div class="image-btn">图片<input class="memos-upload-image-input d-none" type="file" accept="image/*"></div>
              <div class="switchUser-btn">帐户</div><div class="private-btn">私有</div><div class="oneday-btn">回忆</div>
            </div>
          </div></div>
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
  </div><div class="memos-random d-none"></div>
</div>`;
}

})(); // End IIFE