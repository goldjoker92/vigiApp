/**
 * utils.js (VERBOSE + CLEAN, NO REGRESSION)
 * ----------------------------------------------------------------------
 * - Init ADMIN (idempotent) + Firestore handle
 * - Logs formatés (exportés) + helpers génériques
 * - Helpers “Public Alerts” (labels, couleurs, distances…)
 * - Rayon de propagation par type d’incident (kind) -> garantit la sélection
 *   des destinataires dans le rayon (par défaut 1 km), extensible 3 km.
 * - Expo push (inchangé) + variantes avec mapping des réponses
 * - FCM wrapper (sendToToken) ✅ channelId + sound corrigés (+ TTL optionnel)
 * - upsertPublicAlertDoc (merge idempotent) -> applique le bon radius
 *   et PRÉSERVE createdAt si le doc existe déjà (pas de casse)
 * - Delivery logs & tokens helpers (Expo + FCM)
 * - Error wrapper
 * - NEW: helpers retries (classification FCM) + job builder (optionnel)
 *   => pipeline “presque 100%” via pushQueue (sans casser l’existant)
 * - NEW: Alert footprints 90j (back-only) → heatmap/statistiques
 * ----------------------------------------------------------------------
 */

/* eslint-env node */
'use strict';

const functions = require('firebase-functions');
const v1functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const geofire = require('geofire-common'); // NEW: geohash pour footprints
const { safeForEach } = require('@/utils/safeEach');


// ======================================================================
// Init admin — idempotent
// ======================================================================
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// ======================================================================
// Logs formatés (exportés)
// ======================================================================
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
  if (!t) {
    return t;
  }
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

// ---- Auth guard (inchangé)
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
// Helpers “Public Alerts” — sélection & UI
// ======================================================================
// Défaut historique (incident public) : 1 km
const DEFAULT_ALERT_RADIUS_M = 1000;

// Rayon de propagation par type d’incident (m)
// -> Extensible à 3000 m pour enfant/animal/objet perdu
const PROPAGATION_RADIUS_BY_KIND_M = Object.freeze({
  publicIncident: 1000, // incident public (actuel)
  missingChild: 3000, // enfant (à venir)
  missingAnimal: 3000, // animal (à venir)
  lostObject: 3000, // objet perdu (à venir)
});

// Style par défaut du cercle (front). L’user est le centre visuel.
// NB: côté back, on utilise ce même radius pour la sélection.
const CIRCLE_STYLE_DEFAULT = Object.freeze({
  radiusM: DEFAULT_ALERT_RADIUS_M,
  strokeColor: '#ef4444',
  strokeWeight: 5,
  fill: false,
});

// Résout le rayon selon kind + override éventuel depuis la payload
function coerceRadiusM(v) {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) {
    return n;
  }
  // On ne spam pas le warn si v est null/undefined: c’est un cas normal géré par resolveRadiusByKind
  if (v !== undefined && v !== null) {
    warn(`[coerceRadiusM] valeur invalide "${v}" -> fallback ${DEFAULT_ALERT_RADIUS_M}m`);
  }
  return DEFAULT_ALERT_RADIUS_M;
}

// ✅ FIX: si radius_m est absent/undefined, on NE court-circuite PAS le mapping par kind
function resolveRadiusByKind(kind, explicitRadiusM) {
  if (explicitRadiusM !== null && explicitRadiusM !== undefined) {
    // accepte 0/valeurs valides, skip null/undefined
    return coerceRadiusM(explicitRadiusM);
  }
  const k = String(kind || '').trim();
  const mapped = PROPAGATION_RADIUS_BY_KIND_M[k];
  return Number.isFinite(mapped) ? mapped : DEFAULT_ALERT_RADIUS_M;
}

function getCircleStyleForKind(kind) {
  const r = resolveRadiusByKind(kind, null);
  return { ...CIRCLE_STYLE_DEFAULT, radiusM: r };
}

const toDigits = (v = '') => String(v).replace(/\D/g, '');
const isHexColor = (c) => /^#?[0-9A-Fa-f]{6}$/.test(String(c || ''));
const normColor = (c) => (String(c || '').startsWith('#') ? String(c) : `#${c}`);

const coerceBool = (v) => {
  if (typeof v === 'boolean') {
    return v;
  }
  return ['true', '1', 'yes', 'on'].includes(String(v).toLowerCase());
};

function resolveAccentColor({ severity, formColor }) {
  if (formColor && isHexColor(formColor)) {
    return normColor(formColor);
  }
  if (severity === 'high' || severity === 'grave') {
    return '#FF3B30';
  }
  if (severity === 'low' || severity === 'minor') {
    return '#FFE600';
  }
  if (severity === 'medium') {
    return '#FFA500';
  }
  return '#0A84FF';
}

