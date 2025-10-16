// ============================================================================
// VigiApp — push-infra (sélection des destinataires + audit + DLQ)
// CommonJS + bootstrap-config facultatif
// Champs par défaut alignés avec ta base: city, cep, lat, lng, active
// Ultra logs pour diagnostic / pas de régression
// ============================================================================

const admin = require('firebase-admin');

// ---------------------------------------------------------------------------
// 1) Bootstrap config
//    - Si ./bootstrap-config exporte { get(k, def) } on l'utilise
//    - Sinon on retombe sur process.env
// ---------------------------------------------------------------------------
let cfg = (k, d) => (process.env[k] !== undefined ? process.env[k] : d);
try {
  const boot = require('../bootstrap-config'); // optionnel
  if (boot && typeof boot.get === 'function') {
    cfg = (k, d) => boot.get(k, d);
    console.log('[PUSH-INFRA][BOOT] bootstrap-config.get ✅');
  } else if (typeof boot === 'function') {
    cfg = boot;
    console.log('[PUSH-INFRA][BOOT] bootstrap-config(fn) ✅');
  } else {
    console.log('[PUSH-INFRA][BOOT] bootstrap-config chargé (fallback env) ℹ️');
  }
} catch {
  console.log('[PUSH-INFRA][BOOT] bootstrap-config absent (fallback env) ℹ️');
}

// ---------------------------------------------------------------------------
// 2) Admin init (idempotent)
// ---------------------------------------------------------------------------
try {
  admin.app();
  console.log('[PUSH-INFRA][BOOT] admin.app() reuse ✅');
} catch {
  admin.initializeApp();
  console.log('[PUSH-INFRA][BOOT] admin.initializeApp() ✅');
}

// ---------------------------------------------------------------------------
// 3) Champs/collections (adaptés à tes docs)
// ---------------------------------------------------------------------------
const DEVICES_COLLECTION = cfg('DEVICES_COLLECTION', 'devices');
const CITY_FIELD = cfg('DEVICE_CITY_FIELD', 'city'); // ← ta base
const CEP_FIELD = cfg('DEVICE_CEP_FIELD', 'cep');
const LAT_FIELD = cfg('DEVICE_LAT_FIELD', 'lat');
const LNG_FIELD = cfg('DEVICE_LNG_FIELD', 'lng');
const CHANNEL_PUBLIC_FIELD = cfg('DEVICE_CHANNEL_PUBLIC_FIELD', 'channels.publicAlerts');
const ENABLED_FIELD = cfg('DEVICE_ENABLED_FIELD', 'active'); // ← ta base
const LAST_SEEN_FIELD = cfg('DEVICE_LAST_SEEN_FIELD', 'lastSeenAt');
const MAX_UNIQ = Number(cfg('PUSH_MAX_UNIQ', '10000')) || 10000;

// ---------------------------------------------------------------------------
// 4) Utils
// ---------------------------------------------------------------------------
const isExpo = (t) => typeof t === 'string' && t.startsWith('ExponentPushToken');

const pickExpoToken = (u) => {
  if (!u) {
    return null;
  }
  if (typeof u.expo === 'string' && isExpo(u.expo)) {
    return u.expo;
  }
  if (typeof u.expoPushToken === 'string' && isExpo(u.expoPushToken)) {
    return u.expoPushToken;
  }
  if (Array.isArray(u.expoTokens) && u.expoTokens.length && isExpo(u.expoTokens[0])) {
    return u.expoTokens[0];
  }
  if (typeof u.token === 'string' && isExpo(u.token)) {
    return u.token;
  }
  return null;
};
const pickFcmToken = (u) => {
  if (!u) {
    return null;
  }
  if (typeof u.fcm === 'string') {
    return u.fcm;
  }
  if (typeof u.fcmToken === 'string') {
    return u.fcmToken;
  }
  if (typeof u.fcmDeviceToken === 'string') {
    return u.fcmDeviceToken;
  }
  if (Array.isArray(u.fcmTokens) && u.fcmTokens.length) {
    return u.fcmTokens[0];
  }
  if (typeof u.token === 'string' && !isExpo(u.token)) {
    return u.token;
  }
  return null;
};

