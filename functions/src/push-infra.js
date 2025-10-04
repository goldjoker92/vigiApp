// ============================================================================
// VigiApp — Push Infra (sélection destinataires + fallbacks tolérants)
// Priorité: GEO (lat/lng) → widen progressif → CEP (optionnel) → city sample
// Filtre devices inactifs/obsolètes, dédup tokens, cap global, logs détaillés.
// - Garantit l’inclusion du lanceur si son device est géolocalisé (dist=0)
// - Ignore proprement les tokens Expo pour le canal FCM
// - Ajoute un échantillonnage aléatoire en fallback “city” pour la fairness
// - Traces explicites à chaque étape + métriques de fenêtres GEO
// ============================================================================

const admin = require('firebase-admin');

// -----------------------------
// Paramètres “prod-friendly”
// -----------------------------
const STALE_DEVICE_DAYS = 30; // ignore devices non mis à jour depuis > 30j
const MAX_RECIPIENTS = 10000; // garde-fou global (hard cap)
const GEO_PASS_LIMIT = 20000; // limite soft: nb cand. max à parcourir avant early stop
const WIDEN_FACTOR = 1.3;
const MAX_WIDEN_STEPS = 2;
const CITY_SAMPLE_LIMIT = 1000;

// -----------------------------
// Maths & conversions
// -----------------------------
function toRad(x) {
  return (x * Math.PI) / 180;
}
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000,
    dLat = toRad(lat2 - lat1),
    dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function metersToDegLat(m) {
  return m / 111320;
}
function metersToDegLng(m, lat) {
  // protège cos() à l’équateur et proche ±90°
  const c = Math.max(0.000001, Math.abs(Math.cos((lat * Math.PI) / 180)));
  return m / (111320 * c);
}

// -----------------------------
// Fraîcheur & utilitaires
// -----------------------------
function isFresh(updatedAt) {
  if (!updatedAt) {
    return false;
  }
  const t = updatedAt.toMillis ? updatedAt.toMillis() : new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) {
    return false;
  }
  return (Date.now() - t) / 86400000 <= STALE_DEVICE_DAYS;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dedupeTokens(list) {
  const seen = new Set();
  const out = [];
  for (const r of list) {
    if (!r?.token) {
      continue;
    }
    if (seen.has(r.token)) {
      continue;
    }
    seen.add(r.token);
    out.push(r);
    if (out.length >= MAX_RECIPIENTS) {
      break;
    }
  }
  return out;
}

// -----------------------------
// Normalisation des tokens
// - On cible FCM ici: on ignore les Expo push tokens
// - Tolère fcmToken, fcmDeviceToken, fcmTokens[0] (compat historique)
// -----------------------------
function looksLikeExpoToken(tok) {
  // Expo: typiquement "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
  return typeof tok === 'string' && /^ExponentPushToken\[[A-Za-z0-9\-\_]+\]$/.test(tok);
}
function normalizeFcmTokenFromDevice(d) {
  if (!d) {
    return null;
  }
  let t = null;
  if (typeof d.fcmToken === 'string' && d.fcmToken) {
    t = d.fcmToken;
  } else if (typeof d.fcmDeviceToken === 'string' && d.fcmDeviceToken) {
    t = d.fcmDeviceToken;
  } else if (Array.isArray(d.fcmTokens) && d.fcmTokens.length) {
    t = d.fcmTokens[0];
  }

  if (!t || looksLikeExpoToken(t)) {
    return null;
  } // ⚠️ pas exploitable via FCM admin.messaging
  return t;
}

// -----------------------------
// Fenêtre GEO initiale (lat range → filtrage lng + Haversine)
// -----------------------------
async function queryGeoWindow({ lat, lng, radiusM }) {
  const db = admin.firestore();
  const col = db.collection('devices');

  const dLat = metersToDegLat(radiusM),
    dLng = metersToDegLng(radiusM, lat);
  const minLat = lat - dLat,
    maxLat = lat + dLat,
    minLng = lng - dLng,
    maxLng = lng + dLng;

  console.log('[PUSH_INFRA][GEO] window', {
    lat,
    lng,
    radiusM,
    minLat: +minLat.toFixed(5),
    maxLat: +maxLat.toFixed(5),
    minLng: +minLng.toFixed(5),
    maxLng: +maxLng.toFixed(5),
  });

  // NB: double inégalité Firestore sur un seul champ (lat). Pour lng, filtrage en mémoire.
  const snap = await col
    .where('active', '==', true)
    .where('lat', '>=', minLat)
    .where('lat', '<=', maxLat)
    .get();

  let scanned = 0;
  const candidates = [];
  snap.forEach((doc) => {
    scanned += 1;
    if (scanned > GEO_PASS_LIMIT) {
      return;
    } // early stop si dataset énorme
    const d = doc.data();
    const token = normalizeFcmTokenFromDevice(d);
    if (!token) {
      return;
    }
    if (typeof d?.lat !== 'number' || typeof d?.lng !== 'number') {
      return;
    }
    if (!isFresh(d.updatedAt)) {
      return;
    }
    if (d.lng < minLng || d.lng > maxLng) {
      return;
    }

    candidates.push({
      id: doc.id,
      token,
      lat: d.lat,
      lng: d.lng,
      updatedAt: d.updatedAt,
    });
  });

  console.log('[PUSH_INFRA][GEO] candidates (pre-haversine)', {
    scanned,
    kept: candidates.length,
    earlyStop: scanned > GEO_PASS_LIMIT,
  });

  const recipients = [];
  for (const c of candidates) {
    const dist = haversineMeters(lat, lng, c.lat, c.lng);
    if (dist <= radiusM) {
      recipients.push({ token: c.token, distance_m: Math.round(dist) });
    }
  }
  const unique = dedupeTokens(recipients);
  console.log('[PUSH_INFRA][GEO] unique (post-haversine+dedupe)', unique.length);
  return unique;
}

