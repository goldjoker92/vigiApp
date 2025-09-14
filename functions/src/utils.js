/**
 * utils.js (VERBOSE + CLEAN)
 * - Init ADMIN (idempotent)
 * - Firestore handle
 * - Helpers: chunk, dedupe, assertRole
 * - Expo push:
 *    - expoPushSend (compat)
 *    - expoPushSendWithMap (nouveau, conserve l'ordre token→ticket)
 *    - summarizeExpoResults
 *    - cleanInvalidTokens (supprime expoPushToken invalides dans Firestore)
 */

const functions = require('firebase-functions');
const v1functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// ---- Init admin — idempotent
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// ---- Logs formatés
const APP_TAG = 'VigiApp';
const LIB_TAG = 'FnsUtils';
const nowIso = () => new Date().toISOString();
const log = (...a) => console.warn(`[${APP_TAG}][${LIB_TAG}][${nowIso()}]`, ...a);
const warn = (...a) => console.warn(`[${APP_TAG}][${LIB_TAG}][${nowIso()}]`, ...a);
const err = (...a) => console.error(`[${APP_TAG}][${LIB_TAG}][${nowIso()}]`, ...a);

const safeJson = (obj, max = 800) => {
  try {
    return JSON.stringify(obj).slice(0, max);
  } catch {
    return '[unserializable]';
  }
};
const maskToken = (t) => {
  if (!t) {
    return t;
  }
  const s = String(t);
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-6)}(${s.length})` : s;
};

// ---- Utils
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function dedupe(arr) {
  const set = new Set(arr);
  return Array.from(set);
}

// ---- Auth guard
function assertRole(context, allowed = ['admin', 'moderator']) {
  const role = context?.auth?.token?.role;
  if (!role || !allowed.includes(role)) {
    warn('[assertRole] refusé — role:', role, 'required:', allowed);
    throw new functions.https.HttpsError(
      'permission-denied',
      'Accès refusé: rôle requis (admin/moderator).',
    );
  }
}

// ======================================================================
// Expo Push — VERSION COMPAT (sans map) : laisse ton code existant tourner
// ======================================================================
async function expoPushSend(tokens, title, body, data = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    warn('[expoPushSend] no tokens');
    return [];
  }

  const unique = dedupe(tokens);
  const dupes = tokens.length - unique.length;
  if (dupes > 0) {
    warn(`[expoPushSend] removed duplicates: ${dupes}`);
  }

  log('[expoPushSend] start', {
    count: unique.length,
    sample: unique.slice(0, 3).map(maskToken),
    title,
    body,
  });

  const results = [];
  const batches = chunk(unique, 100);
  let batchIndex = 0;

  for (const batch of batches) {
    batchIndex += 1;
    const payload = batch.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data,
      channelId: 'default',
    }));

    log(`[expoPushSend] POST batch ${batchIndex}/${batches.length}`, {
      size: batch.length,
      first: maskToken(batch[0]),
    });

    let res, text;
    try {
      res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      text = await res.text();
      log(
        `[expoPushSend] http ${res.status} ${res.statusText} (batch ${batchIndex}) body=`,
        text.slice(0, 700),
      );
    } catch (e) {
      err(`[expoPushSend] fetch failed (batch ${batchIndex})`, e?.message || e);
      results.push({ error: 'fetch_failed', message: e?.message });
      continue;
    }

    try {
      const json = JSON.parse(text);
      // Expo retourne un tableau de tickets dans data
      const dataArr = Array.isArray(json?.data) ? json.data : [];
      const okCount = dataArr.filter((d) => d?.status === 'ok').length;
      const errCount = dataArr.filter((d) => d?.status === 'error').length;
      if (errCount > 0) {
        const codes = {};
        for (const d of dataArr) {
          if (d?.status === 'error') {
            const code = d?.details?.error || 'unknown';
            codes[code] = (codes[code] || 0) + 1;
          }
        }
        warn(`[expoPushSend] batch ${batchIndex} errors=`, codes);
      } else {
        log(`[expoPushSend] batch ${batchIndex} ok=${okCount}`);
      }
      results.push(json);
    } catch (_e) {
      warn(`[expoPushSend] non-JSON response (batch ${batchIndex})`, (text || '').slice(0, 256));
      results.push({ raw: text });
    }
  }

  log('[expoPushSend] done', { batches: batches.length });
  return results;
}

// ===================================================================================
// Expo Push — VERSION AVEC MAP : retourne aussi la map de tokens dans l’ordre d’envoi
// ===================================================================================
async function expoPushSendWithMap(tokens, title, body, data = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    warn('[expoPushSendWithMap] no tokens');
    return { results: [], map: [] };
  }

  const unique = dedupe(tokens);
  const dupes = tokens.length - unique.length;
  if (dupes > 0) {
    warn(`[expoPushSendWithMap] removed duplicates: ${dupes}`);
  }

  log('[expoPushSendWithMap] start', {
    count: unique.length,
    sample: unique.slice(0, 3).map(maskToken),
    title,
    body,
  });

  const results = [];
  const map = []; // ordre strict des tokens envoyés
  const batches = chunk(unique, 100);
  let batchIndex = 0;

  for (const batch of batches) {
    batchIndex += 1;

    const payload = batch.map((to) => {
      map.push(to);
      return {
        to,
        sound: 'default',
        title,
        body,
        data,
        channelId: 'default',
      };
    });

    log(`[expoPushSendWithMap] POST batch ${batchIndex}/${batches.length}`, {
      size: batch.length,
      first: maskToken(batch[0]),
    });

    let res, text;
    try {
      res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      text = await res.text();
      log(
        `[expoPushSendWithMap] http ${res.status} ${res.statusText} (batch ${batchIndex}) body=`,
        text.slice(0, 700),
      );
    } catch (e) {
      err(`[expoPushSendWithMap] fetch failed (batch ${batchIndex})`, e?.message || e);
      results.push({ error: 'fetch_failed', message: e?.message });
      continue;
    }

    try {
      const json = JSON.parse(text);
      results.push(json);
    } catch (_e) {
      warn(
        `[expoPushSendWithMap] non-JSON response (batch ${batchIndex})`,
        (text || '').slice(0, 256),
      );
      results.push({ raw: text });
    }
  }

  log('[expoPushSendWithMap] done', { batches: batches.length, mapLen: map.length });
  return { results, map };
}

// ---- Résumé des résultats Expo (ok/error par code)
function summarizeExpoResults(results) {
  const summary = { ok: 0, error: 0, errorsByCode: {} };
  if (!Array.isArray(results)) {
    return summary;
  }

  for (const r of results) {
    const arr = Array.isArray(r?.data) ? r.data : [];
    for (const t of arr) {
      if (t?.status === 'ok') {
        summary.ok += 1;
      } else if (t?.status === 'error') {
        summary.error += 1;
        const code = t?.details?.error || 'unknown';
        summary.errorsByCode[code] = (summary.errorsByCode[code] || 0) + 1;
      }
    }
  }
  return summary;
}

// ======================================================================
// Nettoyage des tokens invalides (DeviceNotRegistered / InvalidCredentials)
// - Nécessite expoPushSendWithMap pour l’index → token
// - Supprime le champ expoPushToken dans devices où il match
// ======================================================================
async function cleanInvalidTokens(expoResults, tokenMap) {
  let globalIdx = 0;
  const toDelete = new Set();

  for (const r of expoResults) {
    const arr = Array.isArray(r?.data) ? r.data : [];
    for (const ticket of arr) {
      const token = tokenMap[globalIdx];
      const status = ticket?.status;
      const code = ticket?.details?.error || null;
      if (status === 'error' && token) {
        if (code === 'DeviceNotRegistered' || code === 'InvalidCredentials') {
          toDelete.add(token);
        }
      }
      globalIdx += 1;
    }
  }

  const invalidTokens = Array.from(toDelete);
  if (!invalidTokens.length) {
    log('[cleanInvalidTokens] nothing to clean');
    return { removed: 0, matchedDocs: 0, tokens: [] };
  }

  log(
    '[cleanInvalidTokens] candidates:',
    invalidTokens.length,
    invalidTokens.slice(0, 5).map(maskToken),
  );

  const delField = admin.firestore.FieldValue.delete();
  let matchedDocs = 0;

  for (const grp of chunk(invalidTokens, 10)) {
    const snap = await db.collection('devices').where('expoPushToken', 'in', grp).get();
    if (snap.empty) {
      continue;
    }

    const batch = db.batch();
    snap.forEach((doc) => {
      matchedDocs += 1;
      batch.update(doc.ref, {
        expoPushToken: delField,
        updatedAtServer: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  log('[cleanInvalidTokens] done', { removed: invalidTokens.length, matchedDocs });
  return { removed: invalidTokens.length, matchedDocs, tokens: invalidTokens };
}

// ---- Delivery log
async function createDeliveryLog(kind, meta) {
  const ref = await db.collection('deliveries').add({
    kind,
    ...meta,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  log('[createDeliveryLog]', { kind, logId: ref.id });
  return ref;
}

// ---- Tokens fetchers
async function getTokensByCEP(cep) {
  log('[getTokensByCEP] cep=', cep);
  const snap = await db.collection('devices').where('cep', '==', cep).get();
  const tokens = [];
  snap.forEach((doc) => {
    const t = doc.get('expoPushToken');
    if (t) {
      tokens.push(t);
    }
  });
  log('[getTokensByCEP] found=', tokens.length, 'sample=', tokens.slice(0, 3).map(maskToken));
  return tokens;
}

async function getTokensByUserIds(userIds) {
  log('[getTokensByUserIds] input length=', userIds?.length || 0);
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }
  const tokens = [];
  for (const ids of chunk(userIds, 10)) {
    const snap = await db.collection('devices').where('userId', 'in', ids).get();
    snap.forEach((doc) => {
      const t = doc.get('expoPushToken');
      if (t) {
        tokens.push(t);
      }
    });
  }
  log(
    '[getTokensByUserIds] total tokens=',
    tokens.length,
    'sample=',
    tokens.slice(0, 3).map(maskToken),
  );
  return tokens;
}

// ---- Error wrapper (avec durée)
async function errorHandlingWrapper(functionName, callback) {
  const start = Date.now();
  try {
    log(`[${functionName}] start`);
    const result = await callback();
    log(`[${functionName}] success in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    err(`❌ [${functionName}]`, error?.message, error?.stack);
    await db.collection('errorLogs').add({
      functionName,
      error: error?.message,
      stack: error?.stack,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    return null;
  }
}

module.exports = {
  functions,
  v1functions,
  admin,
  db,
  chunk,
  dedupe,
  assertRole,
  // push
  expoPushSend,
  expoPushSendWithMap,
  summarizeExpoResults,
  cleanInvalidTokens,
  // logs & tokens utils
  createDeliveryLog,
  getTokensByCEP,
  getTokensByUserIds,
  errorHandlingWrapper,
  maskToken,
};
