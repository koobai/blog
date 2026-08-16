document.addEventListener("DOMContentLoaded", () => {
  'use strict';

  const INITIAL_VISIBLE = 16;
  const BATCH_SIZE = 32;
  const LAYOUT_GAP = 15;
  const DESKTOP_QUERY = '(min-width: 768px)';
  const layout = document.querySelector('.ticket-layout');
  const btnLoadMore = document.getElementById('btn-load-more');
  const btnLoadMoreLabel = btnLoadMore?.querySelector('.movie-btn-more-label');
  const btnLoadMoreProgress = btnLoadMore?.querySelector('.movie-btn-more-progress');

  if (!layout) return;

  const allMovies = Array.from(layout.querySelectorAll('.review-card'));
  if (allMovies.length === 0) return;

  const desktopMedia = window.matchMedia(DESKTOP_QUERY);
  const supportsGridLanes = typeof CSS !== 'undefined'
    && typeof CSS.supports === 'function'
    && CSS.supports('display', 'grid-lanes');
  let currentIndex = Math.min(INITIAL_VISIBLE, allMovies.length);
  let layoutFrame = 0;
  let lastLayoutWidth = 0;

  const clearMasonry = () => {
    layout.classList.remove('is-js-masonry');
    layout.style.removeProperty('height');
  };

  const layoutMasonry = () => {
    layoutFrame = 0;

    if (supportsGridLanes || !desktopMedia.matches) {
      clearMasonry();
      lastLayoutWidth = layout.getBoundingClientRect().width;
      return;
    }

    const visibleMovies = allMovies.filter(movie => !movie.classList.contains('is-hidden'));
    if (visibleMovies.length === 0) {
      clearMasonry();
      lastLayoutWidth = layout.getBoundingClientRect().width;
      return;
    }

    // Restore the regular grid while measuring so every card gets its natural
    // two-column width. All reads happen before the positioning writes below.
    clearMasonry();
    const layoutWidth = layout.getBoundingClientRect().width;
    const columnWidth = (layoutWidth - LAYOUT_GAP) / 2;
    const movieHeights = visibleMovies.map(movie => movie.getBoundingClientRect().height);
    const columnHeights = [0, 0];

    visibleMovies.forEach((movie, index) => {
      const column = index % 2;
      const x = column * (columnWidth + LAYOUT_GAP);
      const y = columnHeights[column];

      movie.style.setProperty('--movie-masonry-x', `${x}px`);
      movie.style.setProperty('--movie-masonry-y', `${y}px`);
      columnHeights[column] += movieHeights[index] + LAYOUT_GAP;
    });

    const layoutHeight = Math.max(...columnHeights) - LAYOUT_GAP;
    layout.style.height = `${Math.max(0, layoutHeight)}px`;
    layout.classList.add('is-js-masonry');
    lastLayoutWidth = layoutWidth;
  };

  const scheduleMasonry = () => {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(layoutMasonry);
  };

  const updatePagination = () => {
    allMovies.forEach((movie, index) => {
      movie.classList.toggle('is-hidden', index >= currentIndex);
    });

    if (btnLoadMore) {
      const isComplete = currentIndex >= allMovies.length;

      btnLoadMore.hidden = false;
      btnLoadMore.disabled = isComplete;
      btnLoadMore.classList.toggle('is-complete', isComplete);

      if (btnLoadMoreLabel) {
        btnLoadMoreLabel.textContent = isComplete ? '票夹见底' : '再翻一叠';
      }

      if (btnLoadMoreProgress) {
        btnLoadMoreProgress.textContent = isComplete
          ? `共 ${allMovies.length} 张`
          : `${currentIndex} / ${allMovies.length}`;
      }

      btnLoadMore.setAttribute(
        'aria-label',
        isComplete
          ? `票夹见底，共 ${allMovies.length} 张票根`
          : `再翻一叠，已展开 ${currentIndex} 张，共 ${allMovies.length} 张票根`
      );
    }
  };

  const restoreReadingPosition = (scrollTop, focusTarget) => {
    // Wait until the masonry frame and the browser's scroll anchoring have
    // settled, then return to the point where the next batch was requested.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollTop, behavior: 'auto' });
        if (focusTarget) focusTarget.focus({ preventScroll: true });
      });
    });
  };

  updatePagination();
  scheduleMasonry();

  if (btnLoadMore) {
    btnLoadMore.addEventListener('click', event => {
      const scrollTop = window.scrollY;
      const firstNewMovie = allMovies[currentIndex];
      const focusTarget = event.detail === 0
        ? firstNewMovie.querySelector('.rc-title a')
        : null;

      btnLoadMore.blur();
      currentIndex = Math.min(currentIndex + BATCH_SIZE, allMovies.length);
      updatePagination();
      scheduleMasonry();
      restoreReadingPosition(scrollTop, focusTarget);
    });
  }

  if (!supportsGridLanes && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleMasonry);
  }

  if (!supportsGridLanes && typeof ResizeObserver === 'function') {
    const resizeObserver = new ResizeObserver(entries => {
      const width = entries[0] ? entries[0].contentRect.width : 0;
      if (Math.abs(width - lastLayoutWidth) < 0.5) return;
      scheduleMasonry();
    });

    resizeObserver.observe(layout);
  } else if (!supportsGridLanes) {
    window.addEventListener('resize', scheduleMasonry, { passive: true });
  }
});
