(function() {
  'use strict';

  const modules = window.JingzheExerciseModules = window.JingzheExerciseModules || {};

  modules.createModel = (contract) => {
    const exerciseContract = contract || { sports: {}, groups: {}, foods: [] };
    const sportColors = Object.fromEntries(
      Object.entries(exerciseContract.sports || {}).map(([type, values]) => [type, values.color])
    );
    const rideTypes = new Set(exerciseContract.groups?.ride || []);
    const walkTypes = new Set(exerciseContract.groups?.walk || []);
    const runTypes = new Set(exerciseContract.groups?.run || []);
    const runWalkTypes = new Set([...runTypes, ...walkTypes]);
    const monthlyFoods = (exerciseContract.foods || [])
      .filter(food => food.monthly)
      .map(({ monthly, ...food }) => food);

    const colorFromType = (type) => sportColors[type] || exerciseContract.fallbackColor;

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);

    const normalizeId = (value) => {
      if (!value || value === 'undefined' || value === 'null') return null;
      return String(Number(String(value).replace(/,/g, '')));
    };

    const stableChoiceIndex = (seed, length) => {
      let hash = 2166136261;
      for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return length > 0 ? (hash >>> 0) % length : 0;
    };

    const buildMonthlyEnergySummary = (monthKey, runs) => {
      const validRuns = (runs || []).filter(run => Number(run.calories) > 0);
      if (validRuns.length === 0) return null;

      const totalCalories = validRuns.reduce((total, run) => total + Number(run.calories), 0);
      let strongestRun = validRuns[0];
      validRuns.forEach(run => {
        if (Number(run.calories) > Number(strongestRun.calories)) strongestRun = run;
      });

      const candidates = monthlyFoods.map(food => ({
        food,
        count: Math.max(1, Math.round(totalCalories / food.kcal))
      }));
      const naturalCandidates = candidates.filter(candidate => candidate.count >= 8 && candidate.count <= 30);
      const readableCandidates = naturalCandidates.length > 0
        ? naturalCandidates
        : [...candidates].sort((left, right) => (
          Math.abs(left.count - 19) - Math.abs(right.count - 19)
        )).slice(0, 4);
      readableCandidates.sort((left, right) => left.food.key.localeCompare(right.food.key));
      const selected = readableCandidates[
        stableChoiceIndex(`${monthKey}:monthly-food:v1`, readableCandidates.length)
      ];

      return {
        totalCalories: Math.round(totalCalories),
        food: selected.food,
        foodCount: selected.count,
        strongestDay: Number(strongestRun.start_date_local?.slice(8, 10)) || null,
        strongestTitle: strongestRun.energy_title
          || strongestRun.display_name
          || strongestRun.sport_display_name
          || ''
      };
    };

    const computeEngineData = (allRuns, currentYear, calMonthIndex) => {
      const displayYear = Number(currentYear);
      const filteredRuns = (allRuns || []).filter(
        run => run.start_date_local?.startsWith(currentYear)
      );
      const monthMap = new Map();
      const datesSet = new Set();
      let totalDist = 0;
      let rideDist = 0;
      let runDist = 0;

      const firstDayUTC = Date.UTC(displayYear, 0, 1);
      const lastDayUTC = Date.UTC(displayYear, 11, 31);
      const totalWeeks = Math.ceil((lastDayUTC - firstDayUTC) / 86400000 / 7) + 1;
      const weekData = new Array(totalWeeks).fill(0);

      filteredRuns.forEach(run => {
        const dateStr = run.start_date_local.slice(0, 10);
        const month = Number(dateStr.slice(5, 7)) - 1;
        const utcDayTimestamp = new Date(`${dateStr}T00:00:00Z`).getTime();
        run.hour = new Date(run.start_date_local).getHours();
        run.dateStr = dateStr;
        const distance = run.distance || 0;

        if (!monthMap.has(month)) monthMap.set(month, { runs: [], runsByDate: new Map() });
        const monthData = monthMap.get(month);
        monthData.runs.push(run);
        if (!monthData.runsByDate.has(dateStr)) monthData.runsByDate.set(dateStr, []);
        monthData.runsByDate.get(dateStr).push(run);

        totalDist += distance;
        datesSet.add(utcDayTimestamp);
        const currentWeek = Math.max(
          0,
          Math.min(totalWeeks - 1, Math.floor((utcDayTimestamp - firstDayUTC) / 86400000 / 7))
        );
        weekData[currentWeek] += distance;

        if (rideTypes.has(run.type)) rideDist += distance;
        else if (runWalkTypes.has(run.type)) runDist += distance;
      });

      const sparklineData = weekData.map((value, index, values) => {
        const previous = values[index - 1] ?? value;
        const next = values[index + 1] ?? value;
        return previous * 0.25 + value * 0.5 + next * 0.25;
      });

      const currentMonthData = monthMap.get(calMonthIndex) || { runs: [], runsByDate: new Map() };
      const currentMonthKey = `${displayYear}-${String(calMonthIndex + 1).padStart(2, '0')}`;
      let monthTotal = 0;
      let monthRide = 0;
      let monthRun = 0;
      let maxTimeBlockCount = 0;
      let validHrRuns = 0;
      const timeBlocks = new Array(8).fill(0);
      const hrCounts = new Array(5).fill(0);

      currentMonthData.runs.forEach(run => {
        const distance = run.distance || 0;
        monthTotal += distance;
        if (rideTypes.has(run.type)) monthRide += distance;
        else if (runWalkTypes.has(run.type)) monthRun += distance;

        const blockIndex = Math.floor(run.hour / 3);
        if (++timeBlocks[blockIndex] > maxTimeBlockCount) maxTimeBlockCount = timeBlocks[blockIndex];
        if (run.average_heartrate && run.average_heartrate > 0) {
          validHrRuns += 1;
          const heartRate = run.average_heartrate;
          const zoneIndex = heartRate < 115 ? 0 : heartRate < 130 ? 1 : heartRate < 145 ? 2 : heartRate < 160 ? 3 : 4;
          hrCounts[zoneIndex] += 1;
        }
      });

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
        availableMonthsArr: Array.from(new Set(
          filteredRuns.map(run => run.start_date_local.slice(5, 7))
        )).sort().reverse(),
        globalData: {
          stats: { totalDist, rideDist, runDist, activeDays: datesSet.size },
          sparklineData,
          sparklineMax: Math.max(...sparklineData, 1)
        },
        monthlyData: {
          runsByDate: currentMonthData.runsByDate,
          monthDetailStats: { totalDist: monthTotal, rideDist: monthRide, runDist: monthRun },
          energySummary: buildMonthlyEnergySummary(currentMonthKey, currentMonthData.runs),
          insights: {
            hasActivities: currentMonthData.runs.length > 0,
            timeBlocks,
            maxTimeBlockCount: Math.max(maxTimeBlockCount, 1),
            peakPersona: maxTimeBlockCount > 0
              ? personas[timeBlocks.indexOf(maxTimeBlockCount)].name
              : '等待记录',
            personas,
            validHrRuns,
            hrCounts,
            hrZonesInfo,
            hrMaxZone: hrZonesInfo[hrCounts.indexOf(Math.max(...hrCounts))] || hrZonesInfo[0]
          }
        }
      };
    };

    return {
      sportColors,
      rideTypes,
      runWalkTypes,
      colorFromType,
      escapeHtml,
      normalizeId,
      buildMonthlyEnergySummary,
      computeEngineData
    };
  };
})();
