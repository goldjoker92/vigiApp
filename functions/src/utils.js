/**
 * utils.js (VERBOSE + CLEAN)
 * - Init ADMIN (idempotent)
 * - Firestore handle
 * - Logs & helpers génériques
 * - Expo push (tes fonctions existantes, inchangées)
 * - Helpers “Public Alerts”
 * - FCM wrapper (sendToToken) ✅ channelId + sound corrigés
 * - upsertPublicAlertDoc (merge idempotent)
 */

/* eslint-env node */
'use strict';

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
const log = (...a) => console.log(`[${APP_TAG}][${LIB_TAG}][${nowIso()}]`, ...a);
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
  if (!t) return t;
  const s = String(t);
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-6)}(${s.length})` : s;
};

// ======================================================================
// Helpers génériques
// ======================================================================
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
function dedupe(arr) {
  return Array.from(new Set(arr));
}

// ---- Auth guard (conserve le comportement)
function assertRole(context, allowed = ['admin', 'moderator']) {
  const role = context?.auth?.token?.role;
  if (!role || !allowed.includes(role)) {
    warn('[assertRole] refusé — role:', role, 'required:', allowed);
    throw new functions.https.HttpsError(
      'permission-denied',
      'Accès refusé: rôle requis (admin/moderator).'
    );
  }
}

// ======================================================================
// Helpers “Public Alerts”
// ======================================================================
// --- Portée V1 (incident public) ---
const DEFAULT_ALERT_RADIUS_M = 1000;

const toDigits = (v = '') => String(v).replace(/\D/g, '');
const isHexColor = (c) => /^#?[0-9A-Fa-f]{6}$/.test(String(c || ''));
const normColor = (c) => (String(c || '').startsWith('#') ? String(c) : `#${c}`);

/**
 * Force un rayon valide en mètres. Log un WARN si fallback.
 */
function coerceRadiusM(v) {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  warn(`[coerceRadiusM] valeur invalide "${v}" → fallback ${DEFAULT_ALERT_RADIUS_M}m`);
  return DEFAULT_ALERT_RADIUS_M;
}

const coerceBool = (v) => {
  if (typeof v === 'boolean') return v;
  return ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase());
};

function resolveAccentColor({ severity, formColor }) {
  if (formColor && isHexColor(formColor)) {
    return normColor(formColor);
  }
  if (severity === 'high' || severity === 'grave') return '#FF3B30'; // rouge
  if (severity === 'low' || severity === 'minor') return '#FFE600'; // jaune
  if (severity === 'medium') return '#FFA500'; // orange
  return '#0A84FF'; // bleu par défaut
}

function localLabel({ endereco, bairro, cidade, uf }) {
  if (endereco) return endereco;
  if (bairro) return bairro;
  if (cidade && uf) return `${cidade}/${uf}`;
  if (cidade) return cidade;
  return 'sua região';
}

function textsBySeverity(sev, local, distText) {
  const sfx = distText
    ? ` (a ${distText}). Abra para mais detalhes.`
    : `. Abra para mais detalhes.`;
  switch (sev) {
    case 'low':
    case 'minor':
      return { title: 'VigiApp — Aviso', body: `Aviso informativo em ${local}${sfx}` };
    case 'high':
    case 'grave':
      return { title: 'VigiApp — URGENTE', body: `URGENTE: risco em ${local}${sfx}` };
    case 'medium':
    default:
      return { title: 'VigiApp — Alerta público', body: `Alerta em ${local}${sfx}` };
  }
}

// (utiles pour l’endpoint “adresse”)
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

