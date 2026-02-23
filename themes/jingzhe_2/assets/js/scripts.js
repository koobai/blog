var body = document.querySelector('body');
var menuTrigger = document.querySelector('#toggle-menu-main-mobile');
var menuContainer = document.querySelector('#menu-main-mobile');
var hamburgerIcon = document.querySelector('.hamburger');

if (menuTrigger !== null) {
  menuTrigger.addEventListener('click', function(e) {
    menuContainer.classList.toggle('open');
    hamburgerIcon.classList.toggle('is-active');
    body.classList.toggle('lock-scroll');
  });
}
// 回到顶部
window.onscroll=function(){(document.body.scrollTop>500||document.documentElement.scrollTop>500)?document.getElementById("gotop").style.display="block":document.getElementById("gotop").style.display="none"};function smoothScrollTop(){var e=null;cancelAnimationFrame(e),e=requestAnimationFrame(function n(){var o=document.body.scrollTop||document.documentElement.scrollTop;o>0?(document.body.scrollTop=document.documentElement.scrollTop=o-150,e=requestAnimationFrame(n)):cancelAnimationFrame(e)})}

// 灯箱调用(首页顶部/Memos页面)
window.ViewImage && ViewImage.init('.content_zhengwen img, .top-img,.gallery-thumbnail img,.posts_photo a,.photo-moment a');

// 页面上滑加载动画
function animateSummaries() {
  // 1. 选取所有需要动画的元素
  const articles = document.querySelectorAll('.img-hide, .retu-hide');
  
  // 如果没找到元素，直接退出，防止报错
  if (articles.length === 0) return;

  // 2. 观察器配置
  const options = {
    // 关键：rootMargin 设为 '0px' 或者 '50px' 都可以
    // 意思是在元素进入屏幕前一点点就开始准备，防止滑太快出现空白
    rootMargin: '0px 0px 50px 0px', 
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      // 只要元素进入视口（哪怕只有一丁点）
      if (entry.isIntersecting) {
        const target = entry.target;
        
        // --- 核心：随机呼吸感 ---
        // 生成一个 0 到 150 毫秒的随机延迟
        // 这样每个元素出来的时机都不一样，就像你原来的那样自然
        const randomDelay = Math.random() * 150; 
        
        setTimeout(() => {
          // 添加类名，让 CSS 负责显示
          target.classList.add('visible');
        }, randomDelay);

        // 动画只做一次，做完就解绑，节省性能
        observer.unobserve(target);
      }
    });
  }, options);

  // 3. 开始观察所有元素
  // 不需要这里打乱顺序，上面的 randomDelay 已经足够产生“乱序感”了
  articles.forEach((article) => {
    observer.observe(article);
  });
}
animateSummaries();

