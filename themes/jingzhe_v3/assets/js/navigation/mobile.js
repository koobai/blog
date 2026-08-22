// 手机端默认展开，滚动时连续收窄；点击胶囊可反向展开并临时固定。
(() => {
  const dock = document.querySelector('.mobile-dock');
  const trigger = dock?.querySelector('.mobile-dock-trigger');
  const currentIcon = trigger?.querySelector('.mobile-dock-current-icon');
  const panel = dock?.querySelector('.mobile-dock-panel');
  const dockItems = [...(dock?.querySelectorAll('.mobile-dock-item') || [])];
  const avatarImages = [...(dock?.querySelectorAll('.mobile-dock-avatar img, .mobile-dock-current-avatar img') || [])];

  if (!dock || !trigger || !currentIcon || !panel) return;

  const mobileQuery = window.matchMedia('(max-width: 767px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const {
    COLLAPSE_DISTANCE,
    clamp,
    lerp,
    range,
    isSameProgress,
    getScrollProgress,
    hasEnoughScrollDistance,
    setStyleProperty
  } = window.JingzheNavMotion;
  const PANEL_INTERACTION_END = 0.18;
  const PINNED_SCROLL_RELEASE_DISTANCE = 18;
  const COMPACT_SIZE = 58;
  const EXPANDED_HEIGHT = 76;
  const MAX_EXPANDED_WIDTH = 400;
  const PANEL_HORIZONTAL_PADDING = 16;
  const expandedLabel = trigger.getAttribute('aria-label') || '主导航';
  const compactLabel = expandedLabel.replace(/^主导航/, '展开主导航');
  let displayProgress = 0;
  let scrollProgress = 0;
  let morphEnabled = false;
  let pinned = false;
  let scrollFrame = 0;
  let animationFrame = 0;
  let activeMenuIndex = -1;
  let hasMenuCurrent = false;
  let panelInteractiveState;
  let compactVisualState;
  let pinnedLastScrollY = 0;
  let pinnedDownwardDistance = 0;
  let manualScrollAnchorY = null;
  let cachedExpandedWidth = 0;
  let layoutMetricsDirty = true;
  let hasRendered = false;
  let motionIdleTimer = 0;

  function beginMotion() {
    window.clearTimeout(motionIdleTimer);
    dock.classList.add('is-motion-active');
  }

  function settleMotion(delay = 140) {
    window.clearTimeout(motionIdleTimer);
    motionIdleTimer = window.setTimeout(() => {
      dock.classList.remove('is-motion-active');
    }, delay);
  }

  function getExpandedWidth() {
    return Math.max(260, Math.min(window.innerWidth - 20, MAX_EXPANDED_WIDTH));
  }

  function getMaxScroll() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function refreshLayoutMetrics() {
    cachedExpandedWidth = getExpandedWidth();
    morphEnabled = hasEnoughScrollDistance(getMaxScroll());
    layoutMetricsDirty = false;
  }

  function invalidateLayoutMetrics() {
    layoutMetricsDirty = true;
    hasRendered = false;
    scheduleScrollSync();
  }

  function updateScrollProgress() {
    if (layoutMetricsDirty) refreshLayoutMetrics();
    if (!morphEnabled) {
      manualScrollAnchorY = null;
      scrollProgress = 0;
      return;
    }

    if (manualScrollAnchorY !== null) {
      manualScrollAnchorY = Math.min(manualScrollAnchorY, window.scrollY);
      scrollProgress = clamp((window.scrollY - manualScrollAnchorY) / COLLAPSE_DISTANCE);
      return;
    }

    scrollProgress = getScrollProgress(window.scrollY);
  }

  function getExpectedScrollProgress() {
    if (!morphEnabled) return 0;
    if (manualScrollAnchorY !== null) {
      const anchorY = Math.min(manualScrollAnchorY, window.scrollY);
      return clamp((window.scrollY - anchorY) / COLLAPSE_DISTANCE);
    }
    return getScrollProgress(window.scrollY);
  }

  function setAccessibility(progress) {
    const panelActive = pinned || progress < PANEL_INTERACTION_END;
    if (panelActive !== panelInteractiveState) {
      panelInteractiveState = panelActive;
      dock.classList.toggle('is-panel-active', panelActive);
      dock.classList.toggle('is-trigger-active', !panelActive);
      panel.setAttribute('aria-hidden', String(!panelActive));
      panel.toggleAttribute('inert', !panelActive);
      trigger.tabIndex = panelActive ? -1 : 0;
      trigger.setAttribute('aria-expanded', String(panelActive));
      trigger.setAttribute('aria-label', panelActive ? expandedLabel : compactLabel);
    }

    const compact = progress > 0.98 && !pinned;
    if (compact !== compactVisualState) {
      compactVisualState = compact;
      dock.classList.toggle('is-compact', compact);
    }
  }

  function render(progress) {
    displayProgress = clamp(progress);
    hasRendered = true;
    const widthProgress = range(displayProgress, 0.1, 1);
    const heightProgress = range(displayProgress, 0.04, 1);
    const labelProgress = range(displayProgress, 0.04, 0.34);
    const itemsProgress = range(displayProgress, 0.18, 0.52);
    const centerProgress = range(displayProgress, 0.24, 0.82);
    const expandedWidth = cachedExpandedWidth;
    const width = lerp(expandedWidth, COMPACT_SIZE, widthProgress);
    const height = lerp(EXPANDED_HEIGHT, COMPACT_SIZE, heightProgress);
    const contentWidth = Math.max(0, expandedWidth - PANEL_HORIZONTAL_PADDING * 2);
    const slotOffset = hasMenuCurrent && dockItems.length
      ? ((activeMenuIndex + 0.5) / dockItems.length - 0.5) * contentWidth
      : 0;
    const unclampedOffset = slotOffset * (1 - centerProgress);
    const maximumOffset = Math.max(0, width / 2 - 16);
    const currentOffset = clamp(unclampedOffset, -maximumOffset, maximumOffset);
    const triggerOpacity = hasMenuCurrent ? 1 : range(displayProgress, 0.62, 0.9);
    const currentYOffset = hasMenuCurrent ? -6.125 * (1 - labelProgress) : 0;

    setStyleProperty(dock, '--mobile-expanded-width', `${expandedWidth.toFixed(3)}px`);
    setStyleProperty(dock, '--mobile-dock-width', `${width.toFixed(3)}px`);
    setStyleProperty(dock, '--mobile-dock-height', `${height.toFixed(3)}px`);
    setStyleProperty(dock, '--mobile-dock-radius', `${lerp(EXPANDED_HEIGHT / 2, COMPACT_SIZE / 2, heightProgress).toFixed(3)}px`);
    setStyleProperty(dock, '--mobile-current-offset', `${currentOffset.toFixed(3)}px`);
    setStyleProperty(dock, '--mobile-current-y-offset', `${currentYOffset.toFixed(3)}px`);
    setStyleProperty(dock, '--mobile-trigger-opacity', triggerOpacity.toFixed(4));
    setStyleProperty(dock, '--mobile-label-opacity', (1 - labelProgress).toFixed(4));
    setStyleProperty(dock, '--mobile-label-shift', `${(-2 * labelProgress).toFixed(3)}px`);
    setStyleProperty(dock, '--mobile-items-opacity', (1 - itemsProgress).toFixed(4));
    setStyleProperty(dock, '--mobile-items-scale', lerp(1, 0.88, itemsProgress).toFixed(4));
    setStyleProperty(dock, '--mobile-panel-opacity', (1 - range(displayProgress, 0.8, 0.98)).toFixed(4));
    setAccessibility(displayProgress);
  }

  function resolveCurrentMenu() {
    const currentIdentifier = dock.dataset.currentIdentifier;
    const activeItem = dockItems.find((item) => (
      item.dataset.menuIdentifier === currentIdentifier && item.classList.contains('is-active')
    ));
    activeMenuIndex = dockItems.indexOf(activeItem);
    hasMenuCurrent = Boolean(currentIdentifier && activeMenuIndex >= 0);
    dock.classList.toggle('has-menu-current', hasMenuCurrent);
  }

  function markAvatarAvailability() {
    dock.classList.toggle('is-avatar-missing', !avatarImages.some((image) => image.naturalWidth));
  }

  function animateTo(target, { duration = 320, onComplete } = {}) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    const from = displayProgress;
    beginMotion();
    if (reducedMotionQuery.matches || Math.abs(target - from) < 0.001) {
      render(target);
      settleMotion();
      onComplete?.();
      return;
    }

    const startedAt = performance.now();
    const step = (now) => {
      const elapsed = clamp((now - startedAt) / duration);
      const eased = elapsed < 0.5
        ? 4 * elapsed * elapsed * elapsed
        : 1 - Math.pow(-2 * elapsed + 2, 3) / 2;
      render(lerp(from, target, eased));
      if (elapsed < 1) {
        animationFrame = window.requestAnimationFrame(step);
      } else {
        animationFrame = 0;
        settleMotion();
        onComplete?.();
      }
    };
    animationFrame = window.requestAnimationFrame(step);
  }

  function syncToScroll() {
    if (!mobileQuery.matches) return;
    updateScrollProgress();
    if (pinned) {
      const scrollDelta = window.scrollY - pinnedLastScrollY;
      pinnedLastScrollY = window.scrollY;
      if (scrollDelta > 0) {
        pinnedDownwardDistance += scrollDelta;
      } else if (scrollDelta < 0) {
        pinnedDownwardDistance = 0;
      }

      if (pinnedDownwardDistance >= PINNED_SCROLL_RELEASE_DISTANCE) {
        releasePinnedForScroll();
      }
      return;
    }

    if (!animationFrame && (!hasRendered || !isSameProgress(scrollProgress, displayProgress))) {
      beginMotion();
      render(scrollProgress);
      settleMotion();
    }
  }

  function scheduleScrollSync() {
    if (!mobileQuery.matches) return;
    if (
      !pinned
      && !animationFrame
      && !layoutMetricsDirty
      && hasRendered
      && isSameProgress(getExpectedScrollProgress(), displayProgress)
    ) return;
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      syncToScroll();
    });
  }

  function pinOpen({ keyboard = false } = {}) {
    if (!mobileQuery.matches) return;
    pinned = true;
    pinnedLastScrollY = window.scrollY;
    pinnedDownwardDistance = 0;
    if (!keyboard) trigger.blur();
    animateTo(0, {
      onComplete: () => {
        if (keyboard) {
          const activeLink = panel.querySelector('a[aria-current="page"]');
          (activeLink || panel.querySelector('a'))?.focus({ preventScroll: true });
        }
      }
    });
  }

  function releasePinned({ restoreFocus = false } = {}) {
    pinned = false;
    pinnedDownwardDistance = 0;
    updateScrollProgress();
    animateTo(scrollProgress, {
      onComplete: () => {
        if (restoreFocus && scrollProgress >= PANEL_INTERACTION_END) {
          trigger.focus({ preventScroll: true });
        }
      }
    });
  }

  function releasePinnedForScroll() {
    pinned = false;
    pinnedDownwardDistance = 0;
    manualScrollAnchorY = window.scrollY;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    scrollProgress = 0;
    beginMotion();
    render(0);
    settleMotion();
  }

  trigger.addEventListener('click', (event) => pinOpen({ keyboard: event.detail === 0 }));

  dockItems.forEach((item) => {
    const link = item.querySelector('a');
    link?.addEventListener('click', (event) => {
      if (link.getAttribute('aria-current') !== 'page') return;
      event.preventDefault();
      if (pinned) releasePinned({ restoreFocus: true });
    });
  });

  document.addEventListener('click', (event) => {
    if (pinned && !dock.contains(event.target)) releasePinned();
  });
  document.addEventListener('keydown', (event) => {
    if (pinned && event.key === 'Escape') {
      event.preventDefault();
      releasePinned({ restoreFocus: true });
    }
  });
  window.addEventListener('scroll', scheduleScrollSync, { passive: true });
  window.addEventListener('resize', invalidateLayoutMetrics, { passive: true });
  mobileQuery.addEventListener('change', () => {
    pinned = false;
    manualScrollAnchorY = null;
    layoutMetricsDirty = true;
    hasRendered = false;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    window.clearTimeout(motionIdleTimer);
    dock.classList.remove('is-motion-active');
    syncToScroll();
  });
  window.addEventListener('pageshow', () => {
    pinned = false;
    manualScrollAnchorY = null;
    layoutMetricsDirty = true;
    hasRendered = false;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    syncToScroll();
  });
  window.addEventListener('load', invalidateLayoutMetrics, { once: true });

  if ('ResizeObserver' in window) {
    const contentObserver = new ResizeObserver(invalidateLayoutMetrics);
    contentObserver.observe(document.body);
  }

  if (avatarImages.length) {
    avatarImages.forEach((image) => {
      image.addEventListener('load', markAvatarAvailability);
      image.addEventListener('error', markAvatarAvailability);
    });
    if (avatarImages.every((image) => image.complete)) markAvatarAvailability();
  }

  resolveCurrentMenu();
  syncToScroll();
})();
