(function() {
  'use strict';

  // 极致精简：仅保留必要的常量
  const RIDE_TYPES = new Set(['Ride', 'VirtualRide', 'EBikeRide']);
  const MS_PER_DAY = 86400000;

  /* ========================================================================
     模块 1：数据清洗与统计引擎 (Data Engine)
  ======================================================================== */
  class DataEngine {
    constructor(allRuns = []) {
      this.allRuns = allRuns;
      const today = new Date();
      this.displayYear = today.getFullYear();
      this.calMonthIndex = today.getMonth(); 
    }

    setMonthOffset(dir) {
      this.calMonthIndex = Math.max(0, Math.min(11, this.calMonthIndex + dir));
    }

    _calculateStreak(timestampArray) {
      if (timestampArray.length === 0) return 0;
      let maxStr = 1, currStr = 1;
      for (let i = 1; i < timestampArray.length; i++) {
        const diffDays = (timestampArray[i] - timestampArray[i - 1]) / MS_PER_DAY;
        // 【优化 2】：使用 Math.round 抹平跨越夏令时 (DST) 或浮点运算带来的微小误差
        if (Math.round(diffDays) === 1) {
            maxStr = Math.max(maxStr, ++currStr);
        } else if (diffDays > 1) {
            currStr = 1;
        }
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
        if (RIDE_TYPES.has(r.type)) rideDist += dist;
        else runDist += dist;
        
        // 【优化 1】：更稳妥的本地零点时间戳获取方式
        const localDateStr = r.start_date_local.slice(0, 10);
        const d = new Date(localDateStr); // YYYY-MM-DD 格式默认解析为 UTC 零点，保证间隔绝对是 24h
        activeDaysSet.add(d.getTime());
      });

      return { 
        totalDist, 
        rideDist, 
        runDist,
        activeDays: activeDaysSet.size,
        // 数值必须传入 a - b，否则默认按照字符串排序会导致连签计算出错
        maxStreak: this._calculateStreak(Array.from(activeDaysSet).sort((a, b) => a - b))
      };
    }

    compute() {
      const currYearStr = this.displayYear.toString();
      
      // 数据切片
      const currYearRuns = this.allRuns.filter(r => r.start_date_local.startsWith(currYearStr));
      const currMonthRuns = currYearRuns.filter(r => (Number(r.start_date_local.slice(5, 7)) - 1) === this.calMonthIndex);

      // 构建图表折线数据 (年)
      const weekData = new Array(54).fill(0);
      const yearFirstDayUTC = Date.UTC(this.displayYear, 0, 1);
      
      currYearRuns.forEach(r => {
         const dateStr = r.start_date_local.slice(0, 10);
         const dist = r.distance || 0;
         const utcDayTs = new Date(dateStr).getTime();
         // 【优化 4】：增加边界防护 Math.min(53)，防止极端跨年数据导致数组越界
         const dayIndex = Math.floor((utcDayTs - yearFirstDayUTC) / MS_PER_DAY);
         const week = Math.min(53, Math.max(0, Math.floor(dayIndex / 7)));
         weekData[week] += dist;
      });

      // 构建图表折线数据 (月)
      const daysInMonth = new Date(this.displayYear, this.calMonthIndex + 1, 0).getDate();
      const monthDailyDist = new Array(daysInMonth).fill(0);
      currMonthRuns.forEach(r => {
         monthDailyDist[new Date(r.start_date_local.slice(0, 10)).getDate() - 1] += (r.distance || 0);
      });

      return {
          displayYear: this.displayYear,
          calMonthIndex: this.calMonthIndex,
          global: {
              stats: this._extractStats(currYearRuns),
              sparkline: this._smoothSparkline(weekData)
          },
          monthly: {
              stats: this._extractStats(currMonthRuns),
              sparkline: this._smoothSparkline(monthDailyDist)
          }
      };
    }
  }

  /* ========================================================================
     模块 2：UI 渲染引擎 (UI Renderer)
  ======================================================================== */
  class UIRenderer {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
      this.gradientIdCounter = 0;
    }

    _generateSparklineSVG(dataArray, isEmpty = false) {
      if (!dataArray || dataArray.length === 0) return '';
      const max = Math.max(...dataArray, 1);
      const width = 200, height = 40, pad = 6;
      
      const points = dataArray.map((val, i) => ({ 
        x: (i / Math.max(dataArray.length - 1, 1)) * width, 
        y: height - pad - (val / max) * (height - 2 * pad) 
      }));
      
      let pathStr = `M ${points[0].x},${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
          const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = Math.max(pad, Math.min(height - pad, p1.y + (p2.y - p0.y) / 6));
          const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = Math.max(pad, Math.min(height - pad, p2.y - (p3.y - p1.y) / 6));
          pathStr += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
      }

      this.gradientIdCounter++;
      const uniqueGradientId = `stat-spark-grad-${this.gradientIdCounter}`;
      const sparkColor = isEmpty ? '#8E8E93' : '#32D74B';

      return `
        <svg class="sparkline" viewBox="0 0 200 40" preserveAspectRatio="none">
          <defs>
            <linearGradient id="${uniqueGradientId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${sparkColor}" stop-opacity="0.25" />
              <stop offset="100%" stop-color="${sparkColor}" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d="${pathStr} L 200,40 L 0,40 Z" fill="url(#${uniqueGradientId})" class="sparkline-fill" />
          <path d="${pathStr}" fill="none" class="sparkline-line" stroke="${sparkColor}"/>
        </svg>`;
    }

    _renderStatCard(title, dataObj, navOptions = null, customClass = '') {
      const renderMetric = (label, val, unit) => `
        <div class="metric-item">
          <span class="metric-label">${label}</span>
          <span class="metric-val">${val}<small>${unit}</small></span>
        </div>`;

      let prevBtn = '';
      let nextBtn = '';
      if (navOptions) {
          prevBtn = `<button class="nav-btn btn-prev" data-action="prev-month" ${navOptions.isFirst ? 'disabled' : ''} aria-label="上个月"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg></button>`;
          nextBtn = `<button class="nav-btn btn-next" data-action="next-month" ${navOptions.isLast ? 'disabled' : ''} aria-label="下个月"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6" /></svg></button>`;
      }

      const isEmpty = dataObj.stats.totalDist === 0;

      return `
        <div class="kb-card card-stat ${isEmpty ? 'is-empty' : ''} ${customClass}">
          ${this._generateSparklineSVG(dataObj.sparkline, isEmpty)}
          <div class="stat-header">
            ${prevBtn}
            <span class="stat-title">${title}</span>
            ${nextBtn}
          </div>
          <div class="stat-main">
            <span class="val">${dataObj.stats.totalDist.toFixed(1)}</span>
          </div>
          <div class="stat-metrics">
            ${renderMetric('骑行', dataObj.stats.rideDist.toFixed(0), 'km')}
            ${renderMetric('跑走', dataObj.stats.runDist.toFixed(0), 'km')}
            ${renderMetric('出勤', dataObj.stats.activeDays, '天')}
            ${renderMetric('连签', dataObj.stats.maxStreak, '天')}
          </div>
        </div>`;
    }

    render(engineData) {
      if (!this.container) return;
      
      const isCurrentRealMonth = engineData.calMonthIndex === new Date().getMonth() && engineData.displayYear === new Date().getFullYear();
      const monthTitle = isCurrentRealMonth ? '本月锻炼总里程' : `${engineData.calMonthIndex + 1}月总里程`;
      
      const monthNavOptions = {
          isFirst: engineData.calMonthIndex === 0,
          isLast: engineData.calMonthIndex === 11
      };

      this.container.innerHTML = `
        <div class="run-grid">
          ${this._renderStatCard(monthTitle, engineData.monthly, monthNavOptions, 'card-monthly')}
          ${this._renderStatCard('本年度总里程', engineData.global, null, 'card-annual')}
        </div>
      `;
    }
  }

  /* ========================================================================
     模块 3：应用入口控制器
  ======================================================================== */
  class AppController {
    constructor(data) {
      this.engine = new DataEngine(data);
      this.renderer = new UIRenderer('kb-bento-container');
      this.initEvents();
      this.updateView();
    }

    initEvents() {
      this.renderer.container.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn || btn.disabled) return;
        
        const action = btn.dataset.action;
        if (action === 'prev-month') this.engine.setMonthOffset(-1);
        if (action === 'next-month') this.engine.setMonthOffset(1);
        
        this.updateView();
      });
    }

    updateView() {
      this.renderer.render(this.engine.compute());
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.KoobaiRunData) {
      new AppController(window.KoobaiRunData);
    }
  });

})();