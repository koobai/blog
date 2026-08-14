'use strict';

const assert = require('node:assert/strict');
const contract = require('../data/jingzhe/exercise.json');

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

console.log('exercise contract: ok');
