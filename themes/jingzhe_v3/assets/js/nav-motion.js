(function attachJingzheNavMotion(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) root.JingzheNavMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const SCROLL_START = 40;
  const COLLAPSE_DISTANCE = 320;
  const MIN_SCROLL_DISTANCE = SCROLL_START + COLLAPSE_DISTANCE;
  const RENDER_EPSILON = 0.0005;
  const styleValueCache = new WeakMap();

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, progress) => from + (to - from) * progress;
  const ease = (progress) => progress * progress * (3 - 2 * progress);
  const range = (value, start, end) => ease(clamp((value - start) / (end - start)));
  const isSameProgress = (left, right) => Math.abs(left - right) < RENDER_EPSILON;
  const getScrollProgress = (scrollY) => clamp((scrollY - SCROLL_START) / COLLAPSE_DISTANCE);
  const hasEnoughScrollDistance = (maxScroll) => maxScroll >= MIN_SCROLL_DISTANCE;

  function getElementCache(element) {
    let cache = styleValueCache.get(element);
    if (!cache) {
      cache = new Map();
      styleValueCache.set(element, cache);
    }
    return cache;
  }

  function setStyleProperty(element, property, value) {
    const cache = getElementCache(element);
    if (cache.get(property) === value) return false;
    cache.set(property, value);
    element.style.setProperty(property, value);
    return true;
  }

  function removeStyleProperty(element, property) {
    const cache = getElementCache(element);
    cache.delete(property);
    element.style.removeProperty(property);
  }

  return Object.freeze({
    SCROLL_START,
    COLLAPSE_DISTANCE,
    MIN_SCROLL_DISTANCE,
    clamp,
    lerp,
    ease,
    range,
    isSameProgress,
    getScrollProgress,
    hasEnoughScrollDistance,
    setStyleProperty,
    removeStyleProperty
  });
});
