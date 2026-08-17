// 切换主题模式
(function () {
    const root = document.documentElement;
    const key = 'theme';

    const apply = (mode, save = false) => {
       const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
       const isDarkMode = mode === 'dark' || (mode === 'auto' && isSystemDark);
       root.classList.toggle('dark', isDarkMode);

        mode === 'auto' ? root.removeAttribute('data-theme') : root.setAttribute('data-theme', mode);

        if (save) {
            mode === 'auto' ? localStorage.removeItem(key) : localStorage.setItem(key, mode);
        }

        document.querySelectorAll('.theme-item').forEach(item => {
            const isActive = item.dataset.mode === mode;
            item.classList.toggle('active', isActive);
            item.setAttribute('aria-pressed', String(isActive));
        });
    };

    const saved = localStorage.getItem(key) || 'auto';
    apply(saved);

    document.addEventListener('DOMContentLoaded', () => apply(saved));

    document.addEventListener('click', event => {
        const item = event.target.closest('.theme-item');
        if (item) apply(item.dataset.mode, true);
    });

    window.setTheme = (mode) => apply(mode, true);
})();
