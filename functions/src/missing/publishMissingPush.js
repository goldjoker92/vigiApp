// =============================================================================
// VigiApp — Publish Missing Push (FCM topics + Expo fanout par tuiles)
// -----------------------------------------------------------------------------
// - Envoie sur topics FCM "missing_geo_<tile>" (mêmes noms que onWriteDevice)
// - Expo: fanout par tiles via /devices_missing (expoToken != null)
// - TTL différent pour created / resolved
// - Logs centralisés (writeNotifLog)
// - Logs emoji très visibles 👀
// =============================================================================

const admin = require('firebase-admin');
const db = admin.firestore();

const { tilesForRadius } = require('../libsMissing/geoTiles');

// FCM helpers centralisés (optionnel : vos helpers existants)
const { sendToTopic, TTL_CREATED, TTL_RESOLVED } = require('../libsMissing/fcm');
const { sendExpoBatch } = require('../libsMissing/expoPush');
const { writeNotifLog } = require('../libsMissing/logs');

const NS = '🧭 [Missing][Publish]';

// -- Topics helpers : même règle que côté onWriteDevice
function sanitizeTopicPart(s) {
  return String(s || '')
    .replace(/[^a-zA-Z0-9\-_.~%]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
}
function tileTopic(tile) {
  return `missing_geo_${sanitizeTopicPart(tile)}`;
}

// -- Utils
const nowIso = () => new Date().toISOString();
const log  = (step, extra = {}) => console.log(`${NS} ${step}`, { t: nowIso(), ...extra });
const warn = (step, extra = {}) => console.warn(`${NS} ${step}`, { t: nowIso(), ...extra });
const err  = (step, extra = {}) => console.error(`${NS} ${step}`, { t: nowIso(), ...extra });

function maskToken(tok) {
  if (!tok) return null;
  const s = String(tok);
  if (s.length <= 8) return '***';
  return `${s.slice(0,4)}…${s.slice(-4)}`;
}

// -- Payload commun
function makePayload({ caseId, kind, title, body, approx }) {
  const data = {
    type: 'missing',
    caseId: String(caseId || ''),
    kind: String(kind || ''),
    approx: approx ? '1' : '0',
    deeplink: `vigiapp://missing/${caseId}`,
  };
  const notification = (title || body) ? { title, body } : undefined;
  return { data, notification };
}

// ✅ FCM (topics par tuiles)
async function publishFCMByTiles({ lat, lng, caseId, kind, event, title, body, approx }) {
  log('🚀 FCM_TILES_START', { lat, lng, caseId, kind, event, approx });

  let tiles = [];
  try {
    tiles = tilesForRadius(lat, lng) || [];
    if (!Array.isArray(tiles) || tiles.length === 0) throw new Error('no_tiles');
  } catch (e) {
    err('💥 FCM_TILES_COMPUTE_FAIL', { caseId, err: e?.message || String(e), lat, lng });
    throw e;
  }

  log('🧩 FCM_TILES_OK', { caseId, tilesCount: tiles.length });

  const payload = makePayload({ caseId, kind, title, body, approx });
  const ttl = event === 'resolved' ? TTL_RESOLVED : TTL_CREATED;

  // Trace payload (sans spam)
  log('📦 FCM_PAYLOAD_BUILD', { caseId, hasNotification: !!payload.notification, ttl });

  let ok = 0, ko = 0;
  const details = [];

  for (const t of tiles) {
    const topic = tileTopic(t);
    try {
      log('📡 FCM_ABOUT_TO_SEND', { caseId, topic });
      const res = await sendToTopic(topic, payload, { ttl });
      ok++;
      details.push({ topic, ok: true, res: res || 'ok' });
      log('✅ FCM_SENT', { caseId, topic });
    } catch (e) {
      ko++;
      const info = {
        topic,
        ok: false,
        code: e?.code || e?.errorInfo?.code || null,
        msg: e?.message || String(e),
      };
      details.push(info);
      warn('❌ FCM_SEND_FAIL', { caseId, ...info });
    }
  }

  log('🏁 FCM_TILES_END', { caseId, ok, ko, tiles: tiles.length });

  try {
    await writeNotifLog(`${caseId}#${event}#fcm`, {
      mode: 'topics',
      tiles,
      ok,
      ko,
      caseId,
      kind,
      event,
      approx,
      sample: details.slice(0, 10), // éviter d’inonder
    });
  } catch (e) {
    warn('📝 WRITE_NOTIF_LOG_FAIL_FCM', { caseId, err: e?.message || String(e) });
  }

  return { ok, ko, tiles, details };
}

// ✅ Expo (fanout via collection devices_missing)
async function publishExpoByTiles({ lat, lng, caseId, kind, event, title, body, approx }) {
  log('🚀 EXPO_TILES_START', { lat, lng, caseId, kind, event, approx });

  let tiles = [];
  try {
    tiles = tilesForRadius(lat, lng) || [];
    if (!Array.isArray(tiles) || tiles.length === 0) throw new Error('no_tiles');
  } catch (e) {
    err('💥 EXPO_TILES_COMPUTE_FAIL', { caseId, err: e?.message || String(e), lat, lng });
    throw e;
  }

  log('🧩 EXPO_TILES_OK', { caseId, tilesCount: tiles.length });

  const tokens = new Set();
  let queried = 0;

  // On interroge par tuile; si volume important, penser à batcher/partitionner
  for (const t of tiles) {
    try {
      log('🔎 EXPO_QUERY_TILE', { caseId, tile: t });
      const qs = await db
        .collection('devices_missing')
        .where('expoToken', '!=', null)
        .where('tiles', 'array-contains', t)
        .limit(500)
        .get();

      queried += qs.size || 0;
      qs.forEach(d => {
        const tok = d.data()?.expoToken;
        if (tok) tokens.add(tok);
      });
    } catch (e) {
      warn('⚠️ EXPO_QUERY_TILE_FAIL', { caseId, tile: t, err: e?.message || String(e) });
    }
  }

  const tokenArr = [...tokens];
  log('🧮 EXPO_TOKENS_COLLECTED', {
    caseId,
    uniqueTokens: tokenArr.length,
    docsQueried: queried,
    sample: tokenArr.slice(0, 5).map(maskToken),
  });

  if (tokenArr.length === 0) {
    warn('⚠️ EXPO_NO_TOKENS', { caseId });
    try {
      await writeNotifLog(`${caseId}#${event}#expo`, {
        mode: 'expo',
        tiles,
        requested: 0,
        ok: 0,
        ko: 0,
        caseId, kind, event, approx
      });
    } catch (e) {
      warn('📝 WRITE_NOTIF_LOG_FAIL_EXPO_EMPTY', { caseId, err: e?.message || String(e) });
    }
    return { requested: 0, ok: 0, ko: 0, details: [] };
  }

  const messages = tokenArr.map(to => ({
    to,
    title: title || 'Alerta Missing',
    body: body || '',
    data: {
      type: 'missing',
      caseId,
      kind,
      approx: approx ? '1' : '0',
      deepLink: `vigiapp://missing/${caseId}`,
    },
  }));

  // Envoi
  log('📡 EXPO_ABOUT_TO_SEND', { caseId, requested: messages.length });

  let stats = { requested: messages.length, ok: 0, ko: 0, details: [] };
  try {
    const res = await sendExpoBatch(messages);
    // On standardise au cas où la lib renvoie une autre forme
    stats.requested = res?.requested ?? messages.length;
    stats.ok = res?.ok ?? 0;
    stats.ko = res?.ko ?? 0;
    stats.details = res?.details ?? [];

    // Log court + extrait
    log('✅ EXPO_SENT', {
      caseId,
      ok: stats.ok,
      ko: stats.ko,
      sample: stats.details.slice(0, 5),
    });
  } catch (e) {
    err('💥 EXPO_SEND_FAIL', { caseId, err: e?.message || String(e) });
    stats = { requested: messages.length, ok: 0, ko: messages.length, details: [{ error: e?.message || String(e) }] };
  }

  // Log applicatif
  try {
    await writeNotifLog(`${caseId}#${event}#expo`, {
      mode: 'expo',
      tiles,
      requested: stats.requested,
      ok: stats.ok,
      ko: stats.ko,
      caseId, kind, event, approx,
      sample: stats.details.slice(0, 10),
    });
  } catch (e) {
    warn('📝 WRITE_NOTIF_LOG_FAIL_EXPO', { caseId, err: e?.message || String(e) });
  }

  log('🏁 EXPO_TILES_END', { caseId, ok: stats.ok, ko: stats.ko, tiles: tiles.length });
  return stats;
}

module.exports = {
  publishFCMByTiles,
  publishExpoByTiles,
  makePayload,
};
