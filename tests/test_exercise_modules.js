'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const exerciseAsset = name => path.join(
  ROOT,
  'themes/jingzhe_v3/assets/js/exercise',
  name
);

global.window = {};
global.document = {
  readyState: 'complete',
  documentElement: { getAttribute: () => 'light' },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  dispatchEvent() {}
};
global.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

require(exerciseAsset('model.js'));
require(exerciseAsset('routes.js'));
require(exerciseAsset('poster.js'));
require(exerciseAsset('ui.js'));
require(exerciseAsset('mapbox-adapter.js'));

const modules = window.JingzheExerciseModules;
const contract = require('../data/jingzhe/exercise.json');
const model = modules.createModel(contract);

assert.equal(modules.mapMotion.getScopeTransitionDuration(
  { year: '2026', mode: 'year' },
  { year: '2026', mode: 'month' }
), 500);
assert.equal(modules.mapMotion.getScopeTransitionDuration(
  { year: '2026', mode: 'month' },
  { year: '2026', mode: 'year' }
), 700);
assert.equal(modules.mapMotion.getScopeTransitionDuration(
  { year: '2026', mode: 'year' },
  { year: '2025', mode: 'year' }
), 800);
assert.equal(modules.mapMotion.getScopeTransitionDuration(
  { year: '2026', mode: 'year' },
  { year: '2025', mode: 'year' },
  true
), 0);
assert.equal(modules.mapMotion.durations.runFlight, 2000);
assert.equal(modules.mapMotion.durations.runOrbit, 36000);
assert.deepEqual(
  modules.mapMotion.getOrbitCameraState(20, 14, 0),
  { bearing: 20, pitch: 65, zoom: 14 }
);
const quarterOrbit = modules.mapMotion.getOrbitCameraState(20, 14, 0.25);
assert.equal(quarterOrbit.bearing, 110);
assert.equal(quarterOrbit.pitch, 67);
assert.equal(quarterOrbit.zoom, 14.2);
const oneSecondOrbit = modules.mapMotion.getOrbitCameraState(20, 14, 1000 / 36000);
assert.equal(oneSecondOrbit.bearing, 30);
const completedOrbit = modules.mapMotion.getOrbitCameraState(20, 14, 1);
assert.equal(completedOrbit.bearing, 380);
assert.ok(Math.abs(completedOrbit.pitch - 65) < 1e-10);
assert.ok(Math.abs(completedOrbit.zoom - 14) < 1e-10);

assert.equal(model.colorFromType('Run'), '#F58200');
assert.equal(model.normalizeId('1,234'), '1234');
assert.equal(model.normalizeId(null), null);

const sampleRuns = [{
  run_id: 101,
  type: 'Run',
  start_date_local: '2026-08-15T07:30:00',
  distance: 5,
  moving_time: '00:30:00',
  average_heartrate: 142,
  calories: 320,
  display_name: '晨跑',
  sport_display_name: '跑步',
  calendar_achievements: [],
  energy_title: '晨跑'
}];
const engine = model.computeEngineData(sampleRuns, '2026', 7);
assert.equal(engine.globalData.stats.totalDist, 5);
assert.equal(engine.globalData.stats.activeDays, 1);
assert.equal(engine.monthlyData.monthDetailStats.runDist, 5);
assert.equal(engine.monthlyData.insights.validHrRuns, 1);
assert.equal(engine.monthlyData.energySummary.totalCalories, 320);

const encodedLandmark = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const routes = modules.createRoutes({
  data: [],
  landmarkRoutes: [{
    key: 'synthetic-route',
    geometry: encodedLandmark,
    reference_km: 1
  }]
}, [0, 0]);
const privateRun = {
  run_id: 202,
  route_status: 'privacy_hidden',
  distance_title_key: 'synthetic-route',
  distance: 1,
  type: 'Run'
};
Object.defineProperty(privateRun, 'summary_polyline', {
  get() {
    throw new Error('private polyline must never be read');
  }
});
const privateSelection = routes.selectDisplayRoute(privateRun);
assert.equal(privateSelection.hasRealTrack, false);
assert.equal(privateSelection.landmarkRoute.key, 'synthetic-route');
assert.ok(privateSelection.displayCoordinates.length >= 2);
assert.equal(Object.hasOwn(privateRun, '_decodedCoords'), false);

const pendingRun = {
  run_id: 252,
  route_status: 'pending',
  distance_title_key: 'synthetic-route',
  distance: 1,
  type: 'Run'
};
Object.defineProperty(pendingRun, 'summary_polyline', {
  get() {
    throw new Error('a pending polyline must never be read');
  }
});
const pendingSelection = routes.selectDisplayRoute(pendingRun);
assert.equal(pendingSelection.hasRealTrack, false);
assert.equal(pendingSelection.landmarkRoute, null);
assert.equal(pendingSelection.displayCoordinates.length, 0);
assert.equal(Object.hasOwn(pendingRun, '_decodedCoords'), false);

