// ============================================================================
// VigiApp — Cloud Functions v2 (Node 20) — INDEX LOW-COST
// HTTP (onRequest) + Firestore Triggers (onDocumentUpdated)
// - Région unique
// - Logs légers (console.* uniquement)
// - Garde-fous anti-boucle / anti-bruit
// - Fallback safe si une lib manque (geoTiles)
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

// ---------- Région & options globales ----------
setGlobalOptions({ region: 'southamerica-east1' });

// ---------- Admin idempotent ----------
try { admin.app(); } catch { admin.initializeApp(); }
const db = () => admin.firestore();

// ===================== HTTP =====================
const { verifyGuardian } = require('./src/verifyguardian');
const { sendPublicAlertByAddress } = require('./src/sendpublicalertbyaddress');

// Garde-fous de chargement
if (typeof verifyGuardian !== 'function') {throw new Error('[index] verifyGuardian export is not a function');}
if (typeof sendPublicAlertByAddress !== 'function') {throw new Error('[index] sendPublicAlertByAddress export is not a function');}

// Profils HTTP sobres
const httpSmall = { cors: true, memory: '128MiB', timeoutSeconds: 30 };
const httpStd   = { cors: true, memory: '256MiB', timeoutSeconds: 60 };

// ===================== Triggers Missing (v2) =====================
const { onCreateMissing } = require('./src/missing/oncreatemissing');
const { onUpdateMissing } = require('./src/missing/onupdtemissing');

// ===================== TRIGGERS Missing (v2) =====================
const { onCreateMissing } = require('./src/missing/oncreatemissing');
const { onUpdateMissing } = require('./src/missing/onupdatemissing');

// Triggers en minuscules (aligné avec ton déploiement)
exports.oncreatemissing = onCreateMissing;
exports.onupdatemissing = onUpdateMissing;

// ===================== Helpers communs (LOW COST) =====================
// Topics FCM sûrs
function sanitizeTopicPart(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\-_.~%]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
}
function tileTopic(tile) {
  return `missing_geo_${sanitizeTopicPart(tile)}`;
}

// Lat/Lng depuis {lat,lng} ou {geo:{lat,lng}} (+ bornes)
function pickLatLng(d) {
  const lat = Number.isFinite(+d?.lat) ? +d.lat : Number.isFinite(+d?.geo?.lat) ? +d.geo.lat : null;
  const lng = Number.isFinite(+d?.lng) ? +d.lng : Number.isFinite(+d?.geo?.lng) ? +d.geo.lng : null;
  if (lat === null || lng === null) {return null;}
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {return null;}
  return { lat, lng };
}

// Diff simple
function diff(a = [], b = []) {
  const A = new Set(a), B = new Set(b);
  return {
    toSub:   [...A].filter((x) => !B.has(x)),
    toUnsub: [...B].filter((x) => !A.has(x)),
  };
}

// Chargement tolérant de geoTiles (évite un crash boot si le module est manquant)
let tilesForRadius = () => [];
try {
  const mod = require('./src/libsMissing/geoTiles');
  if (typeof mod?.tilesForRadius === 'function') {tilesForRadius = mod.tilesForRadius;}
  else {console.debug('[index] geoTiles loaded but tilesForRadius missing, using noop');}
} catch (e) {
  console.debug('[index] geoTiles not found, using noop:', e?.message);
}

// (Un)subscribe sobres (sans spam de logs)
async function subscribeTiles(fcmToken, tiles) {
  for (const t of tiles) { try { await admin.messaging().subscribeToTopic([fcmToken], tileTopic(t)); } catch (_) {} }
}
async function unsubscribeTiles(fcmToken, tiles) {
  for (const t of tiles) { try { await admin.messaging().unsubscribeFromTopic([fcmToken], tileTopic(t)); } catch (_) {} }
}

// ===================== Trigger: devices (LOW COST) =====================
// Kill switch (mets à false pour couper instantanément sans retirer la fonction)
const DEVICE_TILES_ENABLED = true;

