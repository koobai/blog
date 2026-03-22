document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // 确保依赖项和全局命名空间均已加载
  if (typeof mapboxgl === 'undefined' || !window.KoobaiRun) {
    return;
  }

  /* ========================================================================
     板块 1：基础配置与 Mapbox 初始化
  ======================================================================== */
  
  // 起终点的小旗子 SVG 图标
  const FLAG_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20">
      <path fill="currentColor" d="M4.5 3.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75H6v2.75a.75.75 0 0 1-1.5 0zM6 13h3v-3h3v3h3v-3h-3V7h3V4h-3v3H9V4H6v3h3v3H6z"/>
    </svg>`;

  mapboxgl.accessToken = window.KoobaiRun.config.MAPBOX_TOKEN;

  // 1. 动态获取当前主题样式 URL（完美兼容你的 data-theme 和系统 auto）
  const getMapStyleUrl = () => {
    const theme = document.documentElement.getAttribute('data-theme');
    let isDark = false;
    
    if (theme === 'dark') {
      isDark = true;
    } else if (theme === 'light') {
      isDark = false;
    } else {
      // 如果是 auto（没设置 data-theme），则听命于系统的暗黑模式
      isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    return isDark 
      ? 'mapbox://styles/koobai/cmma8mwce001v01sge7e0dx1w' // 暗黑版
      : 'mapbox://styles/koobai/cmma9983i00f101qwezj0f77f'; // 浅色版
  };

  // 2. 初始化地图实例
  const map = new mapboxgl.Map({
    container: 'mapbox-container', 
    style: getMapStyleUrl(), 
    center: [120.1551, 30.2741], 
    zoom: 11, 
    pitch: 0, 
    bearing: 0, 
    maxPitch: 85,
    logoPosition: 'bottom-right', 
    attributionControl: false,
    preserveDrawingBuffer: true // 👈 【关键】既然还原了原始代码，记得把这句加回来，否则截图黑屏
  });

  // 仅保留缩放控件，隐藏指南针
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-left');

  // 3. 监听外层容器大小变化
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper && window.ResizeObserver) {
    new ResizeObserver(() => { requestAnimationFrame(() => map.resize()); }).observe(mapWrapper);
  }

  // 4. 监听主题切换（响应网站按钮点击 & 系统级主题变化）
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

  // 4. 坐标网格聚类算法：过滤掉极个别异常漂移的坐标点，确保地图居中缩放时视野正常
  const filterCityBoundingBox = (allCoordinates) => {
    if (allCoordinates.length === 0) return allCoordinates;
    const grid = {};
    
    allCoordinates.forEach(coord => {
      const key = `${Math.round(coord[1] * 10) / 10},${Math.round(coord[0] * 10) / 10}`;
      grid[key] = (grid[key] || 0) + 1;
    });
    
    let maxCount = 0, maxCenterLat = 0, maxCenterLng = 0;
    for (const key in grid) {
      if (grid[key] > maxCount) {
        maxCount = grid[key];
        const parts = key.split(',');
        maxCenterLat = parseFloat(parts[0]);
        maxCenterLng = parseFloat(parts[1]);
      }
    }
    return allCoordinates.filter(c => 
      c[1] >= maxCenterLat - 0.5 && c[1] <= maxCenterLat + 0.5 && 
      c[0] >= maxCenterLng - 0.5 && c[0] <= maxCenterLng + 0.5
    );
  };

  // 5. 计算两点之间的方位角 (用于飞行动画时的镜头朝向)
  const calculateBearing = (start, end) => {
    const PI = Math.PI;
    const lat1 = (start[1] * PI) / 180, lon1 = (start[0] * PI) / 180;
    const lat2 = (end[1] * PI) / 180, lon2 = (end[0] * PI) / 180;
    const dLon = lon2 - lon1;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / PI + 360) % 360;
  };

  /* ========================================================================
     板块 4：全局状态与图层渲染核心
  ======================================================================== */
  
  // 动画状态锁
  let activeRunId = null;
  let animationRef = null;
  let flyToTimeout = null;
  let currentMarkers = [];
  let isFirstLoad = true;
  
  // 初始年份读取
  const firstYearBtn = document.querySelector('#year-nav .button');
  let currentYear = firstYearBtn ? firstYearBtn.getAttribute('data-year') : new Date().getFullYear().toString();

  // 清理上一轮的动画和标记
  const resetState = () => {
    if (animationRef) cancelAnimationFrame(animationRef);
    if (flyToTimeout) clearTimeout(flyToTimeout);
    currentMarkers.forEach(m => m.remove());
    currentMarkers = [];
  };

  // 注入自定义地形与轨迹图层
  const injectCustomLayers = () => {
    const isDark = document.documentElement.classList.contains('dark');
    
    try {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', { 'type': 'raster-dem', 'url': 'mapbox://mapbox.mapbox-terrain-dem-v1', 'tileSize': 512, 'maxzoom': 14 });
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 3 }); 
      }
      if (!map.getLayer('3d-buildings')) {
        map.addLayer({
          'id': '3d-buildings', 
          'source': 'composite', 
          'source-layer': 'building', 
          'filter': ['==', 'extrude', 'true'], 
          'type': 'fill-extrusion', 
          'minzoom': 14,
          'paint': { 
            'fill-extrusion-color': isDark ? '#1C1C1E' : '#eaeaf1', 
            'fill-extrusion-height': ['*', ['get', 'height'], 4], 
            'fill-extrusion-base': ['*', ['get', 'min_height'], 4], 
            'fill-extrusion-opacity': 0.6 
          }
        }); 
      }
    } catch (e) {
      console.warn("3D地形加载失败，降级为2D显示", e);
    }

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
        paint: { 'line-color': colorRules, 'line-width': 4, 'line-opacity': 1 } 
      });
    }
  };

  // 根据选中的年份，提取数据并重绘底图所有轨迹
  const renderDataByYear = (targetYear) => {
    activeRunId = null; 
    currentYear = targetYear; 
    resetState();
    
    if (!map.getSource('all-runs')) return;
    
    const features = []; 
    let allCoordsForBounds = [];

    // 遍历筛选属于当前年份的数据
    window.KoobaiRun.data.forEach(run => {
      if (!run.start_date_local?.startsWith(targetYear) || !run.summary_polyline) return;
      
      // 缓存解码后的坐标，避免重复消耗 CPU
      if (!run._decodedCoords) {
        run._decodedCoords = decodePolyline(run.summary_polyline);
      }
      const coords = run._decodedCoords;

      if (coords.length === 0) return;
      
      allCoordsForBounds.push(...coords);
      features.push({ 
        type: 'Feature', 
        properties: { id: Number(run.run_id), type: run.type }, 
        geometry: { type: 'LineString', coordinates: coords } 
      });
    });

    // 更新数据源
    map.getSource('all-runs').setData({ type: 'FeatureCollection', features });
    map.getSource('highlight-run-source').setData({ type: 'FeatureCollection', features: [] });
    map.setPaintProperty('runs-core', 'line-opacity', 0.8);

    // 将地图视角居中至这一年的全部轨迹范围
    if (allCoordsForBounds.length > 0) {
      const validCoords = filterCityBoundingBox(allCoordsForBounds);
      const bounds = new mapboxgl.LngLatBounds();
      validCoords.forEach(c => bounds.extend(c));
      
      const cam = map.cameraForBounds(bounds, { padding: 50 });
      
      if (cam) {
        if (isFirstLoad) {
          map.jumpTo({ ...cam, zoom: cam.zoom - 0.2, pitch: 0, bearing: 0 });
          setTimeout(() => { 
            map.easeTo({ ...cam, pitch: 0, bearing: 0, duration: 1000, easing: (t) => t * (2 - t) }); 
          }, 50);
          isFirstLoad = false;
        } else {
          map.easeTo({ ...cam, pitch: 0, bearing: 0, duration: 1000 });
        }
      }
    }
  }; 

  // 地图加载完毕后初始化
  map.on('style.load', () => {
    injectCustomLayers(); 
    
    if (activeRunId && window.KoobaiRun.ui) {
      window.KoobaiRun.ui.highlightRunInUI(null);
      const statsPanel = document.getElementById('map-stats-panel');
      if (statsPanel) statsPanel.style.display = 'none';
    }
    
    renderDataByYear(currentYear); 
  });

  // 监听年份切换按钮点击
  document.getElementById('year-nav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.button'); 
    if (btn) {
      renderDataByYear(btn.getAttribute('data-year'));
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

      // 每次点击轨迹时，强制清理可能残留的海报预览状态和遮罩
      const mapWrapper = document.getElementById('map-wrapper');
      if (mapWrapper) mapWrapper.classList.remove('show-poster-mode');
      const oldMask = document.getElementById('real-poster-mask');
      if (oldMask) oldMask.remove();

      // 再次点击同一条路线，相当于“取消选中”，恢复全览状态
      if (normalizeId(activeRunId) === runId) {
        renderDataByYear(currentYear);
        if (window.KoobaiRun.ui) window.KoobaiRun.ui.highlightRunInUI(null); 
        if (statsPanel) statsPanel.style.display = 'none'; 
        
        // ✨ 新增：取消选中时，隐藏左下角的分享按钮
        const shareCtrl = document.getElementById('custom-share-ctrl');
        if (shareCtrl) shareCtrl.style.display = 'none';
        
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

      if (statsPanel) {
        const distanceNum = runData.distance > 0 ? runData.distance.toFixed(2) : '--';
        const distanceUnit = runData.distance > 0 ? 'km' : ''; 
        const runTime = runData.moving_time || '--';
        const heartRate = runData.average_heartrate || '--';
        const paceNum = runData.distance > 0 ? (runData.pace_num || '--') : '--';
        const paceUnit = runData.distance > 0 ? (runData.pace_unit || '') : '';
        const color = getColor(runData.type);
        const isRide = ['Ride', 'VirtualRide', 'EBikeRide'].includes(runData.type);
        const displayTime = runData.start_date_local.substring(5, 16).replace('T', ' ');
        const smartName = window.KoobaiRun.getSmartName(runData.name, runData.type, runData.summary_polyline);

        // 1. 纯净的 HTML 结构（已去除标题旁的分享图标）
        statsPanel.innerHTML = `
          <div class="normal-view">
            <div class="detailName">
              <span class="detailDate">${displayTime}</span>
            </div>
            <div class="detailStatsRow">
              <div class="detailStatBlock"><span class="statLabel">里程</span><span class="statVal" style="color: ${color}">${distanceNum}<small>${distanceUnit}</small></span></div>
              <div class="detailStatBlock"><span class="statLabel">用时</span><span class="statVal">${runTime}</span></div>
              <div class="detailStatBlock"><span class="statLabel">${isRide ? '均速' : '配速'}</span><span class="statVal">${paceNum}<small>${paceUnit}</small></span></div>
              <div class="detailStatBlock"><span class="statLabel">心率</span><span class="statVal">${heartRate}</span></div>
            </div>
          </div>

          <div class="poster-view" style="display: none;">
            <div class="poster-actions">
            <button id="poster-download-btn" title="保存海报"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 512 512"><path fill="currentColor" d="M426.666 426.667H85.333V384h341.333zm-149.333-179.5l91.583-91.583l30.167 30.166L256 328.834L112.916 185.75l30.167-30.166l91.583 91.582v-204.5h42.667z"/></svg></button>
              <button id="poster-close-btn" title="退出预览"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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
        const posterView = statsPanel.querySelector('.poster-view');
        
        // 🚀 核心：动态生成左下角 Mapbox 风格的分享按钮
        let shareCtrl = document.getElementById('custom-share-ctrl');
        if (!shareCtrl) {
          const target = document.querySelector('.mapboxgl-ctrl-bottom-left');
          if (target) {
            shareCtrl = document.createElement('div');
            shareCtrl.id = 'custom-share-ctrl';
            // 赋予 Mapbox 原生的 class，自动获取白底/黑底和圆角阴影
            shareCtrl.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
            shareCtrl.innerHTML = `
              <button type="button" title="生成海报" class="map-share">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="m12 2.586l6.207 6.207l-1.414 1.414L13 6.414V16h-2V6.414l-3.793 3.793l-1.414-1.414zM3 18v-4h2v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4h2v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3"/></svg>
              </button>`;
            // prepend 确保我们的分享按钮永远排在加减号的上方
            target.prepend(shareCtrl); 
          }
        }

        // 每次选中路线时，显示它并刷新点击事件
        if (shareCtrl) {
          shareCtrl.style.display = 'block';
          shareCtrl.onclick = (e) => {
            e.stopPropagation();
            wrapper.classList.add('show-poster-mode');
            normalView.style.display = 'none';
            posterView.style.display = 'block';

            if (!document.getElementById('real-poster-mask')) {
              const mask = document.createElement('div');
              mask.id = 'real-poster-mask';
              mask.className = 'poster-gradient-mask'; 
              wrapper.appendChild(mask);
            }
          };
        }

        // 关闭预览和下载的逻辑完全不变
        document.getElementById('poster-close-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          wrapper.classList.remove('show-poster-mode');
          posterView.style.display = 'none';
          normalView.style.display = 'block';
          const mask = document.getElementById('real-poster-mask');
          if (mask) mask.remove();
        });

        document.getElementById('poster-download-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const btn = e.currentTarget;
          btn.style.opacity = '0.5'; 

          htmlToImage.toCanvas(wrapper, {
            pixelRatio: 4, 
            backgroundColor: null, 
            filter: (node) => !node.classList?.contains('poster-actions')
          }).then(function (canvas) {
            const webpDataUrl = canvas.toDataURL('image/webp', 0.92);
            const link = document.createElement('a');
            link.download = `KoobaiRun_${displayTime.replace(/[\/\s:]/g, '')}.webp`;
            link.href = webpDataUrl;
            link.click();
            btn.style.opacity = '1';
          }).catch(function (error) {
            console.error('海报生成失败:', error);
            btn.style.opacity = '1';
          });
        });
      }

      // 4. 坐标解析与标记物插入
      const coords = runData._decodedCoords || decodePolyline(runData.summary_polyline);
      const totalPoints = coords.length;
      if (totalPoints < 2) return;

      const sportColor = getColor(runData.type);
      
      const startEl = document.createElement('div'); 
      startEl.style.color = sportColor; 
      startEl.style.lineHeight = '0'; 
      startEl.innerHTML = FLAG_SVG;
      
      const endEl = document.createElement('div'); 
      endEl.style.color = sportColor; 
      endEl.style.lineHeight = '0'; 
      endEl.innerHTML = FLAG_SVG;

      currentMarkers.push(
        new mapboxgl.Marker({ element: startEl, anchor: 'bottom-left', offset: [-5, 4] })
          .setLngLat(coords[0])
          .addTo(map),
        new mapboxgl.Marker({ element: endEl, anchor: 'bottom-left', offset: [-5, 4] })
          .setLngLat(coords[coords.length - 1])
          .addTo(map)
      );

      // 5. 构建距离矩阵数组 (供动画二分查找进度使用)
      const cumulativeDistances = new Float32Array(totalPoints); 
      cumulativeDistances[0] = 0;
      for (let i = 1; i < totalPoints; i++) {
        cumulativeDistances[i] = cumulativeDistances[i - 1] + Math.sqrt(
          Math.pow(coords[i][0] - coords[i - 1][0], 2) + Math.pow(coords[i][1] - coords[i - 1][1], 2)
        );
      }
      const totalGeoDistance = cumulativeDistances[totalPoints - 1];

      // 6. 开始飞行：先跳跃至起点上空
      let startTime = null;
      let currentBearing = calculateBearing(coords[0], coords[Math.min(5, totalPoints - 1)]);
      map.flyTo({ center: coords[0], bearing: currentBearing, pitch: 70, zoom: 16, duration: 2500, essential: true });

      // 7. 动画逐帧渲染核心 (requestAnimationFrame)
      const animate = (timestamp) => {
        if (String(activeRunId) !== runId) return; 
        if (!startTime) startTime = timestamp;
        
        // 基于公里数动态计算动画耗时，路程越长飞得越久
        const progress = Math.min((timestamp - startTime) / Math.min(3500 + Math.sqrt(runData.distance || 5) * 800, 12000), 1);
        const targetDist = progress * totalGeoDistance;

        // 二分法极速查找当前进度应在哪个坐标点
        let l = 0, r = totalPoints - 1, idx = 0;
        while (l <= r) { 
          const mid = (l + r) >> 1; 
          if (cumulativeDistances[mid] <= targetDist) { 
            idx = mid; 
            l = mid + 1; 
          } else {
            r = mid - 1; 
          }
        }
        if (idx >= totalPoints - 1) idx = totalPoints - 2;

        // 计算跨点间的微小平滑余量
        const remainder = (cumulativeDistances[idx + 1] - cumulativeDistances[idx]) > 0 
          ? (targetDist - cumulativeDistances[idx]) / (cumulativeDistances[idx + 1] - cumulativeDistances[idx]) 
          : 0;

        if (progress < 1) {
          if (coords[idx] && coords[idx + 1]) {
            // 插值计算当前飞机的绝对位置
            const currentPos = [ 
              coords[idx][0] + (coords[idx + 1][0] - coords[idx][0]) * remainder, 
              coords[idx][1] + (coords[idx + 1][1] - coords[idx][1]) * remainder 
            ];
            
            // 实时截断线段，渲染高亮轨迹
            const currentLineCoords = coords.slice(0, idx + 1); 
            currentLineCoords.push(currentPos);
            
            if (map.getSource('highlight-run-source')) {
              map.getSource('highlight-run-source').setData({ 
                type: 'FeatureCollection', 
                features: [{ 
                  type: 'Feature', 
                  properties: { type: runData.type }, 
                  geometry: { type: 'LineString', coordinates: currentLineCoords } 
                }] 
              });
            }

            // 预判前方的转向角，实现丝滑镜头摇摄
            let lookAheadIdx = idx; 
            while (lookAheadIdx < totalPoints - 1 && cumulativeDistances[lookAheadIdx] < targetDist + totalGeoDistance * 0.05) {
              lookAheadIdx++;
            }
            currentBearing += ((((calculateBearing(currentPos, coords[lookAheadIdx]) - currentBearing) + 540) % 360) - 180) * 0.05; 
            
            map.easeTo({ center: currentPos, bearing: currentBearing, pitch: 70, zoom: 16.5, duration: 32, easing: (t) => t });
          }
          animationRef = requestAnimationFrame(animate);

        } else {
          // 动画结束：完整渲染整条高亮线
          if (map.getSource('highlight-run-source')) {
            map.getSource('highlight-run-source').setData({ 
              type: 'FeatureCollection', 
              features: [{ 
                type: 'Feature', 
                properties: { type: runData.type }, 
                geometry: { type: 'LineString', coordinates: coords } 
              }] 
            });
          }
          
          // 延迟 1 秒后，拉起视角俯瞰全线
          flyToTimeout = setTimeout(() => {
            const endCam = map.cameraForBounds([
              [Math.min(...coords.map(p => p[0])), Math.min(...coords.map(p => p[1]))], 
              [Math.max(...coords.map(p => p[0])), Math.max(...coords.map(p => p[1]))]
            ], { padding: 60 });
            
            if (endCam) {
              map.easeTo({ ...endCam, pitch: 0, bearing: 0, duration: 1500 });
            }
          }, 1000); 
        }
      };
      
      // 给镜头降落预留 2.6 秒时间，再启动飞行动画
      flyToTimeout = setTimeout(() => { 
        animationRef = requestAnimationFrame(animate); 
      }, 2600);
      
    }
  };
});