// ======================================================================
// Expo Push — (inchangé, juste comments + logs)
// ======================================================================
async function expoPushSend(tokens, title, body, data = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    warn('[expoPushSend] no tokens');
    return [];
  }
  const unique = dedupe(tokens);
  const dupes = tokens.length - unique.length;
  if (dupes > 0) warn(`[expoPushSend] removed duplicates: ${dupes}`);

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
        (text || '').slice(0, 700)
      );
    } catch (e) {
      err(`[expoPushSend] fetch failed (batch ${batchIndex})`, e?.message || e);
      results.push({ error: 'fetch_failed', message: e?.message });
      continue;
    }

    try {
      const json = JSON.parse(text);
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
    } catch {
      warn(`[expoPushSend] non-JSON response (batch ${batchIndex})`, (text || '').slice(0, 256));
      results.push({ raw: text });
    }
  }

  log('[expoPushSend] done', { batches: batches.length });
  return results;
}

async function expoPushSendWithMap(tokens, title, body, data = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    warn('[expoPushSendWithMap] no tokens');
    return { results: [], map: [] };
  }
  const unique = dedupe(tokens);
  const dupes = tokens.length - unique.length;
  if (dupes > 0) warn(`[expoPushSendWithMap] removed duplicates: ${dupes}`);

  log('[expoPushSendWithMap] start', {
    count: unique.length,
    sample: unique.slice(0, 3).map(maskToken),
    title,
    body,
  });

  const results = [];
  const map = []; // ordre strict
  const batches = chunk(unique, 100);
  let batchIndex = 0;

  for (const batch of batches) {
    batchIndex += 1;
    const payload = batch.map((to) => {
      map.push(to);
      return { to, sound: 'default', title, body, data, channelId: 'default' };
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
        (text || '').slice(0, 700)
      );
    } catch (e) {
      err(`[expoPushSendWithMap] fetch failed (batch ${batchIndex})`, e?.message || e);
      results.push({ error: 'fetch_failed', message: e?.message });
      continue;
    }

    try {
      const json = JSON.parse(text);
      results.push(json);
    } catch {
      warn(
        `[expoPushSendWithMap] non-JSON response (batch ${batchIndex})`,
        (text || '').slice(0, 256)
      );
      results.push({ raw: text });
    }
  }

  log('[expoPushSendWithMap] done', { batches: batches.length, mapLen: map.length });
  return { results, map };
}

function summarizeExpoResults(results) {
  const summary = { ok: 0, error: 0, errorsByCode: {} };
  if (!Array.isArray(results)) return summary;
  for (const r of results) {
    const arr = Array.isArray(r?.data) ? r.data : [];
    for (const t of arr) {
      if (t?.status === 'ok') summary.ok += 1;
      else if (t?.status === 'error') {
        summary.error += 1;
        const code = t?.details?.error || 'unknown';
        summary.errorsByCode[code] = (summary.errorsByCode[code] || 0) + 1;
      }
    }
  }
  return summary;
}

