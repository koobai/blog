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
            item.classList.toggle('active', item.dataset.mode === mode);
        });
    };

    const saved = localStorage.getItem(key) || 'auto';
    apply(saved);

    document.addEventListener('DOMContentLoaded', () => apply(saved));

    window.setTheme = (mode) => apply(mode, true);
})();