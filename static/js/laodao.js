let cachedLikesData = null;

async function getLikesData() {
  if (cachedLikesData) return cachedLikesData;
  const LIKE_API_BASE = 'https://likes.koobai.com/api/likes';
  try {
    const res = await fetch(LIKE_API_BASE);
    if (res.ok) cachedLikesData = await res.json();
  } catch (e) { console.error('获取赞失败', e); }
  return cachedLikesData || { counts: {}, myLikes: [] };
}

async function initLikes() {
  const triggers = document.querySelectorAll('.koobai-like-trigger:not(.initialized)');
  if (triggers.length === 0) return;

  const data = await getLikesData();
  const likesMap = data.counts || {};
  const myLikes = data.myLikes || [];

  triggers.forEach(trigger => {
    trigger.classList.add('initialized'); 
    const url = trigger.getAttribute('data-url');
    const tooltip = trigger.querySelector('.koobai-tooltip');

    let count = likesMap[url] || 0;
    let isLikedLocally = false;
    try {
      isLikedLocally = !!localStorage.getItem(`liked_${url}`);
    } catch (e) {}

    let isLiked = myLikes.includes(url) || isLikedLocally;

    if (isLiked) {
      trigger.classList.add('liked');
      count = Math.max(count, 1);
    }

    const updateText = () => {
      if (count === 0) {
        tooltip.textContent = ''; 
      } else {
        tooltip.textContent = isLiked ? (count === 1 ? '你悄悄点了个赞' : `你和其他 ${count - 1} 人悄悄点赞`) : `${count} 人悄悄点赞`;
      }
    };
    updateText();

    trigger.addEventListener('click', () => {
      // 🚀 优化 4：直接用 JS 变量 isLiked 判断，极速且优雅
      if (isLiked) {
        tooltip.textContent = '已经悄悄记下你的赞啦~';
        tooltip.classList.add('force-show');
        setTimeout(() => { updateText(); tooltip.classList.remove('force-show'); }, 1500);
        return;
      }

      trigger.classList.add('liked', 'animating');
      isLiked = true; // 同步更新局部状态
      count++;
      try { localStorage.setItem(`liked_${url}`, 'true'); } catch (e) {}
      
      // 🚀 优化 3：同步更新全局缓存，确保“加载更多”或其他地方调用时数据绝对一致！
      if (cachedLikesData) {
        cachedLikesData.counts[url] = count;
        if (!cachedLikesData.myLikes.includes(url)) {
          cachedLikesData.myLikes.push(url);
        }
      }

      updateText();

      const bubble = document.createElement('span');
      bubble.className = 'koobai-floating-plus';
      bubble.textContent = '+1';
      trigger.appendChild(bubble);
      setTimeout(() => bubble.remove(), 800);

      // 后台静默发送
      fetch('https://likes.koobai.com/api/likes/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      }).catch(()=>{});
    });
  });
}

// ========= 下方的无刷新加载逻辑保持完全不变 =========
document.addEventListener("DOMContentLoaded", () => {
  initLikes();

  const loadMoreBtn = document.getElementById("laoda-more-btn");
  const timeline = document.getElementById("index-card-timeline");
  if (!loadMoreBtn || !timeline) return;

  loadMoreBtn.addEventListener("click", async function() {
    const nextUrl = this.dataset.nextUrl;
    if (!nextUrl) return;

    const originalText = this.innerText;
    this.innerText = "加载中...";
    this.style.opacity = "0.6";
    this.style.pointerEvents = "none";

    try {
      const response = await fetch(nextUrl);
      if (!response.ok) throw new Error("NetErr");
      const html = await response.text();
      
      const doc = new DOMParser().parseFromString(html, "text/html");
      const newItems = doc.querySelectorAll("#index-card-timeline > .card-timeline");

      const fragment = document.createDocumentFragment();
      newItems.forEach(item => fragment.appendChild(item));
      timeline.appendChild(fragment);

      const newBtn = doc.getElementById("laoda-more-btn");
      if (newBtn && newBtn.dataset.nextUrl) {
        this.dataset.nextUrl = newBtn.dataset.nextUrl;
        this.innerText = originalText;
        this.style.opacity = "1";
        this.style.pointerEvents = "auto";
      } else {
        this.parentNode.remove(); 
      }

      initLikes(); // 命中带有最新数据的内存缓存

    } catch (err) {
      console.error("Timeline Load Error:", err);
      this.innerText = "网络开小差了，点击重试";
      this.style.opacity = "1";
      this.style.pointerEvents = "auto";
    }
  });
});