const toNum = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const getNested = (obj, path) =>
  path.split('.').reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj);

function distanceMeters(lat1, lon1, lat2, lon2) {
  const a = [lat1, lon1, lat2, lon2].map(toNum);
  if (a.some((v) => v === null)) {
    return Infinity;
  }
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function uniqByToken(rows) {
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const tok = pickFcmToken(r) || pickExpoToken(r);
    if (!tok || seen.has(tok)) {
      continue;
    }
    seen.add(tok);
    out.push(r);
    if (out.length >= MAX_UNIQ) {
      break;
    }
  }
  return out;
}

function baseDeviceFilter(d) {
  const enabled = ENABLED_FIELD in d ? !!d[ENABLED_FIELD] : true;
  if (!enabled) {
    return false;
  }
  const channel = getNested(d, CHANNEL_PUBLIC_FIELD);
  if (channel === false) {
    return false;
  }
  if (!(pickFcmToken(d) || pickExpoToken(d))) {
    return false;
  }
  return true;
}

// ----------------------------------------------------------------------------
// A) Sélection géo via bounding box + haversine
// ----------------------------------------------------------------------------
async function selectRecipientsGeohash({ lat, lng, radiusM }) {
  const db = admin.firestore();
  const col = db.collection(DEVICES_COLLECTION);

  const metersToDegLat = (m) => m / 111320;
  const metersToDegLng = (m, la) =>
    m / (111320 * Math.max(0.000001, Math.abs(Math.cos((la * Math.PI) / 180))));
  const dLat = metersToDegLat(radiusM);
  const dLng = metersToDegLng(radiusM, lat);
  const minLat = lat - dLat,
    maxLat = lat + dLat;
  const minLng = lng - dLng,
    maxLng = lng + dLng;

  // NB: nécessite lat/lng stockés en Number
  const snap = await col.where(LAT_FIELD, '>=', minLat).where(LAT_FIELD, '<=', maxLat).get();

  const out = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (!baseDeviceFilter(d)) {
      return;
    }
    const la = toNum(d[LAT_FIELD]);
    const ln = toNum(d[LNG_FIELD]);
    if (la === null || ln === null) {
      return;
    }
    if (ln < minLng || ln > maxLng) {
      return;
    }
    const dist = distanceMeters(lat, lng, la, ln);
    if (dist <= radiusM) {
      out.push({ id: doc.id, ...d, distance_m: Math.round(dist) });
    }
  });

  const uniq = uniqByToken(out);
  console.log('[PUSH-INFRA] A.geohash candidates=', out.length, 'unique=', uniq.length, 'bbox=', {
    minLat,
    maxLat,
    minLng,
    maxLng,
  });
  return uniq;
}

// ----------------------------------------------------------------------------
// B) Fallback scan (CEP puis élargissement lat)
// ----------------------------------------------------------------------------
async function selectRecipientsFallbackScan({ lat, lng, radiusM, cep }) {
  const db = admin.firestore();
  const col = db.collection(DEVICES_COLLECTION);
  const cepDigits = String(cep || '').replace(/\D+/g, '');

  if (cepDigits) {
    const outCep = [];
    const snap = await col.where(CEP_FIELD, '==', cepDigits).get();
    snap.forEach((doc) => {
      const d = doc.data();
      if (!baseDeviceFilter(d)) {
        return;
      }
      outCep.push({ id: doc.id, ...d });
    });
    if (outCep.length) {
      const uniqCep = uniqByToken(outCep);
      console.log('[PUSH-INFRA] B.cep unique=', uniqCep.length);
      return uniqCep;
    }
  }

  const dLat = radiusM / 111320;
  const minLat = lat - dLat;
  const maxLat = lat + dLat;
  const snap2 = await col
    .where(LAT_FIELD, '>=', minLat)
    .where(LAT_FIELD, '<=', maxLat)
    .limit(2000)
    .get();

  const out = [];
  const maxLngDelta = radiusM / 111320; // approx
  snap2.forEach((doc) => {
    const d = doc.data();
    if (!baseDeviceFilter(d)) {
      return;
    }
    const la = toNum(d[LAT_FIELD]);
    const ln = toNum(d[LNG_FIELD]);
    if (la === null || ln === null) {
      return;
    }
    if (Math.abs(ln - lng) > maxLngDelta) {
      return;
    }
    const dist = distanceMeters(lat, lng, la, ln);
    if (dist <= radiusM) {
      out.push({ id: doc.id, ...d, distance_m: Math.round(dist) });
    }
  });
  const uniq = uniqByToken(out);
  console.log('[PUSH-INFRA] B.scan unique=', uniq.length);
  return uniq;
}

