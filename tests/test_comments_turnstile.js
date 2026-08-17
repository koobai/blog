const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../themes/jingzhe_v3/assets/js/pages/comments.js'),
  'utf8'
);

function createHarness() {
  const scripts = new Map();
  const appendedScripts = [];

  const document = {
    addEventListener() {},
    getElementById(id) {
      return scripts.get(id) || null;
    },
    createElement(tagName) {
      assert.equal(tagName, 'script');
      const listeners = new Map();
      return {
        id: '',
        src: '',
        async: false,
        defer: false,
        addEventListener(type, listener) {
          listeners.set(type, listener);
        },
        removeEventListener(type) {
          listeners.delete(type);
        },
        dispatch(type) {
          const listener = listeners.get(type);
          if (listener) listener();
        },
        remove() {
          scripts.delete(this.id);
        }
      };
    },
    head: {
      appendChild(script) {
        scripts.set(script.id, script);
        appendedScripts.push(script);
      }
    }
  };

  const window = {
    JINGZHE_CONFIG: {
      services: {
        social: {
          turnstilescripturl: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
          turnstilesitekey: 'test-site-key'
        }
      }
    }
  };

  vm.runInNewContext(source, {
    window,
    document,
    setTimeout,
    clearTimeout,
    Promise,
    Error,
    console
  });

  return { window, appendedScripts };
}

async function run() {
  const success = createHarness();
  assert.equal(success.appendedScripts.length, 0, 'Turnstile must not load during page initialization');

  const firstLoad = success.window.JingzheTurnstile.ensureReady();
  const repeatedLoad = success.window.JingzheTurnstile.ensureReady();
  assert.strictEqual(firstLoad, repeatedLoad, 'concurrent callers must share one loading promise');
  assert.equal(success.appendedScripts.length, 1, 'only one Turnstile script may be appended');

  const turnstileApi = { render() {}, execute() {}, reset() {}, remove() {} };
  success.window.turnstile = turnstileApi;
  success.appendedScripts[0].dispatch('load');
  assert.strictEqual(await firstLoad, turnstileApi);
  assert.strictEqual(await repeatedLoad, turnstileApi);

  const retry = createHarness();
  const failedLoad = retry.window.JingzheTurnstile.ensureReady();
  retry.appendedScripts[0].dispatch('error');
  await assert.rejects(failedLoad, /人机验证加载失败/);

  const retryLoad = retry.window.JingzheTurnstile.ensureReady();
  assert.equal(retry.appendedScripts.length, 2, 'a failed load must be retryable');
  retry.window.turnstile = turnstileApi;
  retry.appendedScripts[1].dispatch('load');
  assert.strictEqual(await retryLoad, turnstileApi);

  console.log('comment Turnstile lazy-loading contracts: ok');
}

run();
