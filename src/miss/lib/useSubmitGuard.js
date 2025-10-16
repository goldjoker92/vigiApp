// src/miss/lib/useSubmitGuard.js
// VigiApp — Guard anti double-submit + backoff simple
// - guard(name, fn): aligne la concu (maxParallel) + cooldown par action
// - running(name): savoir si une action tourne
// - withBackoff(fn, {attempts, baseDelay}): retry expo

import { useCallback, useRef, useState } from 'react';

const NS = '[GUARD]';
const Log = {
  info: (...a) => console.log(NS, ...a),
  warn: (...a) => console.warn(NS, '⚠️', ...a),
  error: (...a) => console.error(NS, '❌', ...a),
};

export function useSubmitGuard({ cooldownMs = 1000, maxParallel = 1 } = {}) {
  const runningCountsRef = useRef(new Map());   // actionName -> count
  const lastRunRef = useRef(new Map());         // actionName -> timestamp
  const [, force] = useState(0);                // pour forcer un rerender léger

  const running = useCallback((name) => {
    return (runningCountsRef.current.get(name) || 0) > 0;
  }, []);

  const inc = (name) => {
    const m = runningCountsRef.current;
    m.set(name, (m.get(name) || 0) + 1);
    force((x) => x + 1);
  };
  const dec = (name) => {
    const m = runningCountsRef.current;
    const cur = (m.get(name) || 1) - 1;
    if (cur <= 0) {
      m.delete(name);
    } else {
      m.set(name, cur);
    }
    force((x) => x + 1);
  };

  const guard = useCallback((name, fn) => {
    return async (...args) => {
      const now = Date.now();
      const last = lastRunRef.current.get(name) || 0;
      const since = now - last;

      // Cooldown
      if (since < cooldownMs) {
        Log.warn('COOLDOWN', { name, since, cooldownMs });
        return;
      }

      // Concurrence
      const cur = runningCountsRef.current.get(name) || 0;
      if (cur >= maxParallel) {
        Log.warn('PARALLEL_LIMIT', { name, cur, maxParallel });
        return;
      }

      lastRunRef.current.set(name, now);
      inc(name);
      try {
        Log.info('ENTER', { name });
        return await fn(...args);
      } catch (e) {
        Log.error('FN_ERROR', { name, err: e?.message || String(e) });
        throw e;
      } finally {
        dec(name);
        Log.info('LEAVE', { name });
      }
    };
  }, [cooldownMs, maxParallel]);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const withBackoff = useCallback(async (fn, { attempts = 2, baseDelay = 500 } = {}) => {
    let lastErr;
    for (let i = 0; i <= attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (i < attempts) {
          const wait = baseDelay * Math.pow(2, i);
          Log.warn('RETRY', { i, wait });
          await sleep(wait);
        }
      }
    }
    throw lastErr;
  }, []);

  return { guard, running, withBackoff };
}
