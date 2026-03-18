document.addEventListener("DOMContentLoaded", () => {
  const loadMoreBtn = document.getElementById("laoda-more-btn");
  const timeline = document.getElementById("index-card-timeline");

  if (!loadMoreBtn || !timeline) return;

  loadMoreBtn.addEventListener("click", async function() {
    const nextUrl = this.dataset.nextUrl;
    if (!nextUrl) return;

    // 1. 状态锁定 (防抖)
    const originalText = this.innerText;
    this.innerText = "加载中...";
    this.style.opacity = "0.6";
    this.style.pointerEvents = "none";

    try {
      // 2. 极速拉取并解析 HTML
      const response = await fetch(nextUrl);
      if (!response.ok) throw new Error("NetErr");
      const html = await response.text();
      
      const doc = new DOMParser().parseFromString(html, "text/html");
      const newItems = doc.querySelectorAll("#index-card-timeline > .card-timeline");

      // 3. 内存级挂载 (DocumentFragment 避免引发页面多次重排)
      const fragment = document.createDocumentFragment();
      newItems.forEach(item => fragment.appendChild(item));
      timeline.appendChild(fragment);

      // 4. 生态链唤醒：时间格式化
      if (typeof window.formatDate === 'function') {
        timeline.querySelectorAll('.twitter-time:not([data-formatted="true"])').forEach(el => {
          if (el.dataset.time) {
            const isExact = el.dataset.exact === 'true';
            const forceShort = el.dataset.short === 'true';
            el.innerText = window.formatDate(el.dataset.time, isExact, forceShort);
            el.dataset.formatted = 'true';
          }
        });
      }

      // 6. 翻页接力与销毁
      const newBtn = doc.getElementById("laoda-more-btn");
      if (newBtn && newBtn.dataset.nextUrl) {
        this.dataset.nextUrl = newBtn.dataset.nextUrl;
        this.innerText = originalText;
        this.style.opacity = "1";
        this.style.pointerEvents = "auto";
      } else {
        // 没有下一页了，优雅销毁自身 DOM
        this.parentNode.remove(); 
      }

    } catch (err) {
      console.error("Timeline Load Error:", err);
      this.innerText = "网络开小差了，点击重试";
      this.style.opacity = "1";
      this.style.pointerEvents = "auto";
    }
  });
});