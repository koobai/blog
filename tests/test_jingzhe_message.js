"use strict";

const assert = require("node:assert/strict");
const message = require("../static/js/jingzhe-message.js");

assert.equal(typeof message, "function");
for (const method of ["info", "success", "warning", "error", "loading", "destroyAll", "config"]) {
  assert.equal(typeof message[method], "function", `${method} API 缺失`);
}
assert.deepEqual(message.config(), { duration: 2000, showClose: false });
assert.deepEqual(message.config({ duration: 3000, showClose: true }), {
  duration: 3000,
  showClose: true,
});
assert.doesNotThrow(() => message.destroyAll());

console.log("Jingzhe message contract passed");
