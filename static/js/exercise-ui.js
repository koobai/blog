(function() {
  'use strict';

  // 初始化全局命名空间
  if (!window.KoobaiRun) {
    window.KoobaiRun = {};
  }

  /* ========================================================================
     板块 1：全局配置与枚举字典
     功能：统一定义运动类型的分类、主题色以及对应的 SVG 图标
  ======================================================================== */
  
  // 1. 运动类型颜色映射表
  window.KoobaiRun.SPORT_COLORS = {
    'Run': '#F58200', 'TrailRun': '#F58200', 'Treadmill': '#F58200', 'VirtualRun': '#F58200',
    'Ride': '#32D74B', 'EBikeRide': '#32D74B', 'VirtualRide': '#32D74B', 
    'Walk': '#DF40C4', 'Hike': '#DF40C4',
    'Swim': '#0BAEE6', 'WaterSport': '#0BAEE6'
  };

  // 2. 运动类型大类集合 (用于极值计算和图标匹配)
  const RIDE_TYPES = new Set(['Ride', 'VirtualRide', 'EBikeRide']);
  const WALK_TYPES = new Set(['Walk', 'Hike']);
  const RUN_TYPES = new Set(['Run', 'TrailRun', 'Treadmill', 'VirtualRun', 'Trail Run']);
  const RUN_WALK_TYPES = new Set([...RUN_TYPES, ...WALK_TYPES]);

  // 获取颜色辅助函数 (带默认回退色)
  const colorFromType = (type) => window.KoobaiRun.SPORT_COLORS[type] || '#14C759';

  // 获取对应图标辅助函数
  const getActivityIcon = (type) => {
    if (RIDE_TYPES.has(type)) {
      return `
        <svg viewBox="0 -1 26 26" fill="currentColor">
          <path d="M5.5 21a4.5 4.5 0 1 1 0-9a4.5 4.5 0 0 1 0 9m0-2a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m13 2a4.5 4.5 0 1 1 0-9a4.5 4.5 0 0 1 0 9m0-2a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5m-7.477-8.695L13 12v6h-2v-5l-2.719-2.266A2 2 0 0 1 8 7.671l2.828-2.828a2 2 0 0 1 2.829 0l1.414 1.414a6.97 6.97 0 0 0 3.917 1.975l-.01 2.015a8.96 8.96 0 0 1-5.321-2.575zM16 5a2 2 0 1 1 0-4a2 2 0 0 1 0 4"/>
        </svg>`;
    }
    if (WALK_TYPES.has(type)) {
      return `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.61713 8.71233L10.8222 6.38373C11.174 6.12735 11.6087 5.98543 12.065 6.0008C13.1764 6.02813 14.1524 6.75668 14.4919 7.82036C14.6782 8.40431 14.8481 8.79836 15.0017 9.0025C15.914 10.2155 17.3655 11 19.0002 11V13C16.8255 13 14.8825 12.0083 13.5986 10.4526L12.901 14.4085L14.9621 16.138L17.1853 22.246L15.3059 22.93L13.266 17.3256L9.87576 14.4808C9.32821 14.0382 9.03139 13.3192 9.16231 12.5767L9.67091 9.6923L8.99407 10.1841L6.86706 13.1116L5.24902 11.9361L7.60016 8.7L7.61713 8.71233ZM13.5002 5.5C12.3956 5.5 11.5002 4.60457 11.5002 3.5C11.5002 2.39543 12.3956 1.5 13.5002 1.5C14.6047 1.5 15.5002 2.39543 15.5002 3.5C15.5002 4.60457 14.6047 5.5 13.5002 5.5ZM10.5286 18.6813L7.31465 22.5116L5.78257 21.226L8.75774 17.6803L9.50426 15.5L11.2954 17L10.5286 18.6813Z"></path>
        </svg>`;
    }
    return `
      <svg viewBox="0 0 640 640" fill="currentColor">
        <path d="M352.5 32c30.9 0 56 25.1 56 56s-25.1 56-56 56s-56-25.1-56-56s25.1-56 56-56M219.6 240c-3.3 0-6.2 2-7.4 5l-22 54.9c-6.6 16.4-25.2 24.4-41.6 17.8s-24.4-25.2-17.8-41.6l21.9-54.9c11-27.3 37.4-45.2 66.9-45.2h97.3c28.5 0 54.8 15.1 69.1 39.7l32.8 56.3h61.6c17.7 0 32 14.3 32 32s-14.3 32-32 32h-61.6c-22.8 0-43.8-12.1-55.3-31.8l-10-17.1l-20.7 70.4l75.4 22.6c27.7 8.3 41.8 39 30.1 65.5L381.7 573c-7.2 16.2-26.1 23.4-42.2 16.2s-23.4-26.1-16.2-42.2l49.2-110.8l-95.9-28.8c-32.7-9.8-52-43.7-43.7-76.8l22.7-90.6h-35.9zm-8 181c13.3 14.9 30.7 26.3 51.2 32.4l4.7 1.4l-6.9 19.3c-5.8 16.3-16 30.8-29.3 41.8l-82.4 67.9c-13.6 11.2-33.8 9.3-45-4.3s-9.3-33.8 4.3-45l82.4-67.9c4.5-3.7 7.8-8.5 9.8-13.9z"/>
      </svg>`;
  };


  /* ========================================================================
     板块 2：数据格式化引擎
     功能：根据时间和运动类型，智能生成如“清晨跑步”、“傍晚骑行”的名称
  ======================================================================== */
  const getSmartName = (name, type, startTime) => {
    if (!startTime) return name;
    const hour = new Date(startTime).getHours();
    
    // 判定时间段
    let timePrefix = '晚上';
    if (hour >= 23 || hour < 2) timePrefix = '深夜'; 
    else if (hour >= 2 && hour < 5) timePrefix = '凌晨'; 
    else if (hour >= 5 && hour < 7) timePrefix = '清晨'; 
    else if (hour >= 7 && hour < 11) timePrefix = '上午'; 
    else if (hour >= 11 && hour < 13) timePrefix = '中午'; 
    else if (hour >= 13 && hour < 18) timePrefix = '下午'; 
    else if (hour >= 18 && hour < 20) timePrefix = '傍晚'; 

    // 判定运动类型
    let typeStr = '运动';
    if (RUN_TYPES.has(type)) typeStr = '跑步';
    else if (RIDE_TYPES.has(type)) typeStr = '骑行';
    else if (['Swim', 'WaterSport'].includes(type)) typeStr = '游泳';
    else if (WALK_TYPES.has(type)) typeStr = '步行';

    // 仅针对原生默认名称进行替换，如果用户自定义了名字则不覆盖
    const isDefaultPattern = /^(晨间|上午|午间|午后|下午|傍晚|晚间|夜间|凌晨|清晨|Morning|Afternoon|Evening|Night|Lunch)/.test(name) && 
                             /(跑步|骑行|行走|徒步|游泳|运动|Run|Ride|Walk|Swim|Hike|Treadmill|VirtualRun)$/.test(name) && 
                             name.length <= 15;
                             
    if (isDefaultPattern || ['Run', 'Ride', 'Walk'].includes(name)) {
      return `${timePrefix}${typeStr}`;
    }
    return name;
  };
  window.KoobaiRun.getSmartName = getSmartName;


  /* ========================================================================
     板块 3：核心视图逻辑控制引擎 (UIEngine)
     功能：处理所有页面交互、数据计算(极值、热力分布)以及 DOM 渲染
  ======================================================================== */
  class UIEngine {
    constructor(allRuns) {
      this.allRuns = allRuns || [];
      
      // 初始化状态：默认选中最新年份、全部月份
      const firstYearBtn = document.querySelector('#year-nav .button');
      this.currentYear = firstYearBtn ? firstYearBtn.getAttribute('data-year') : new Date().getFullYear().toString();
      this.listMonth = 'All';
      
      // 缓存底部 DOM 卡片，避免重复查询
      this.cachedRunCards = document.querySelectorAll('.runCard'); 
      this.setSmartMonth(); 
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

    // 触发底部卡片列表的显示/隐藏过滤
    triggerListFilter() {
      this.cachedRunCards.forEach(card => {
        const isYearMatch = card.classList.contains(`item-year-${this.currentYear}`);
        const isMonthMatch = this.listMonth === 'All' || card.classList.contains(`item-month-${this.listMonth}`);
        card.style.display = (isYearMatch && isMonthMatch) ? 'flex' : 'none';
      });
    }

    // 切换年份事件
    setYear(year) {
      this.currentYear = year;
      document.querySelectorAll('#year-nav .button').forEach(btn => {
        btn.classList.toggle('selected', btn.getAttribute('data-year') === year);
      });
      this.setSmartMonth(); 
      this.listMonth = 'All';
      this.renderAll();
    }

    // 切换日历板的月份事件 (-1 或 1)
    setCalMonth(dir) {
      this.calMonthIndex = Math.max(0, Math.min(11, this.calMonthIndex + dir));
      this.renderCalendar(this.computeEngineData());
    }

    // 切换列表数据的月份过滤事件
    setListMonth(monthStr) {
      this.listMonth = monthStr;
      this.renderMonthFilterUI();
      this.triggerListFilter(); 
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

      // 3. 计算最长连续运动天数
      let maxStreak = 0;
      if (datesSet.size > 0) {
        const timestamps = Array.from(datesSet).sort((a, b) => a - b);
        maxStreak = 1; let currStreak = 1;
        for (let i = 1; i < timestamps.length; i++) {
          const diffDays = (timestamps[i] - timestamps[i - 1]) / 86400000;
          if (diffDays === 1) maxStreak = Math.max(maxStreak, ++currStreak);
          else if (diffDays > 1) currStreak = 1;
        }
      }

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
          stats: { totalDist, rideDist, runDist, activeDays: datesSet.size, maxStreak }, 
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
      this.renderMonthFilterUI(engine.availableMonthsArr);
      this.triggerListFilter(); 
      this.renderCalendar(engine);
    }

    // 渲染月份过滤器 (Pills)
    renderMonthFilterUI(monthsArr) {
      const filterContainer = document.getElementById('month-filter-bar');
      if (!filterContainer) return;
      
      const arr = monthsArr || Array.from(new Set(this.allRuns.filter(r => r.start_date_local?.startsWith(this.currentYear)).map(r => r.start_date_local.slice(5, 7)))).sort().reverse();
      
      const pillsHtml = arr.map(m => `
        <div class="filterPill ${this.listMonth === m ? 'activePill' : ''}" onclick="window.KoobaiRun.ui.setListMonth('${m}')">
          ${m}
        </div>
      `).join('');
      
      filterContainer.innerHTML = `
        <div class="filterPill ${this.listMonth === 'All' ? 'activePill' : ''}" onclick="window.KoobaiRun.ui.setListMonth('All')">全部</div>
        ${pillsHtml}
        <div class="monthLabel">月</div>
      `;
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
          const runListHtml = dayRuns.map(r => `
            <div class="ttItem">
              <span class="ttName">${getSmartName(r.name, r.type, r.start_date_local)}</span>
              <span class="ttNum" style="color: ${colorFromType(r.type)}">
                ${r.distance.toFixed(1)} <small style="color: #8E8E93; font-size: 0.7rem;">km</small>
              </span>
            </div>
          `).join('');
          
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
            const iconColor = colorFromType(isRideY || isRideM ? 'Ride' : 'Run');
            iconDom = `
              <div class="calIconRing ${ringClass}" style="color: ${iconColor}">
                ${getActivityIcon(isRideY || isRideM ? 'Ride' : 'Run')}
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
        const dateStyle = hasRun ? `color: ${runColor}; opacity: 1;` : 'color: inherit; opacity: 0.6;';
        
        return `
          <div class="dayCell ${hasRun ? 'hasRun' : ''} ${hasAchieve ? 'maxDay' : ''}" 
               data-run-id="${hasRun ? primaryRun.run_id : ''}" 
               ${hasRun ? `onclick="window.KoobaiRun.map.flyTo('${primaryRun.run_id}')" style="cursor: pointer;"` : ''}>
            ${!hasAchieve ? `<span class="dateNum" style="${dateStyle}">${day}</span>` : ''}
            ${iconDom}
            ${tooltipHtml}
          </div>`;
      }).join('');

      // 3. 生成洞察图表：时间段分布打孔图
      const insights = engine.monthlyData.insights;
      const timeBlocksHtml = insights.timeBlocks.map((count, i) => {
        const heightRatio = insights.maxTimeBlockCount > 0 ? (count / insights.maxTimeBlockCount) : 0;
        const bgColor = count > 0 ? `rgba(50, 215, 75, ${0.3 + 0.7 * heightRatio})` : 'color-mix(in srgb, var(--text-info-color), transparent 80%)';
        
        return `
          <div class="barWrapper">
            <div class="punchHole" style="background-color: ${bgColor}"></div>
            <div class="runTooltip">
              <div class="ttItem">
                <span class="ttName" style="color: var(--text-info-color);">${insights.personas[i].time}</span>
                <span class="ttNum">${count} <small>趟</small></span>
              </div>
            </div>
          </div>`;
      }).join('');

      // 4. 生成洞察图表：心率区间柱状图
      const hrZonesHtml = insights.hrCounts.map((count, i) => {
        const info = insights.hrZonesInfo[i];
        const percent = insights.validHrRuns > 0 ? Math.max(12, (count / insights.validHrRuns) * 100) : 12;
        const bgColor = count > 0 ? info.color : 'color-mix(in srgb, var(--text-info-color), transparent 80%)';
        
        return `
          <div class="zoneCol">
            <div class="zoneBar" style="height: ${percent}%; background-color: ${bgColor}"></div>
            <div class="runTooltip">
              <div class="ttItem">
                <span class="ttName" style="color: ${info.color};">
                  ${info.range} <small style="color: inherit">BPM</small>
                </span>
                <span class="ttNum">${count} <small>趟</small></span>
              </div>
            </div>
          </div>`;
      }).join('');

      // 5. 注入最终拼装的 DOM 结构
      container.innerHTML = `
        <div class="boardContainer">
          
          <div class="globalSection">
            ${sparklineSvg}
            <div class="globalTitle">年度总里程</div>
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
              <div class="metricBlock">
                <span class="metricLabel">连签</span>
                <span class="metricValue">${engine.globalData.stats.maxStreak}<small>天</small></span>
              </div>
            </div>
          </div>
          
          <div class="calendarSection">
            <div class="monthHeader">
              <div class="monthNav">
                <button onclick="window.KoobaiRun.ui.setCalMonth(-1)" ${this.calMonthIndex === 0 ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span>${engine.displayYear}-${String(this.calMonthIndex + 1).padStart(2, '0')}</span>
                <button onclick="window.KoobaiRun.ui.setCalMonth(1)" ${this.calMonthIndex === 11 ? 'disabled' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            </div>
            <div class="weekdays"><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div><div>日</div></div>
            <div class="grid">${gridHtml}</div>
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