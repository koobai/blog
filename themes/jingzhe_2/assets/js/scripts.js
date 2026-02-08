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

// 全局时间调用显示
document.addEventListener("DOMContentLoaded", function() {
  const dateElements = document.querySelectorAll('.twitter-time');

  dateElements.forEach(el => {
    let rawTime = el.getAttribute('data-time');
    if (!rawTime) return;

    let finalTime;

    // 1. 如果是日期字符串 (包含 "-" 或 "/") -> 转为秒
    if (rawTime.includes('-') || rawTime.includes('/')) {
        const dateObj = new Date(rawTime);
        if (!isNaN(dateObj.getTime())) {
            // 【关键修改】getTime() 是毫秒，必须除以 1000 变成秒
            // 这样传入 formatDate 时，让它自己去决定是否要 * 1000
            finalTime = Math.floor(dateObj.getTime() / 1000); 
        }
    } 
    // 2. 否则按纯数字处理 (通常 CSV 里是秒)
    else {
        finalTime = parseInt(rawTime);
    }

    // 调用全局格式化函数
    if (finalTime && typeof window.formatDate === 'function') {
      el.innerText = window.formatDate(finalTime);
    }
  });
});


// ============================================================
// 全站统一搜索
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById('unified-search-input');
    const list = document.getElementById('unified-search-list');
    if (!input || !list) return;

    // 配置与状态
    const MEMOS_API = `https://memos.koobai.com/api/v1/memos?parent=users/1&pageSize=1000`;
    let db = { blog: [], memos: [] }, loaded = false, timer;

    // 通用清洗函数：去Markdown、去HTML、转纯文本
    const clean = (s) => (s || '').replace(/!\[.*?\]\(.*?\)/g, '[图片]').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/[#*`]/g, '').replace(/<[^>]+>/g, '').trim();
    
    // 通用格式化时间
    const fmtDate = (ts) => typeof window.formatDate === 'function' ? window.formatDate(ts) : new Date(ts * 1000).toLocaleDateString();

    // 1. 核心：加载并标准化数据
    const load = async () => {
        if (loaded) return;
        try {
            const [bRes, mRes] = await Promise.allSettled([
                fetch('/index.json').then(r => r.json()),
                fetch(MEMOS_API).then(r => r.json())
            ]);

            // 标准化 Blog 数据
            if (bRes.value) db.blog = bRes.value.map(x => ({
                title: x.title,
                link: x.permalink,
                _txt: clean(x.title + x.content) 
            }));

            // 标准化 Memos 数据
            if (mRes.value?.memos) db.memos = mRes.value.memos.map(x => {
                const ts = x.createTime ? Math.floor(new Date(x.createTime) / 1000) : Date.now() / 1000;
                return {
                    title: `${fmtDate(ts)}`,
                    link: `/?memo=${x.name.split('/').pop()}`,
                    _txt: clean(x.content)
                };
            });

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

            // 智能截取
            const idx = low.indexOf(terms[0]);
            const start = Math.max(0, idx - 10);
            const snip = (start > 0 ? '...' : '') + item._txt.substring(start, start + 50) + '...';
            
            // 高亮处理
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