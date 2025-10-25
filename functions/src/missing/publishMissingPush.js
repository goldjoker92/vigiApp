// =============================================================================
// VigiApp — Publish Missing Push (FCM topics + Expo fanout par tuiles)
// -----------------------------------------------------------------------------
// - Envoie sur topics FCM "missing_geo_<tile>" (mêmes noms que onWriteDevice)
// - Expo: fanout par tiles via /devices_missing (expoToken != null)
// - TTL différent pour created / resolved
// - Logs centralisés (writeNotifLog)
// =============================================================================

const admin = require('firebase-admin');
const db = admin.firestore();

const { tilesForRadius } = require('../libsMissing/geoTiles');

// FCM helpers centralisés (optionnel : vos helpers existants)
const { sendToTopic, TTL_CREATED, TTL_RESOLVED } = require('../libsMissing/fcm');
const { sendExpoBatch } = require('../libsMissing/expoPush');
const { writeNotifLog } = require('../libsMissing/logs');

const NS = '[Missing][Publish]';

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

// -- FCM (topics par tuiles)
async function publishFCMByTiles({ lat, lng, caseId, kind, event, title, body, approx }) {
  const tiles = tilesForRadius(lat, lng);
  const payload = makePayload({ caseId, kind, title, body, approx });
  const ttl = event === 'resolved' ? TTL_RESOLVED : TTL_CREATED;

  let ok = 0, ko = 0;
  for (const t of tiles) {
    const topic = tileTopic(t);
    try {
      await sendToTopic(topic, payload, { ttl });
      ok++;
    } catch (e) {
      console.warn(NS, 'topic_fail', topic, e?.message || e);
      ko++;
    }
  }

  await writeNotifLog(`${caseId}#${event}#fcm`, {
    mode: 'topics',
    tiles, ok, ko, caseId, kind, event, approx
  });

  return { ok, ko, tiles };
}

// -- Expo (fanout via collection devices_missing)
async function publishExpoByTiles({ lat, lng, caseId, kind, event, title, body, approx }) {
  const tiles = tilesForRadius(lat, lng);
  const tokens = new Set();

  // On interroge par tuile; si volume important, penser à batcher/partitionner
  for (const t of tiles) {
    const qs = await db.collection('devices_missing')
      .where('expoToken', '!=', null)
      .where('tiles', 'array-contains', t)
      .limit(500)
      .get();

    qs.forEach(d => {
      const tok = d.data()?.expoToken;
      if (tok) tokens.add(tok);
    });
  }

  const messages = [...tokens].map(to => ({
    to,
    title: title || 'Alerta Missing',
    body: body || '',
    data: { type: 'missing', caseId, kind, approx: approx ? '1' : '0', deepLink: `vigiapp://missing/${caseId}` },
  }));

  const stats = await sendExpoBatch(messages);

  await writeNotifLog(`${caseId}#${event}#expo`, {
    mode: 'expo',
    tiles,
    requested: stats.requested,
    ok: stats.ok,
    ko: stats.ko,
    caseId, kind, event, approx
  });

  return stats;
}

module.exports = {
  publishFCMByTiles,
  publishExpoByTiles,
  makePayload,
};