// État minimal pertinent pour comparaison idempotente
function stateOf(d) {
  const p = pickLatLng(d);
  return {
    lat: p?.lat ?? null,
    lng: p?.lng ?? null,
    fcm: d?.fcmToken ?? d?.fcm ?? null,
    expo: d?.expoPushToken ?? d?.expo ?? null,
    missingOn: d?.channels?.missingAlerts !== false, // défaut ON
    active: d?.active !== false,                     // défaut ON
  };
}
function stable(o) {
  // JSON stable (clés triées)
  return JSON.stringify(Object.keys(o).sort().reduce((acc, k) => (acc[k] = o[k], acc), {}));
}

// ⚠️ IMPORTANT: on passe en onDocumentUpdated (et on garde le NOM "onwritedevice")
exports.onwritedevice = onDocumentUpdated(
  { document: 'devices/{deviceId}', region: 'southamerica-east1' },
  async (event) => {
    if (!DEVICE_TILES_ENABLED) {return;}

    const before = event.data.before.data() || {};
    const after  = event.data.after.data()  || {};
    const deviceId = event.params.deviceId;

    // 1) Early return si rien d'utile n'a changé (FCM/position/expo/flags)
    const Sbefore = stateOf(before);
    const Safter  = stateOf(after);
    if (stable(Sbefore) === stable(Safter)) {return;}

    // 2) Gating strict: inactif / missing OFF / pas de FCM / pas de position -> miroir vide et sortie
    const posOk = Safter.lat !== null && Safter.lng !== null;
    if (!Safter.active || !Safter.missingOn || !Safter.fcm || !posOk) {
      try {
        await db().collection('devices_missing').doc(deviceId).set({
          userId: after.userId ?? before.userId ?? null,
          fcmToken: Safter.fcm ?? null,
          expoToken: Safter.expo ?? null,
          tiles: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (_) {}
      return;
    }

    // 3) Calcul des tiles — si échec, on sort silencieusement
    let newTiles = [];
    try {
      newTiles = tilesForRadius(Safter.lat, Safter.lng) || [];
      if (!Array.isArray(newTiles) || newTiles.length === 0) {return;}
    } catch { return; }

    const oldTiles = Array.isArray(before?.tiles) ? before.tiles : [];
    const sameTiles = newTiles.length === oldTiles.length && newTiles.every((t, i) => t === oldTiles[i]);

    // 4) (Un)subscribe minimal: si token change → reset total ; sinon diff
    try {
      if (Sbefore.fcm && Safter.fcm && Sbefore.fcm !== Safter.fcm) {
        if (oldTiles.length) {await unsubscribeTiles(Sbefore.fcm, oldTiles);}
        await subscribeTiles(Safter.fcm, newTiles);
      } else if (!sameTiles) {
        const { toSub, toUnsub } = diff(newTiles, oldTiles);
        if (toUnsub.length) {await unsubscribeTiles(Safter.fcm, toUnsub);}
        if (toSub.length)   {await subscribeTiles(Safter.fcm, toSub);}
      }
    } catch (_) {
      // éviter les boucles / logs bruyants
    }

    // 5) Écritures Firestore **minimales** (évite retriggers)
    const writes = [];

    // On n'écrit devices.tiles QUE si ça change
    if (!sameTiles) {
      writes.push(
        db().collection('devices').doc(deviceId).set({
          tiles: newTiles,
          tilesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      );
    }

    // Miroir compact pour debug/admin (utile si token/expo changent)
    writes.push(
      db().collection('devices_missing').doc(deviceId).set({
        userId: after.userId ?? before.userId ?? null,
        fcmToken: Safter.fcm ?? null,
        expoToken: Safter.expo ?? null,
        tiles: newTiles,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true })
    );

    if (writes.length) { try { await Promise.all(writes); } catch (_) {} }

    // Log discret (décommenter si besoin de tracer un cas précis)
    // console.debug('onwritedevice OK', deviceId);
  }
);

// ===================== Log de démarrage =====================
console.log('[Index] loaded', {
  http: ['verifyguardian', 'sendpublicalertbyaddress'],
  triggers: ['oncreatemissing', 'onupdatemissing', 'onwritedevice'],
});
