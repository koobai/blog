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