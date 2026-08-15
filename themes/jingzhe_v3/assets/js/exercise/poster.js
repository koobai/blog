(function() {
  'use strict';

  const modules = window.JingzheExerciseModules = window.JingzheExerciseModules || {};

  const cleanPosterPrefix = (value) => (
    String(value || 'JingzheExercise').replace(/[^a-zA-Z0-9_-]/g, '') || 'JingzheExercise'
  );

  const reset = (wrapper) => {
    if (wrapper) wrapper.classList.remove('show-poster-mode');
    const mask = document.getElementById('real-poster-mask');
    if (mask) mask.remove();
  };

  const buildPanelHtml = (run, model) => {
    const distanceNum = run.distance > 0 ? run.distance.toFixed(2) : '--';
    const distanceUnit = run.distance > 0 ? 'km' : '';
    const runTime = run.moving_time || '--';
    const heartRate = run.average_heartrate || '--';
    const calories = Number(run.calories) > 0 ? Math.round(Number(run.calories)) : '--';
    const paceNum = run.distance > 0 ? (run.pace_num || '--') : '--';
    const paceUnit = run.distance > 0 ? (run.pace_unit || '') : '';
    const color = model.colorFromType(run.type);
    const isRide = ['Ride', 'VirtualRide', 'EBikeRide'].includes(run.type);
    const displayTime = run.start_date_local.substring(5, 16).replace('T', ' ');
    const smartName = run.display_name;
    const sportTypeName = run.sport_display_name || '运动';
    const achievement = run.card_achievement?.label
      ? `<span class="map-achievement-tag">${model.escapeHtml(run.card_achievement.label)}</span>`
      : '';

    return {
      displayTime,
      html: `
        <div class="normal-view">
          <div class="detailName">
            <div class="nameLeft">
              <span class="detailDate">${displayTime}</span>${achievement}${sportTypeName}
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
          <div class="poster-dist-hero"><span class="heroNum">${distanceNum}</span><span class="heroUnit">${distanceUnit}</span></div>
          <div class="poster-stats-row">
            <div class="poster-stat-block"><span class="statLabel">用时</span><span class="statVal">${runTime}</span></div>
            <div class="poster-stat-block"><span class="statLabel">${isRide ? '均速' : '配速'}</span><span class="statVal">${paceNum}<small>${paceUnit}</small></span></div>
            <div class="poster-stat-block"><span class="statLabel">心率</span><span class="statVal">${heartRate}</span></div>
          </div>
          <div class="poster-watermark">${displayTime}</div>
          <div class="poster-title">${smartName}</div>
        </div>
      `
    };
  };

  const render = ({
    bounds,
    config,
    hasDisplayTrack,
    map,
    model,
    onClose,
    run,
    statsPanel,
    wrapper
  }) => {
    const panel = buildPanelHtml(run, model);
    statsPanel.innerHTML = panel.html;
    statsPanel.style.display = 'flex';
    const normalView = statsPanel.querySelector('.normal-view');
    const posterView = statsPanel.querySelector('.data-poster-view');

    const enterPosterMode = () => {
      wrapper.classList.add('show-poster-mode');
      normalView.style.display = 'none';
      posterView.style.display = 'block';
      if (!document.getElementById('real-poster-mask')) {
        const mask = document.createElement('div');
        mask.id = 'real-poster-mask';
        mask.className = 'poster-gradient-mask';
        wrapper.appendChild(mask);
      }
      if (hasDisplayTrack && bounds) {
        const compact = wrapper.clientHeight <= 400;
        map.fitBounds(bounds, {
          padding: {
            top: compact ? 30 : 60,
            bottom: compact ? 30 : 260,
            left: compact ? wrapper.clientWidth * 0.5 : 60,
            right: compact ? 20 : 60
          },
          pitch: 0,
          bearing: 0,
          duration: 1000,
          linear: true
        });
      }
    };

    const trigger = statsPanel.querySelector('#trigger-poster-btn');
    if (trigger) trigger.addEventListener('click', event => {
      event.stopPropagation();
      enterPosterMode();
    });

    statsPanel.querySelectorAll('.poster-close-btn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        reset(wrapper);
        onClose();
      });
    });

    statsPanel.querySelectorAll('.poster-download-btn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const currentButton = event.currentTarget;
        if (currentButton.dataset.isGenerating === 'true') return;
        currentButton.dataset.isGenerating = 'true';
        currentButton.style.opacity = '0.5';
        currentButton.style.cursor = 'wait';

        const renderer = window.htmlToImage;
        const restoreButton = () => {
          currentButton.dataset.isGenerating = 'false';
          currentButton.style.opacity = '1';
          currentButton.style.cursor = 'pointer';
        };
        if (!renderer?.toCanvas) {
          restoreButton();
          return;
        }
        renderer.toCanvas(wrapper, {
          pixelRatio: 4,
          backgroundColor: null,
          filter: node => !node.classList?.contains('poster-actions')
        }).then(canvas => {
          const link = document.createElement('a');
          link.download = `${cleanPosterPrefix(config.POSTER_FILE_PREFIX)}_${panel.displayTime.replace(/[\/\s:]/g, '')}.webp`;
          link.href = canvas.toDataURL('image/webp', 0.92);
          link.click();
          restoreButton();
        }).catch(error => {
          console.error('海报生成失败:', error);
          restoreButton();
        });
      });
    });
  };

  modules.poster = { buildPanelHtml, cleanPosterPrefix, render, reset };
})();
