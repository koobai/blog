// 现代段落目录导航：零 scroll 事件，极致性能
document.addEventListener("DOMContentLoaded", () => {
    const toc = document.querySelector('.paragraph-dh');
    if (!toc) return;

    // 1. 目录显隐逻辑 (监听主标题)
    // 逻辑：只要文章标题（H1）离开了屏幕视口，说明用户往下读了，此时显示目录。
    const postTitle = document.querySelector('.article_details_title');
    if (postTitle) {
        const titleObserver = new IntersectionObserver(([entry]) => {
            // entry.isIntersecting 为 true 说明标题还在屏幕上，false 说明滚下去了
            toc.style.opacity = entry.isIntersecting ? "0" : "1";
            // 彻底防止隐藏状态下被误触
            toc.style.pointerEvents = entry.isIntersecting ? "none" : "auto"; 
        });
        titleObserver.observe(postTitle); // 死死盯住这个标题
    }

    // 2. 目录高亮逻辑 (屏幕顶部隐形扫描线)
    // rootMargin: '-10% 0px -80% 0px' 意思是：在距离屏幕顶部 10% 到 20% 之间拉一根线
    // 哪个标题滚到了这根线上，就判定它处于 "活跃" 状态
    const headingObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // 清理上一个高亮
                toc.querySelectorAll('a.active').forEach(a => a.classList.remove('active'));
                
                // 点亮当前碰线的目录
                const targetLink = toc.querySelector(`a[href="#${entry.target.id}"]`);
                if (targetLink) targetLink.classList.add('active');
            }
        });
    }, { rootMargin: '-10% 0px -80% 0px' });

    // 把正文里所有带 ID 的 h2 和 h3 喂给观察器
    document.querySelectorAll('.content h2[id], .content h3[id]').forEach(h => headingObserver.observe(h));
});