// Nettoyage des tokens Expo invalides
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
    invalidTokens.slice(0, 5).map(maskToken)
  );
  const delField = admin.firestore.FieldValue.delete();
  let matchedDocs = 0;

  for (const grp of chunk(invalidTokens, 10)) {
    const snap = await db.collection('devices').where('expoPushToken', 'in', grp).get();
    if (snap.empty) continue;

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

// ======================================================================
// FCM wrapper — ✅ canal & son corrigés + data stringifiée
// ======================================================================
function stringifyDataValues(obj) {
  // FCM data = { [key: string]: string }; on évite undefined/null
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

async function sendToToken({ token, title, body, image, androidColor, data = {} }) {
  const payloadData = stringifyDataValues(data);

  const message = {
    token,
    // ⚠️ Title/body obligatoires pour affichage quand l'app est FERMÉE
    notification: {
      title,
      body,
      ...(image ? { image } : {}),
    },
    android: {
      priority: 'high', // delivery prioritaire
      collapseKey: 'vigiapp-public-alert', // facultatif: regroupe
      notification: {
        channelId: 'alerts-high', // ✅ BON CANAL (heads-up)
        color: androidColor || '#FFA500',
        sound: 'default', // ✅ CORRECT (pas defaultSound)
        visibility: 'PUBLIC',
        tag: 'vigiapp-public-alert',
        // Certains OEM lisent encore ces champs:
        title,
        body,
        ...(image ? { imageUrl: image } : {}),
      },
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default', mutableContent: 1 } },
    },
    data: payloadData, // meta pour deep-link et UI
  };

  log('[sendToToken] →', maskToken(token), { title, hasImage: !!image });
  return admin.messaging().send(message);
}

// ======================================================================
// Firestore — upsert publicAlerts/{alertId} (merge idempotent)
// ======================================================================
async function upsertPublicAlertDoc({
  alertId,
  titulo,
  descricao,
  endereco,
  cidade,
  uf,
  cep,
  lat,
  lng,
  radius_m,
  severity,
  accent,
  image,
  expiresAt,
}) {
  const ref = db.collection('publicAlerts').doc(alertId);

  const payload = {
    // --- Schéma standard pour le front ---
    titulo: titulo || descricao || 'Alerta público',
    descricao: descricao || 'Alerta público',
    endereco: endereco || null,
    cidade: cidade || null,
    uf: uf || null,
    cep: cep || null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    radius_m: coerceRadiusM(radius_m),
    status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt, // clé pour gérer l’expiration côté app

    // --- Meta UI ---
    gravidade: severity || 'medium',
    color: accent || null,
    image: image || null,

    // --- Compat legacy (ne rien casser)
    ruaNumero: endereco || null,
    estado: uf || null,
    location: {
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
    },
  };

  log('[upsertPublicAlertDoc] publicAlerts/%s ←', alertId, safeJson(payload, 400));
  await ref.set(payload, { merge: true }); // idempotent
  return { id: alertId };
}

// ======================================================================
// Logs de delivery & fetch tokens (préservé)
// ======================================================================
async function createDeliveryLog(kind, meta) {
  const ref = await db.collection('deliveries').add({
    kind,
    ...meta,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  log('[createDeliveryLog]', { kind, logId: ref.id });
  return ref;
}

async function getTokensByCEP(cep) {
  log('[getTokensByCEP] cep=', cep);
  const snap = await db.collection('devices').where('cep', '==', cep).get();
  const tokens = [];
  snap.forEach((doc) => {
    const t = doc.get('expoPushToken');
    if (t) tokens.push(t);
  });
  log('[getTokensByCEP] found=', tokens.length, 'sample=', tokens.slice(0, 3).map(maskToken));
  return tokens;
}

async function getTokensByUserIds(userIds) {
  log('[getTokensByUserIds] input length=', userIds?.length || 0);
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const tokens = [];
  for (const ids of chunk(userIds, 10)) {
    const snap = await db.collection('devices').where('userId', 'in', ids).get();
    snap.forEach((doc) => {
      const t = doc.get('expoPushToken');
      if (t) tokens.push(t);
    });
  }
  log(
    '[getTokensByUserIds] total tokens=',
    tokens.length,
    'sample=',
    tokens.slice(0, 3).map(maskToken)
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

// ======================================================================
// Exports
// ======================================================================
module.exports = {
  // Firebase
  functions,
  v1functions,
  admin,
  db,

  // Génériques
  chunk,
  dedupe,
  assertRole,
  maskToken,
  safeJson,

  // Public Alerts helpers
  toDigits,
  coerceBool,
  resolveAccentColor,
  localLabel,
  textsBySeverity,
  distanceMeters,
  fmtDist,
  DEFAULT_ALERT_RADIUS_M,
  coerceRadiusM,

  // Expo push
  expoPushSend,
  expoPushSendWithMap,
  summarizeExpoResults,
  cleanInvalidTokens,

  // FCM + Firestore
  sendToToken,
  upsertPublicAlertDoc,

  // Logs & tokens utilitaires
  createDeliveryLog,
  getTokensByCEP,
  getTokensByUserIds,
  errorHandlingWrapper,
};
