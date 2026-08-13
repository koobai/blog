document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // 确保依赖项和全局命名空间均已加载
  if (typeof mapboxgl === 'undefined' || !window.KoobaiRun) {
    return;
  }

  /* ========================================================================
     板块 1：基础配置与 Mapbox 初始化
  ======================================================================== */

  mapboxgl.accessToken = window.KoobaiRun.config.MAPBOX_TOKEN;

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
      ? 'mapbox://styles/koobai/cmma8mwce001v01sge7e0dx1w' // 暗黑版
      : 'mapbox://styles/koobai/cmma9983i00f101qwezj0f77f'; // 浅色版
  };

  // 3. 初始化地图实例
  const map = new mapboxgl.Map({
    container: 'mapbox-container', 
    style: getMapStyleUrl(), 
    center: [120.1551, 30.2741], 
    zoom: 11, 
    pitch: 0, 
    bearing: 0, 
    maxPitch: 85,
    logoPosition: 'bottom-left', 
    attributionControl: false,
    preserveDrawingBuffer: true // 👈 【关键】既然还原了原始代码，记得把这句加回来，否则截图黑屏
  });

  // 真实地点标题使用 OpenStreetMap 数据；保持地图署名精简但可见。
  map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

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
     板块 3：核心工具函数与 GIS 算法
  ======================================================================== */
  
  // 1. 获取运动类型对应的颜色 (带回退机制)
  const TYPE_COLORS = window.KoobaiRun.SPORT_COLORS || {};
  const FALLBACK_COLOR = '#00ED5E'; 
  const getColor = (type) => TYPE_COLORS[type] || FALLBACK_COLOR;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const getRouteStampCopy = (runData) => {
    if (runData.is_indoor === true) {
      return {
        reason: '室内运动没有定位轨迹',
        tagline: '室内开练，地图休息'
      };
    }

    if (runData.route_status === 'privacy_hidden') {
      return {
        reason: '定位轨迹未公开',
        tagline: '轨迹留白，运动没停'
      };
    }

    return {
      reason: '本次没有定位轨迹',
      tagline: '没有轨迹，运动照常'
    };
  };

  // 2. 组装 Mapbox 样式规范的条件渲染表达式 (match [get type])
  const colorRules = ['match', ['get', 'type']];
  for (const [type, color] of Object.entries(TYPE_COLORS)) { 
    colorRules.push(type, color); 
  }
  colorRules.push(FALLBACK_COLOR);

  // 3. 解析 Google Encoded Polyline 字符串，还原为真实的经纬度坐标数组
  const decodePolyline = (str, precision = 5) => {
    let index = 0, lat = 0, lng = 0, coordinates = [], shift = 0, result = 0, byte = null;
    let factor = Math.pow(10, precision);
    
    while (index < str.length) {
      byte = null; shift = 0; result = 0;
      // 解析纬度位
      do { 
        byte = str.charCodeAt(index++) - 63; 
        result |= (byte & 0x1f) << shift; 
        shift += 5; 
      } while (byte >= 0x20);
      lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
      
      shift = result = 0;
      // 解析经度位
      do { 
        byte = str.charCodeAt(index++) - 63; 
        result |= (byte & 0x1f) << shift; 
        shift += 5; 
      } while (byte >= 0x20);
      lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
      
      coordinates.push([lng / factor, lat / factor]);
    }
    return coordinates;
  };

  // 4. 标题地点路线。隐私记录只根据 distance_title_key 选取杭州真实道路，
  // 再按本次实际距离截取、循环或往返；本人原始轮廓完全不参与绘制。
  const LANDMARK_ROUTE_LIBRARY = Array.isArray(window.KoobaiRun.landmarkRoutes)
    ? window.KoobaiRun.landmarkRoutes
    : [];
  const LANDMARK_ROUTES_BY_KEY = new Map(
    LANDMARK_ROUTE_LIBRARY.map(route => [route.key, route])
  );
  const LANDMARK_MAP_CENTER = [120.1551, 30.2741];

  const getLandmarkRouteForRun = (run) => (
    LANDMARK_ROUTES_BY_KEY.get(run.distance_title_key) || null
  );

  const coordinateDistanceKm = (from, to) => {
    const earthRadiusKm = 6371;
    const toRadians = value => value * Math.PI / 180;
    const latitudeDelta = toRadians(to[1] - from[1]);
    const longitudeDelta = toRadians(to[0] - from[0]);
    const value = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(toRadians(from[1])) * Math.cos(toRadians(to[1]))
      * Math.sin(longitudeDelta / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.sqrt(value));
  };

  const appendCoordinatesUntilDistance = (output, coordinates, distanceLeftKm) => {
    let remaining = distanceLeftKm;
    for (let index = 1; index < coordinates.length && remaining > 0; index += 1) {
      const start = output[output.length - 1];
      const end = coordinates[index];
      const segmentDistance = coordinateDistanceKm(start, end);
      if (segmentDistance <= remaining + 0.000_001) {
        output.push(end);
        remaining -= segmentDistance;
        continue;
      }
      const ratio = segmentDistance > 0 ? remaining / segmentDistance : 0;
      output.push([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio
      ]);
      remaining = 0;
    }
    return remaining;
  };

  const routePassCount = (route, run) => {
    const referenceMeters = Number(route.reference_meters);
    const elevationMeters = Number(run.total_elevation_gain);
    if (Number.isFinite(referenceMeters) && referenceMeters > 0
      && Number.isFinite(elevationMeters) && elevationMeters > 0) {
      return elevationMeters / referenceMeters;
    }

    const referenceKm = Number(route.reference_km);
    const distanceKm = Number(run.distance);
    if (Number.isFinite(referenceKm) && referenceKm > 0
      && Number.isFinite(distanceKm) && distanceKm > 0) {
      return distanceKm / referenceKm;
    }
    return 0;
  };

  // 地点路线只画一次真实公共道路。未满一趟时按比例截取；超过一趟后
  // 不再原路叠画，而是交给线宽表达本次完成的趟数。
  const coordinatesForRunRoute = (route, run) => {
    const baseCoordinates = decodePolyline(route.geometry || '');
    const passCount = routePassCount(route, run);
    if (baseCoordinates.length < 2 || !Number.isFinite(passCount) || passCount <= 0) return [];
    if (passCount >= 1) return baseCoordinates;

    const output = [baseCoordinates[0]];
    const baseDistanceKm = baseCoordinates.slice(1).reduce(
      (total, coordinate, index) => total + coordinateDistanceKm(baseCoordinates[index], coordinate),
      0
    );
    appendCoordinatesUntilDistance(output, baseCoordinates, baseDistanceKm * passCount);
    return output;
  };

  const singleRouteLineWidth = (route, run) => {
    const passCount = routePassCount(route, run);
    // 1 趟约 4px，4～5 趟约 6～7px；超过 6 趟后封顶，避免压住地图。
    return 3.4 + Math.min(Math.max(passCount, 0.5), 6) * 0.65;
  };

  /* ========================================================================
     板块 4：全局状态与图层渲染核心
  ======================================================================== */
  
  // 动画状态锁
  let activeRunId = null;
  let animationRef = null;
  let flyToTimeout = null;
  let hasPlayedInitialOverview = false;
  let isUserInteracting = false;
  ['mousedown', 'touchstart', 'dragstart'].forEach(e => map.on(e, () => isUserInteracting = true));
  ['mouseup', 'touchend', 'dragend'].forEach(e => map.on(e, () => isUserInteracting = false));
  
  // 初始年份读取 (从全局数据中动态提取最新年份)
  let currentYear = new Date().getFullYear().toString();
  if (window.KoobaiRun.availableYears && window.KoobaiRun.availableYears.length > 0) {
    currentYear = window.KoobaiRun.availableYears[0].toString();
  }

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
    ['landmark-routes-casing', 'landmark-routes-core'].forEach(layerId => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'none');
    });
  };

  const focusAnonymousBackdrop = () => {
    map.jumpTo({
      center: LANDMARK_MAP_CENTER,
      zoom: 11,
      pitch: 0,
      bearing: 0
    });
  };

  const showAnonymousFeatures = (features, padding = 42, publicFeatures = [], animate = false) => {
    if (!map.getSource('landmark-routes') || !mapWrapper) return;

    map.getSource('landmark-routes').setData({ type: 'FeatureCollection', features });
    ['landmark-routes-casing', 'landmark-routes-core'].forEach(layerId => {
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
        duration: animate ? 2000 : 0,
        essential: true
      });
    } else {
      focusAnonymousBackdrop();
    }

    if (anonymousOverlay) {
      anonymousOverlay.hidden = true;
      anonymousOverlay.innerHTML = '';
    }
    mapWrapper.classList.add('show-anonymous-map');
  };

  const showAnnualRouteOverview = (targetYear, animate = false) => {
    if (!mapWrapper) return;

    const routes = window.KoobaiRun.data.filter(run => (
      run.start_date_local?.startsWith(targetYear) && run.is_indoor !== true
    ));

    const landmarkGroups = new Map();
    routes.forEach(run => {
      if (run.route_status !== 'privacy_hidden') return;
      const key = run.distance_title_key;
      if (!key) return;
      if (!landmarkGroups.has(key)) landmarkGroups.set(key, []);
      landmarkGroups.get(key).push(run);
    });

    const landmarkFeatures = [...landmarkGroups.entries()]
      .map(([key, groupRuns]) => {
        const landmarkRoute = LANDMARK_ROUTES_BY_KEY.get(key) || null;
        if (!landmarkRoute) return null;
        const run = [...groupRuns].sort(
          (left, right) => routePassCount(landmarkRoute, right) - routePassCount(landmarkRoute, left)
        )[0];
        const coordinates = coordinatesForRunRoute(landmarkRoute, run);
        if (coordinates.length < 2) return null;
        return {
          type: 'Feature',
          properties: {
            id: Number(run.run_id),
            landmark: key,
            type: run.type,
            visits: groupRuns.length,
            mode: 'annual'
          },
          geometry: { type: 'LineString', coordinates }
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.properties.visits - right.properties.visits);

    const publicFeatures = routes
      .filter(run => run.route_status === 'available' && run.summary_polyline)
      .map(run => {
        const coordinates = run._decodedCoords || decodePolyline(run.summary_polyline);
        run._decodedCoords = coordinates;
        if (coordinates.length < 2) return null;
        const routeCenter = coordinates[Math.floor(coordinates.length / 2)];
        // 年度图保持在路线最密集的杭州主区域；远途公开轨迹仍可点开单独查看。
        if (coordinateDistanceKm(LANDMARK_MAP_CENTER, routeCenter) > 120) return null;
        return {
          type: 'Feature',
          properties: { id: Number(run.run_id), type: run.type },
          geometry: { type: 'LineString', coordinates }
        };
      })
      .filter(Boolean);

    if (map.getSource('all-runs')) {
      map.getSource('all-runs').setData({ type: 'FeatureCollection', features: publicFeatures });
    }
    if (map.getLayer('runs-core')) {
      map.setPaintProperty('runs-core', 'line-opacity', publicFeatures.length > 0 ? 0.8 : 0);
    }

    showAnonymousFeatures(landmarkFeatures, 34, publicFeatures, animate);
  };

  const showEmptyAnonymousMap = () => {
    if (!anonymousOverlay || !mapWrapper) return;
    anonymousOverlay.innerHTML = '';
    if (map.getSource('landmark-routes')) {
      map.getSource('landmark-routes').setData({ type: 'FeatureCollection', features: [] });
    }
    ['landmark-routes-casing', 'landmark-routes-core'].forEach(layerId => {
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
    if (animationRef) cancelAnimationFrame(animationRef);
    if (flyToTimeout) clearTimeout(flyToTimeout);
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
        id: 'landmark-routes-casing',
        type: 'line',
        source: 'landmark-routes',
        layout: {
          visibility: 'none',
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          // 浅色底图用白色描边分离道路；暗黑底图改用深色描边，避免年度总览泛白。
          'line-color': isDarkMapTheme()
            ? 'rgba(4, 5, 7, 0.68)'
            : 'rgba(255, 255, 255, 0.72)',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            8.5, [
              'case',
              ['==', ['get', 'mode'], 'single'], 6,
              ['interpolate', ['linear'], ['get', 'visits'], 1, 2.4, 3, 2.8, 6, 3.4, 12, 4.2, 24, 5.2]
            ],
            11.5, [
              'case',
              ['==', ['get', 'mode'], 'single'], 6,
              ['interpolate', ['linear'], ['get', 'visits'], 1, 2.5, 3, 3.1, 6, 4, 12, 5.1, 24, 6.3]
            ],
            14.5, [
              'case',
              ['==', ['get', 'mode'], 'single'], 6,
              ['interpolate', ['linear'], ['get', 'visits'], 1, 2.8, 3, 4, 6, 5.5, 12, 7.2, 24, 9.2]
            ]
          ],
          'line-opacity': isDarkMapTheme() ? 0.64 : 0.82
        }
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

  // 根据选中的年份，提取数据并重绘底图所有轨迹
  const renderDataByYear = (targetYear, animate = false) => {
    hideRouteStamp();
    activeRunId = null; 
    currentYear = targetYear; 
    resetState();
    showAnnualRouteOverview(targetYear, animate);
    
    if (!map.getSource('all-runs')) return;
    
    map.getSource('highlight-run-source').setData({ type: 'FeatureCollection', features: [] });
  }; 

  // 地图加载完毕后初始化
  map.on('style.load', () => {
    hideRouteStamp();
    injectCustomLayers();
    
    if (activeRunId && window.KoobaiRun.ui) {
      window.KoobaiRun.ui.highlightRunInUI(null);
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
        renderDataByYear(currentYear, true);
      });
      return;
    }

    renderDataByYear(currentYear);
  });

  // 🚀 监听 UI 层派发的年份切换全局事件
  document.addEventListener('koobaiYearChanged', (e) => {
    if (e.detail && e.detail.year) {
      renderDataByYear(e.detail.year);
      const statsPanel = document.getElementById('map-stats-panel');
      if (statsPanel) {
        statsPanel.style.display = 'none'; 
      }
    }
  });


  /* ========================================================================
     板块 5：路线飞行动画 (挂载至全局空间供 UI 调用)
  ======================================================================== */
  window.KoobaiRun.map = {
    flyTo: (rawRunId) => {
      const normalizeId = (id) => {
        if (!id || id === 'undefined' || id === 'null') return null;
        return String(Number(String(id).replace(/,/g, '')));
      };
      
      const runId = normalizeId(rawRunId);
      const statsPanel = document.getElementById('map-stats-panel'); 

      hideRouteStamp();
      hideAnonymousOverlay();

      // 每次点击轨迹时，强制清理可能残留的海报预览状态和遮罩
      const mapWrapper = document.getElementById('map-wrapper');
      if (mapWrapper) mapWrapper.classList.remove('show-poster-mode');
      const oldMask = document.getElementById('real-poster-mask');
      if (oldMask) oldMask.remove();

      // 再次点击同一条路线，相当于“取消选中”，恢复全览状态
      if (normalizeId(activeRunId) === runId) {
        renderDataByYear(currentYear, true);
        if (window.KoobaiRun.ui) window.KoobaiRun.ui.highlightRunInUI(null); 
        if (statsPanel) statsPanel.style.display = 'none'; 
        
        return;
      }

      // 2. 环境清理
      activeRunId = runId; 
      resetState();
      
      if (window.KoobaiRun.ui) window.KoobaiRun.ui.highlightRunInUI(runId); 
      if (map.getLayer('runs-core')) map.setPaintProperty('runs-core', 'line-opacity', 0); // 隐藏其他轨迹
      if (map.getSource('highlight-run-source')) {
        map.getSource('highlight-run-source').setData({ type: 'FeatureCollection', features: [] });
      }

      // 3. 寻找数据与渲染覆盖层 (Bento 面板)
      const runData = window.KoobaiRun.data.find(r => normalizeId(r.run_id) === runId);
      if (!runData) return;

      // 🚀 挪动与新增：提前解析坐标和边界，为 2D/3D 视角无缝切换做准备
      const polyline = runData.summary_polyline || '';
      const realCoordinates = runData._decodedCoords || decodePolyline(polyline);
      const hasRealTrack = runData.route_status === 'available' && realCoordinates.length >= 2;
      const landmarkRoute = runData.route_status === 'privacy_hidden'
        ? getLandmarkRouteForRun(runData)
        : null;
      const landmarkCoordinates = landmarkRoute
        ? coordinatesForRunRoute(landmarkRoute, runData)
        : [];
      // 后续地图交互只认“当前显示的轨迹”：公开记录使用本人轨迹，
      // 隐私记录使用标题地点代表路线，两者共享完全相同的镜头与交互逻辑。
      const displayCoordinates = hasRealTrack ? realCoordinates : landmarkCoordinates;
      const hasDisplayTrack = displayCoordinates.length >= 2;
      
      let bounds = null, center = null;
      if (hasDisplayTrack) {
        bounds = new mapboxgl.LngLatBounds();
        displayCoordinates.forEach(c => bounds.extend(c));
        center = bounds.getCenter();
      }

      if (statsPanel) {
        const distanceNum = runData.distance > 0 ? runData.distance.toFixed(2) : '--';
        const distanceUnit = runData.distance > 0 ? 'km' : ''; 
        const runTime = runData.moving_time || '--';
        const heartRate = runData.average_heartrate || '--';
        const hasCalories = Number(runData.calories) > 0;
        const calories = hasCalories ? Math.round(Number(runData.calories)) : '--';
        const paceNum = runData.distance > 0 ? (runData.pace_num || '--') : '--';
        const paceUnit = runData.distance > 0 ? (runData.pace_unit || '') : '';
        const color = getColor(runData.type);
        const isRide = ['Ride', 'VirtualRide', 'EBikeRide'].includes(runData.type);
        const displayTime = runData.start_date_local.substring(5, 16).replace('T', ' ');
        const smartName = runData.name;
        const sportTypeName = runData.fallback_name || '运动';

        let achievementTagsHtml = '';
        const sourceCard = document.querySelector(`.runCard[data-run-id="${runId}"]`);
        if (sourceCard) {
          const achieveNode = sourceCard.querySelector('.map-achieve-data');
          if (achieveNode) {
            const achieveText = achieveNode.getAttribute('data-text');
            if (achieveText) {
              achievementTagsHtml = `<span class="map-achievement-tag">${achieveText}</span>`;
            }
          }
        }

        // 1. 纯净的 HTML 结构（已去除标题旁的分享图标）
        statsPanel.innerHTML = `
          <div class="normal-view">
            <div class="detailName">
              <div class="nameLeft">
                <span class="detailDate">${displayTime}</span>${achievementTagsHtml}${sportTypeName}
              </div>
              <div class="panel-share">
                <button type="button" id="trigger-poster-btn" class="panel-share-btn panl-share-down">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><g fill="none"><path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M9 3a1 1 0 0 1 .117 1.993L9 5H5v14h14v-9a1 1 0 0 1 1.993-.117L21 10v9a2 2 0 0 1-1.85 1.995L19 21H5a2 2 0 0 1-1.995-1.85L3 19V5a2 2 0 0 1 1.85-1.995L5 3zm10.513 0c.622 0 .984.468 1.075.856c.091.389-.025.971-.585 1.247l-.414.211l-.164.088l-.363.201l-.405.236l-.439.27c-.682.43-1.46.976-2.242 1.637c-1.654 1.399-3.258 3.261-4.027 5.57a1 1 0 0 1-1.898-.632c.928-2.784 2.823-4.933 4.634-6.465c.431-.365.862-.698 1.278-1l.31-.219H14a1 1 0 0 1-.117-1.993L14 3z"/></g></svg>
                </button>
              </div>
            </div>
            <div class="detailStatsRow">
              <div class="detailStatBlock"><span class="statLabel">里程</span><span class="statVal" style="color: ${color}">${distanceNum}<small>${distanceUnit}</small></span></div>
              <div class="detailStatBlock"><span class="statLabel">用时</span><span class="statVal">${runTime}</span></div>
              <div class="detailStatBlock"><span class="statLabel">${isRide ? '均速' : '配速'}</span><span class="statVal">${paceNum}<small>${paceUnit}</small></span></div>
              <div class="detailStatBlock"><span class="statLabel">心率</span><span class="statVal">${heartRate}</span></div>
              <div class="detailStatBlock"><span class="statLabel">千卡</span><span class="statVal">${calories}</span></div>
            </div>
          </div>

          <div class="poster-view data-poster-view" style="display: none;">
            <div class="poster-actions">
              <button class="poster-download-btn" title="保存海报"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 512 512"><path fill="currentColor" d="M426.666 426.667H85.333V384h341.333zm-149.333-179.5l91.583-91.583l30.167 30.166L256 328.834L112.916 185.75l30.167-30.166l91.583 91.582v-204.5h42.667z"/></svg></button>
              <button class="poster-close-btn" title="退出预览"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div class="poster-dist-hero">
              <span class="heroNum">${distanceNum}</span>
              <span class="heroUnit">${distanceUnit}</span>
            </div>
            <div class="poster-stats-row">
              <div class="poster-stat-block"><span class="statLabel">用时</span><span class="statVal">${runTime}</span></div>
              <div class="poster-stat-block"><span class="statLabel">${isRide ? '均速' : '配速'}</span><span class="statVal">${paceNum}<small>${paceUnit}</small></span></div>
              <div class="poster-stat-block"><span class="statLabel">心率</span><span class="statVal">${heartRate}</span></div>
            </div>
            <div class="poster-watermark">${displayTime}</div>
            <div class="poster-title">${smartName}</div>
          </div>

        `;
        statsPanel.style.display = 'flex';

        const wrapper = document.getElementById('map-wrapper');
        const normalView = statsPanel.querySelector('.normal-view');
        const dataPosterView = statsPanel.querySelector('.data-poster-view');
        
        // 抽象公共逻辑：进入海报模式
        const enterPosterMode = (viewToShow) => {
          wrapper.classList.add('show-poster-mode');
          normalView.style.display = 'none';
          dataPosterView.style.display = 'none';
          
          viewToShow.style.display = 'block';

          if (!document.getElementById('real-poster-mask')) {
            const mask = document.createElement('div');
            mask.id = 'real-poster-mask';
            mask.className = 'poster-gradient-mask'; 
            wrapper.appendChild(mask);
          }

          if (hasDisplayTrack && bounds) {
            const h = wrapper.clientHeight;
            const w = wrapper.clientWidth;
            
            // 🧠 核心判断：当前是否为扁平的吸顶/手机模式
            const isCompact = h <= 400;
            
            const safeTop = isCompact ? 30 : 60;
            const safeBottom = isCompact ? 30 : 260; 
            const safeRight = isCompact ? 20 : 60; 
            const safeLeft = isCompact ? (w * 0.5) : 60; 

            map.fitBounds(bounds, { 
              padding: { top: safeTop, bottom: safeBottom, left: safeLeft, right: safeRight }, 
              pitch: 0, 
              bearing: 0, 
              duration: 1000,
              linear: true
            });
          }
        };

        // 点击打开数据海报
        const triggerPosterBtn = document.getElementById('trigger-poster-btn');
        if (triggerPosterBtn) {
          triggerPosterBtn.onclick = (e) => {
            e.stopPropagation();
            enterPosterMode(dataPosterView);
          };
        }

        // 统一绑定：退出预览
        statsPanel.querySelectorAll('.poster-close-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            wrapper.classList.remove('show-poster-mode');
            const mask = document.getElementById('real-poster-mask');
            if (mask) mask.remove();
            renderDataByYear(currentYear); 
            if (window.KoobaiRun.ui) window.KoobaiRun.ui.highlightRunInUI(null); 
            if (statsPanel) statsPanel.style.display = 'none';
          });
        });

        // 统一绑定：生成图片下载
        statsPanel.querySelectorAll('.poster-download-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentBtn = e.currentTarget;
            
            // 👇 新增防连击锁：如果正在生成中，直接拦截
            if (currentBtn.dataset.isGenerating === 'true') return;
            currentBtn.dataset.isGenerating = 'true';
            currentBtn.style.opacity = '0.5'; 
            currentBtn.style.cursor = 'wait'; // 给鼠标加个等待状态

            htmlToImage.toCanvas(wrapper, {
              pixelRatio: 4, backgroundColor: null, filter: (node) => !node.classList?.contains('poster-actions')
            }).then(function (canvas) {
              const webpDataUrl = canvas.toDataURL('image/webp', 0.92);
              const link = document.createElement('a');
              link.download = `KoobaiRun_${displayTime.replace(/[\/\s:]/g, '')}.webp`;
              link.href = webpDataUrl;
              link.click();
              
              // 👇 恢复状态
              currentBtn.dataset.isGenerating = 'false';
              currentBtn.style.opacity = '1';
              currentBtn.style.cursor = 'pointer';
            }).catch(function (error) {
              console.error('海报生成失败:', error);
              // 👇 恢复状态
              currentBtn.dataset.isGenerating = 'false';
              currentBtn.style.opacity = '1';
              currentBtn.style.cursor = 'pointer';
            });
          });
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
      let initialBearing = map.getBearing();
      map.flyTo({ 
        center: center, 
        zoom: targetZoom, 
        pitch: 65, 
        bearing: initialBearing,
        duration: 2000, 
        essential: true 
      });

      // 8. 启动环绕盘旋动画
      let lastTimestamp = null;
      let startTimestamp = null; 
      
      const rotateCamera = (timestamp) => {
        // 如果用户点击了其他路线或取消选中，立即终止
        if (String(activeRunId) !== runId) return; 

        // 记录时间锁
        if (!lastTimestamp) lastTimestamp = timestamp;
        if (!startTimestamp) startTimestamp = timestamp; 
        
        const deltaTime = timestamp - lastTimestamp;
        const elapsed = timestamp - startTimestamp; 
        lastTimestamp = timestamp;
        
        // 获取当前是否处于“海报生成模式”
        const wrapper = document.getElementById('map-wrapper');
        const isPosterMode = wrapper && wrapper.classList.contains('show-poster-mode');

        // 如果没有打开海报 且 用户没有在触碰地图，才自动旋转 + 呼吸
        if (!isPosterMode && !isUserInteracting) {
          const currentBearing = map.getBearing();
          
          // 自转运算：这里的 40 控制旋转速度（保留原样）
          const newBearing = (currentBearing + deltaTime / 100) % 360; 
          
          const newPitch = 65 + Math.sin(elapsed / 1200) * 2;
          const newZoom = targetZoom + Math.sin(elapsed / 1800) * 0.2;
          
          // 使用 jumpTo 确保 GPU 底层直接且丝滑地渲染这三个维度的微小变化
          map.jumpTo({ 
            bearing: newBearing, 
            pitch: newPitch, 
            zoom: newZoom 
          });
        }
        
        animationRef = requestAnimationFrame(rotateCamera);
      };

      // 等待无人机(镜头)飞行就位后，开始缓缓自转
      flyToTimeout = setTimeout(() => {
        animationRef = requestAnimationFrame(rotateCamera);
      }, 2000);
      
    }
  }; 
});