function localLabel({ endereco, bairro, cidade, uf }) {
  if (endereco) {
    return endereco;
  }
  if (bairro) {
    return bairro;
  }
  if (cidade && uf) {
    return `${cidade}/${uf}`;
  }
  if (cidade) {
    return cidade;
  }
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

// Distance Haversine (m) — utile pour filtrage précis (post-geohash)
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
// Expo Push — (inchangé, robuste, loggé)
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
    if (snap.empty) {
      continue;
    }

    const batch = db.batch();
    safeForEach(snap, (doc) =>  {
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
// FCM wrapper — ✅ canal & son corrigés + data stringifiée (+ TTL optionnel)
// ======================================================================
function stringifyDataValues(obj) {
  // FCM data = { [key: string]: string } ; éviter undefined/null → ''
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = v === undefined || v === null ? '' : String(v);
  }
  return out;
}

/**
 * Envoi direct FCM vers un device token.
 * - Conserve la signature (pas de casse).
 * - Ajoute un TTL optionnel (en secondes) : utile pour alertes périssables.
 *   -> Si non fourni, pas d'impact.
 */
async function sendToToken({ token, title, body, image, androidColor, data = {}, ttlSeconds }) {
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
      collapseKey: 'vigiapp-public-alert',
      ...(Number.isFinite(ttlSeconds) && ttlSeconds > 0
        ? { ttl: `${Math.floor(ttlSeconds)}s` }
        : {}),
      notification: {
        channelId: 'alerts-high', // ✅ BON CANAL (heads-up)
        color: androidColor || '#FFA500',
        sound: 'default', // ✅ CORRECT
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

  log('[sendToToken] →', maskToken(token), { title, hasImage: !!image, ttlSeconds });
  return admin.messaging().send(message);
}

// ======================================================================
// Firestore — upsert publicAlerts/{alertId} (merge idempotent)
// -> GARANTIT que le doc possède le radius correct (kind-aware)
// -> PRÉSERVE createdAt si le doc existe déjà (sinon on le crée)
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
  radius_m, // optionnel : si absent, résolu via `kind`
  severity,
  accent,
  image,
  expiresAt,
  kind, // publicIncident (default) / missingChild / missingAnimal / lostObject
}) {
  const ref = db.collection('publicAlerts').doc(alertId);

  // Lecture préalable pour préserver createdAt si déjà présent (no regression)
  const prev = await ref.get();
  const prevCreatedAt = prev.exists ? prev.get('createdAt') || null : null;

  const payload = {
    // Schéma front
    titulo: titulo || descricao || 'Alerta público',
    descricao: descricao || 'Alerta público',
    endereco: endereco || null,
    cidade: cidade || null,
    uf: uf || null,
    cep: cep || null,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,

    // ✅ Radius appliqué côté back (override si fourni)
    radius_m: resolveRadiusByKind(kind, radius_m),

    status: 'active',
    createdAt: prevCreatedAt || admin.firestore.FieldValue.serverTimestamp(), // préserve si existe
    expiresAt,

    // Meta UI
    gravidade: severity || 'medium',
    color: accent || null,
    image: image || null,

    // Compat legacy (ne rien casser)
    ruaNumero: endereco || null,
    estado: uf || null,
    location: {
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
    },

    // Info
    kind: kind || 'publicIncident',
  };

  log('[upsertPublicAlertDoc] publicAlerts/%s ←', alertId, safeJson(payload, 500));
  await ref.set(payload, { merge: true }); // idempotent
  return { id: alertId };
}

// ======================================================================
// Delivery & tokens
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

// ---- EXPO TOKENS (inchangé)
async function getTokensByCEP(cep) {
  log('[getTokensByCEP] cep=', cep);
  const snap = await db.collection('devices').where('cep', '==', cep).get();
  const tokens = [];
  safeForEach(snap, (doc) => {
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
    safeForEach(snap, (doc) => {
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
    tokens.slice(0, 3).map(maskToken)
  );
  return tokens;
}

// ---- FCM TOKENS (nouveaux helpers — reco prod Android)
async function getFcmTokensByCEP(cep) {
  log('[getFcmTokensByCEP] cep=', cep);
  const snap = await db.collection('devices').where('cep', '==', cep).get();
  const tokens = [];
 safeForEach(snap, (doc) =>  {
    const t = doc.get('fcmToken');
    if (t) {
      tokens.push(t);
    }
  });
  log('[getFcmTokensByCEP] found=', tokens.length, 'sample=', tokens.slice(0, 3).map(maskToken));
  return tokens;
}

async function getFcmTokensByUserIds(userIds) {
  log('[getFcmTokensByUserIds] input length=', userIds?.length || 0);
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }
  const tokens = [];
  for (const ids of chunk(userIds, 10)) {
    const snap = await db.collection('devices').where('userId', 'in', ids).get();
    safeForEach(snap, (doc) =>  {
      const t = doc.get('fcmToken');
      if (t) {
        tokens.push(t);
      }
    });
  }
  log(
    '[getFcmTokensByUserIds] total tokens=',
    tokens.length,
    'sample=',
    tokens.slice(0, 3).map(maskToken)
  );
  return tokens;
}

// ======================================================================
// Error wrapper (avec durée)
// ======================================================================
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
// NEW — Helpers retries (optionnels, pour fan-out + worker sans régression)
// ======================================================================
// Classification minimaliste des erreurs FCM
function isTransientFcmError(code) {
  // codes “recoverable” connus/équivalents
  return [
    'messaging/internal-error',
    'messaging/server-unavailable',
    'messaging/unavailable',
    'messaging/timeout',
    'messaging/quota-exceeded', // throttling possible → retry
  ].includes(String(code || '').toLowerCase());
}
function isFatalFcmError(code) {
  // tokens invalides/inexistants → à nettoyer
  return [
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
  ].includes(String(code || '').toLowerCase());
}

// Construction d’un job de retry idempotent (alertId+token)
function buildRetryJob({ alertId, token, payload, attempt = 0 }) {
  const crypto = require('crypto');
  const _id = crypto.createHash('sha256').update(`${alertId}:${token}`).digest('hex');
  return {
    _id,
    alertId,
    token,
    payload, // { title, body, data, androidColor, image }
    status: 'pending',
    attempt,
    nextRunAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// ======================================================================
// NEW — Alert footprints (90j) — stats pour heatmap, back-only
// ======================================================================
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Enregistre une empreinte d'alerte (cercle) pour heatmap/statistiques.
 * - N'affecte pas le front → purement back “analytics”.
 * - Prépare TTL via expireAt (+90j) si Firestore TTL est activé.
 * - Ajoute geohash pour requêtes rapides (bbox/center).
 */
async function recordPublicAlertFootprint({
  alertId,
  userId = null,
  kind = 'publicIncident',
  lat,
  lng,
  radius_m,
  endereco = null,
  bairro = null,
  cidade = null,
  uf = null,
  createdAt = null, // optionnel (si pas fourni → serverTimestamp)
}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius_m)) {
    warn('[recordPublicAlertFootprint] invalid lat/lng/radius', { lat, lng, radius_m });
    return null;
  }

  const now = Date.now();
  const expireAt = new Date(now + NINETY_DAYS_MS);
  const geohash = geofire.geohashForLocation([lat, lng]);

  const doc = {
    alertId,
    userId,
    kind,
    lat,
    lng,
    radius_m,
    geohash,
    endereco: endereco || null,
    bairro: bairro || null,
    cidade: cidade || null,
    uf: uf || null,
    createdAt: createdAt || admin.firestore.FieldValue.serverTimestamp(),
    expireAt, // ← pour TTL Firestore (si activé)
  };

  const ref = await db.collection('alertFootprints').add(doc);
  log('[recordPublicAlertFootprint] add alertFootprints/%s ← %s', ref.id, safeJson(doc, 400));
  return { id: ref.id };
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

  // Logs & tools
  log,
  warn,
  err,
  safeJson,
  maskToken,

  // Génériques
  chunk,
  dedupe,
  assertRole,

  // Public Alerts helpers
  toDigits,
  coerceBool,
  resolveAccentColor,
  localLabel,
  textsBySeverity,
  distanceMeters,
  fmtDist,

  // Propagation & cercle (front/back cohérents)
  DEFAULT_ALERT_RADIUS_M,
  PROPAGATION_RADIUS_BY_KIND_M,
  CIRCLE_STYLE_DEFAULT,
  resolveRadiusByKind,
  getCircleStyleForKind,
  coerceRadiusM,

  // Expo push
  expoPushSend,
  expoPushSendWithMap,
  summarizeExpoResults,
  cleanInvalidTokens,

  // FCM + Firestore
  sendToToken,
  upsertPublicAlertDoc,

  // Logs & tokens utilitaires — Expo
  createDeliveryLog,
  getTokensByCEP,
  getTokensByUserIds,

  // Logs & tokens utilitaires — FCM (nouveaux)
  getFcmTokensByCEP,
  getFcmTokensByUserIds,

  errorHandlingWrapper,

  // Retries (optionnels)
  isTransientFcmError,
  isFatalFcmError,
  buildRetryJob,

  // NEW — Heatmap footprints
  NINETY_DAYS_MS,
  recordPublicAlertFootprint,
};
