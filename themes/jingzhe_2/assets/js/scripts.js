//手机端菜单导航
var body = document.querySelector('body');
var menuTrigger = document.querySelector('#toggle-menu-main-mobile');
var menuContainer = document.querySelector('#menu-main-mobile');
var hamburgerIcon = document.querySelector('.hamburger');
var menuLinks = document.querySelectorAll('#menu-main-mobile .menu a');

if (menuTrigger !== null) {
  menuTrigger.addEventListener('click', function(e) {
    menuContainer.classList.toggle('open');
    hamburgerIcon.classList.toggle('is-active');
    body.classList.toggle('lock-scroll');
  });

  menuLinks.forEach(function(link) {
    link.addEventListener('click', function() {
      menuContainer.classList.remove('open');
      hamburgerIcon.classList.remove('is-active');
      body.classList.remove('lock-scroll');
    });
  });
}

// 灯箱调用(首页顶部/Memos页面)
window.ViewImage && ViewImage.init('.content_zhengwen img, .top-img,.gallery-thumbnail img,.posts_photo a,.photo-moment a');

// 页面上滑加载动画
function animateSummaries() {
  const articles = document.querySelectorAll('.img-hide, .retu-hide');
  if (articles.length === 0) return;
  const options = {
    // 意思是在元素进入屏幕前一点点就开始准备，防止滑太快出现空白
    rootMargin: '0px 0px 50px 0px', 
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const target = entry.target;

        const randomDelay = Math.random() * 150; 
        
        setTimeout(() => {
          target.classList.add('visible');
        }, randomDelay);
        observer.unobserve(target);
      }
    });
  }, options);
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