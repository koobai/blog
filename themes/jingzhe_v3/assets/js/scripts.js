// 灯箱调用(首页顶部/Memos页面)
window.ViewImage && ViewImage.init('.article-cover-img,.post-figure img,.laodao-photo');

// ==========================================
// 极简原生时间格式化
// ==========================================
window.formatDate = (time, isExact = true, forceShort = false) => {
    if (!time) return '';

    let ts = isNaN(time) ? new Date(time).getTime() : Number(time);
    if (ts < 1e12) ts *= 1000; 

    const now = new Date();
    const target = new Date(ts);
    const diff = now.getTime() - ts;

    const pad = n => String(n).padStart(2, '0');

    const Y = target.getFullYear();
    const M = pad(target.getMonth() + 1);
    const D = pad(target.getDate());
    const H = pad(target.getHours());
    const m = pad(target.getMinutes());

    const timeSuffix = isExact ? ` ${H}:${m}` : '';

    // 1. 判断“今天”
    if (now.toDateString() === target.toDateString()) {
        if (diff < 60000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`;
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        return `${Math.floor(diff / 3600000)} 小时前`;
    }

    // 2. 判断“昨天”
    const yesterday = new Date(now.getTime() - 86400000);
    if (yesterday.toDateString() === target.toDateString()) {
        return isExact ? `昨天 ${H}:${m}` : `昨天`; 
    }

    // 3. 🌟 核心修复：如果开启了 forceShort，无论哪一年都只返回 月-日
    if (forceShort) {
        return `${M}-${D}${timeSuffix}`;
    }

    // 4. 原有的跨年逻辑 (针对推特流等其他地方)
    if (now.getFullYear() === target.getFullYear()) {
        return `${M}-${D}${timeSuffix}`;
    }
    return `${Y}-${M}-${D}${timeSuffix}`;
};

// 全局时间调用显示 (Hugo 页面渲染)
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.twitter-time').forEach(el => {
        if (el.dataset.time) {
            // 分别独立获取两个开关的状态
            const isExact = el.dataset.exact === 'true'; // 控制：是否显示 小时:分钟
            const forceShort = el.dataset.short === 'true'; // 控制：是否强行不显示 年份

            // 互不干扰地传给 formatDate 函数
            el.innerText = window.formatDate(el.dataset.time, isExact, forceShort);
        }
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