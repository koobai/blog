const KOOBAI_LIKES_RUNTIME = window.JINGZHE_CONFIG || {};
const KOOBAI_LIKES_CONFIG = (KOOBAI_LIKES_RUNTIME.services && KOOBAI_LIKES_RUNTIME.services.social) || {};
const KOOBAI_LIKES_API_BASE = KOOBAI_LIKES_CONFIG.likesapi || '';
const KOOBAI_LIKES_SUBMIT_URL = KOOBAI_LIKES_CONFIG.likessubmiturl || '';
const KOOBAI_LIKES_TURNSTILE_SITE_KEY = KOOBAI_LIKES_CONFIG.turnstilesitekey || '';

let cachedLikesData = null;

async function getLikesData() {
  if (cachedLikesData) return cachedLikesData;
  if (!KOOBAI_LIKES_API_BASE) return { counts: {}, myLikes: [] };
  try {
    const res = await fetch(KOOBAI_LIKES_API_BASE);
    if (res.ok) cachedLikesData = await res.json();
  } catch (e) { console.error('获取赞失败', e); }
  return cachedLikesData || { counts: {}, myLikes: [] };
}

function getLikeVerificationToken() {
  return new Promise(resolve => {
    if (!KOOBAI_LIKES_TURNSTILE_SITE_KEY || typeof turnstile === 'undefined') {
      resolve(null);
      return;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    let widgetId = null;
    let settled = false;
    const finish = token => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (widgetId !== null) turnstile.remove(widgetId);
      container.remove();
      resolve(token || null);
    };
    const timeoutId = setTimeout(() => finish(null), 10000);

    try {
      widgetId = turnstile.render(container, {
        sitekey: KOOBAI_LIKES_TURNSTILE_SITE_KEY,
        size: 'invisible',
        action: 'like_laodao',
        callback: token => finish(token),
        'error-callback': () => finish(null),
        'timeout-callback': () => finish(null)
      });
    } catch (_error) {
      finish(null);
    }
  });
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

    let count = Number(likesMap[url]) || 0;
    let pending = false;
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
    let tooltipTimer = null;
    const showTemporaryTooltip = (message, duration, restoreText = true) => {
      clearTimeout(tooltipTimer);
      if (message !== null) tooltip.textContent = message;
      tooltip.classList.add('force-show');
      tooltipTimer = setTimeout(() => {
        if (restoreText) updateText();
        tooltip.classList.remove('force-show');
      }, duration);
    };
    updateText();

    trigger.addEventListener('click', async () => {
      if (isLiked) {
        showTemporaryTooltip('已悄悄记下你的赞', 1500);
        return;
      }
      if (pending) return;

      const previousCount = count;
      const optimisticState = JingzheLikes.applyOptimisticLike(previousCount);
      pending = true;
      isLiked = optimisticState.liked;
      count = optimisticState.count;
      trigger.classList.add('liked', 'animating');
      if (optimisticState.persist) {
        try { localStorage.setItem(`liked_${url}`, 'true'); } catch (_error) {}
      }
      updateText();
      showTemporaryTooltip(null, 800, false);

      const bubble = document.createElement('span');
      bubble.className = 'koobai-floating-plus';
      bubble.textContent = '+1';
      trigger.appendChild(bubble);
      setTimeout(() => bubble.remove(), 800);

      try {
        const token = await getLikeVerificationToken();
        const result = await JingzheLikes.submitLike({
          url,
          token,
          submitUrl: KOOBAI_LIKES_SUBMIT_URL
        });

        const nextState = JingzheLikes.applyLikeResult(previousCount, result);
        if (!nextState.liked) {
          isLiked = false;
          count = previousCount;
          trigger.classList.remove('liked');
          try { localStorage.removeItem(`liked_${url}`); } catch (_error) {}
          showTemporaryTooltip('点赞失败，点击重试', 1800);
          return;
        }

        count = nextState.count;
        isLiked = true;
        trigger.classList.add('liked');

        if (cachedLikesData) {
          cachedLikesData.counts = cachedLikesData.counts || {};
          cachedLikesData.myLikes = cachedLikesData.myLikes || [];
          cachedLikesData.counts[url] = count;
          if (!cachedLikesData.myLikes.includes(url)) cachedLikesData.myLikes.push(url);
        }

        updateText();
      } catch (error) {
        console.error('点赞提交失败:', error);
        isLiked = false;
        count = previousCount;
        trigger.classList.remove('liked');
        try { localStorage.removeItem(`liked_${url}`); } catch (_error) {}
        showTemporaryTooltip('点赞失败，点击重试', 1800);
      } finally {
        pending = false;
        trigger.classList.remove('animating');
      }
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
