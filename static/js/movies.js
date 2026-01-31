// 分页加载更多 (保持不变)
  let visibleMovies = 27; 
  const movies_loadMore = document.getElementById('movies_loadMore');
  const allMovies = document.querySelectorAll('.movies_bankuai'); 

  function updateVisibility() {
    allMovies.forEach((movie, idx) => {
      movie.style.display = idx < visibleMovies ? 'block' : 'none';
    });

    if (movies_loadMore && visibleMovies >= allMovies.length) {
      movies_loadMore.style.display = 'none';
    }
  }

  if (movies_loadMore) {
    movies_loadMore.addEventListener('click', () => {
      visibleMovies += 27; 
      updateVisibility(); 
    });
  }

  if (allMovies.length > 0) {
    updateVisibility();
  }
});