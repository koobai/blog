document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // 确保依赖项和全局命名空间均已加载
  if (typeof mapboxgl === 'undefined' || !window.KoobaiRun) {
    return;
  }

  /* =========================================
     1. 基础配置与图标定义
  ========================================= */
  const FLAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20"><path fill="currentColor" d="M4.5 3.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75H6v2.75a.75.75 0 0 1-1.5 0zM6 13h3v-3h3v3h3v-3h-3V7h3V4h-3v3H9V4H6v3h3v3H6z"/></svg>`;

  mapboxgl.accessToken = window.KoobaiRun.config.MAPBOX_TOKEN;
  
  const map = new mapboxgl.Map({
    container: 'mapbox-container', 
    style: 'mapbox://styles/koobai/cmma8mwce001v01sge7e0dx1w', 
    center: [120.1551, 30.2741], 
    zoom: 11, 
    pitch: 0, 
    bearing: 0, 
    maxPitch: 85,
    logoPosition: 'bottom-right', 
    attributionControl: false     
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-left');

  /* =========================================
     2. 容器缩放与重绘控制
  ========================================= */
  const mapWrapper = document.getElementById('map-wrapper');
  if (mapWrapper && window.ResizeObserver) {
    new ResizeObserver(() => {
      requestAnimationFrame(() => map.resize());
    }).observe(mapWrapper);
  }

  window.addEventListener('resizeMap', () => {
    if (map) {
      map.resize();

      if (activeRunId) {
        const runData = window.runData.find(r => Number(r.run_id) === activeRunId);
        if (runData) {
          const coords = decodePolyline(runData.summary_polyline);
          const bounds = new mapboxgl.LngLatBounds();
          coords.forEach(p => bounds.extend(p));
          map.easeTo({
            ...map.cameraForBounds(bounds, { padding: 40 }),
            duration: 300 
          });
        }
      }
    }
  });

  /* =========================================
     3. 核心工具函数与算法
  ========================================= */
  const TYPE_COLORS = {
    'Run': 'rgb(224,237,94)', 'Ride': 'rgb(0,237,94)', 'EBikeRide': 'rgb(0,237,94)',
    'VirtualRide': 'rgb(105,106,173)', 'Hike': 'rgb(237,85,219)', 'Walk': 'rgb(237,85,219)',
    'Swim': 'rgb(0, 199, 255)', 'WaterSport': 'rgb(0, 199, 255)', 'Rowing': 'rgb(112,243,255)',
    'TrailRun': 'rgb(224,237,94)', 'Trail Run': 'rgb(224,237,94)', 'VirtualRun': 'rgb(105,106,173)',
    'Treadmill': 'rgb(224,237,94)'
  };
  
  const FALLBACK_COLOR = 'rgb(0,237,94)'; 
  const getColor = (type) => TYPE_COLORS[type] || FALLBACK_COLOR;

  // 组装 Mapbox 的条件渲染表达式
  const colorRules = ['match', ['get', 'type']];
  for (const [type, color] of Object.entries(TYPE_COLORS)) { 
    colorRules.push(type, color); 
  }
  colorRules.push(FALLBACK_COLOR);

  // 解析 Google Encoded Polyline
  const decodePolyline = (str, precision = 5) => {
    let index = 0, lat = 0, lng = 0, coordinates = [], shift = 0, result = 0, byte = null;
    let factor = Math.pow(10, precision);
    
    while (index < str.length) {
      byte = null; shift = 0; result = 0;
      do { 
        byte = str.charCodeAt(index++) - 63; 
        result |= (byte & 0x1f) << shift; 
        shift += 5; 
      } while (byte >= 0x20);
      lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
      
      shift = result = 0;
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

  // 坐标聚类，防止异常点导致地图缩放失控
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

  // 计算地图平滑转向的方位角
  const calculateBearing = (start, end) => {
    const PI = Math.PI;
    const lat1 = (start[1] * PI) / 180, lon1 = (start[0] * PI) / 180;
    const lat2 = (end[1] * PI) / 180, lon2 = (end[0] * PI) / 180;
    const dLon = lon2 - lon1;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / PI + 360) % 360;
  };

  /* =========================================
     4. 全局图层与状态管理
  ========================================= */
  let activeRunId = null;
  let animationRef = null;
  let flyToTimeout = null;
  let currentMarkers = [];
  let isFirstLoad = true;
  
  const firstYearBtn = document.querySelector('#year-nav .button');
  let currentYear = firstYearBtn ? firstYearBtn.getAttribute('data-year') : new Date().getFullYear().toString();

  const resetState = () => {
    if (animationRef) cancelAnimationFrame(animationRef);
    if (flyToTimeout) clearTimeout(flyToTimeout);
    currentMarkers.forEach(m => m.remove());
    currentMarkers = [];
  };

  map.on('load', () => {
    // 尝试挂载 3D 建筑与地形
    try {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', { 'type': 'raster-dem', 'url': 'mapbox://mapbox.mapbox-terrain-dem-v1', 'tileSize': 512, 'maxzoom': 14 });
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.8 }); 
      }
      if (!map.getLayer('3d-buildings')) {
        map.addLayer({
          'id': '3d-buildings', 'source': 'composite', 'source-layer': 'building', 'filter': ['==', 'extrude', 'true'], 'type': 'fill-extrusion', 'minzoom': 14,
          'paint': { 
            'fill-extrusion-color': '#1C1C1E', 
            'fill-extrusion-height': ['*', ['get', 'height'], 1.8], 
            'fill-extrusion-base': ['*', ['get', 'min_height'], 1.8], 
            'fill-extrusion-opacity': 0.8 
          }
        }); 
      }
    } catch (e) {
      console.warn("3D地形加载失败，降级为2D显示", e);
    }

    // 核心轨迹图层
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

    // 基于年份渲染全景地图
    const renderDataByYear = (targetYear) => {
      activeRunId = null; 
      currentYear = targetYear; 
      resetState();
      
      const features = []; 
      let allCoordsForBounds = [];

      window.KoobaiRun.data.forEach(run => {
        if (!run.start_date_local?.startsWith(targetYear) || !run.summary_polyline) return;
        const coords = decodePolyline(run.summary_polyline);
        if (coords.length === 0) return;
        
        allCoordsForBounds.push(...coords);
        features.push({ 
          type: 'Feature', 
          properties: { id: Number(run.run_id), type: run.type }, 
          geometry: { type: 'LineString', coordinates: coords } 
        });
      });

      map.getSource('all-runs').setData({ type: 'FeatureCollection', features });
      map.getSource('highlight-run-source').setData({ type: 'FeatureCollection', features: [] });
      map.setPaintProperty('runs-core', 'line-opacity', 0.8);

      // =========================================
    // 🌟 自适应相机视角 (直接平铺逻辑，不封装)
    // =========================================
    if (allCoordsForBounds.length > 0) {
      const validCoords = filterCityBoundingBox(allCoordsForBounds);
      const bounds = new mapboxgl.LngLatBounds();
      validCoords.forEach(c => bounds.extend(c));
      
      const cam = map.cameraForBounds(bounds, { padding: 50 });
      
      if (cam) {
        if (isFirstLoad) {
          // 首次加载：先跳转后微调
          map.jumpTo({ ...cam, zoom: cam.zoom - 0.2, pitch: 0, bearing: 0 });
          
          setTimeout(() => { 
            map.easeTo({ 
              ...cam, 
              pitch: 0, 
              bearing: 0, 
              duration: 1000, 
              easing: (t) => t * (2 - t) 
            }); 
          }, 50);
          
          isFirstLoad = false;
        } else {
          // 切换年份：直接平滑移动
          map.easeTo({ 
            ...cam, 
            pitch: 0, 
            bearing: 0, 
            duration: 1000 
          });
        }
      }
    }
  }; 

    // 初始渲染
    renderDataByYear(currentYear);

    // 监听导航年份点击事件
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

    /* =========================================
       5. 路线飞行动画 (挂载至全局空间)
    ========================================= */
    window.KoobaiRun.map = {
      flyTo: (rawRunId) => {
        const runId = Number(String(rawRunId).replace(/,/g, ''));
        const statsPanel = document.getElementById('map-stats-panel'); 

        // 如果点击的是当前已激活的路线，则取消高亮并恢复全景
        if (activeRunId === runId) {
          renderDataByYear(currentYear);
          if (window.KoobaiRun.ui) {
            window.KoobaiRun.ui.highlightRunInUI(null); 
          }
          if (statsPanel) {
            statsPanel.style.display = 'none'; 
          }
          return;
        }

        activeRunId = runId; 
        resetState();
        
        if (window.KoobaiRun.ui) {
          window.KoobaiRun.ui.highlightRunInUI(runId); 
        }
        
        // 隐藏基础路线网，准备渲染高亮层
        map.setPaintProperty('runs-core', 'line-opacity', 0);
        map.getSource('highlight-run-source').setData({ type: 'FeatureCollection', features: [] });

        const runData = window.KoobaiRun.data.find(r => Number(r.run_id) === runId);
        if (!runData) return; 

        // 渲染内嵌数据面板
        if (statsPanel) {
          const distance = (runData.distance / 1000).toFixed(2);
          const runTime = runData.moving_time || '--';
          const heartRate = runData.average_heartrate ? Math.round(runData.average_heartrate) : '--';
          const isRide = ['Ride', 'VirtualRide', 'EBikeRide'].includes(runData.type);
          const color = getColor(runData.type);
          
          let paceNum = '--', paceUnit = '';
          if (runData.average_speed) {
              const speedKmH = runData.average_speed * 3.6;
              if (isRide) { 
                paceNum = speedKmH.toFixed(2); 
                paceUnit = 'km/h'; 
              } else { 
                const paceMins = 60 / speedKmH; 
                paceNum = `${Math.floor(paceMins)}'${Math.round((paceMins - Math.floor(paceMins)) * 60).toString().padStart(2, '0')}''`; 
              }
          }
          
          const displayTime = typeof window.formatDate === 'function' 
            ? window.formatDate(runData.start_date_local.replace(' ', 'T'), true, true) 
            : runData.start_date_local.substring(5, 16);

          statsPanel.innerHTML = `
            <div class="detailName">
              ${window.KoobaiRun.getSmartName(runData.name, runData.type, runData.start_date_local)} 
              <span class="detailDate">${displayTime}</span>
            </div>
            <div class="detailStatsRow">
              <div class="detailStatBlock"><span class="statLabel">里程</span><span class="statVal" style="color: ${color}">${distance}<small>km</small></span></div>
              <div class="detailStatBlock"><span class="statLabel">用时</span><span class="statVal">${runTime}</span></div>
              <div class="detailStatBlock"><span class="statLabel">${isRide ? '均速' : '配速'}</span><span class="statVal">${paceNum}<small>${paceUnit}</small></span></div>
              <div class="detailStatBlock"><span class="statLabel">心率</span><span class="statVal">${heartRate}</span></div>
            </div>
          `;
          statsPanel.style.display = 'flex';
        }

        // 解析当前飞行路线坐标
        const coords = decodePolyline(runData.summary_polyline);
        const totalPoints = coords.length;
        if (totalPoints < 2) return;

        // 挂载起止点旗帜
        const sportColor = getColor(runData.type);
        
        const startEl = document.createElement('div'); 
        startEl.style.color = sportColor; 
        startEl.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))'; 
        startEl.innerHTML = FLAG_SVG;
        
        const endEl = document.createElement('div'); 
        endEl.style.color = sportColor; 
        endEl.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))'; 
        endEl.innerHTML = FLAG_SVG;

        currentMarkers.push(
          new mapboxgl.Marker({ element: startEl, anchor: 'bottom-left' })
            .setLngLat(coords[0])
            .addTo(map),
          new mapboxgl.Marker({ element: endEl, anchor: 'bottom-left' })
            .setLngLat(coords[coords.length - 1])
            .addTo(map)
        );

        // 预计算坐标点距离，用于平滑插值动画
        const cumulativeDistances = new Float32Array(totalPoints); 
        cumulativeDistances[0] = 0;
        for (let i = 1; i < totalPoints; i++) {
          cumulativeDistances[i] = cumulativeDistances[i - 1] + Math.sqrt(
            Math.pow(coords[i][0] - coords[i - 1][0], 2) + Math.pow(coords[i][1] - coords[i - 1][1], 2)
          );
        }
        const totalGeoDistance = cumulativeDistances[totalPoints - 1];

        // 镜头初始化跳跃
        let startTime = null;
        let currentBearing = calculateBearing(coords[0], coords[Math.min(5, totalPoints - 1)]);
        map.flyTo({ center: coords[0], bearing: currentBearing, pitch: 70, zoom: 16, duration: 2500, essential: true });

        // 核心渲染循环函数
        const animate = (timestamp) => {
          if (activeRunId !== runId) return; 
          if (!startTime) startTime = timestamp;
          
          // 动态计算完成进度
          const progress = Math.min((timestamp - startTime) / Math.min(3500 + Math.sqrt((runData.distance || 5000) / 1000) * 800, 12000), 1);
          const targetDist = progress * totalGeoDistance;

          // 二分法查找到达的具体坐标分段
          let l = 0;
          let r = totalPoints - 1;
          let idx = 0;
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

          // 计算当前线段上的插值比例
          const remainder = (cumulativeDistances[idx + 1] - cumulativeDistances[idx]) > 0 
            ? (targetDist - cumulativeDistances[idx]) / (cumulativeDistances[idx + 1] - cumulativeDistances[idx]) 
            : 0;

          if (progress < 1) {
            if (coords[idx] && coords[idx + 1]) {
              const currentPos = [ 
                coords[idx][0] + (coords[idx + 1][0] - coords[idx][0]) * remainder, 
                coords[idx][1] + (coords[idx + 1][1] - coords[idx][1]) * remainder 
              ];
              
              const currentLineCoords = coords.slice(0, idx + 1); 
              currentLineCoords.push(currentPos);
              
              map.getSource('highlight-run-source').setData({ 
                type: 'FeatureCollection', 
                features: [{ 
                  type: 'Feature', 
                  properties: { type: runData.type }, 
                  geometry: { type: 'LineString', coordinates: currentLineCoords } 
                }] 
              });

              // 预见性平滑转向
              let lookAheadIdx = idx; 
              while (lookAheadIdx < totalPoints - 1 && cumulativeDistances[lookAheadIdx] < targetDist + totalGeoDistance * 0.05) {
                lookAheadIdx++;
              }
              currentBearing += ((((calculateBearing(currentPos, coords[lookAheadIdx]) - currentBearing) + 540) % 360) - 180) * 0.05; 
              
              map.easeTo({ center: currentPos, bearing: currentBearing, pitch: 70, zoom: 16.5, duration: 32, easing: (t) => t });
            }
            animationRef = requestAnimationFrame(animate);
          } else {
            // 动画完毕，兜底渲染完整线段
            map.getSource('highlight-run-source').setData({ 
              type: 'FeatureCollection', 
              features: [{ 
                type: 'Feature', 
                properties: { type: runData.type }, 
                geometry: { type: 'LineString', coordinates: coords } 
              }] 
            });
            
            // 镜头拉远展示全局概览
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
        
        // 等待飞跃动画落地后，启动轨迹描绘
        flyToTimeout = setTimeout(() => { 
          animationRef = requestAnimationFrame(animate); 
        }, 2600);
      }
    };
  });
});