const publicRun = {
  run_id: 303,
  route_status: 'available',
  summary_polyline: encodedLandmark,
  distance: 1,
  type: 'Run'
};
const publicSelection = routes.selectDisplayRoute(publicRun);
assert.equal(publicSelection.hasRealTrack, true);
assert.equal(publicSelection.landmarkRoute, null);
assert.ok(publicSelection.displayCoordinates.length >= 2);

const overviewRoutes = modules.createRoutes({
  data: [
    { ...publicRun, run_id: 304, start_date_local: '2026-08-05T07:30:00' },
    { ...publicRun, run_id: 305, start_date_local: '2026-07-05T07:30:00' },
    {
      run_id: 306,
      route_status: 'privacy_hidden',
      distance_title_key: 'synthetic-route',
      distance: 1,
      type: 'Run',
      start_date_local: '2026-08-06T07:30:00'
    },
    {
      run_id: 307,
      route_status: 'privacy_hidden',
      distance_title_key: 'synthetic-route',
      distance: 1,
      type: 'Run',
      start_date_local: '2026-07-06T07:30:00'
    }
  ],
  landmarkRoutes: [{
    key: 'synthetic-route',
    geometry: encodedLandmark,
    reference_km: 1
  }]
}, [-120.95, 40.7]);
const annualOverview = overviewRoutes.buildAnnualOverview('2026');
const augustOverview = overviewRoutes.buildMonthlyOverview('2026', '08');
assert.equal(annualOverview.publicFeatures.length, 2);
assert.equal(annualOverview.landmarkFeatures.length, 1);
assert.equal(annualOverview.landmarkFeatures[0].properties.visits, 2);
assert.equal(augustOverview.publicFeatures.length, 1);
assert.equal(augustOverview.landmarkFeatures.length, 1);
assert.equal(augustOverview.landmarkFeatures[0].properties.visits, 1);
assert.equal(augustOverview.landmarkFeatures[0].properties.mode, 'month');

const poster = modules.poster.buildPanelHtml({
  ...sampleRuns[0],
  pace_num: '6:00',
  pace_unit: '/km',
  card_achievement: { label: '本月最长' }
}, model);
assert.match(poster.html, /本月最长/);
assert.match(poster.html, /保存海报/);
assert.match(poster.html, /aria-label="预览运动海报"/);
assert.match(poster.html, /aria-label="生成并保存运动海报"/);
assert.match(poster.html, /aria-label="退出海报预览"/);
assert.match(poster.html, /<span class="statLabel">千卡<\/span><span class="statVal">320<\/span>/);
assert.equal(modules.poster.cleanPosterPrefix('../Koobai 运动'), 'Koobai');

const calendar = { innerHTML: '' };
const runListEmpty = { hidden: true };
const createRunCard = (...classes) => ({
  classList: { contains: className => classes.includes(className) },
  style: {},
  getAttribute: () => null
});
const augustCard = createRunCard('item-year-2026', 'item-month-08');
const julyCard = createRunCard('item-year-2026', 'item-month-07');
const olderYearCard = createRunCard('item-year-2025', 'item-month-12');
const olderYearNovemberCard = createRunCard('item-year-2025', 'item-month-11');
const runCards = [augustCard, julyCard, olderYearCard, olderYearNovemberCard];
const dispatchedEvents = [];
let delegatedClick = null;
const interactionRoot = {
  addEventListener(type, handler) {
    if (type === 'click') delegatedClick = handler;
  },
  contains: () => true
};
document.getElementById = id => {
  if (id === 'calendar-board-container') return calendar;
  if (id === 'run-list-empty') return runListEmpty;
  return null;
};
document.querySelector = selector => selector === '.exercise-container' ? interactionRoot : null;
document.querySelectorAll = selector => selector === '.runCard' ? runCards : [];
document.dispatchEvent = event => dispatchedEvents.push(event);
let selectedRunId = null;
const uiRuns = [
  ...sampleRuns,
  { ...sampleRuns[0], run_id: 102, start_date_local: '2026-07-10T07:30:00' },
  { ...sampleRuns[0], run_id: 103, start_date_local: '2025-12-10T07:30:00' },
  { ...sampleRuns[0], run_id: 104, start_date_local: '2025-11-10T07:30:00' }
];
window.KoobaiRun = {
  availableYears: [2026, 2025],
  monthlyInsights: {},
  data: uiRuns,
  contract,
  map: {
    flyTo(runId) {
      selectedRunId = runId;
    }
  }
};
const ui = modules.createUI(window.KoobaiRun, model);
assert.equal(ui.currentYear, '2026');
assert.equal(ui.calMonthIndex, 7);
assert.match(calendar.innerHTML, /2026 年度总里程/);
assert.match(calendar.innerHTML, /2026-08/);
assert.match(calendar.innerHTML, /晨跑/);
assert.match(calendar.innerHTML, /aria-label="查看更早年度"/);
assert.match(calendar.innerHTML, /aria-label="查看上个月"/);
assert.match(calendar.innerHTML, /aria-label="切换月度点评"/);
assert.match(calendar.innerHTML, /aria-pressed="false"/);
assert.match(calendar.innerHTML, /class="dayCellAction"/);
assert.doesNotMatch(calendar.innerHTML, /onclick=/);
assert.equal(typeof delegatedClick, 'function');
assert.equal(augustCard.style.display, 'flex');
assert.equal(julyCard.style.display, 'flex');
assert.equal(olderYearCard.style.display, 'none');
assert.equal(olderYearNovemberCard.style.display, 'none');
assert.equal(runListEmpty.hidden, true);
assert.deepEqual(ui.getCurrentRouteScope(), { year: '2026', month: '08', mode: 'year' });

