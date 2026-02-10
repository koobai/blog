// 1. 评论默认隐藏 (优化：使用 const/let，变量名更规范)
function loadComments() {
    const articleComments = document.getElementById("articlecomments");
    const moreCommentsBtn = document.getElementById("MoreComments");
    
    if (!articleComments || !moreCommentsBtn) return; // 防错检查

    articleComments.style.display = "block";
    moreCommentsBtn.style.display = "none";
    
    // 获取按钮位置，平滑滚动
    const buttonRect = moreCommentsBtn.getBoundingClientRect();
    window.scroll({
        top: window.scrollY + buttonRect.top + 300, // 300 是偏移量，可根据实际体验微调
        behavior: 'smooth'
    });
}

// 2. 段落目录导航 (优化：性能与点击健壮性)
document.addEventListener("DOMContentLoaded", () => {
    const postTOC = document.querySelector('.paragraph-dh');
    
    // 如果页面没有目录，直接退出，节省性能
    if (!postTOC) return; 

    // A. 目录高亮逻辑 (保持原逻辑，无需大改)
    const headingObserver = new IntersectionObserver(headings => {
        headings.forEach(({ target, isIntersecting }) => {
            const link = postTOC.querySelector(`a[href="#${target.id}"]`);
            if (isIntersecting && link) {
                postTOC.querySelectorAll('a').forEach(a => a.classList.remove('active'));
                link.classList.add('active');
            }
        });
    }, { rootMargin: '0px 0px -75%' }); // 视口底部 75% 处触发，适合阅读体验

    document.querySelectorAll('.content h2[id], .content h3[id]').forEach(heading => headingObserver.observe(heading));

    // B. 滚动显示目录 (优化：使用 requestAnimationFrame 节流，提升性能)
    let isTicking = false;
    window.addEventListener('scroll', () => {
        if (!isTicking) {
            window.requestAnimationFrame(() => {
                // 逻辑：超过 400px 显示，否则隐藏
                postTOC.style.opacity = (window.pageYOffset > 400) ? 1 : 0;
                isTicking = false;
            });
            isTicking = true;
        }
    });

    // C. 目录点击平滑滚动 (优化：使用 closest 修复子元素点击无效 BUG)
    postTOC.addEventListener('click', (e) => {
        const link = e.target.closest('a'); // 【关键修复】确保获取的是 a 标签
        if (!link) return;

        e.preventDefault();
        const href = link.getAttribute('href');
        if (href) {
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
});