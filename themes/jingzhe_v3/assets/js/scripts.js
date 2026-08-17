// 灯箱调用(首页顶部/Memos页面)
window.ViewImage && ViewImage.init('.article-cover-img,.post-figure img,.laodao-photo');

// 桌面端阅读时渐进收起导航；完整态继续使用原始布局和玻璃材质。
(() => {
  const header = document.querySelector('.floating-header');
  const nav = header?.querySelector('.main-nav-menu');
  const actions = header?.querySelector('.header-actions');
  const compactTrigger = header?.querySelector('.compact-nav-trigger');
  const compactIcon = header?.querySelector('.compact-nav-icon');
  const backButton = document.querySelector('.btn-back');

  backButton?.addEventListener('click', () => {
    const referrer = document.referrer;
    if (referrer && referrer.includes(window.location.host)) {
      history.back();
      return;
    }
    window.location.href = backButton.dataset.fallbackUrl || '/';
  });

  if (!header || !nav || !actions || !compactTrigger || !compactIcon) return;

  const menuItems = [...nav.querySelectorAll('.menu-item')];
  const actionItems = [...actions.querySelectorAll('.action-item')];

  const desktopQuery = window.matchMedia('(min-width: 768px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const {
    clamp,
    lerp,
    ease,
    range,
    isSameProgress,
    getScrollProgress,
    hasEnoughScrollDistance,
    setStyleProperty,
    removeStyleProperty
  } = window.JingzheNavMotion;
  const COMPACT_WIDTH = 60;
  const COMPACT_HEIGHT = 54;
  const COMPACT_ICON_SIZE = 28;
  const ICON_EDGE_GAP = 8;
  const ICON_HANDOFF_START = 0.22;
  const ICON_HANDOFF_END = 0.4;
  const ICON_TRAVEL_START = 0.36;
  const ICON_TRAVEL_END = 0.82;
  const ICON_FLOW_FOLLOW = 0.5;
  const HOVER_THRESHOLD = 0.72;
  const BACK_COMPACT_GAP = 40;

  let fullMetrics;
  let currentVisual;
  let scrollMorphEnabled = false;
  let activeMenuIndex = 0;
  let activeMenuIcon;
  let collapseProgress = 0;
  let displayedProgress = 0;
  let animationFrame = 0;
  let animationToken = 0;
  let scrollFrame = 0;
  let enterTimer = 0;
  let leaveTimer = 0;
  let motionIdleTimer = 0;
  let peeking = false;
  let peekSettled = false;
  let pinned = false;
  let fullContentInteractiveState;
  let compactInteractiveState;

  function beginMotion() {
    window.clearTimeout(motionIdleTimer);
    header.classList.add('is-motion-active');
    backButton?.classList.add('is-nav-motion-active');
  }

  function settleMotion(delay = 140) {
    window.clearTimeout(motionIdleTimer);
    motionIdleTimer = window.setTimeout(() => {
      header.classList.remove('is-motion-active');
      backButton?.classList.remove('is-nav-motion-active');
    }, delay);
  }

  function resolveCurrentIcon() {
    const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    const currentItem = nav.querySelector('.menu-item.is-active') || menuItems.find((item) => {
      const link = item.querySelector('a');
      if (!link) return false;
      const linkPath = new URL(link.href, window.location.href).pathname.replace(/\/+$/, '') || '/';
      return linkPath === pathname;
    }) || menuItems[0];
    activeMenuIcon = currentItem?.querySelector('.menu-icon');

    if (currentItem) activeMenuIndex = Math.max(menuItems.indexOf(currentItem), 0);
    if (activeMenuIcon) compactIcon.innerHTML = activeMenuIcon.innerHTML;
  }

  function measureOriginalHeader() {
    const rect = header.getBoundingClientRect();
    const style = window.getComputedStyle(header);
    const firstLink = menuItems[0]?.querySelector('a');
    const firstLabel = menuItems[0]?.querySelector('.menu-name');
    const activeIconRect = activeMenuIcon?.getBoundingClientRect();
    const backButtonRect = backButton?.getBoundingClientRect();
    const headerCenterX = rect.left + rect.width / 2;
    const headerCenterY = rect.top + rect.height / 2;
    fullMetrics = {
      width: rect.width,
      height: rect.height,
      paddingX: parseFloat(style.paddingLeft) || 0,
      paddingY: parseFloat(style.paddingTop) || 0,
      itemGap: parseFloat(firstLink ? window.getComputedStyle(firstLink).gap : '') || 4,
      labelHeight: firstLabel?.getBoundingClientRect().height || 16,
      activeIconContentOffsetX: activeIconRect
        ? activeIconRect.left + activeIconRect.width / 2 - rect.left - (parseFloat(style.paddingLeft) || 0)
        : rect.width / 2,
      activeIconOffsetX: activeIconRect ? activeIconRect.left + activeIconRect.width / 2 - headerCenterX : 0,
      activeIconOffsetY: activeIconRect ? activeIconRect.top + activeIconRect.height / 2 - headerCenterY : 0,
      headerBottom: parseFloat(style.bottom) || 0,
      backButton: backButtonRect ? {
        width: backButtonRect.width,
        height: backButtonRect.height,
        centerOffsetX: backButtonRect.left + backButtonRect.width / 2 - headerCenterX,
        edgeGap: Math.max(backButtonRect.left - rect.right, 0),
        bottom: Math.max(window.innerHeight - backButtonRect.bottom, 0)
      } : null
    };
  }

  function getProgress() {
    if (!scrollMorphEnabled) return 0;
    return getScrollProgress(window.scrollY);
  }

  function canMorphCurrentPage() {
    const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
    return hasEnoughScrollDistance(maxScroll);
  }

  function getScrollVisual(progress = getProgress()) {
    const widthProgress = range(progress, 0.12, 1);
    const heightProgress = range(progress, 0.06, 0.78);
    const labelFoldProgress = range(progress, 0.14, 0.34);
    const iconHandoffProgress = range(progress, ICON_HANDOFF_START, ICON_HANDOFF_END);
    const iconTravelProgress = range(progress, ICON_TRAVEL_START, ICON_TRAVEL_END);
    const materialProgress = clamp((progress - 0.06) / 0.9);
    const materialDip = Math.pow(Math.sin(Math.PI * materialProgress), 2);
    const width = lerp(fullMetrics.width, COMPACT_WIDTH, widthProgress);
    const height = lerp(fullMetrics.height, COMPACT_HEIGHT, heightProgress);
    const paddingX = lerp(fullMetrics.paddingX, 0, widthProgress);
    const paddingY = lerp(fullMetrics.paddingY, 0, heightProgress);
    const labelHeight = lerp(fullMetrics.labelHeight, 0, labelFoldProgress);
    const itemGap = lerp(fullMetrics.itemGap, 0, labelFoldProgress);
    const foldedContentRatio = (labelHeight + itemGap) / (fullMetrics.labelHeight + fullMetrics.itemGap);
    const currentFlowingIconOffsetX = -width / 2 + paddingX + fullMetrics.activeIconContentOffsetX;
    const currentFlowingIconOffsetY = fullMetrics.activeIconOffsetY * foldedContentRatio;
    const travelStartWidthProgress = range(ICON_TRAVEL_START, 0.12, 1);
    const travelStartWidth = lerp(fullMetrics.width, COMPACT_WIDTH, travelStartWidthProgress);
    const travelStartPaddingX = lerp(fullMetrics.paddingX, 0, travelStartWidthProgress);
    const travelStartIconOffsetX = -travelStartWidth / 2
      + travelStartPaddingX
      + fullMetrics.activeIconContentOffsetX;
    const followedTravelOffsetX = lerp(
      travelStartIconOffsetX,
      currentFlowingIconOffsetX,
      ICON_FLOW_FOLLOW
    ) * (1 - iconTravelProgress);
    const reachesCenterDuringHandoff = fullMetrics.activeIconOffsetX < 0
      && travelStartIconOffsetX >= 0;
    const handoffIconOffsetX = reachesCenterDuringHandoff
      ? Math.min(currentFlowingIconOffsetX, 0)
      : currentFlowingIconOffsetX;
    let flowingIconOffsetX;
    if (progress < ICON_TRAVEL_START) {
      flowingIconOffsetX = handoffIconOffsetX;
    } else if (reachesCenterDuringHandoff) {
      flowingIconOffsetX = 0;
    } else if (travelStartIconOffsetX < 0) {
      flowingIconOffsetX = Math.min(followedTravelOffsetX, 0);
    } else {
      flowingIconOffsetX = Math.max(travelStartIconOffsetX * (1 - iconTravelProgress), 0);
    }
    const flowingIconOffsetY = progress < ICON_TRAVEL_START
      ? currentFlowingIconOffsetY
      : 0;
    const maxIconOffsetX = Math.max((width - COMPACT_ICON_SIZE) / 2 - ICON_EDGE_GAP, 0);
    const maxIconOffsetY = Math.max((height - COMPACT_ICON_SIZE) / 2 - ICON_EDGE_GAP, 0);
    const iconOffsetX = clamp(
      flowingIconOffsetX,
      -maxIconOffsetX,
      maxIconOffsetX
    );
    const iconOffsetY = clamp(
      flowingIconOffsetY,
      -maxIconOffsetY,
      maxIconOffsetY
    );
    let backShiftX = 0;
    let backShiftY = 0;
    if (fullMetrics.backButton) {
      const backGap = lerp(fullMetrics.backButton.edgeGap, BACK_COMPACT_GAP, widthProgress);
      const backCenterOffsetX = width / 2 + backGap + fullMetrics.backButton.width / 2;
      const compactBackBottom = fullMetrics.headerBottom
        + (COMPACT_HEIGHT - fullMetrics.backButton.height) / 2;
      const backBottom = lerp(fullMetrics.backButton.bottom, compactBackBottom, heightProgress);
      backShiftX = backCenterOffsetX - fullMetrics.backButton.centerOffsetX;
      backShiftY = fullMetrics.backButton.bottom - backBottom;
    }

    return {
      progress,
      width,
      height,
      paddingX,
      paddingY,
      shellOpacity: 1 - 0.58 * materialDip,
      menuOpacity: 1 - range(progress, 0.34, 0.6),
      labelOpacity: 1 - range(progress, 0, 0.24),
      labelHeight,
      itemGap,
      actionsOpacity: 1 - range(progress, 0.18, 0.42),
      activeItemOpacity: 1 - iconHandoffProgress,
      compactOpacity: iconHandoffProgress,
      iconOffsetX,
      iconOffsetY,
      backShiftX,
      backShiftY
    };
  }

  function applyItemVisuals(visual) {
    const { progress } = visual;
    const maxDistance = Math.max(activeMenuIndex, menuItems.length - 1 - activeMenuIndex, 1);

    menuItems.forEach((item, index) => {
      let opacity;
      if (index === activeMenuIndex) {
        opacity = visual.activeItemOpacity;
      } else {
        const distanceRatio = Math.abs(index - activeMenuIndex) / maxDistance;
        const fadeStart = lerp(0.3, 0.22, distanceRatio);
        opacity = 1 - range(progress, fadeStart, fadeStart + 0.3);
      }
      setStyleProperty(item, 'opacity', opacity.toFixed(4));
    });

    actionItems.forEach((item, index) => {
      const fadeStart = index === 0 ? 0.18 : index === 1 ? 0.14 : 0.12;
      setStyleProperty(item, 'opacity', (1 - range(progress, fadeStart, fadeStart + 0.24)).toFixed(4));
    });
  }

  function setFullContentInteractive(interactive) {
    if (fullContentInteractiveState === interactive) return;
    fullContentInteractiveState = interactive;
    nav.toggleAttribute('inert', !interactive);
    actions.toggleAttribute('inert', !interactive);
    nav.setAttribute('aria-hidden', String(!interactive));
    actions.setAttribute('aria-hidden', String(!interactive));
    header.classList.toggle('is-reading-content-locked', !interactive);
  }

  function setCompactInteractive(interactive) {
    if (compactInteractiveState === interactive) return;
    compactInteractiveState = interactive;
    header.classList.toggle('is-reading-compact-interactive', interactive);
    compactTrigger.setAttribute('aria-hidden', String(!interactive));
    compactTrigger.tabIndex = interactive ? 0 : -1;
  }

  function syncInteractivity(visual) {
    const fullContentInteractive = visual.shellOpacity * visual.menuOpacity > 0.82
      && visual.shellOpacity * visual.actionsOpacity > 0.82
      && visual.shellOpacity * visual.compactOpacity < 0.18;
    const compactInteractive = visual.progress >= HOVER_THRESHOLD || peeking;

    setFullContentInteractive(fullContentInteractive);
    setCompactInteractive(compactInteractive);
  }

  function applyVisual(visual) {
    currentVisual = visual;
    header.classList.add('is-reading-nav');
    setStyleProperty(header, '--reading-nav-width', `${visual.width.toFixed(3)}px`);
    setStyleProperty(header, '--reading-nav-height', `${visual.height.toFixed(3)}px`);
    setStyleProperty(header, '--reading-nav-padding-x', `${visual.paddingX.toFixed(3)}px`);
    setStyleProperty(header, '--reading-nav-padding-y', `${visual.paddingY.toFixed(3)}px`);
    setStyleProperty(header, '--reading-nav-shell-opacity', visual.shellOpacity.toFixed(4));
    setStyleProperty(header, '--reading-nav-label-opacity', visual.labelOpacity.toFixed(4));
    setStyleProperty(header, '--reading-nav-label-height', `${visual.labelHeight.toFixed(3)}px`);
    setStyleProperty(header, '--reading-nav-item-gap', `${visual.itemGap.toFixed(3)}px`);
    setStyleProperty(header, '--reading-nav-compact-opacity', visual.compactOpacity.toFixed(4));
    setStyleProperty(header, '--reading-nav-icon-x', `${visual.iconOffsetX.toFixed(3)}px`);
    setStyleProperty(header, '--reading-nav-icon-y', `${visual.iconOffsetY.toFixed(3)}px`);
    if (backButton) {
      setStyleProperty(backButton, '--reading-back-x', `${visual.backShiftX.toFixed(3)}px`);
      setStyleProperty(backButton, '--reading-back-y', `${visual.backShiftY.toFixed(3)}px`);
    }
    applyItemVisuals(visual);
    syncInteractivity(visual);
  }

  function clearReadingStyles() {
    animationToken += 1;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    window.clearTimeout(motionIdleTimer);
    motionIdleTimer = 0;
    currentVisual = undefined;
    displayedProgress = 0;
    header.classList.remove(
      'is-reading-nav',
      'is-reading-content-locked',
      'is-reading-compact-interactive',
      'is-motion-active'
    );
    backButton?.classList.remove('is-nav-motion-active');
    [
      '--reading-nav-width',
      '--reading-nav-height',
      '--reading-nav-padding-x',
      '--reading-nav-padding-y',
      '--reading-nav-shell-opacity',
      '--reading-nav-label-opacity',
      '--reading-nav-label-height',
      '--reading-nav-item-gap',
      '--reading-nav-compact-opacity',
      '--reading-nav-icon-x',
      '--reading-nav-icon-y'
    ].forEach((property) => removeStyleProperty(header, property));
    menuItems.forEach((item) => removeStyleProperty(item, 'opacity'));
    actionItems.forEach((item) => removeStyleProperty(item, 'opacity'));
    if (backButton) {
      removeStyleProperty(backButton, '--reading-back-x');
      removeStyleProperty(backButton, '--reading-back-y');
    }
    setFullContentInteractive(true);
    compactInteractiveState = false;
    compactTrigger.setAttribute('aria-hidden', 'true');
    compactTrigger.tabIndex = -1;
    compactTrigger.setAttribute('aria-expanded', String(peeking));
  }

  function animateProgress(from, to, duration, onComplete) {
    const token = ++animationToken;
    const startedAt = performance.now();
    window.cancelAnimationFrame(animationFrame);
    beginMotion();

    if (reducedMotionQuery.matches || duration === 0) {
      displayedProgress = to;
      applyVisual(getScrollVisual(to));
      settleMotion();
      onComplete?.();
      return;
    }

    const tick = (now) => {
      if (token !== animationToken) return;
      const elapsed = clamp((now - startedAt) / duration);
      displayedProgress = lerp(from, to, ease(elapsed));
      applyVisual(getScrollVisual(displayedProgress));

      if (elapsed < 1) {
        animationFrame = window.requestAnimationFrame(tick);
      } else {
        animationFrame = 0;
        settleMotion();
        onComplete?.();
      }
    };

    animationFrame = window.requestAnimationFrame(tick);
  }

  function renderScrollPosition(progress = getProgress()) {
    if (!desktopQuery.matches || !fullMetrics || peeking) return;
    collapseProgress = progress;

    if (collapseProgress === 0) {
      if (currentVisual) clearReadingStyles();
      return;
    }

    if (currentVisual && isSameProgress(collapseProgress, displayedProgress)) return;

    displayedProgress = collapseProgress;
    applyVisual(getScrollVisual(collapseProgress));
  }

  function finishPeek() {
    if (!peeking) return;
    peekSettled = true;
    clearReadingStyles();
    compactTrigger.setAttribute('aria-expanded', 'true');
  }

  function openPeek(shouldPin = false) {
    if (!desktopQuery.matches || collapseProgress < HOVER_THRESHOLD) return;
    window.clearTimeout(leaveTimer);
    pinned = pinned || shouldPin;

    if (peeking) {
      compactTrigger.setAttribute('aria-expanded', 'true');
      return;
    }

    peeking = true;
    peekSettled = false;
    compactTrigger.setAttribute('aria-expanded', 'true');
    const sourceProgress = currentVisual ? displayedProgress : collapseProgress;
    const duration = Math.max(420, 560 * sourceProgress);
    animateProgress(sourceProgress, 0, duration, finishPeek);
  }

  function closePeek({ immediate = false } = {}) {
    window.clearTimeout(enterTimer);
    window.clearTimeout(leaveTimer);
    if (!peeking) return;

    pinned = false;
    peeking = false;
    const targetProgress = getProgress();
    collapseProgress = targetProgress;

    if (!desktopQuery.matches || targetProgress === 0) {
      peekSettled = false;
      clearReadingStyles();
      compactTrigger.setAttribute('aria-expanded', 'false');
      return;
    }

    const sourceProgress = peekSettled || !currentVisual ? 0 : displayedProgress;
    if (!currentVisual) {
      displayedProgress = 0;
      applyVisual(getScrollVisual(0));
    }
    peekSettled = false;
    compactTrigger.setAttribute('aria-expanded', 'false');
    const duration = immediate ? 0 : Math.max(360, 520 * Math.abs(targetProgress - sourceProgress));
    animateProgress(sourceProgress, targetProgress, duration);
  }

  function onPointerEnter() {
    window.clearTimeout(leaveTimer);
    if (pinned || peeking || collapseProgress < HOVER_THRESHOLD) return;
    window.clearTimeout(enterTimer);
    enterTimer = window.setTimeout(() => openPeek(false), 80);
  }

  function onPointerLeave() {
    window.clearTimeout(enterTimer);
    if (pinned || !peeking) return;
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => closePeek(), 150);
  }

  function onScroll() {
    if (!desktopQuery.matches) return;
    const nextProgress = getProgress();
    if (!peeking && (
      (!currentVisual && nextProgress === 0)
      || (currentVisual && isSameProgress(nextProgress, displayedProgress))
    )) return;
    if (scrollFrame) return;
    beginMotion();
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      const progress = getProgress();
      if (peeking) collapseProgress = progress;
      else renderScrollPosition(progress);
      settleMotion();
    });
  }

  function resetForViewport() {
    window.clearTimeout(enterTimer);
    window.clearTimeout(leaveTimer);
    peeking = false;
    peekSettled = false;
    pinned = false;
    collapseProgress = 0;
    scrollMorphEnabled = false;
    clearReadingStyles();

    if (!desktopQuery.matches) return;
    resolveCurrentIcon();
    measureOriginalHeader();
    scrollMorphEnabled = canMorphCurrentPage();
    renderScrollPosition(getProgress());
  }

  compactTrigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openPeek(true);
  });
  header.addEventListener('pointerenter', onPointerEnter);
  header.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    if (!desktopQuery.matches) return;
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      resetForViewport();
    });
  });
  desktopQuery.addEventListener('change', resetForViewport);
  document.addEventListener('pointerdown', (event) => {
    if (pinned && !header.contains(event.target)) closePeek();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && peeking) closePeek();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) resetForViewport();
  });
  window.addEventListener('load', () => {
    if (desktopQuery.matches && scrollMorphEnabled !== canMorphCurrentPage()) {
      resetForViewport();
    }
  }, { once: true });

  resetForViewport();
})();

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
    const sideSpace = window.innerWidth <= 340 ? 12 : 16;
    return Math.max(260, Math.min(window.innerWidth - sideSpace, 320));
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
    const contentWidth = Math.max(0, expandedWidth - 12);
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
    setStyleProperty(dock, '--mobile-dock-radius', `${lerp(25, 29, heightProgress).toFixed(3)}px`);
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
