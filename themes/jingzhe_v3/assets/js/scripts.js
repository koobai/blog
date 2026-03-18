// 灯箱调用(首页顶部/Memos页面)
window.ViewImage && ViewImage.init('.article-cover-img,.post-figure img,.laodao-photo');

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