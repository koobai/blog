// 段落目录导航
document.addEventListener("DOMContentLoaded", () => {
    const toc = document.querySelector('.paragraph-dh');
    if (!toc) return;

    const postTitle = document.querySelector('.article_details_title');
    if (postTitle) {
        const titleObserver = new IntersectionObserver(([entry]) => {
            toc.style.opacity = entry.isIntersecting ? "0" : "1";
            toc.style.pointerEvents = entry.isIntersecting ? "none" : "auto"; 
        });
        titleObserver.observe(postTitle);
    }

    let isClickScrolling = false;
    let scrollTimeout;

    const headingObserver = new IntersectionObserver(entries => {
        if (isClickScrolling) return;

        entries.forEach(entry => {
            if (entry.isIntersecting) {
                toc.querySelectorAll('a.active').forEach(a => a.classList.remove('active'));
                const targetLink = toc.querySelector(`a[href="#${entry.target.id}"]`);
                if (targetLink) targetLink.classList.add('active');
            }
        });
    }, { rootMargin: '-10% 0px -80% 0px' });

    document.querySelectorAll('.content h2[id], .content h3[id]').forEach(h => headingObserver.observe(h));

    toc.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        e.preventDefault(); 
        
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) return;

        const targetId = href.substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
            toc.querySelectorAll('a.active').forEach(a => a.classList.remove('active'));
            link.classList.add('active');

            isClickScrolling = true;
            targetElement.scrollIntoView({ behavior: 'smooth' });
            
            history.replaceState(null, null, href);

            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                isClickScrolling = false;
            }, 800);
        }
    });
});