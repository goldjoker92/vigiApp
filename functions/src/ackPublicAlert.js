// functions/ackPublicAlert.js
// ============================================================================
// VigiApp — ACK Public Alert Receipt (HTTP Cloud Function)
// ----------------------------------------------------------------------------
// - Endpoint: /ackPublicAlertReceipt
// - Idempotent par alertId + tokenHash
// - Stockage: publicAlerts/{alertId}/acks/{tokenHash}
// - Champs: userId, platform, reasons{receive,tap}, firstSeenAt, lastSeenAt, count
// - Incrémente publicAlerts.{ackCount} (compteur global)
// - Durci: validation d'entrée, reason normalisée, no-store, logs clairs
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

try {
  admin.app();
} catch {
  admin.initializeApp();
}

// --- Utils -------------------------------------------------------------------
function sha256Hex(s) {
  try { return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex'); }
  catch { return null; }
}

function nowIso() {
  try { return new Date().toISOString(); } catch { return String(Date.now()); }
}

// Firestore docId ne doit pas contenir '/'; on interdit aussi vide/space
function sanitizeAlertId(s) {
  const v = String(s || '').trim();
  if (!v || v.includes('/')) {
    return null;
  }
  return v;
}

// Force {receive|tap} (default receive)
function normalizeReason(r) {
  const v = String(r || '').trim().toLowerCase();
  return v === 'tap' ? 'tap' : 'receive';
}

async function handleAck(req, res) {
  // Anti-cache proxy/CDN
  res.set('Cache-Control', 'no-store');

  const t0 = Date.now();
  try {
    const b = req.method === 'POST' ? (req.body || {}) : (req.query || {});

    // --- Lecture & normalisation d'entrée -----------------------------------
    const alertId = sanitizeAlertId(b.alertId);
    const reason = normalizeReason(b.reason);
    const userId = String(b.userId || '').trim();
    const platform = String(b.platform || '').trim();
    const fcmToken = String(b.fcmToken || '').trim();
    const channelId = String(b.channelId || '').trim();
    const appOpenTarget = String(b.appOpenTarget || '').trim();

    // (facultatif mais utile pour debug futur)
    const appVersion = String(b.appVersion || '').trim();
    const deviceModel = String(b.deviceModel || '').trim();

    if (!alertId) {
      return res.status(400).json({ ok: false, error: 'alertId invalide' });
    }
    if (!fcmToken) {
      // Certains appareils peuvent ACK sans token lisible → on accepte mais on log
      console.warn('[ACK] fcmToken manquant', { alertId, userId, platform });
    }

    // --- Idempotence par tokenHash (fallback userId|platform si pas de token) -
    const tokenHash = sha256Hex(fcmToken || `${userId}|${platform}`) || 'nohash';

    // --- Ecriture Firestore ---------------------------------------------------
    const db = admin.firestore();
    const ackRef = db.collection('publicAlerts').doc(alertId).collection('acks').doc(tokenHash);
    const now = admin.firestore.FieldValue.serverTimestamp();

    // Merge atomique des raisons + timestamps
    const update = {
      userId: userId || null,
      platform: platform || null,
      tokenHash,
      channelId: channelId || null,
      appOpenTarget: appOpenTarget || null,
      appVersion: appVersion || null,
      deviceModel: deviceModel || null,
      lastSeenAt: now,
      count: admin.firestore.FieldValue.increment(1),
      [`reasons.${reason}`]: true, // reasons.receive=true / reasons.tap=true
      updatedAtISO: nowIso(),       // inspection rapide utile
    };

    // Si premier passage: on garde firstSeenAt (idempotent grâce au docId = tokenHash)
    await ackRef.set(
      {
        firstSeenAt: now,
        ...update,
      },
      { merge: true },
    );

    // Incrément d’un compteur global best-effort (non bloquant)
    try {
      await db
        .collection('publicAlerts')
        .doc(alertId)
        .set({ ackCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
    } catch (e) {
      console.warn('[ACK] ackCount increment fail', e?.message || e);
    }

    const ms = Date.now() - t0;
    console.log('[ACK] OK', { alertId, reason, tokenHash: tokenHash.slice(0, 10) + '…', ms });
    return res.status(200).json({ ok: true, alertId, tokenHash, reason, ms });
  } catch (e) {
    console.error('[ACK] FATAL', e?.stack || e?.message || e);
    return res.status(500).json({ ok: false, error: 'internal', detail: String(e?.message || e) });
  }
}

const ackPublicAlertReceipt = onRequest(
  {
    region: 'southamerica-east1',
    cors: true,
    timeoutSeconds: 20,
    memory: '128MiB',
    concurrency: 80,
  },
  handleAck,
);

module.exports = { ackPublicAlertReceipt };
