'use strict';

const assert = require('node:assert/strict');
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

const modules = window.JingzheExerciseModules;
const contract = require('../data/jingzhe/exercise.json');
const model = modules.createModel(contract);

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

const poster = modules.poster.buildPanelHtml({
  ...sampleRuns[0],
  pace_num: '6:00',
  pace_unit: '/km',
  card_achievement: { label: '本月最长' }
}, model);
assert.match(poster.html, /本月最长/);
assert.match(poster.html, /保存海报/);
assert.match(poster.html, /<span class="statLabel">千卡<\/span><span class="statVal">320<\/span>/);
assert.equal(modules.poster.cleanPosterPrefix('../Koobai 运动'), 'Koobai');

const calendar = { innerHTML: '' };
document.getElementById = id => id === 'calendar-board-container' ? calendar : null;
window.KoobaiRun = {
  availableYears: [2026],
  monthlyInsights: {},
  data: sampleRuns,
  contract
};
const ui = modules.createUI(window.KoobaiRun, model);
assert.equal(ui.currentYear, '2026');
assert.equal(ui.calMonthIndex, 7);
assert.match(calendar.innerHTML, /2026 年度总里程/);
assert.match(calendar.innerHTML, /2026-08/);
assert.match(calendar.innerHTML, /晨跑/);

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
