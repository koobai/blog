document.addEventListener("DOMContentLoaded", () => {
  'use strict';
  
  const BATCH_SIZE = 32; // 每次加载的数量
  const btnLoadMore = document.getElementById('btn-load-more');
  
  if (!btnLoadMore) return;

  const allMovies = document.querySelectorAll('.review-card');
  
  let currentIndex = BATCH_SIZE;

  btnLoadMore.addEventListener('click', () => {
    // 保留了静默的防错拦截，去除了所有的 console 打印
    if (allMovies.length === 0) return;

    const end = Math.min(currentIndex + BATCH_SIZE, allMovies.length);

    for (let i = currentIndex; i < end; i++) {
      allMovies[i].classList.remove('is-hidden');
    }

    currentIndex = end;

    if (currentIndex >= allMovies.length) {
      btnLoadMore.style.display = 'none';
    }
  });
});