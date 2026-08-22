(function() {
  'use strict';

  const modules = window.JingzheExerciseModules = window.JingzheExerciseModules || {};
  const MAP_SCOPE_DURATIONS = Object.freeze({
    month: 500,
    annual: 700,
    year: 800,
    initial: 1400,
    detailReturn: 650,
    runFlight: 2000,
    runOrbit: 36000
  });

  const getScopeTransitionDuration = (currentScope, nextScope, reducedMotion = false) => {
    if (reducedMotion) return 0;
    if (String(currentScope?.year || '') !== String(nextScope?.year || '')) {
      return MAP_SCOPE_DURATIONS.year;
    }
    if (currentScope?.mode === 'month' && nextScope?.mode === 'year') {
      return MAP_SCOPE_DURATIONS.annual;
    }
    return MAP_SCOPE_DURATIONS.month;
  };

  const getOrbitCameraState = (initialBearing, targetZoom, progress) => {
    const boundedProgress = Math.max(0, Math.min(1, progress));
    const breathPhase = boundedProgress * Math.PI * 2;
    return {
      bearing: initialBearing + 360 * boundedProgress,
      pitch: 65 + Math.sin(breathPhase) * 2,
      zoom: targetZoom + Math.sin(breathPhase) * 0.2
    };
  };

  modules.mapMotion = {
    durations: MAP_SCOPE_DURATIONS,
    getOrbitCameraState,
    getScopeTransitionDuration
  };

  modules.createMapAdapter = (runtime, model) => {

    // Mapbox is optional in Core; the controller keeps a no-op compatibility API.
    if (typeof mapboxgl === 'undefined' || !runtime) {
      return;
    }

    /* ========================================================================
       板块 1：基础配置与 Mapbox 初始化
    ======================================================================== */

    const mapConfig = runtime.config || {};
    const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const motionDuration = duration => reducedMotionQuery?.matches ? 0 : duration;
    mapboxgl.accessToken = mapConfig.MAPBOX_TOKEN;
    const configuredMapCenter = Array.isArray(mapConfig.MAP_CENTER) && mapConfig.MAP_CENTER.length === 2
      ? mapConfig.MAP_CENTER.map(Number)
      : [0, 0];

    // 1. 统一判断当前主题，供底图和自定义轨迹图层共同使用。
    const isDarkMapTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');

      if (theme === 'dark') {
        return true;
      }
      if (theme === 'light') {
        return false;
      }

      // 如果是 auto（没设置 data-theme），则听命于系统的暗黑模式。
      return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    };

    // 2. 动态获取当前主题样式 URL。
    const getMapStyleUrl = () => {
      return isDarkMapTheme()
        ? mapConfig.MAP_STYLE_DARK
        : mapConfig.MAP_STYLE_LIGHT;
    };

    // 3. 初始化地图实例
    const map = new mapboxgl.Map({
      container: 'mapbox-container',
      style: getMapStyleUrl(),
      center: configuredMapCenter,
      zoom: 11,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
      logoPosition: 'bottom-left',
      attributionControl: false,
      preserveDrawingBuffer: true // 👈 【关键】既然还原了原始代码，记得把这句加回来，否则截图黑屏
    });

    // 4. 监听外层容器大小变化
    const mapWrapper = document.getElementById('map-wrapper');
    if (mapWrapper && window.ResizeObserver) {
      new ResizeObserver(() => { requestAnimationFrame(() => map.resize()); }).observe(mapWrapper);
    }

    // 5. 监听主题切换（响应网站按钮点击 & 系统级主题变化）
    let currentMapStyle = getMapStyleUrl();
    const updateMapTheme = () => {
      const newStyle = getMapStyleUrl();
      if (newStyle !== currentMapStyle) {
        currentMapStyle = newStyle;
        map.setStyle(newStyle);
      }
    };

    // 监听网站 HTML 上的 class 和 data-theme 变化
    const themeObserver = new MutationObserver(updateMapTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    // 监听系统自身的暗黑模式切换（当网站设为自动时，这里会生效）
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateMapTheme);
    }


    /* ========================================================================
       板块 3：共享数据模型与隐私路线模块
    ======================================================================== */
    const TYPE_COLORS = runtime.SPORT_COLORS || {};
    const FALLBACK_COLOR = '#00ED5E';
    const escapeHtml = model.escapeHtml;
    const routeModel = modules.createRoutes(runtime, configuredMapCenter);
    const {
      buildAnnualOverview,
      buildMonthlyOverview,
      getRouteStampCopy,
      selectDisplayRoute,
      singleRouteLineWidth
    } = routeModel;
    const LANDMARK_MAP_CENTER = configuredMapCenter;

    const colorRules = ['match', ['get', 'type']];
    for (const [type, color] of Object.entries(TYPE_COLORS)) colorRules.push(type, color);
    colorRules.push(FALLBACK_COLOR);

    /* ========================================================================
       板块 4：全局状态与图层渲染核心
    ======================================================================== */

    // 动画状态锁
    let activeRunId = null;
    let animationRef = null;
    let flyToTimeout = null;
    let hasPlayedInitialOverview = false;

    const stopOrbitAnimation = () => {
      if (animationRef) cancelAnimationFrame(animationRef);
      if (flyToTimeout) clearTimeout(flyToTimeout);
      animationRef = null;
      flyToTimeout = null;
    };

    // 用户开始接管地图时，立即终止自动镜头和待启动的环绕动画。
    ['mousedown', 'touchstart', 'dragstart'].forEach(eventName => {
      map.on(eventName, () => {
        stopOrbitAnimation();
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopOrbitAnimation();
    });
    reducedMotionQuery?.addEventListener('change', event => {
      if (event.matches) {
        stopOrbitAnimation();
        map.stop?.();
      }
    });

    // 初始年份读取 (从全局数据中动态提取最新年份)
    let currentYear = new Date().getFullYear().toString();
    if (runtime.availableYears && runtime.availableYears.length > 0) {
      currentYear = runtime.availableYears[0].toString();
    }
    let currentRouteScope = runtime.ui?.getCurrentRouteScope?.() || {
      year: currentYear,
      month: null,
      mode: 'year'
    };

    let anonymousOverlay = document.getElementById('anonymous-route-overlay');
    if (!anonymousOverlay && mapWrapper) {
      anonymousOverlay = document.createElement('div');
      anonymousOverlay.id = 'anonymous-route-overlay';
      anonymousOverlay.className = 'anonymousRouteOverlay';
      anonymousOverlay.hidden = true;
      mapWrapper.appendChild(anonymousOverlay);
    }

    const hideAnonymousOverlay = () => {
      if (mapWrapper) {
        mapWrapper.classList.remove('show-anonymous-map');
      }
      if (anonymousOverlay) {
        anonymousOverlay.hidden = true;
        anonymousOverlay.innerHTML = '';
      }
      if (map.getSource('landmark-routes')) {
        map.getSource('landmark-routes').setData({ type: 'FeatureCollection', features: [] });
      }
      ['landmark-routes-core'].forEach(layerId => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'none');
      });
    };

    const focusAnonymousBackdrop = (duration = 0) => {
      const options = {
        center: LANDMARK_MAP_CENTER,
        zoom: 11,
        pitch: 0,
        bearing: 0,
        duration,
        essential: false
      };
      if (duration > 0 && typeof map.easeTo === 'function') {
        map.easeTo(options);
      } else {
        map.jumpTo(options);
      }
    };

    const showAnonymousFeatures = (features, padding = 42, publicFeatures = [], duration = 0) => {
      if (!map.getSource('landmark-routes') || !mapWrapper) return;

      map.getSource('landmark-routes').setData({ type: 'FeatureCollection', features });
      ['landmark-routes-core'].forEach(layerId => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'visible');
      });
      if (map.getLayer('runs-core')) {
        map.setPaintProperty('runs-core', 'line-opacity', publicFeatures.length > 0 ? 0.8 : 0);
      }
      if (map.getSource('highlight-run-source')) {
        map.getSource('highlight-run-source').setData({ type: 'FeatureCollection', features: [] });
      }

      const bounds = new mapboxgl.LngLatBounds();
      features.forEach(feature => {
        feature.geometry.coordinates.forEach(coordinate => bounds.extend(coordinate));
      });
      publicFeatures.forEach(feature => {
        feature.geometry.coordinates.forEach(coordinate => bounds.extend(coordinate));
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding,
          pitch: 0,
          bearing: 0,
          duration,
          essential: false
        });
      } else {
        focusAnonymousBackdrop(duration);
      }

      if (anonymousOverlay) {
        anonymousOverlay.hidden = true;
        anonymousOverlay.innerHTML = '';
      }
      mapWrapper.classList.add('show-anonymous-map');
    };

    const showRouteOverview = (scope, duration = 0) => {
      if (!mapWrapper) return;
      const overview = scope.mode === 'month'
        ? buildMonthlyOverview(scope.year, scope.month)
        : buildAnnualOverview(scope.year);
      const { landmarkFeatures, publicFeatures } = overview;
      if (map.getSource('all-runs')) {
        map.getSource('all-runs').setData({ type: 'FeatureCollection', features: publicFeatures });
      }
      if (map.getLayer('runs-core')) {
        map.setPaintProperty('runs-core', 'line-opacity', publicFeatures.length > 0 ? 0.8 : 0);
      }
      showAnonymousFeatures(landmarkFeatures, 34, publicFeatures, duration);
    };

    const showEmptyAnonymousMap = () => {
      if (!anonymousOverlay || !mapWrapper) return;
      anonymousOverlay.innerHTML = '';
      if (map.getSource('landmark-routes')) {
        map.getSource('landmark-routes').setData({ type: 'FeatureCollection', features: [] });
      }
      ['landmark-routes-core'].forEach(layerId => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'none');
      });
      focusAnonymousBackdrop();
      anonymousOverlay.hidden = true;
      mapWrapper.classList.add('show-anonymous-map');
    };

    let routeStampOverlay = document.getElementById('route-stamp-overlay');
    if (!routeStampOverlay && mapWrapper) {
      routeStampOverlay = document.createElement('div');
      routeStampOverlay.id = 'route-stamp-overlay';
      routeStampOverlay.className = 'routeStampOverlay';
      routeStampOverlay.hidden = true;
      mapWrapper.appendChild(routeStampOverlay);
    }

    const hideRouteStamp = () => {
      if (mapWrapper) mapWrapper.classList.remove('show-route-stamp');
      if (routeStampOverlay) {
        routeStampOverlay.hidden = true;
        routeStampOverlay.innerHTML = '';
      }
    };

    const showRouteStamp = (runData) => {
      if (!routeStampOverlay || !mapWrapper) return;

      const copy = getRouteStampCopy(runData);

      routeStampOverlay.innerHTML = `
        <div class="routeStamp">
          <span class="routeStampNote">${escapeHtml(copy.tagline)}</span>
        </div>
      `;
      routeStampOverlay.hidden = false;
      mapWrapper.classList.add('show-route-stamp');
    };

    // 清理上一轮的动画和标记
    const resetState = () => {
      stopOrbitAnimation();
      map.stop?.();
    };

    // 注入本人公开轨迹与标题地点代表路线图层。
    const injectCustomLayers = () => {
      // 核心轨迹线：背景浅色轨迹(all-runs) 与 前景高亮轨迹(highlight-run-source)
      if (!map.getSource('all-runs')) {
        map.addSource('all-runs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, lineMetrics: true });
        map.addSource('highlight-run-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, lineMetrics: true });

        map.addLayer({
          id: 'runs-core',
          type: 'line',
          source: 'all-runs',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': colorRules, 'line-width': 2, 'line-opacity': 0.8 }
        });

        map.addLayer({
          id: 'run-highlight-line',
          type: 'line',
          source: 'highlight-run-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': colorRules,
            'line-width': ['coalesce', ['get', 'line_width'], 4],
            'line-opacity': 1
          }
        });
      }

      if (!map.getSource('landmark-routes')) {
        map.addSource('landmark-routes', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        map.addLayer({
          id: 'landmark-routes-core',
          type: 'line',
          source: 'landmark-routes',
          layout: {
            visibility: 'none',
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': colorRules,
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8.5, [
                'case',
                ['==', ['get', 'mode'], 'single'], 4,
                ['interpolate', ['linear'], ['get', 'visits'], 1, 1.2, 3, 1.6, 6, 2.1, 12, 2.8, 24, 3.8]
              ],
              11.5, [
                'case',
                ['==', ['get', 'mode'], 'single'], 4,
                ['interpolate', ['linear'], ['get', 'visits'], 1, 1, 3, 1.6, 6, 2.5, 12, 3.6, 24, 4.8]
              ],
              14.5, [
                'case',
                ['==', ['get', 'mode'], 'single'], 4,
                ['interpolate', ['linear'], ['get', 'visits'], 1, 1.2, 3, 2.2, 6, 3.6, 12, 5.2, 24, 7.2]
              ]
            ],
            'line-opacity': [
              'case',
              ['==', ['get', 'mode'], 'single'], 0.92,
              ['interpolate', ['linear'], ['get', 'visits'], 1, 0.62, 3, 0.7, 6, 0.78, 12, 0.87, 24, 0.94]
            ]
          }
        });
      }
    };

    // 根据当前年度/月度范围重绘轨迹；关闭详情与主题重载后仍恢复同一范围。
    const renderDataByScope = (scope, duration = 0) => {
      const year = String(scope?.year || currentYear);
      const mode = scope?.mode === 'month' ? 'month' : 'year';
      const month = mode === 'month' ? String(scope.month).padStart(2, '0') : null;
      hideRouteStamp();
      activeRunId = null;
      currentYear = year;
      currentRouteScope = { year, month, mode };
      resetState();
      showRouteOverview(currentRouteScope, duration);

      if (!map.getSource('all-runs')) return;

      map.getSource('highlight-run-source').setData({ type: 'FeatureCollection', features: [] });
    };

    const renderCurrentRouteScope = (duration = 0) => {
      renderDataByScope(currentRouteScope, duration);
    };

    // 地图加载完毕后初始化
    map.on('style.load', () => {
      hideRouteStamp();
      injectCustomLayers();

      if (activeRunId && runtime.ui) {
        runtime.ui.highlightRunInUI(null);
        const statsPanel = document.getElementById('map-stats-panel');
        if (statsPanel) statsPanel.style.display = 'none';
      }

      if (!hasPlayedInitialOverview) {
        // 先停在更大的杭州区域，等底图瓦片真正显示后再缩放到年度轨迹。
        // 否则动画会在地图仍然空白时悄悄播完，用户看不到入场效果。
        map.jumpTo({
          center: LANDMARK_MAP_CENTER,
          zoom: 7.8,
          pitch: 0,
          bearing: 0
        });
        map.once('idle', () => {
          if (hasPlayedInitialOverview) return;
          hasPlayedInitialOverview = true;
          renderCurrentRouteScope(motionDuration(MAP_SCOPE_DURATIONS.initial));
        });
        return;
      }

      renderCurrentRouteScope();
    });

    const applyRouteScope = event => {
      if (event.detail && event.detail.year) {
        const duration = getScopeTransitionDuration(
          currentRouteScope,
          event.detail,
          Boolean(reducedMotionQuery?.matches)
        );
        modules.poster.reset(mapWrapper);
        renderDataByScope(event.detail, duration);
        runtime.ui?.highlightRunInUI(null);
        const statsPanel = document.getElementById('map-stats-panel');
        if (statsPanel) {
          statsPanel.style.display = 'none';
        }
      }
    };

    // 保留年份事件，并增加月份事件；二者共用同一范围状态。
    document.addEventListener('koobaiYearChanged', applyRouteScope);
    document.addEventListener('koobaiMonthChanged', applyRouteScope);


    /* ========================================================================
       板块 5：路线飞行动画 (挂载至全局空间供 UI 调用)
    ======================================================================== */
    const api = {
      flyTo: (rawRunId) => {
        const normalizeId = model.normalizeId;

        const runId = normalizeId(rawRunId);
        const statsPanel = document.getElementById('map-stats-panel');

        hideRouteStamp();
        hideAnonymousOverlay();

        // 每次点击轨迹时，强制清理可能残留的海报预览状态和遮罩
        modules.poster.reset(mapWrapper);

        // 再次点击同一条路线，相当于“取消选中”，恢复全览状态
        if (normalizeId(activeRunId) === runId) {
          renderCurrentRouteScope(motionDuration(MAP_SCOPE_DURATIONS.detailReturn));
          if (runtime.ui) runtime.ui.highlightRunInUI(null);
          if (statsPanel) statsPanel.style.display = 'none';

          return;
        }

        // 2. 环境清理
        activeRunId = runId;
        resetState();

        if (runtime.ui) runtime.ui.highlightRunInUI(runId);
        if (map.getLayer('runs-core')) map.setPaintProperty('runs-core', 'line-opacity', 0); // 隐藏其他轨迹
        if (map.getSource('highlight-run-source')) {
          map.getSource('highlight-run-source').setData({ type: 'FeatureCollection', features: [] });
        }

        // 3. 寻找数据与渲染覆盖层 (Bento 面板)
        const runData = runtime.data.find(r => normalizeId(r.run_id) === runId);
        if (!runData) return;

        const {
          displayCoordinates,
          hasDisplayTrack,
          landmarkRoute
        } = selectDisplayRoute(runData);

        let bounds = null, center = null;
        if (hasDisplayTrack) {
          bounds = new mapboxgl.LngLatBounds();
          displayCoordinates.forEach(c => bounds.extend(c));
          center = bounds.getCenter();
        }

        if (statsPanel && mapWrapper) {
          modules.poster.render({
            bounds,
            config: mapConfig,
            hasDisplayTrack,
            map,
            model,
            onClose: () => {
              renderCurrentRouteScope(motionDuration(MAP_SCOPE_DURATIONS.detailReturn));
              if (runtime.ui) runtime.ui.highlightRunInUI(null);
              statsPanel.style.display = 'none';
            },
            run: runData,
            statsPanel,
            wrapper: mapWrapper
          });
        }
        if (!hasDisplayTrack) {
          showEmptyAnonymousMap();
          showRouteStamp(runData);
          return;
        }

        // 5. 立即完整绘制当前高亮轨迹 (不再像贪吃蛇那样一点点画了)
        if (map.getSource('highlight-run-source')) {
          map.getSource('highlight-run-source').setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {
                type: runData.type,
                line_width: landmarkRoute ? singleRouteLineWidth(landmarkRoute, runData) : 4
              },
              geometry: { type: 'LineString', coordinates: displayCoordinates }
            }]
          });
        }

        // 👇 从这里直接开始算相机缩放级别，不需要再重新定义 bounds 了
        // 🚀 优化 2：把之前的 cam.zoom - 0.5 改成 cam.zoom + 0.8（数值越大镜头贴得越近）
        const cam = map.cameraForBounds(bounds, { padding: 60 });
        const targetZoom = cam ? cam.zoom + 0.6 : 15;

        // 7. 无人机起飞：平滑飞向轨迹中心点上方
        const initialBearing = map.getBearing();
        const flightDuration = motionDuration(MAP_SCOPE_DURATIONS.runFlight);
        map.flyTo({
          center: center,
          zoom: targetZoom,
          pitch: 65,
          bearing: initialBearing,
          duration: flightDuration,
          essential: false
        });

        // 减少动态效果模式只定位到轨迹，不启动环绕动画。
        if (flightDuration === 0) return;

        // 8. 启动单圈环绕动画；完成后恢复稳定镜头并停止渲染。
        let lastTimestamp = null;
        let orbitElapsed = 0;

        const rotateCamera = (timestamp) => {
          const wrapper = document.getElementById('map-wrapper');
          const isPosterMode = wrapper && wrapper.classList.contains('show-poster-mode');

          // 切换范围、打开海报或页面进入后台时，不再继续占用渲染资源。
          if (String(activeRunId) !== runId || isPosterMode || document.hidden) {
            stopOrbitAnimation();
            return;
          }

          if (lastTimestamp === null) lastTimestamp = timestamp;
          const deltaTime = Math.min(Math.max(timestamp - lastTimestamp, 0), 50);
          lastTimestamp = timestamp;
          orbitElapsed = Math.min(orbitElapsed + deltaTime, MAP_SCOPE_DURATIONS.runOrbit);
          const progress = orbitElapsed / MAP_SCOPE_DURATIONS.runOrbit;
          const camera = getOrbitCameraState(initialBearing, targetZoom, progress);

          map.jumpTo(camera);

          if (progress >= 1) {
            map.jumpTo({ bearing: initialBearing, pitch: 65, zoom: targetZoom });
            animationRef = null;
            return;
          }

          animationRef = requestAnimationFrame(rotateCamera);
        };

        // 等待镜头飞行就位后开始单圈环绕。
        flyToTimeout = setTimeout(() => {
          flyToTimeout = null;
          animationRef = requestAnimationFrame(rotateCamera);
        }, flightDuration);

      }
    };

    runtime.map = api;
    return api;
  };
})();
