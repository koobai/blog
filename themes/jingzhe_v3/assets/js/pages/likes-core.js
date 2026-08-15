(function (global) {
  'use strict';

  async function submitLike({ url, token, submitUrl, fetchImpl = global.fetch }) {
    if (!url || !submitUrl) return { state: 'failed', reason: 'configuration' };
    if (!token) return { state: 'failed', reason: 'verification' };

    try {
      const response = await fetchImpl(submitUrl, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'CF-Turnstile-Response': token
        },
        body: JSON.stringify({ url })
      });
      if (response.ok) return { state: 'created', status: response.status };
      if (response.status === 409) return { state: 'existing', status: response.status };
      return { state: 'failed', reason: 'server', status: response.status };
    } catch (_error) {
      return { state: 'failed', reason: 'network' };
    }
  }

  function applyOptimisticLike(count) {
    return { liked: true, count: (Number(count) || 0) + 1, persist: true, incremented: true };
  }

  function applyLikeResult(count, result) {
    const currentCount = Number(count) || 0;
    if (result && result.state === 'created') {
      return { liked: true, count: currentCount + 1, persist: true, incremented: true };
    }
    if (result && result.state === 'existing') {
      return { liked: true, count: Math.max(currentCount, 1), persist: true, incremented: false };
    }
    return { liked: false, count: currentCount, persist: false, incremented: false };
  }

  const api = { submitLike, applyOptimisticLike, applyLikeResult };
  global.JingzheLikes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
