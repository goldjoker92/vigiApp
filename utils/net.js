// utils/net.js
// -----------------------------------------------------------------------------
// Réseau: timeouts durs, retries optionnels, utilitaires de log.
// - withTimeout(promise, ms, label): tue une promesse lente.
// - retry(fn, {retries, delayMs, label}): réessaie avec backoff fixe.
// - fetchJson(url, opt, {timeoutMs, label}): fetch + timeout + JSON try/catch.
// Tous les appels sont TRACÉS avec horodatage.
// -----------------------------------------------------------------------------

const TAG = 'NET';

function ts() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}

function log(...a) {
  console.log(`[${TAG}][${ts()}]`, ...a);
}
function warn(...a) {
  console.warn(`[${TAG}][${ts()}]`, ...a);
}
function error(...a) {
  console.error(`[${TAG}][${ts()}]`, ...a);
}

/**
 * withTimeout: rejette si la promesse dépasse ms.
 */
export function withTimeout(promise, ms = 3000, label = 'timeout') {
  const id = `${label}:${Math.random().toString(36).slice(2, 7)}`;
  log('withTimeout start', { id, ms, label });
  let t;
  const killer = new Promise((_, rej) => {
    t = setTimeout(() => {
      warn('withTimeout fired', { id, ms, label });
      rej(new Error(label));
    }, ms);
  });
  return Promise.race([
    promise.finally(() => {
      clearTimeout(t);
      log('withTimeout cleared', { id });
    }),
    killer,
  ]);
}

/**
 * retry: exécute fn() jusqu’à N fois avec délai entre essais.
 */
export async function retry(fn, { retries = 2, delayMs = 300, label = 'retry' } = {}) {
  const id = `${label}:${Math.random().toString(36).slice(2, 7)}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      log('retry attempt', { id, attempt });
      const tKey = `[${TAG}] ${id} attempt#${attempt}`;
      console.time(tKey);
      const res = await fn();
      console.timeEnd(tKey);
      log('retry success', { id, attempt });
      return res;
    } catch (e) {
      warn('retry error', { id, attempt, err: e?.message || String(e) });
      if (attempt === retries) {
        throw e;
      }
      await sleep(delayMs);
    }
  }
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * fetchJson: fetch + timeout + parse JSON.
 * - optTimeout.timeoutMs: délai max
 * - optTimeout.label: label logs
 */
export async function fetchJson(url, opt = {}, optTimeout = {}) {
  const { timeoutMs = 4000, label = 'fetchJson' } = optTimeout;
  const id = `${label}:${Math.random().toString(36).slice(2, 7)}`;
  log('fetchJson start', { id, url, timeoutMs });

  const tKey = `[${TAG}] ${id} fetch`;
  console.time(tKey);
  try {
    const resp = await withTimeout(fetch(url, opt), timeoutMs, `${label}-timeout`);
    console.timeEnd(tKey);
    if (!resp.ok) {
      const txt = await safeReadText(resp);
      warn('fetchJson bad status', { id, status: resp.status, body: txt?.slice?.(0, 200) });
      throw new Error(`http-${resp.status}`);
    }
    const jKey = `[${TAG}] ${id} json`;
    console.time(jKey);
    const data = await resp.json().catch(() => null);
    console.timeEnd(jKey);
    if (data === null) {
      throw new Error('json-parse-failed');
    }
    log('fetchJson ok', { id, size: safeSize(data) });
    return data;
  } catch (e) {
    error('fetchJson failed', { id, err: e?.message || String(e) });
    throw e;
  }
}

async function safeReadText(resp) {
  try {
    return await resp.text();
  } catch {
    return null;
  }
}

function safeSize(x) {
  try {
    return JSON.stringify(x).length;
  } catch {
    return -1;
  }
}
