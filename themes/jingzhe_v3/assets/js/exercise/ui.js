(function() {
  'use strict';

  const modules = window.JingzheExerciseModules = window.JingzheExerciseModules || {};

  modules.createUI = (runtime, model) => {
    const colorFromType = model.colorFromType;
      const escapeHtml = model.escapeHtml;

    class UIEngine {
      constructor(allRuns) {
        this.allRuns = allRuns || [];

        // 🚀 优化：直接读取 Hugo 在 HTML 底部注入的全局年份数组，不再前端重新消耗性能计算
        this.availableYears = Array.isArray(runtime.availableYears)
          ? runtime.availableYears.map(String)
          : [];

        // 初始化状态：默认选中最新年份
        this.currentYear = this.availableYears.length > 0 ? this.availableYears[0] : new Date().getFullYear().toString();

        this.showAiInsight = false;

        // 缓存底部 DOM 卡片
        this.cachedRunCards = document.querySelectorAll('.runCard');
        this.setSmartMonth();
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
        const normalizeId = model.normalizeId;

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
        return model.computeEngineData(this.allRuns, this.currentYear, this.calMonthIndex);
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
                  <span class="ttName">${r.display_name}</span>
                  <span class="ttNum" style="color: ${colorFromType(r.type)}">${numDisplay}</span>
                </div>
              `;
            }).join('');

            const achievements = Array.isArray(primaryRun.calendar_achievements)
              ? primaryRun.calendar_achievements
              : [];
            const isGold = achievements.some(achievement => achievement.level === 'year');
            hasAchieve = achievements.length > 0;

            if (hasAchieve) {
              const dotClass = isGold ? 'is-gold-dot' : 'is-silver-dot';
              iconDom = `<span class="multiDot ${dotClass}"></span>`;
            }

            // 组装成就标签
            const aHtml = achievements.map(achievement => `
              <div class="ttAchieveRow">
                <span>${escapeHtml(achievement.label)}</span>
                <span class="titleTag">${escapeHtml(achievement.group_label)}</span>
              </div>
            `).join('');

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
                <span class="dateNum" style="${dateStyle}">${day}</span>
                ${iconDom}
                ${tooltipHtml}
              </div>`;
        }).join('');
        const currentMonthStr = `${engine.displayYear}-${String(this.calMonthIndex + 1).padStart(2, '0')}`;
        const insightData = runtime.monthlyInsights ? runtime.monthlyInsights[currentMonthStr] : null;
        const statusText = insightData ? (insightData.status_text || '') : '';
        const coachReport = insightData && insightData.coach_report ? insightData.coach_report : null;
        const reportAsOf = insightData && insightData.report_as_of ? insightData.report_as_of : '';
        const reportCutoffDay = Number.parseInt(reportAsOf.slice(-2), 10);
        const midmonthCutoffHtml = insightData
          && insightData.report_phase === 'midmonth'
          && Number.isInteger(reportCutoffDay)
          ? `<div class="monthly-data-cutoff">数据截止到${reportCutoffDay}日</div>`
          : '';
        let monthlyCoachHtml = '';

        if (coachReport) {
          const reportParts = [
            coachReport.verdict,
            coachReport.analysis,
            coachReport.next_plan
          ].filter(Boolean);
          monthlyCoachHtml = `
            <div class="monthly-coach-report">
              ${reportParts.map(part => `<p>${escapeHtml(part)}</p>`).join('')}
            </div>`;
        } else if (statusText) {
          monthlyCoachHtml = `
            <div class="monthly-summary-text">${escapeHtml(statusText)}</div>`;
        }

        const energySummary = engine.monthlyData.energySummary;
        let monthlyEnergyHtml = '';

        if (energySummary) {
          const calorieText = energySummary.totalCalories.toLocaleString('zh-CN');
          const foodText = `${energySummary.foodCount} ${energySummary.food.unit}${energySummary.food.name}`;
          const equivalentText = `差不多燃掉了 ${foodText}`;
          const strongestText = energySummary.strongestDay && energySummary.strongestTitle
            ? `火力最猛的是 ${energySummary.strongestDay} 日那次：${escapeHtml(energySummary.strongestTitle)}。`
            : '';

          monthlyEnergyHtml = `
            <div class="monthly-summary-text monthly-energy-summary">
              本月共消耗 ${calorieText} 千卡，${equivalentText}。${strongestText}
            </div>
            ${midmonthCutoffHtml}`;
        }

        // 有 AI 点评或真实消耗总结时，都可以进入月度点评视图。
        const aiBtnHtml = (monthlyCoachHtml || monthlyEnergyHtml) ? `
          <button class="ai-toggle-btn ${this.showAiInsight ? 'active' : ''}" onclick="window.KoobaiRun.ui.toggleAiInsight()">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5 .5L9 4L6.5 9.5L1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/></svg>
          </button>
        ` : '';

        const gridViewDisplay = this.showAiInsight ? 'none' : 'flex';
        const aiViewDisplay = this.showAiInsight ? 'flex' : 'none';

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
                  ${monthlyCoachHtml}
                  ${monthlyEnergyHtml}
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

    const ui = new UIEngine(runtime.data || []);
    ui.renderAll();
    return ui;
  };
})();
