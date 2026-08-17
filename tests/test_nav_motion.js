const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const motion = require(path.join(
  root,
  'themes/jingzhe_v3/assets/js/nav-motion.js'
));

assert.equal(motion.SCROLL_START, 40);
assert.equal(motion.COLLAPSE_DISTANCE, 320);
assert.equal(motion.MIN_SCROLL_DISTANCE, 360);

const progressCheckpoints = new Map([
  [0, 0],
  [40, 0],
  [120, 0.25],
  [200, 0.5],
  [360, 1],
  [720, 1]
]);

for (const [scrollY, expected] of progressCheckpoints) {
  assert.equal(motion.getScrollProgress(scrollY), expected);
}

assert.equal(motion.hasEnoughScrollDistance(359), false);
assert.equal(motion.hasEnoughScrollDistance(360), true);
assert.equal(motion.range(0, 0.2, 0.8), 0);
assert.ok(Math.abs(motion.range(0.5, 0.2, 0.8) - 0.5) < 1e-12);
assert.equal(motion.range(1, 0.2, 0.8), 1);
assert.equal(motion.isSameProgress(1, 1.0001), true);
assert.equal(motion.isSameProgress(1, 0.99), false);

const writes = [];
const removals = [];
const element = {
  style: {
    setProperty(property, value) {
      writes.push([property, value]);
    },
    removeProperty(property) {
      removals.push(property);
    }
  }
};

assert.equal(motion.setStyleProperty(element, '--width', '58px'), true);
assert.equal(motion.setStyleProperty(element, '--width', '58px'), false);
assert.equal(motion.setStyleProperty(element, '--width', '60px'), true);
assert.deepEqual(writes, [
  ['--width', '58px'],
  ['--width', '60px']
]);

motion.removeStyleProperty(element, '--width');
assert.deepEqual(removals, ['--width']);
assert.equal(motion.setStyleProperty(element, '--width', '60px'), true);

const scripts = fs.readFileSync(
  path.join(root, 'themes/jingzhe_v3/assets/js/scripts.js'),
  'utf8'
);
assert.match(scripts, /function onScroll\(\) \{\s+if \(!desktopQuery\.matches\) return;/);
assert.match(scripts, /function syncToScroll\(\) \{\s+if \(!mobileQuery\.matches\) return;/);
assert.doesNotMatch(scripts, /copyMenuIcons|desktopItems/);

console.log('nav motion contract tests passed');