// ----------------------------------------------------------------------------
// C) Secours par ville (échantillon contrôlé)
// ----------------------------------------------------------------------------
async function selectRecipientsCitySample({ city }) {
  const db = admin.firestore();
  const col = db.collection(DEVICES_COLLECTION);
  const snap = await col.where(CITY_FIELD, '==', String(city)).limit(1000).get();
  const out = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (!baseDeviceFilter(d)) {
      return;
    }
    out.push({ id: doc.id, ...d });
  });
  const uniq = uniqByToken(out);
  console.log('[PUSH-INFRA] C.city unique=', uniq.length);
  return uniq;
}

// ----------------------------------------------------------------------------
// Audit & DLQ
// ----------------------------------------------------------------------------
async function auditPushBlastResult(summary) {
  try {
    const db = admin.firestore();
    await db.collection('pushAudits').add(summary);
    console.log('\n[PUSH-AUDIT][TABLE] summary');
    const rows = [
      { metric: 'recipients', value: summary.recipients || 0 },
      { metric: 'sent', value: summary.sent || 0 },
      { metric: 'sentFCM', value: summary.sentFCM || 0 },
      { metric: 'sentExpo', value: summary.sentExpo || 0 },
      { metric: 'notSent', value: summary.notSent || 0 },
      { metric: 'transient', value: summary.transient || 0 },
      { metric: 'fatal', value: summary.fatal || 0 },
      { metric: 'otherErr', value: summary.otherErr || 0 },
      { metric: 'attemptsAvg', value: summary.attemptsAvg || 0 },
      { metric: 'successPct', value: summary.successPct || 0 },
    ];
    console.table(rows);
    const byCode = summary.byCode || {};
    const entries = Object.entries(byCode).map(([code, count]) => ({ code, count }));
    if (entries.length) {
      console.log('[PUSH-AUDIT][TABLE] byCode');
      console.table(entries);
    }
  } catch (e) {
    console.warn('[PUSH-AUDIT] write_fail', String(e?.message || e));
  }
}

async function enqueueDLQ({ kind, alertId, token, reason }) {
  try {
    const db = admin.firestore();
    await db
      .collection('pushDLQ')
      .add({ kind, alertId, token, reason, ts: admin.firestore.FieldValue.serverTimestamp() });
  } catch (e) {
    console.warn('[PUSH-DLQ] write_fail', String(e?.message || e));
  }
}

module.exports = {
  // sélection
  selectRecipientsGeohash,
  selectRecipientsFallbackScan,
  selectRecipientsCitySample,
  // audit & DLQ
  auditPushBlastResult,
  enqueueDLQ,
  // export des constantes utiles (debug)
  __cfg: {
    DEVICES_COLLECTION,
    CITY_FIELD,
    CEP_FIELD,
    LAT_FIELD,
    LNG_FIELD,
    CHANNEL_PUBLIC_FIELD,
    ENABLED_FIELD,
    LAST_SEEN_FIELD,
    MAX_UNIQ,
  },
};