delegatedClick({
  target: {
    closest: () => ({
      dataset: { exerciseAction: 'fly-to-run', runId: '101' }
    })
  }
});
assert.equal(selectedRunId, '101');

delegatedClick({
  target: {
    closest: () => ({
      dataset: { exerciseAction: 'change-month', direction: '-1' }
    })
  }
});
assert.equal(ui.calMonthIndex, 6);
assert.match(calendar.innerHTML, /2026-07/);
assert.equal(augustCard.style.display, 'none');
assert.equal(julyCard.style.display, 'flex');
assert.equal(olderYearCard.style.display, 'none');
assert.equal(runListEmpty.hidden, true);
assert.deepEqual(dispatchedEvents.at(-1).detail, { year: '2026', month: '07', mode: 'month' });

delegatedClick({
  target: {
    closest: () => ({
      dataset: { exerciseAction: 'change-month', direction: '1' }
    })
  }
});
assert.equal(ui.calMonthIndex, 7);
assert.equal(augustCard.style.display, 'flex');
assert.equal(julyCard.style.display, 'flex');
assert.equal(olderYearCard.style.display, 'none');
assert.equal(runListEmpty.hidden, true);
assert.deepEqual(dispatchedEvents.at(-1).detail, { year: '2026', month: '08', mode: 'year' });

delegatedClick({
  target: {
    closest: () => ({
      dataset: { exerciseAction: 'change-month', direction: '1' }
    })
  }
});
assert.equal(ui.calMonthIndex, 8);
assert.equal(augustCard.style.display, 'none');
assert.equal(julyCard.style.display, 'none');
assert.equal(olderYearCard.style.display, 'none');
assert.equal(runListEmpty.hidden, false);
assert.deepEqual(dispatchedEvents.at(-1).detail, { year: '2026', month: '09', mode: 'month' });

ui.setYear('2025');
assert.equal(ui.calMonthIndex, 11);
assert.equal(augustCard.style.display, 'none');
assert.equal(julyCard.style.display, 'none');
assert.equal(olderYearCard.style.display, 'flex');
assert.equal(olderYearNovemberCard.style.display, 'flex');
assert.equal(runListEmpty.hidden, true);
assert.deepEqual(dispatchedEvents.at(-1).detail, { year: '2025', month: '12', mode: 'year' });

ui.setCalMonth(-1);
assert.equal(ui.calMonthIndex, 10);
assert.equal(olderYearCard.style.display, 'none');
assert.equal(olderYearNovemberCard.style.display, 'flex');
assert.equal(runListEmpty.hidden, true);
assert.deepEqual(dispatchedEvents.at(-1).detail, { year: '2025', month: '11', mode: 'month' });

const exerciseTemplateSource = fs.readFileSync(path.join(
  ROOT,
  'themes/jingzhe_v3/layouts/pages/exercise.html'
), 'utf8');
const exerciseUiSource = fs.readFileSync(exerciseAsset('ui.js'), 'utf8');
assert.doesNotMatch(exerciseTemplateSource, /onclick=/);
assert.doesNotMatch(exerciseUiSource, /onclick=/);
assert.match(exerciseTemplateSource, /class="runCardAction"/);

let uiCreated = false;
let mapCreated = false;
modules.createUI = () => {
  uiCreated = true;
  return { highlightRunInUI() {} };
};
modules.createMapAdapter = () => {
  mapCreated = true;
  return { flyTo() {} };
};
window.addEventListener = () => {};
window.requestAnimationFrame = callback => callback();
window.KoobaiRun = {
  data: sampleRuns,
  availableYears: [2026],
  contract,
  config: {},
  ui: null,
  map: null
};
require(exerciseAsset('controller.js'));
assert.equal(window.KoobaiRun.initialized, true);
assert.equal(uiCreated, true);
assert.equal(mapCreated, true);
assert.equal(typeof window.KoobaiRun.ui.highlightRunInUI, 'function');
assert.equal(typeof window.KoobaiRun.map.flyTo, 'function');

console.log('exercise modules: ok');
