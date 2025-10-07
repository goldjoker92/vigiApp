// functions/src/ackPublicAlert.js
// =============================================================================
// VigiApp — CF v2: ackPublicAlertReceipt
// - Endpoint: /ackPublicAlertReceipt
// - Idempotent: publicAlerts/{alertId}/acks/{tokenHash}
// - Compteurs: publicAlerts.ackCount ++, devices.pushStats.ack ++ (si deviceId)
// - Reasons: receive | tap | open
// - Debug via debug=1
// =============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');

let _init = false;
function ensureInit() {
  if (_init) {
    return;
  }
  try {
    admin.app();
  } catch {
    admin.initializeApp();
  }
  _init = true;
}
const db = () => admin.firestore();

const sha256Hex = (s) =>
  crypto
    .createHash('sha256')
    .update(String(s || ''), 'utf8')
    .digest('hex');

const nowIso = () => {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
};

function sanitizeAlertId(s) {
  const v = String(s || '').trim();
  if (!v || v.includes('/')) {
    return null;
  }
  return v;
}

function normalizeReason(r) {
  const v = String(r || '')
    .trim()
    .toLowerCase();
  return v === 'tap' || v === 'open' ? v : 'receive';
}

const ackPublicAlertReceipt = onRequest(
  {
    region: 'southamerica-east1',
    cors: true,
    timeoutSeconds: 20,
    memory: '128MiB',
    concurrency: 80,
  },
  async (req, res) => {
    ensureInit();
    res.set('Cache-Control', 'no-store');
    const t0 = Date.now();

    try {
      const b = req.method === 'POST' ? req.body || {} : req.query || {};
      const wantDebug = String(b.debug ?? req.query?.debug) === '1';

      // ---- Inputs
      const alertId = sanitizeAlertId(b.alertId);
      if (!alertId) {
        return res.status(400).json({ ok: false, error: 'alertId invalide' });
      }

      const reason = normalizeReason(b.reason);
      const userId = (b.userId && String(b.userId).trim()) || null;
      const deviceId = (b.deviceId && String(b.deviceId).trim()) || null;
      const platform = (b.platform && String(b.platform).trim()) || null;
      const fcmToken = (b.fcmToken && String(b.fcmToken).trim()) || null;

      const channelId = (b.channelId && String(b.channelId).trim()) || null;
      const appOpenTarget = (b.appOpenTarget && String(b.appOpenTarget).trim()) || null;
      const appVersion = (b.appVersion && String(b.appVersion).trim()) || null;
      const deviceModel = (b.deviceModel && String(b.deviceModel).trim()) || null;

      if (!fcmToken) {
        // On accepte sans token, mais on le note (hash tombera sur fallback userId|platform)
        console.warn('[ACK] fcmToken manquant', { alertId, userId, platform });
      }

      // ---- Idempotence key
      const tokenHash =
        sha256Hex(fcmToken || `${userId || 'nouser'}|${platform || 'unk'}`) || 'nohash';
      const now = FieldValue.serverTimestamp();

      // ---- Write ACK doc (idempotent via docId=tokenHash)
      const ackRef = db().collection('publicAlerts').doc(alertId).collection('acks').doc(tokenHash);
      await ackRef.set(
        {
          tokenHash,
          userId,
          platform,
          channelId,
          appOpenTarget,
          appVersion,
          deviceModel,
          firstSeenAt: now, // ne sera posé qu'au premier passage (merge)
          lastSeenAt: now,
          updatedAtISO: nowIso(),
          count: FieldValue.increment(1),
          reasons: { [reason]: true },
        },
        { merge: true },
      );

      // ---- Global ackCount (best effort)
      db()
        .collection('publicAlerts')
        .doc(alertId)
        .set({ ackCount: FieldValue.increment(1) }, { merge: true })
        .catch((e) => console.warn('[ACK] ackCount increment fail', e?.message || e));

      // ---- Device counters (si fourni)
      if (deviceId) {
        await db()
          .collection('devices')
          .doc(deviceId)
          .set(
            {
              updatedAt: now,
              lastAckAt: now,
              lastAckId: String(alertId),
              pushStats: {
                total: FieldValue.increment(0), // assure la structure
                ack: FieldValue.increment(1),
              },
            },
            { merge: true },
          );
      }

      const out = { ok: true, alertId, tokenHash, reason, ms: Date.now() - t0 };
      if (wantDebug) {
        out.debug = {
          userId,
          deviceId,
          platform,
          channelId,
          appOpenTarget,
          appVersion,
          deviceModel,
        };
      }
      return res.status(200).json(out);
    } catch (e) {
      console.error('[ACK] FATAL', e?.stack || e?.message || e);
      return res
        .status(500)
        .json({ ok: false, error: 'internal', detail: String(e?.message || e) });
    }
  },
);

module.exports = { ackPublicAlertReceipt };
// ============================================================================



