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
window.formatDate = (time, isExact = true) => {
    if (!time) return '';

    // 兼容处理：秒级/毫秒级时间戳、或者时间格式字符串
    let ts = isNaN(time) ? new Date(time).getTime() : Number(time);
    if (ts < 1e12) ts *= 1000; 

    const now = new Date();
    const target = new Date(ts);
    const diff = now.getTime() - ts;

    // 极简补零辅助函数
    const pad = n => String(n).padStart(2, '0');

    const Y = target.getFullYear();
    const M = pad(target.getMonth() + 1);
    const D = pad(target.getDate());
    const H = pad(target.getHours());
    const m = pad(target.getMinutes());

    const timeSuffix = isExact ? ` ${H}:${m}` : '';

    // 1. 判断“今天” (利用 toDateString 极简判断日历日)
    if (now.toDateString() === target.toDateString()) {
        if (diff < 60000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`;
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        return `${Math.floor(diff / 3600000)} 小时前`;
    }

    // 2. 判断“昨天” (当前时间减去24小时后的日历对比)
    const yesterday = new Date(now.getTime() - 86400000);
    if (yesterday.toDateString() === target.toDateString()) {
        return isExact ? `昨天 ${H}:${m}` : `昨天`; 
    }

    // 3. 判断“今年”
    if (now.getFullYear() === target.getFullYear()) {
        return `${M}月${D}日${timeSuffix}`;
    }

    // 4. 往年 (跨年)
    return `${Y}年${M}月${D}日${timeSuffix}`;
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