// ==========================================
// 极简原生时间格式化
// ==========================================
window.formatDate = (time, isExact = false) => {
    if (!time) return '';

    let ts = isNaN(time) ? new Date(time).getTime() : Number(time);
    if (ts < 1e12) ts *= 1000;

    const now = Date.now();
    const diff = now - ts;
    const target = new Date(ts);

    if (diff < 60000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

    const [Y, M, D, H, m] = [
        target.getFullYear(),
        target.getMonth() + 1,
        target.getDate(),
        target.getHours(),
        target.getMinutes()
    ].map(n => String(n).padStart(2, '0'));

    return `${Y == new Date().getFullYear() ? '' : Y + '年'}${M}月${D}日${isExact ? ` ${H}:${m}` : ''}`;
};

// 全局时间调用显示 (Hugo 页面渲染)
document.addEventListener("DOMContentLoaded", () => {
    // 使用现代的 data-* API 与箭头函数精简遍历
    document.querySelectorAll('.twitter-time').forEach(el => {
        if (el.dataset.time) el.innerText = window.formatDate(el.dataset.time, false);
    });
});


// ============================================================
// 全站统一搜索
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById('unified-search-input');
    const list = document.getElementById('unified-search-list');
    if (!input || !list) return;

    // 配置
    const MEMOS_BASE_URL = `https://memos.koobai.com/api/v1/memos?parent=users/1`;
    let db = { blog: [], memos: [] }, loaded = false, timer;

    // 通用清洗函数
    const clean = (s) => (s || '').replace(/!\[.*?\]\(.*?\)/g, '[图片]').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/[#*`]/g, '').replace(/<[^>]+>/g, '').trim();
    
    // 通用格式化时间
    const fmtDate = (ts) => typeof window.formatDate === 'function' ? window.formatDate(ts) : new Date(ts * 1000).toLocaleDateString();

    // --- 新增：专门用于循环拉取所有 Memos 的函数 ---
    const fetchAllMemos = async () => {
        let allMemos = [];
        let pageToken = '';
        
        // 循环直到没有下一页
        do {
            // 每次只取 200 条，更稳妥，不容易被后端截断
            const url = `${MEMOS_BASE_URL}&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`;
            const res = await fetch(url).then(r => r.json());
            
            if (res.memos) {
                // 前端双重过滤：确保只收录 PUBLIC 状态的
                const publicMemos = res.memos.filter(m => m.visibility === 'PUBLIC');
                allMemos = allMemos.concat(publicMemos);
            }
            
            pageToken = res.nextPageToken; // 获取下一页标记
        } while (pageToken);

        return allMemos;
    };

    // 1. 核心：加载并标准化数据
    const load = async () => {
        if (loaded) return;
        
        try {
            // 并行加载：文章(一次性) + 动态(循环分页)
            const [bRes, mRes] = await Promise.allSettled([
                fetch('/index.json').then(r => r.json()),
                fetchAllMemos() // 调用上面的新函数
            ]);

            // 标准化 Blog 数据
            if (bRes.status === 'fulfilled' && bRes.value) {
                db.blog = bRes.value.map(x => ({
                    title: x.title,
                    link: x.permalink,
                    _txt: clean(x.title + x.content) 
                }));
            }

            // 标准化 Memos 数据
            if (mRes.status === 'fulfilled' && mRes.value) {
                db.memos = mRes.value.map(x => {
                    const ts = x.createTime ? Math.floor(new Date(x.createTime) / 1000) : Date.now() / 1000;
                    return {
                        title: `${fmtDate(ts)}`,
                        link: `/?memo=${x.name.split('/').pop()}`,
                        _txt: clean(x.content)
                    };
                });
            }

            loaded = true;
        } catch (e) {
            console.error("索引加载失败", e);
        }
    };

    // 2. 核心：通用搜索渲染器 (极简)
    const scan = (arr, terms, limit, label) => {
        if (!arr.length) return '';
        let html = '', count = 0, reg = new RegExp(`(${terms.join('|')})`, 'gi');

        for (const item of arr) {
            const low = item._txt.toLowerCase();
            if (!terms.every(t => low.includes(t))) continue;

            const idx = low.indexOf(terms[0]);
            const start = Math.max(0, idx - 10);
            const snip = (start > 0 ? '...' : '') + item._txt.substring(start, start + 50) + '...';
            
            const ti = item.title.replace(reg, '<mark class="search-highlight">$1</mark>');
            const sn = snip.replace(reg, '<mark class="search-highlight">$1</mark>');

            html += `<li><a href="${item.link}" target="_blank">
                <span class="search-title">${ti}</span><span class="search-snippet">${sn}</span>
            </a></li>`;
            
            if (++count >= limit) break; 
        }
        return html ? `<li class="search-section-title">${label}</li>${html}` : '';
    };

    // 3. 事件监听
    input.addEventListener('focus', load);
    
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const val = input.value.trim().toLowerCase();
            const safeTerms = val.split(/\s+/).filter(t => t).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            
            if (!safeTerms.length) return list.style.display = 'none';

            const h1 = scan(db.blog, safeTerms, 999, '博文');
            const h2 = scan(db.memos, safeTerms, 20, '唠叨');

            list.innerHTML = (h1 + h2) || '<li class="search-none">无结果，没写过</li>';
            list.style.display = 'block';
        }, 300);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            list.style.display = 'none';
            input.blur(); 
        }
    });

    document.addEventListener('click', e => {
        if (e.target !== input && !list.contains(e.target)) list.style.display = 'none';
    });
});


// 评论跳转中间页
document.body.addEventListener('click', function(e) {
    const target = e.target.closest('.atk-comment-wrap a');
    
    // 确保是站外链接
    if (target && !target.href.includes('koobai.com')) {
        e.preventDefault();
        
        try {
            const encodedUrl = btoa(encodeURIComponent(target.href));
            const url = '/tiaozhuan?target=' + encodedUrl;
            window.open(url, '_blank');
        } catch (error) {
            console.error("链接编码失败:", error);
            window.open(target.href, '_blank');
        }
    }
});