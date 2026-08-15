(function() {
  'use strict';

  const modules = window.JingzheExerciseModules = window.JingzheExerciseModules || {};

  const attachStickyMap = () => {
    const bentoHero = document.getElementById('bento-hero');
    const mapWrapper = document.getElementById('map-wrapper');
    if (!bentoHero || !mapWrapper) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      window.requestAnimationFrame(() => {
        const isSticky = bentoHero.getBoundingClientRect().bottom < 80;
        mapWrapper.classList.toggle('sticky-map', isSticky);
        ticking = false;
      });
      ticking = true;
    }, { passive: true });
  };

  modules.initialize = () => {
    const runtime = window.KoobaiRun;
    if (!runtime || runtime.initialized) return runtime;

    const requiredFactories = [
      'createModel',
      'createRoutes',
      'createUI',
      'createMapAdapter'
    ];
    const missingFactory = requiredFactories.find(name => typeof modules[name] !== 'function');
    if (missingFactory || !modules.poster) {
      console.error(`Exercise module failed to load: ${missingFactory || 'poster'}`);
      return runtime;
    }

    runtime.initialized = true;
    runtime.model = modules.createModel(runtime.contract);
    runtime.SPORT_COLORS = runtime.model.sportColors;

    // Keep the historical global API available even if Mapbox is unavailable.
    runtime.map = { flyTo() {} };
    runtime.ui = modules.createUI(runtime, runtime.model);
    runtime.map = modules.createMapAdapter(runtime, runtime.model) || runtime.map;

    attachStickyMap();
    return runtime;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', modules.initialize, { once: true });
  } else {
    modules.initialize();
  }
})();
