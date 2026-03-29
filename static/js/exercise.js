(function() {
  'use strict';

  /* ========================================================================
     模块 1：静态配置 (Config)
  ======================================================================== */
  const CONFIG = {
    COLORS: {
      Run: '#F58200', TrailRun: '#F58200', Treadmill: '#F58200', VirtualRun: '#F58200',
      Ride: '#32D74B', EBikeRide: '#32D74B', VirtualRide: '#32D74B', 
      Walk: '#DF40C4', Hike: '#DF40C4', Swim: '#0BAEE6', StairStepper: '#AF52DE',
      Default: '#14C759'
    },
    TYPES: {
      RIDE: new Set(['Ride', 'VirtualRide', 'EBikeRide']),
      RUN: new Set(['Run', 'TrailRun', 'Treadmill', 'VirtualRun']),
      WALK: new Set(['Walk', 'Hike'])
    },
    PERSONAS: [ 
      { name: '午夜潜行', time: '00:00-03:00' }, { name: '破晓先锋', time: '03:00-06:00' }, 
      { name: '晨光逐风', time: '06:00-09:00' }, { name: '骄阳行者', time: '09:00-12:00' }, 
      { name: '烈日独行', time: '12:00-15:00' }, { name: '午后追风', time: '15:00-18:00' }, 
      { name: '暮色掠影', time: '18:00-21:00' }, { name: '暗夜游侠', time: '21:00-24:00' } 
    ],
    HR_ZONES: [ 
      { color: '#32D74B', title: '舒缓有氧', name: 'Z1', range: '<115', max: 114 }, 
      { color: '#FFCC00', title: '稳态燃脂', name: 'Z2', range: '115-129', max: 129 }, 
      { color: '#FF9500', title: '有氧强化', name: 'Z3', range: '130-144', max: 144 }, 
      { color: '#FF5E3A', title: '乳酸阈值', name: 'Z4', range: '145-159', max: 159 }, 
      { color: '#FF3B30', title: '无氧极限', name: 'Z5', range: '≥160', max: 999 } 
    ],
    
    getColor: (type) => CONFIG.COLORS[type] || CONFIG.COLORS.Default,
    
    getSmartName: (name, type) => {
      if (!/^(Morning|Afternoon|Evening|Night|Lunch|Run|Ride|Walk|Swim|Hike|Treadmill|晨间|上午|午间|下午|跑步|骑行)/i.test(name) && name.length > 0 && name.length <= 20) return name;
      const map = { Run: '跑起来', TrailRun: '山野跑起', Treadmill: '跑马机跑起', Ride: '骑起来', Walk: '走起来', Hike: '徒步走起', Swim: '游起来', StairStepper: '楼梯爬起' };
      return map[type] || '运动';
    },

    getIcon: (type) => {
      if (CONFIG.TYPES.RIDE.has(type)) return `<svg viewBox="0 -1 26 26" fill="currentColor"><path d="M5.5 21a4.5 4.5 0 1 1 0-9a4.5 4.5 0 0 1 0 9m0-2a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m13 2a4.5 4.5 0 1 1 0-9a4.5 4.5 0 0 1 0 9m0-2a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m-7.477-8.695L13 12v6h-2v-5l-2.719-2.266A2 2 0 0 1 8 7.671l2.828-2.828a2 2 0 0 1 2.829 0l1.414 1.414a6.97 6.97 0 0 0 3.917 1.975l-.01 2.015a8.96 8.96 0 0 1-5.321-2.575zM16 5a2 2 0 1 1 0-4a2 2 0 0 1 0 4"/></svg>`;
      if (CONFIG.TYPES.WALK.has(type)) return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.61713 8.71233L10.8222 6.38373C11.174 6.12735 11.6087 5.98543 12.065 6.0008C13.1764 6.02813 14.1524 6.75668 14.4919 7.82036C14.6782 8.40431 14.8481 8.79836 15.0017 9.0025C15.914 10.2155 17.3655 11 19.0002 11V13C16.8255 13 14.8825 12.0083 13.5986 10.4526L12.901 14.4085L14.9621 16.138L17.1853 22.246L15.3059 22.93L13.266 17.3256L9.87576 14.4808C9.32821 14.0382 9.03139 13.3192 9.16231 12.5767L9.67091 9.6923L8.99407 10.1841L6.86706 13.1116L5.24902 11.9361L7.60016 8.7L7.61713 8.71233ZM13.5002 5.5C12.3956 5.5 11.5002 4.60457 11.5002 3.5C11.5002 2.39543 12.3956 1.5 13.5002 1.5C14.6047 1.5 15.5002 2.39543 15.5002 3.5C15.5002 4.60457 14.6047 5.5 13.5002 5.5ZM10.5286 18.6813L7.31465 22.5116L5.78257 21.226L8.75774 17.6803L9.50426 15.5L11.2954 17L10.5286 18.6813Z"></path></svg>`;
      return `<svg viewBox="0 0 640 640" fill="currentColor"><path d="M352.5 32c30.9 0 56 25.1 56 56s-25.1 56-56 56s-56-25.1-56-56s25.1-56 56-56M219.6 240c-3.3 0-6.2 2-7.4 5l-22 54.9c-6.6 16.4-25.2 24.4-41.6 17.8s-24.4-25.2-17.8-41.6l21.9-54.9c11-27.3 37.4-45.2 66.9-45.2h97.3c28.5 0 54.8 15.1 69.1 39.7l32.8 56.3h61.6c17.7 0 32 14.3 32 32s-14.3 32-32 32h-61.6c-22.8 0-43.8-12.1-55.3-31.8l-10-17.1l-20.7 70.4l75.4 22.6c27.7 8.3 41.8 39 30.1 65.5L381.7 573c-7.2 16.2-26.1 23.4-42.2 16.2s-23.4-26.1-16.2-42.2l49.2-110.8l-95.9-28.8c-32.7-9.8-52-43.7-43.7-76.8l22.7-90.6h-35.9zm-8 181c13.3 14.9 30.7 26.3 51.2 32.4l4.7 1.4l-6.9 19.3c-5.8 16.3-16 30.8-29.3 41.8l-82.4 67.9c-13.6 11.2-33.8 9.3-45-4.3s-9.3-33.8 4.3-45l82.4-67.9c4.5-3.7 7.8-8.5 9.8-13.9z"/></svg>`;
    }
  };

  /* ========================================================================
     模块 2：数据清洗与统计引擎 (Data Engine)
  ======================================================================== */
  class DataEngine {
    constructor(allRuns) {
      this.allRuns = allRuns || [];
      this.displayYear = this._initYear();
      this.calMonthIndex = this._initMonth();
    }

    _initYear() {
      if (this.allRuns.length === 0) return new Date().getFullYear();
      const maxTime = Math.max(...this.allRuns.map(r => new Date(r.start_date_local).getTime()));
      return new Date(maxTime).getFullYear();
    }

    _initMonth() {
      const runsInYear = this.allRuns.filter(r => r.start_date_local?.startsWith(this.displayYear.toString()));
      if (runsInYear.length > 0) {
        return Math.max(...runsInYear.map(r => parseInt(r.start_date_local.substring(5, 7), 10) - 1));
      }
      return new Date().getMonth();
    }

    setMonthOffset(dir) {
      this.calMonthIndex = Math.max(0, Math.min(11, this.calMonthIndex + dir));
      return this.compute();
    }

    _calculateStreak(timestampArray) {
      if (timestampArray.length === 0) return 0;
      let maxStr = 1, currStr = 1;
      for (let i = 1; i < timestampArray.length; i++) {
        const diffDays = (timestampArray[i] - timestampArray[i - 1]) / 86400000;
        if (diffDays === 1) maxStr = Math.max(maxStr, ++currStr);
        else if (diffDays > 1) currStr = 1;
      }
      return maxStr;
    }

    _smoothSparkline(data) {
      return data.map((val, idx, arr) => {
        const prev = arr[idx - 1] ?? val;
        const next = arr[idx + 1] ?? val;
        return prev * 0.25 + val * 0.5 + next * 0.25;
      });
    }

    _extractStats(runs) {
        let rideDist = 0, runDist = 0, totalDist = 0;
        const activeDaysSet = new Set();
        runs.forEach(r => {
            const dist = r.distance || 0;
            totalDist += dist;
            if (CONFIG.TYPES.RIDE.has(r.type)) rideDist += dist;
            else runDist += dist;
            activeDaysSet.add(new Date(`${r.start_date_local.slice(0, 10)}T00:00:00Z`).getTime());
        });
        return {
            totalDist, rideDist, runDist,
            activeDays: activeDaysSet.size,
            maxStreak: this._calculateStreak(Array.from(activeDaysSet).sort())
        };
    }

    _extractInsights(runs) {
        const insights = { timeBlocks: new Array(8).fill(0), hrCounts: new Array(5).fill(0), validHrRuns: 0 };
        runs.forEach(r => {
            insights.timeBlocks[Math.floor(new Date(r.start_date_local).getHours() / 3)]++;
            if (r.average_heartrate > 0) {
                insights.validHrRuns++;
                const hr = r.average_heartrate;
                const zoneIdx = CONFIG.HR_ZONES.findIndex(z => hr < z.max);
                insights.hrCounts[zoneIdx !== -1 ? zoneIdx : 4]++;
            }
        });
        return {
            ...insights,
            maxTimeBlock: Math.max(...insights.timeBlocks, 1),
            peakPersona: Math.max(...insights.timeBlocks) > 0 ? CONFIG.PERSONAS[insights.timeBlocks.indexOf(Math.max(...insights.timeBlocks))].name : '等待记录',
            topZone: CONFIG.HR_ZONES[insights.hrCounts.indexOf(Math.max(...insights.hrCounts))] || CONFIG.HR_ZONES[0]
        };
    }

    _calcTrends(curr, prev) {
        const getTrend = (c, p) => {
            if (p === 0) return { percent: c > 0 ? 100 : 0, dir: c > 0 ? 1 : 0 };
            const delta = c - p;
            const percent = Math.round((Math.abs(delta) / p) * 100);
            return { percent, dir: delta > 0 ? 1 : (delta < 0 ? -1 : 0) };
        };
        return {
            rideDist: getTrend(curr.rideDist, prev.rideDist),
            runDist: getTrend(curr.runDist, prev.runDist),
            activeDays: getTrend(curr.activeDays, prev.activeDays),
            maxStreak: getTrend(curr.maxStreak, prev.maxStreak)
        };
    }

    compute() {
      const currYearStr = this.displayYear.toString();
      const prevYearStr = (this.displayYear - 1).toString();
      const currMonthIdx = this.calMonthIndex;
      const prevMonthIdx = this.calMonthIndex === 0 ? 11 : this.calMonthIndex - 1;
      const prevMonthYearStr = this.calMonthIndex === 0 ? prevYearStr : currYearStr;

      const currYearRuns = this.allRuns.filter(r => r.start_date_local.startsWith(currYearStr));
      const currMonthRuns = currYearRuns.filter(r => (Number(r.start_date_local.slice(5, 7)) - 1) === currMonthIdx);
      const prevMonthRuns = this.allRuns.filter(r => r.start_date_local.startsWith(prevMonthYearStr) && (Number(r.start_date_local.slice(5, 7)) - 1) === prevMonthIdx);

      const globalStats = this._extractStats(currYearRuns);
      const monthlyStats = this._extractStats(currMonthRuns);
      const prevMonthlyStats = this._extractStats(prevMonthRuns);
      const monthlyTrends = this._calcTrends(monthlyStats, prevMonthlyStats);

      const globalInsights = this._extractInsights(currYearRuns);
      const monthlyInsights = this._extractInsights(currMonthRuns);

      const weekData = new Array(54).fill(0);
      const yearFirstDayUTC = Date.UTC(this.displayYear, 0, 1);
      const dailyStats = new Map();

      currYearRuns.forEach(r => {
         const dateStr = r.start_date_local.slice(0, 10);
         const dist = r.distance || 0;
         const utcDayTs = new Date(`${dateStr}T00:00:00Z`).getTime();
         const week = Math.max(0, Math.floor((utcDayTs - yearFirstDayUTC) / 86400000 / 7));
         weekData[week] += dist;

         if (!dailyStats.has(dateStr)) dailyStats.set(dateStr, { rideDist: 0, rwDist: 0, month: Number(dateStr.slice(5,7))-1 });
         if (CONFIG.TYPES.RIDE.has(r.type)) dailyStats.get(dateStr).rideDist += dist;
         else dailyStats.get(dateStr).rwDist += dist;
      });

      const daysInMonth = new Date(this.displayYear, this.calMonthIndex + 1, 0).getDate();
      const monthDailyDist = new Array(daysInMonth).fill(0);
      const runsByDate = new Map();

      currMonthRuns.forEach(r => {
         const dateStr = r.start_date_local.slice(0, 10);
         monthDailyDist[new Date(r.start_date_local).getDate() - 1] += (r.distance || 0);

         if (!runsByDate.has(dateStr)) runsByDate.set(dateStr, []);
         runsByDate.get(dateStr).push(r);
      });

      const maxDates = { rideY: null, rwY: null, rideM: new Map(), rwM: new Map() };
      let rYM = 0, rwYM = 0;
      dailyStats.forEach((stat, date) => {
         if (stat.rideDist > rYM) { rYM = stat.rideDist; maxDates.rideY = date; }
         if (stat.rwDist > rwYM) { rwYM = stat.rwDist; maxDates.rwY = date; }
         if (stat.rideDist > (maxDates.rideM.get(stat.month)?.dist || 0)) maxDates.rideM.set(stat.month, {date, dist: stat.rideDist});
         if (stat.rwDist > (maxDates.rwM.get(stat.month)?.dist || 0)) maxDates.rwM.set(stat.month, {date, dist: stat.rwDist});
      });

      return {
          displayYear: this.displayYear,
          calMonthIndex: this.calMonthIndex,
          global: {
              stats: globalStats,
              insights: globalInsights,
              sparkline: this._smoothSparkline(weekData.slice(0, 52)),
              maxDates: { ride: maxDates.rideY, rw: maxDates.rwY }
          },
          monthly: {
              stats: monthlyStats,
              trends: monthlyTrends,
              insights: monthlyInsights,
              sparkline: this._smoothSparkline(monthDailyDist),
              maxDates: {
                  ride: maxDates.rideM.get(this.calMonthIndex)?.date,
                  rw: maxDates.rwM.get(this.calMonthIndex)?.date
              },
              runsByDate
          }
      };
    }
  }

  /* ========================================================================
     模块 3：UI 渲染引擎 (UI Renderer)
  ======================================================================== */
  class UIRenderer {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
    }

    _generateSparklineSVG(dataArray) {
      if (!dataArray || dataArray.length === 0) return '';
      const max = Math.max(...dataArray, 1);
      const width = 200, height = 40, pad = 6;
      
      const points = dataArray.map((val, i) => ({ 
        x: (i / Math.max(dataArray.length - 1, 1)) * width, 
        y: height - pad - (val / max) * (height - 2 * pad) 
      }));
      
      let path = `M ${points[0].x},${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
          const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = Math.max(pad, Math.min(height - pad, p1.y + (p2.y - p0.y) / 6));
          const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = Math.max(pad, Math.min(height - pad, p2.y - (p3.y - p1.y) / 6));
          path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
      }

      return `
        <svg class="sparkline" viewBox="0 0 200 40" preserveAspectRatio="none">
          <defs>
            <linearGradient id="stat-spark-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#32D74B" stop-opacity="0.25" />
              <stop offset="100%" stop-color="#32D74B" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d="${path} L 200,40 L 0,40 Z" fill="url(#stat-spark-grad)" class="sparkline-fill" />
          <path d="${path}" fill="none" class="sparkline-line" />
        </svg>`;
    }

    _renderStatCard(engineData, statMode) {
      const isMonthly = statMode === 'monthly';
      const data = isMonthly ? engineData.monthly : engineData.global;
      
      const renderMetric = (label, val, unit, trend) => {
        let trendHtml = '';
        if (trend) {
            const isUp = trend.dir === 1;
            const isDown = trend.dir === -1;
            const colorCls = isUp ? 'trend-up' : (isDown ? 'trend-down' : 'trend-flat');
            const curve = isUp ? `M2,10 Q6,10 12,5 T22,2` : (isDown ? `M2,2 Q6,2 12,7 T22,10` : `M2,6 L22,6`);
            const trendText = isUp ? `增长 ${trend.percent}%` : (isDown ? `下降 ${trend.percent}%` : '持平');

            trendHtml = `
              <div class="metric-trend ${colorCls}">
                <svg viewBox="0 0 24 12" class="trend-curve"><path d="${curve}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                <div class="run-tooltip">
                    <div class="tt-item">
                        <span class="tt-name">较上月</span>
                        <span class="tt-num ${colorCls}">${trendText}</span>
                    </div>
                </div>
              </div>`;
        }

        return `
            <div class="metric-item">
              <span class="metric-label">${label}</span>
              <span class="metric-val">${val}<small>${unit}</small></span>
              ${trendHtml}
            </div>`;
      };

      return `
        <div class="kb-card card-stat area-stat">
          ${this._generateSparklineSVG(data.sparkline)}
          <div class="stat-header">
            <span class="stat-title">${isMonthly ? "本月总里程" : "年度总里程"}</span>
            <button class="btn-toggle" data-action="toggle-stat">${isMonthly ? "查看年度" : "查看本月"}</button>
          </div>
          <div class="stat-main">
            <span class="val">${data.stats.totalDist.toFixed(1)}</span>
            <span class="unit">KM</span>
          </div>
          <div class="stat-metrics">
            ${renderMetric('骑行', data.stats.rideDist.toFixed(0), 'km', isMonthly ? data.trends.rideDist : null)}
            ${renderMetric('跑走', data.stats.runDist.toFixed(0), 'km', isMonthly ? data.trends.runDist : null)}
            ${renderMetric('出勤', data.stats.activeDays, '天', isMonthly ? data.trends.activeDays : null)}
            ${renderMetric('连签', data.stats.maxStreak, '天', isMonthly ? data.trends.maxStreak : null)}
          </div>
        </div>`;
    }

    _renderTooltipHTML(dayRuns, dateStr, isMaxY_Ride, isMaxY_Rw, isMaxM_Ride, isMaxM_Rw) {
      const runList = dayRuns.map(r => `
        <div class="tt-item">
          <span class="tt-name">${CONFIG.getSmartName(r.name, r.type)}</span>
          <span class="tt-num" style="color: ${CONFIG.getColor(r.type)}">
            ${r.distance > 0 ? `${r.distance.toFixed(1)} <small class="tt-unit">km</small>` : `${r.moving_time} <small class="tt-unit">用时</small>`}
          </span>
        </div>
      `).join('');

      let achieveHtml = '';
      if (isMaxY_Ride) achieveHtml += `<div class="tt-achieve-row"><span>年度最远</span><span class="title-tag">骑行</span></div>`;
      else if (isMaxM_Ride) achieveHtml += `<div class="tt-achieve-row"><span>月度最远</span><span class="title-tag">骑行</span></div>`;
      if (isMaxY_Rw) achieveHtml += `<div class="tt-achieve-row"><span>年度最远</span><span class="title-tag">跑走</span></div>`;
      else if (isMaxM_Rw) achieveHtml += `<div class="tt-achieve-row"><span>月度最远</span><span class="title-tag">跑走</span></div>`;

      return `
        <div class="run-tooltip">
          <div class="tt-list">${runList}</div>
          ${achieveHtml ? `<div class="tt-achieve">${achieveHtml}</div>` : ''}
        </div>`;
    }

    _renderCalendarCard(engineData) {
      const { displayYear, calMonthIndex, global, monthly } = engineData;
      const rawFirstDay = new Date(displayYear, calMonthIndex, 1).getDay();
      const emptyPrefix = rawFirstDay === 0 ? 6 : rawFirstDay - 1; 
      const daysInMonth = new Date(displayYear, calMonthIndex + 1, 0).getDate();
      
      const totalCellsNeeded = emptyPrefix + daysInMonth;
      const totalWeeks = Math.ceil(totalCellsNeeded / 7);
      const paddingEnd = (totalWeeks * 7) - totalCellsNeeded;

      const gridArray = [
        ...Array(emptyPrefix).fill(null),
        ...Array.from({length: daysInMonth}, (_, i) => i + 1),
        ...Array(paddingEnd).fill(null)
      ];

      const gridHtml = gridArray.map(day => {
        if (!day) return `<div class="day-empty"></div>`;
        const dateStr = `${displayYear}-${String(calMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayRuns = (monthly.runsByDate.get(dateStr) || []).sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
        if (dayRuns.length === 0) return `<div class="day-cell"><span class="day-num" style="opacity:0.6;">${day}</span></div>`;

        const primaryType = dayRuns[0].type;
        const isMaxY_Ride = dateStr === global.maxDates.ride;
        const isMaxY_Rw = dateStr === global.maxDates.rw;
        const isMaxM_Ride = !isMaxY_Ride && dateStr === monthly.maxDates.ride;
        const isMaxM_Rw = !isMaxY_Rw && dateStr === monthly.maxDates.rw;

        const isGold = isMaxY_Ride || isMaxY_Rw;
        const hasAchieve = isGold || isMaxM_Ride || isMaxM_Rw;
        
        let iconDom = '';
        if (hasAchieve) {
            const iconType = (isMaxY_Ride || isMaxM_Ride) ? 'Ride' : 'Run';
            iconDom = `<div class="icon-ring ${isGold ? 'ring-gold' : 'ring-silver'}" style="color: ${CONFIG.getColor(iconType)}">${CONFIG.getIcon(iconType)}</div>`;
        } else if (dayRuns.length > 1) {
            iconDom = `<span class="multi-dot"></span>`;
        }
        
        return `
          <div class="day-cell is-active ${hasAchieve ? 'is-max' : ''}">
            ${!hasAchieve ? `<span class="day-num" style="color:${CONFIG.getColor(primaryType)}">${day}</span>` : ''}
            ${iconDom}
            ${this._renderTooltipHTML(dayRuns, dateStr, isMaxY_Ride, isMaxY_Rw, isMaxM_Ride, isMaxM_Rw)}
          </div>`;
      }).join('');

      return `
        <div class="kb-card card-calendar area-calendar">
          <div class="calendar-header">
            <div class="cal-title">
              <span class="cal-month">${String(calMonthIndex + 1).padStart(2, '0')}</span>
              <span class="cal-year">${displayYear}</span>
            </div>
            <div class="cal-nav-group">
              <button class="nav-btn" data-action="prev-month" ${calMonthIndex === 0 ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div class="nav-divider"></div>
              <button class="nav-btn" data-action="next-month" ${calMonthIndex === 11 ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>
          <div class="calendar-weekdays"><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div><div>日</div></div>
          <div class="calendar-days" style="grid-template-rows: repeat(${totalWeeks}, 1fr);">${gridHtml}</div>
        </div>`;
    }

    _renderInsightsCard(insights, hasData) {
      const timeHtml = insights.timeBlocks.map((count, i) => {
        const bgStyle = count > 0 ? `style="background-color: rgba(50, 215, 75, ${0.3 + 0.7 * (count / insights.maxTimeBlock)})"` : '';
        return `
          <div class="bar-wrap">
            <div class="bar-fill" ${bgStyle}></div>
            <div class="run-tooltip">
              <div class="tt-item"><span class="tt-name">${CONFIG.PERSONAS[i].time}</span><span class="tt-num">${count} <small class="tt-unit">趟</small></span></div>
            </div>
          </div>`;
      }).join('');

      const hrHtml = insights.hrCounts.map((count, i) => {
        const info = CONFIG.HR_ZONES[i];
        const percent = insights.validHrRuns > 0 ? Math.max(12, (count / insights.validHrRuns) * 100) : 12;
        const bgStyle = count > 0 ? `background-color: ${info.color}` : '';
        return `
          <div class="zone-col">
            <div class="zone-bar" style="height: ${percent}%; ${bgStyle}"></div>
            <div class="run-tooltip">
              <div class="tt-item"><span class="tt-name" style="color: ${info.color};">${info.range} <small class="tt-unit">BPM</small></span><span class="tt-num">${count} <small class="tt-unit">趟</small></span></div>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="kb-card card-insight area-time">
          <div class="insight-header">${insights.peakPersona}</div>
          <div class="chart-punch">${timeHtml}</div>
          <div class="insight-labels labels-time"><span>00:00</span><span>12:00</span><span>24:00</span></div>
        </div>
        <div class="kb-card card-insight area-hr">
          <div class="insight-header">${hasData ? insights.topZone.title : '等待记录'}</div>
          <div class="chart-zone">${hrHtml}</div>
          <div class="insight-labels labels-zone">${CONFIG.HR_ZONES.map(z => `<span>${z.name}</span>`).join('')}</div>
        </div>`;
    }

    render(engineData, statMode) {
      if (!this.container) return;
      const currentData = statMode === 'monthly' ? engineData.monthly : engineData.global;
      this.container.innerHTML = `
        <div class="run-grid">
          ${this._renderCalendarCard(engineData)}
          ${this._renderStatCard(engineData, statMode)}
          ${this._renderInsightsCard(currentData.insights, currentData.stats.totalDist > 0)}
        </div>
      `;
    }
  }

  /* ========================================================================
     模块 4：应用入口控制器 (事件委托实现)
  ======================================================================== */
  class AppController {
    constructor(data) {
      this.engine = new DataEngine(data);
      this.renderer = new UIRenderer('kb-bento-container');
      this.statMode = 'monthly';
      this.initEvents();
      this.updateView();
    }

    initEvents() {
      // 顶级事件委托：不再需要内联 onclick，避免全局污染
      this.renderer.container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;
        
        const action = btn.dataset.action;
        if (action === 'prev-month') {
          this.engine.setMonthOffset(-1);
          this.statMode = 'monthly';
          this.updateView();
        } else if (action === 'next-month') {
          this.engine.setMonthOffset(1);
          this.statMode = 'monthly';
          this.updateView();
        } else if (action === 'toggle-stat') {
          this.statMode = this.statMode === 'monthly' ? 'annual' : 'monthly';
          this.updateView();
        }
      });
    }

    updateView() {
      this.renderer.render(this.engine.compute(), this.statMode);
    }
  }

  // 入口启动器
  document.addEventListener('DOMContentLoaded', () => {
    // 读取从 Hugo 传过来的全局数据，然后初始化应用
    if (window.KoobaiRunData) {
      new AppController(window.KoobaiRunData);
    }
  });

})();