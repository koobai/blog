'use strict';

const assert = require('node:assert/strict');
const contract = require('../data/jingzhe/exercise.json');
const activities = require('../assets/data/exercise/activities.json');
const landmarkRoutes = require('../assets/data/exercise/landmark-routes.json');

const colors = Object.fromEntries(
  Object.entries(contract.sports).map(([type, values]) => [type, values.color])
);
assert.equal(colors.Run, '#F58200');
assert.equal(colors.Ride, '#32D74B');
assert.equal(colors.Walk, '#DF40C4');
assert.deepEqual(contract.groups.ride, ['Ride', 'VirtualRide', 'EBikeRide']);

const monthlyFoods = contract.foods.filter(food => food.monthly);
assert.equal(monthlyFoods.length, 11);
assert.equal(new Set(contract.foods.map(food => food.key)).size, contract.foods.length);
assert.ok(monthlyFoods.every(food => food.kcal >= 139));

assert.equal(landmarkRoutes.length, 20);
assert.equal(new Set(landmarkRoutes.map(route => route.key)).size, landmarkRoutes.length);
assert.ok(landmarkRoutes.every(route => route.kind === 'distance' || route.kind === 'elevation'));
assert.ok(landmarkRoutes.filter(route => route.kind === 'distance').every(route => (
  route.reference_km > 0
  && route.min_km <= route.max_km
  && route.max_count > 0
  && route.preferred_groups.length > 0
)));
assert.ok(landmarkRoutes.filter(route => route.kind === 'elevation').every(route => (
  route.reference_meters > 0 && route.max_count > 0
)));

assert.ok(activities.every(activity => Object.hasOwn(activity, 'display_name')));
assert.ok(activities.every(activity => Object.hasOwn(activity, 'sport_display_name')));
assert.ok(activities.every(activity => Object.hasOwn(activity, 'card_achievement')));
assert.ok(activities.every(activity => Array.isArray(activity.calendar_achievements)));

console.log('exercise contract: ok');
