(function() {
  'use strict';

  // 初始化全局命名空间
  if (!window.KoobaiRun) {
    window.KoobaiRun = {};
  }

  /* ========================================================================
     纯前端矢量轨迹生成引擎
  ======================================================================== */
  window.KoobaiTrack = {
    // 极简操场跑道作为无轨迹的兜底
    FALLBACK_POINTS: [[3, 7], [7, 7], [8.5, 6.4], [9.5, 5], [8.5, 3.6], [7, 3], [3, 3], [1.5, 3.6], [0.5, 5], [1.5, 6.4], [3, 7]],

    decode: function(str) {
      let index = 0, lat = 0, lng = 0, coordinates = [], shift = 0, result = 0, byte = null;
      while (index < str.length) {
        byte = null; shift = 0; result = 0;
        do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
        shift = result = 0;
        do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
        coordinates.push([lng / 1e5, lat / 1e5]);
      }
      return coordinates;
    },

    generate: function(polyline, size = 38, runObj = null) {
      let points;
      if (!polyline || polyline === '') {
        points = this.FALLBACK_POINTS;
      } else {
        if (runObj && runObj._decodedCoords) {
          points = runObj._decodedCoords;
        } else {
          points = this.decode(polyline);
          if (points.length < 2) points = this.FALLBACK_POINTS;
          if (runObj && points !== this.FALLBACK_POINTS) runObj._decodedCoords = points; 
        }
      }

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      points.forEach(pt => {
        if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
      });

      const scale = Math.min((size * 0.95) / (maxX - minX || 1), (size * 0.95) / (maxY - minY || 1));
      const offX = (size - (maxX - minX) * scale) / 2;
      const offY = (size - (maxY - minY) * scale) / 2;

      let pathD = '';
      points.forEach((pt, index) => {
        const x = (pt[0] - minX) * scale + offX;
        const y = (maxY - minY - (pt[1] - minY)) * scale + offY;
        pathD += (index === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`);
      });

      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><path d="${pathD}" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="path-track" /></svg>`;
    }
  };

  /* ========================================================================
     板块 1：全局配置与枚举字典
  ======================================================================== */
  window.KoobaiRun.SPORT_COLORS = {
    'Run': '#F58200', 'TrailRun': '#F58200', 'Treadmill': '#F58200', 'VirtualRun': '#F58200',
    'Ride': '#32D74B', 'EBikeRide': '#32D74B', 'VirtualRide': '#32D74B', 
    'Walk': '#DF40C4', 'Hike': '#DF40C4',
    'Swim': '#0BAEE6', 'WaterSport': '#0BAEE6',
    'StairStepper': '#AF52DE'
  };

  const RIDE_TYPES = new Set(['Ride', 'VirtualRide', 'EBikeRide']);
  const WALK_TYPES = new Set(['Walk', 'Hike']);
  const RUN_TYPES = new Set(['Run', 'TrailRun', 'Treadmill', 'VirtualRun', 'Trail Run']);
  const RUN_WALK_TYPES = new Set([...RUN_TYPES, ...WALK_TYPES]);
  const colorFromType = (type) => window.KoobaiRun.SPORT_COLORS[type] || '#14C759';

  /* ========================================================================
     板块 3：核心视图逻辑控制引擎 (UIEngine)
  ======================================================================== */
  class UIEngine {
    constructor(allRuns) {
      this.allRuns = allRuns || [];
      
      // 🚀 优化：直接读取 Hugo 在 HTML 底部注入的全局年份数组，不再前端重新消耗性能计算
      this.availableYears = (window.KoobaiRun && window.KoobaiRun.availableYears) ? window.KoobaiRun.availableYears.map(String) : [];
      
      // 初始化状态：默认选中最新年份
      this.currentYear = this.availableYears.length > 0 ? this.availableYears[0] : new Date().getFullYear().toString();

      this.showAiInsight = false;
      
      // 缓存底部 DOM 卡片
      this.cachedRunCards = document.querySelectorAll('.runCard'); 
      this.setSmartMonth(); 
      this.replaceIconsWithTracks();
    }
    
// 👇 新增：翻转 AI 视图的交互函数
    toggleAiInsight() {
      this.showAiInsight = !this.showAiInsight;
      const gridView = document.querySelector('.calendar-grid-view');
      const aiView = document.querySelector('.ai-insight-view');
      const btn = document.querySelector('.ai-toggle-btn');
      const footer = document.querySelector('.monthFooter'); 
      const bottomCharts = document.querySelector('.monthlyInsights');
      
      if (gridView && aiView && btn) {
        if (this.showAiInsight) {
          gridView.style.display = 'none';
          aiView.style.display = 'flex';
          btn.classList.add('active');
          if (footer) footer.style.display = 'none'; 
          if (bottomCharts) bottomCharts.style.display = 'none'; 
        } else {
          gridView.style.display = 'flex';
          aiView.style.display = 'none';
          btn.classList.remove('active');
          if (footer) footer.style.display = 'block'; 
          if (bottomCharts) bottomCharts.style.display = 'flex';
        }
      }
    }
    // --- 新增：批量替换列表图标为轨迹图 ---
    replaceIconsWithTracks() {
      // 🚀 核心优化：将数组转化为哈希字典，极速匹配
      const normalizeId = (id) => String(Number(String(id).replace(/,/g, '')));
      const runMap = new Map();
      this.allRuns.forEach(r => runMap.set(normalizeId(r.run_id), r));

      this.cachedRunCards.forEach(card => {
        const runId = card.getAttribute('data-run-id');
        if (!runId) return;
        
        const runData = runMap.get(normalizeId(runId));
        
        if (runData) {
          const trackSvg = window.KoobaiTrack.generate(runData.summary_polyline, 38, runData);
          const iconRing = card.querySelector('.iconRing');
          if (iconRing && trackSvg) {
            iconRing.innerHTML = trackSvg;
          }
        }
      });
    }

    // --- 状态控制方法 ---
    
    // 根据年份自动定位到有数据的月份
    setSmartMonth() {
      const runsInYear = this.allRuns.filter(r => r.start_date_local?.startsWith(this.currentYear));
      if (runsInYear.length > 0) {
        this.calMonthIndex = Math.max(...runsInYear.map(r => parseInt(r.start_date_local.substring(5, 7), 10) - 1));
      } else {
        this.calMonthIndex = new Date().getMonth();
      }
    }

    // 触发底部卡片列表的显示/隐藏过滤 (仅按年份过滤)
    triggerListFilter() {
      this.cachedRunCards.forEach(card => {
        const isYearMatch = card.classList.contains(`item-year-${this.currentYear}`);
        card.style.display = isYearMatch ? 'flex' : 'none';
      });
    }

    // 切换年份事件（核心逻辑更新）
    setYear(year) {
      this.currentYear = year;
      this.showAiInsight = false;
      this.setSmartMonth(); 
      this.renderAll();
      
      // 🚀 新增：派发自定义全局事件，通知地图层更新数据
      document.dispatchEvent(new CustomEvent('koobaiYearChanged', { detail: { year: year } }));
    }

    // 新增：通过左右箭头切换年份
    changeYearBy(dir) {
      // 🚀 防御：如果上一次的 DOM 还没渲染完（过快点击），直接拦截
      if (this._isChangingYear) return; 
      this._isChangingYear = true;

      const currentIndex = this.availableYears.indexOf(this.currentYear);
      if (currentIndex !== -1) {
        const nextIndex = currentIndex - dir; 
        if (nextIndex >= 0 && nextIndex < this.availableYears.length) {
          this.setYear(this.availableYears[nextIndex]);
        }
      }
      
      setTimeout(() => { this._isChangingYear = false; }, 300);
    }

    // 切换日历板的月份事件 (-1 或 1)
    setCalMonth(dir) {
      this.calMonthIndex = Math.max(0, Math.min(11, this.calMonthIndex + dir));
      this.showAiInsight = false;
      this.renderCalendar(this.computeEngineData());
    }

    // 地图交互联动：高亮列表卡片和日历格子
    highlightRunInUI(runId) {
      const normalizeId = (id) => {
        if (!id || id === 'undefined' || id === 'null') return null;
        return String(Number(String(id).replace(/,/g, '')));
      };
      
      const targetId = normalizeId(runId);
      
      let activeBg = 'rgba(50, 215, 75, 0.08)'; 
      let activeBorder = 'rgba(50, 215, 75, 0.3)'; 
      
      // 提取目标卡片的主题色
      if (targetId) {
        const targetRun = this.allRuns.find(r => normalizeId(r.run_id) === targetId);
        if (targetRun) {
          const activeColor = colorFromType(targetRun.type);
          let r = 50, g = 215, b = 75;
          if (activeColor.startsWith('#') && activeColor.length === 7) {
            r = parseInt(activeColor.slice(1, 3), 16);
            g = parseInt(activeColor.slice(3, 5), 16);
            b = parseInt(activeColor.slice(5, 7), 16);
          }
          activeBg = `rgba(${r}, ${g}, ${b}, 0.08)`;
          activeBorder = `rgba(${r}, ${g}, ${b}, 0.3)`; 
        }
      }

      // 高亮列表卡片
      this.cachedRunCards.forEach(card => {
        const cardId = normalizeId(card.getAttribute('data-run-id'));
        if (targetId && cardId === targetId) {
          card.style.background = activeBg; 
          card.style.borderColor = activeBorder;
        } else {
          card.style.background = ''; 
          card.style.borderColor = '';
        }
      });
      
      // 高亮日历格子
      document.querySelectorAll('.dayCell.hasRun').forEach(cell => {
        const cellId = normalizeId(cell.getAttribute('data-run-id'));
        if (targetId && cellId === targetId) {
          cell.style.borderColor = activeBorder;
          cell.style.background = activeBg; 
        } else {
          cell.style.borderColor = ''; 
          cell.style.background = '';
        }
      });
    }

    // --- 核心计算方法 ---
    
    // 计算当前选中年份的所有统计数据 (连签、热力图、极值)
    computeEngineData() {
      const displayYear = Number(this.currentYear);
      const filteredRuns = this.allRuns.filter(r => r.start_date_local?.startsWith(this.currentYear));
      
      const monthMap = new Map();
      const dateStats = new Map();
      const datesSet = new Set();
      
      let totalDist = 0, rideDist = 0, runDist = 0;
      
      // 计算用于生成迷你折线图的周数据
      const firstDayUTC = Date.UTC(displayYear, 0, 1);
      const lastDayUTC = Date.UTC(displayYear, 11, 31);
      const totalWeeks = Math.ceil((lastDayUTC - firstDayUTC) / 86400000 / 7) + 1;
      const weekData = new Array(totalWeeks).fill(0);

      // 1. 遍历并归类数据
      filteredRuns.forEach(r => {
        const dateStr = r.start_date_local.slice(0, 10);
        const month = Number(dateStr.slice(5, 7)) - 1;
        const utcDayTimestamp = new Date(`${dateStr}T00:00:00Z`).getTime();
        
        r.hour = new Date(r.start_date_local).getHours();
        r.dateStr = dateStr;
        const distNum = r.distance || 0;

        if (!monthMap.has(month)) monthMap.set(month, { runs: [], runsByDate: new Map() });
        const mData = monthMap.get(month);
        mData.runs.push(r);
        
        if (!mData.runsByDate.has(dateStr)) mData.runsByDate.set(dateStr, []);
        mData.runsByDate.get(dateStr).push(r);

        totalDist += distNum;
        datesSet.add(utcDayTimestamp);
        
        const currentWeek = Math.max(0, Math.min(totalWeeks - 1, Math.floor((utcDayTimestamp - firstDayUTC) / 86400000 / 7)));
        weekData[currentWeek] += distNum;

        if (!dateStats.has(dateStr)) dateStats.set(dateStr, { rideDist: 0, rwDist: 0, month });
        if (RIDE_TYPES.has(r.type)) { 
          rideDist += distNum; 
          dateStats.get(dateStr).rideDist += distNum; 
        } else if (RUN_WALK_TYPES.has(r.type)) { 
          runDist += distNum; 
          dateStats.get(dateStr).rwDist += distNum; 
        }
      });

      // 2. 计算极值 (年度/月度最远)
      let calRideYMax = 0, calRideYDate = null;
      let calRwYMax = 0, calRwYDate = null;
      const calRideMDate = new Map(), calRideMMax = new Map();
      const calRwMDate = new Map(), calRwMMax = new Map();

      dateStats.forEach((stats, date) => {
        if (stats.rideDist > calRideYMax) { calRideYMax = stats.rideDist; calRideYDate = date; }
        if (stats.rideDist > (calRideMMax.get(stats.month) || 0)) { calRideMMax.set(stats.month, stats.rideDist); calRideMDate.set(stats.month, date); }
        if (stats.rwDist > calRwYMax) { calRwYMax = stats.rwDist; calRwYDate = date; }
        if (stats.rwDist > (calRwMMax.get(stats.month) || 0)) { calRwMMax.set(stats.month, stats.rwDist); calRwMDate.set(stats.month, date); }
      });

      // 平滑处理折线图数据
      const sparklineData = weekData.map((val, idx, arr) => {
        const prev = arr[idx - 1] ?? val;
        const next = arr[idx + 1] ?? val;
        return prev * 0.25 + val * 0.5 + next * 0.25;
      });
      
      // 4. 计算选中月份的详细数据 (分布图、心率等)
      const currentMonthData = monthMap.get(this.calMonthIndex) || { runs: [], runsByDate: new Map() };
      let mTotal = 0, mRide = 0, mRun = 0, maxTimeBlockCount = 0, validHrRuns = 0;
      const timeBlocks = new Array(8).fill(0); 
      const hrCounts = new Array(5).fill(0);   
      
      currentMonthData.runs.forEach(r => {
        const distNum = r.distance || 0;
        mTotal += distNum;
        if (RIDE_TYPES.has(r.type)) mRide += distNum; 
        else if (RUN_WALK_TYPES.has(r.type)) mRun += distNum;
        
        // 分配 24 小时至 8 个时间块
        const blockIdx = Math.floor(r.hour / 3);
        if (++timeBlocks[blockIdx] > maxTimeBlockCount) maxTimeBlockCount = timeBlocks[blockIdx];
        
        // 分配心率区间
        if (r.average_heartrate && r.average_heartrate > 0) {
          validHrRuns++;
          const hr = r.average_heartrate;
          const zoneIndex = hr < 115 ? 0 : hr < 130 ? 1 : hr < 145 ? 2 : hr < 160 ? 3 : 4;
          hrCounts[zoneIndex]++;
        }
      });

      // 静态图表文案配置
      const personas = [ 
        { name: '午夜潜行', time: '00:00-03:00' }, { name: '破晓先锋', time: '03:00-06:00' }, 
        { name: '晨光逐风', time: '06:00-09:00' }, { name: '骄阳行者', time: '09:00-12:00' }, 
        { name: '烈日独行', time: '12:00-15:00' }, { name: '午后追风', time: '15:00-18:00' }, 
        { name: '暮色掠影', time: '18:00-21:00' }, { name: '暗夜游侠', time: '21:00-24:00' } 
      ];
      
      const hrZonesInfo = [ 
        { color: '#32D74B', title: '舒缓有氧', name: 'Z1', range: '<115' }, 
        { color: '#FFCC00', title: '稳态燃脂', name: 'Z2', range: '115-129' }, 
        { color: '#FF9500', title: '有氧强化', name: 'Z3', range: '130-144' }, 
        { color: '#FF5E3A', title: '乳酸阈值', name: 'Z4', range: '145-159' }, 
        { color: '#FF3B30', title: '无氧极限', name: 'Z5', range: '≥160' } 
      ];

      return {
        displayYear, 
        availableMonthsArr: Array.from(new Set(filteredRuns.map(r => r.start_date_local.slice(5, 7)))).sort().reverse(),
        globalData: { 
          stats: { totalDist, rideDist, runDist, activeDays: datesSet.size },
          sparklineData, sparklineMax: Math.max(...sparklineData, 1), 
          calRideYDate, calRideMDates: new Set(calRideMDate.values()), 
          calRwYDate, calRwMDates: new Set(calRwMDate.values()) 
        },
        monthlyData: { 
          runsByDate: currentMonthData.runsByDate, 
          monthDetailStats: { totalDist: mTotal, rideDist: mRide, runDist: mRun }, 
          insights: { 
            hasActivities: currentMonthData.runs.length > 0, 
            timeBlocks, maxTimeBlockCount: Math.max(maxTimeBlockCount, 1), 
            peakPersona: maxTimeBlockCount > 0 ? personas[timeBlocks.indexOf(maxTimeBlockCount)].name : '等待记录', 
            personas, validHrRuns, hrCounts, hrZonesInfo, 
            hrMaxZone: hrZonesInfo[hrCounts.indexOf(Math.max(...hrCounts))] || hrZonesInfo[0] 
          } 
        }
      };
    }

    // --- DOM 渲染方法 ---

    // 触发全局渲染
    renderAll() {
      const engine = this.computeEngineData();
      this.triggerListFilter(); 
      this.renderCalendar(engine);
    }

    // 渲染日历及 Bento 数据面板
    renderCalendar(engine) {
      const container = document.getElementById('calendar-board-container');
      if (!container) return;

      // 1. 生成迷你折线图 SVG
      let sparklineSvg = '';
      if (engine.globalData.sparklineData.length > 0) {
        const width = 200, height = 40, pad = 6, maxVal = engine.globalData.sparklineMax;
        const points = engine.globalData.sparklineData.map((val, i) => ({ 
          x: (i / Math.max(engine.globalData.sparklineData.length - 1, 1)) * width, 
          y: height - pad - (val / maxVal) * (height - 2 * pad) 
        }));
        
        let path = `M ${points[0].x},${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = Math.max(pad, Math.min(height - pad, p1.y + (p2.y - p0.y) / 6));
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = Math.max(pad, Math.min(height - pad, p2.y - (p3.y - p1.y) / 6));
          
          path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
        }
        
        sparklineSvg = `
          <svg class="sparkline" viewBox="0 0 200 40" preserveAspectRatio="none" style="overflow: visible">
            <defs>
              <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#32D74B" stop-opacity="0.25" />
                <stop offset="100%" stop-color="#32D74B" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path d="${path} L 200,40 L 0,40 Z" fill="url(#sparklineGrad)" stroke="none" class="sparklineFill" />
            <path d="${path}" fill="none" class="sparklineLine" />
          </svg>`;
      }

      // 2. 生成日历格子
      const rawFirstDay = new Date(engine.displayYear, this.calMonthIndex, 1).getDay();
      const firstDayOfMonth = rawFirstDay === 0 ? 6 : rawFirstDay - 1; 
      const daysInMonth = new Date(engine.displayYear, this.calMonthIndex + 1, 0).getDate();
      const daysArr = Array.from({ length: firstDayOfMonth }, () => null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

      const gridHtml = daysArr.map(day => {
        if (!day) return `<div class="emptyDay"></div>`;
        
        const dateStr = `${engine.displayYear}-${String(this.calMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayRuns = (engine.monthlyData.runsByDate.get(dateStr) || []).sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));

        const hasRun = dayRuns.length > 0;
        const primaryRun = hasRun ? dayRuns[0] : null;

        let hasAchieve = false;
        let iconDom = '';
        let tooltipHtml = '';

        if (primaryRun) {
          // 组装 Tooltip 内部的条目列表
          const runListHtml = dayRuns.map(r => {
            // ✨ 如果有距离就显示公里，没距离就显示运动时长
            const numDisplay = r.distance > 0 
              ? `${r.distance.toFixed(1)} <small class="ttUnit">km</small>`
              : `${r.moving_time} <small class="ttUnit">用时</small>`;
              
            return `
              <div class="ttItem">
                <span class="ttName">${r.name}</span>
                <span class="ttNum" style="color: ${colorFromType(r.type)}">${numDisplay}</span>
              </div>
            `;
          }).join('');
          
          // 成就判定
          const isRideY = dateStr === engine.globalData.calRideYDate;
          const isRwY = dateStr === engine.globalData.calRwYDate;
          const isRideM = !isRideY && engine.globalData.calRideMDates.has(dateStr);
          const isRwM = !isRwY && engine.globalData.calRwMDates.has(dateStr);
          
          const isGold = isRideY || isRwY;
          hasAchieve = isGold || isRideM || isRwM;

          // 决定渲染何种图标指示器
          if (hasAchieve) {
            const ringClass = isGold ? 'goldRing' : 'silverRing';
            const trackSvgSmall = window.KoobaiTrack.generate(primaryRun.summary_polyline, 20, primaryRun);
            iconDom = `
              <div class="calIconRing ${ringClass} has-track">
                ${trackSvgSmall}
              </div>`;
          } else if (dayRuns.length > 1) {
            iconDom = `<span class="multiDot"></span>`;
          }
          
          // 组装成就标签
          let aHtml = '';
          if (isRideY) aHtml += `<div class="ttAchieveRow"><span>年度最远</span><span class="titleTag">骑行</span></div>`;
          else if (isRideM) aHtml += `<div class="ttAchieveRow"><span>月度最远</span><span class="titleTag">骑行</span></div>`;
          if (isRwY) aHtml += `<div class="ttAchieveRow"><span>年度最远</span><span class="titleTag">跑走</span></div>`;
          else if (isRwM) aHtml += `<div class="ttAchieveRow"><span>月度最远</span><span class="titleTag">跑走</span></div>`;

          tooltipHtml = `
            <div class="runTooltip">
              <div class="ttDayRunList">${runListHtml}</div>
              ${aHtml ? `<div class="ttAchievement">${aHtml}</div>` : ''}
            </div>`;
        }

        const runColor = primaryRun ? colorFromType(primaryRun.type) : '#32D74B';
        const dateStyle = hasRun ? `color: ${runColor}; opacity: 1;` : 'opacity: 0.6;';
        
        return `
          <div class="dayCell ${hasRun ? 'hasRun' : ''} ${hasAchieve ? 'maxDay' : ''}" 
               data-run-id="${hasRun ? primaryRun.run_id : ''}" 
               ${hasRun ? `onclick="window.KoobaiRun.map.flyTo('${primaryRun.run_id}')" style="cursor: pointer;"` : ''}>
            ${!hasAchieve ? `<span class="dateNum" style="${dateStyle}">${day}</span>` : ''}
            ${iconDom}
            ${tooltipHtml}
          </div>`;
      }).join('');
      const currentMonthStr = `${engine.displayYear}-${String(this.calMonthIndex + 1).padStart(2, '0')}`;
      const insightData = window.KoobaiRun.monthlyInsights ? window.KoobaiRun.monthlyInsights[currentMonthStr] : null;
      
      // 如果本月有 AI 数据，则生成一个星星按钮
      const aiBtnHtml = insightData ? `
        <button class="ai-toggle-btn ${this.showAiInsight ? 'active' : ''}" onclick="window.KoobaiRun.ui.toggleAiInsight()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5 .5L9 4L6.5 9.5L1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/></svg>
        </button>
      ` : '';

      const gridViewDisplay = this.showAiInsight ? 'none' : 'flex';
      const aiViewDisplay = this.showAiInsight ? 'flex' : 'none';
      const aiComment = insightData ? insightData.ai_comment : '';

      // 3. 生成洞察图表：时间段分布打孔图
      const insights = engine.monthlyData.insights;
      const timeBlocksHtml = insights.timeBlocks.map((count, i) => {
        const heightRatio = insights.maxTimeBlockCount > 0 ? (count / insights.maxTimeBlockCount) : 0;
        const bgStyle = count > 0 ? `style="background-color: rgba(50, 215, 75, ${0.3 + 0.7 * heightRatio})"` : '';
        
        return `
          <div class="barWrapper">
            <div class="punchHole" ${bgStyle}></div>
            <div class="runTooltip">
              <div class="ttItem">
                <span class="ttName">${insights.personas[i].time}</span>
                <span class="ttNum">${count} <small>趟</small></span>
              </div>
            </div>
          </div>`;
      }).join('');

      // 4. 生成洞察图表：心率区间柱状图
      const hrZonesHtml = insights.hrCounts.map((count, i) => {
        const info = insights.hrZonesInfo[i];
        const percent = insights.validHrRuns > 0 ? Math.max(12, (count / insights.validHrRuns) * 100) : 12;
        
        const bgStyle = count > 0 ? `background-color: ${info.color}` : '';
        
        return `
          <div class="zoneCol">
            <div class="zoneBar" style="height: ${percent}%; ${bgStyle}"></div>
            <div class="runTooltip">
              <div class="ttItem">
                <span class="ttName" style="color: ${info.color};">
                  ${info.range} <small>BPM</small>
                </span>
                <span class="ttNum">${count} <small>趟</small></span>
              </div>
            </div>
          </div>`;
      }).join('');

      // --- 新增：判断是否达到年份边界，用来置灰箭头 ---
      const currentYIdx = this.availableYears.indexOf(this.currentYear);
      const disablePrevY = currentYIdx >= this.availableYears.length - 1; // 无法切换到更老的年份
      const disableNextY = currentYIdx <= 0; // 无法切换到更新的年份

      // 5. 注入最终拼装的 DOM 结构
      container.innerHTML = `
        <div class="boardContainer">
          
          <div class="globalSection">
            ${sparklineSvg}
            <div class="globalTitle monthNav">
              <button onclick="window.KoobaiRun.ui.changeYearBy(-1)" ${disablePrevY ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span>${engine.displayYear} 年度总里程</span>
              <button onclick="window.KoobaiRun.ui.changeYearBy(1)" ${disableNextY ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
            <div class="globalMainStat">
              <span class="val">${engine.globalData.stats.totalDist.toFixed(1)}</span>
              <span class="unit">KM</span>
            </div>
            <div class="metricsRow">
              <div class="metricBlock">
                <span class="metricLabel">骑行</span>
                <span class="metricValue">${engine.globalData.stats.rideDist.toFixed(0)}<small>km</small></span>
              </div>
              <div class="metricBlock">
                <span class="metricLabel">跑走</span>
                <span class="metricValue">${engine.globalData.stats.runDist.toFixed(0)}<small>km</small></span>
              </div>
              <div class="metricBlock">
                <span class="metricLabel">出勤</span>
                <span class="metricValue">${engine.globalData.stats.activeDays}<small>天</small></span>
              </div>
            </div>
          </div>
          
          <div class="calendarSection">
            <div class="monthHeader">
              <div class="monthNav" style="position: relative;">
                <button onclick="window.KoobaiRun.ui.setCalMonth(-1)" ${this.calMonthIndex === 0 ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span>${currentMonthStr}</span>
                <button onclick="window.KoobaiRun.ui.setCalMonth(1)" ${this.calMonthIndex === 11 ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
                ${aiBtnHtml}
              </div>
            </div>
            
            <div class="cal-content-wrapper">
              <div class="calendar-grid-view" style="display: ${gridViewDisplay};">
                <div class="weekdays"><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div><div>日</div></div>
                <div class="grid">${gridHtml}</div>
              </div>
              
              <div class="ai-insight-view" style="display: ${aiViewDisplay};">
                <div class="ai-comment-content">${aiComment}</div>
              </div>
            </div>

            <div class="monthFooter">
              里程 <span>${engine.monthlyData.monthDetailStats.totalDist.toFixed(1)}</span> km 
              <span class="dot">•</span> 
              骑行 <span>${engine.monthlyData.monthDetailStats.rideDist.toFixed(1)}</span> km 
              <span class="dot">•</span> 
              跑走 <span>${engine.monthlyData.monthDetailStats.runDist.toFixed(1)}</span> km
            </div>
          </div>
          
          <div class="monthlyInsights">
            <div class="insightCard">
              <div class="insightHeader"><span class="insightTitle">${insights.peakPersona}</span></div>
              <div class="insightContent">
                <div class="punchCard">${timeBlocksHtml}</div>
                <div class="insightLabels timeLabels"><span>00:00</span><span>12:00</span><span>24:00</span></div>
              </div>
            </div>
            
            <div class="insightCard">
              <div class="insightHeader"><span class="insightTitle">${insights.hasActivities ? insights.hrMaxZone.title : '等待记录'}</span></div>
              <div class="insightContent">
                <div class="zoneChart">${hrZonesHtml}</div>
                <div class="insightLabels zoneLabels">
                  ${insights.hrZonesInfo.map(i => `<span>${i.name}</span>`).join('')}
                </div>
              </div>
            </div>
          </div>
          
        </div>
      `;
    }
  }

  /* ========================================================================
     板块 4：页面挂载与初始化
     功能：当 DOM 加载完成且数据就绪时，实例化 UI 引擎
  ======================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    if (window.KoobaiRun && window.KoobaiRun.data) {
      window.KoobaiRun.ui = new UIEngine(window.KoobaiRun.data);
      window.KoobaiRun.ui.renderAll();
    }
  });

})();