// -----------------------------
// Sélection principale GEO + widen progressif
// -----------------------------
async function selectRecipientsGeohash({ lat, lng, radiusM }) {
  console.log('[PUSH_INFRA][GEO] START', { lat, lng, radiusM });
  let r = await queryGeoWindow({ lat, lng, radiusM });
  console.log('[PUSH_INFRA][GEO] pass0', { count: r.length });

  let steps = 0,
    current = radiusM;
  while (r.length === 0 && steps < MAX_WIDEN_STEPS) {
    current = Math.min(
      Math.floor(current * WIDEN_FACTOR),
      radiusM * Math.pow(WIDEN_FACTOR, steps + 1),
    );
    steps += 1;
    console.warn('[PUSH_INFRA][GEO] widen', { step: steps, radiusM: current });
    r = await queryGeoWindow({ lat, lng, radiusM: current });
    console.log('[PUSH_INFRA][GEO] pass' + steps, { count: r.length });
  }

  // Info: si le lanceur est bien upserté avec lat/lng, il est inclus ici (dist≈0).
  console.log('[PUSH_INFRA][GEO] DONE', { count: r.length, steps });
  return r;
}

// -----------------------------
// Fallback CEP (tolérant si pas de coords)
// -----------------------------
async function selectRecipientsFallbackScan({ lat, lng, radiusM, cep }) {
  if (!cep) {
    console.log('[PUSH_INFRA][CEP] no CEP → skip');
    return [];
  }
  const db = admin.firestore();
  const col = db.collection('devices');

  const snap = await col.where('active', '==', true).where('cep', '==', String(cep)).get();
  const out = [];
  let scanned = 0,
    kept = 0;

  snap.forEach((doc) => {
    scanned += 1;
    const d = doc.data();
    const token = normalizeFcmTokenFromDevice(d);
    if (!token) {
      return;
    }
    if (!isFresh(d.updatedAt)) {
      return;
    }

    if (typeof d.lat === 'number' && typeof d.lng === 'number') {
      const dist = haversineMeters(lat, lng, d.lat, d.lng);
      if (dist <= radiusM) {
        out.push({ token, distance_m: Math.round(dist) });
        kept += 1;
      }
    } else {
      // fallback “soft” si pas de coords: on garde quand même
      out.push({ token });
      kept += 1;
    }
  });

  const unique = dedupeTokens(out);
  console.log('[PUSH_INFRA][CEP] unique', { cep, scanned, kept, unique: unique.length });
  return unique;
}

// -----------------------------
// Fallback City sample (fairness: shuffle + cap)
// -----------------------------
async function selectRecipientsCitySample({ city }) {
  if (!city) {
    return [];
  }
  const db = admin.firestore();
  const col = db.collection('devices');

  const snap = await col
    .where('active', '==', true)
    .where('city', '==', String(city))
    .limit(CITY_SAMPLE_LIMIT)
    .get();

  const out = [];
  let scanned = 0,
    kept = 0;

  snap.forEach((doc) => {
    scanned += 1;
    const d = doc.data();
    const token = normalizeFcmTokenFromDevice(d);
    if (!token) {
      return;
    }
    if (!isFresh(d.updatedAt)) {
      return;
    }
    out.push({ token });
    kept += 1;
  });

  // fairness: évite de spammer toujours les mêmes
  shuffleInPlace(out);
  const unique = dedupeTokens(out);
  console.warn('[PUSH_INFRA][CITY] sample', { city, scanned, kept, unique: unique.length });
  return unique;
}

// -----------------------------
// Hooks optionnels
// -----------------------------
async function auditPushBlastResult(payload) {
  // hook de télémétrie: peut être redirigé vers BigQuery / Log-based metrics
  console.log('[PUSH_INFRA][AUDIT]', payload);
}

async function enqueueDLQ({ kind, alertId, token, reason }) {
  const masked = token ? token.slice(0, 6) + '…' + token.slice(-4) : '(empty)';
  console.warn('[PUSH_INFRA][DLQ]', { kind, alertId, token: masked, reason });

  // Optionnel: consigner pour nettoyage ultérieur (batch job)
  try {
    await admin.firestore().collection('deadTokens').add({
      kind,
      alertId,
      token,
      reason,
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[PUSH_INFRA][DLQ] write_fail', String(e?.message || e));
  }
}

module.exports = {
  selectRecipientsGeohash,
  selectRecipientsFallbackScan,
  selectRecipientsCitySample,
  auditPushBlastResult,
  enqueueDLQ,
};
