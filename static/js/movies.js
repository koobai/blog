document.addEventListener("DOMContentLoaded", () => {
  'use strict';
  
  const BATCH_SIZE = 28;
  const btnLoadMore = document.getElementById('btn-load-more');
  
  if (!btnLoadMore) return;

  btnLoadMore.addEventListener('click', () => {
    // 找出所有未展示的卡片
    const hiddenMovies = document.querySelectorAll('.movie-card.is-hidden');
    
    // 移除前 BATCH_SIZE 个元素的隐藏类
    for (let i = 0; i < BATCH_SIZE && i < hiddenMovies.length; i++) {
      hiddenMovies[i].classList.remove('is-hidden');
    }

    // 全展示完后隐藏按钮
    if (document.querySelectorAll('.movie-card.is-hidden').length === 0) {
      btnLoadMore.style.display = 'none';
    }
  });
});