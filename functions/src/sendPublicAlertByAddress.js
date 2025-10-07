// functions/src/sendPublicAlertByAddress.js
// =============================================================================
// VigiApp — CF v2: sendPublicAlertByAddress
// - Sélection rayon (Haversine) + filtres (active, channels.publicAlerts)
// - Mode test: testToken (bypass sélection)
// - Dédup par token
// - Incrémente /devices/{id}.pushStats.{attempt|sent|notSent|transient|total}
// - Audit /push_audit/{alertId}
// - Debug via debug=1
// =============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

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
const fcm = () => admin.messaging();

const toNum = (v) => (typeof v === 'string' ? parseFloat(v) : v);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n);
const maskToken = (t) =>
  !t
    ? '(empty)'
    : String(t).length <= 14
      ? String(t)
      : `${String(t).slice(0, 6)}…${String(t).slice(-6)}`;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000,
    toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1),
    dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (!k || seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(x);
  }
  return out;
}

async function bumpPushStats(deviceId, alertId, kind /* attempt|sent|notSent|transient */) {
  if (!deviceId) {
    return;
  }
  await db()
    .collection('devices')
    .doc(deviceId)
    .set(
      {
        deviceId,
        updatedAt: FieldValue.serverTimestamp(),
        lastBlastAt: FieldValue.serverTimestamp(),
        lastBlastId: String(alertId),
        pushStats: {
          total: FieldValue.increment(1),
          [kind]: FieldValue.increment(1),
        },
      },
      { merge: true },
    );
}

const sendPublicAlertByAddress = onRequest(
  {
    region: 'southamerica-east1',
    cors: true,
    timeoutSeconds: 60,
    memory: '256MiB',
    concurrency: 40,
  },
  async (req, res) => {
    ensureInit();
    const t0 = Date.now();

    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, code: 'method_not_allowed' });
      }

      const b = req.body || {};
      const wantDebug = String(b.debug ?? req.query?.debug) === '1';

      const alertId = String(b.alertId || `debug_${Math.random().toString(16).slice(2, 8)}`);
      const endereco = b.endereco || null;
      const bairro = b.bairro || null;
      const cityIn = b.city || b.cidade || null;
      const uf = b.uf || null;
      const cepNorm = b.cep ? String(b.cep).replace(/\D+/g, '').slice(0, 8) : null;

      const lat = clamp(toNum(b.lat), -90, 90);
      const lng = clamp(toNum(b.lng), -180, 180);
      const hasLatLng = isFiniteNum(lat) && isFiniteNum(lng);
      const radiusM = clamp(toNum(b.radius_m) || 1500, 50, 50000);

      const severidade = String(b.severidade || 'medium');
      const color = String(b.color || '#FFA500');

      const testToken = b.testToken || null;
      const testIncludePublic = String(b.testIncludePublic) === '1';
      const _testIncludeAuthor = String(b.testIncludeAuthor) === '1';

      // ---------- Mode test: testToken ----------
      if (testToken) {
        try {
          const msg = {
            token: testToken,
            notification: {
              title: severidade === 'high' ? 'ALERTE VigiApp' : 'Info VigiApp',
              body: endereco
                ? `${endereco}${bairro ? ' · ' + bairro : ''}${cityIn ? ' · ' + cityIn : ''}`
                : 'Alerte public',
            },
            android: { notification: { channelId: 'alerts-high', sound: 'default' } },
            data: {
              type: 'public-alert',
              alertId: String(alertId),
              deepLink: `vigiapp://public-alerts/${alertId}`,
              severidade,
              color,
            },
          };
          const id = await fcm().send(msg);
          const out = {
            ok: true,
            mode: 'testToken',
            result: { ok: true, id, attempts: 1 },
            ms: Date.now() - t0,
          };
          if (wantDebug) {
            out.debug = { sentTo: maskToken(testToken) };
          }
          return res.json(out);
        } catch (e) {
          return res.json({
            ok: true,
            mode: 'testToken',
            result: {
              ok: false,
              fatal: true,
              transient: false,
              code: e?.code || 'messaging/unknown',
              msg: e?.message || String(e),
            },
            ms: Date.now() - t0,
          });
        }
      }

      // ---------- Sélection réelle ----------
      if (!hasLatLng) {
        return res.status(400).json({ ok: false, code: 'bad_geo', msg: 'lat/lng invalides' });
      }

      // Scan simple (remplaçable par bbox/geohash)
      const snap = await db().collection('devices').limit(10000).get();
      const candidates = [],
        excluded = [];
      for (const d of snap.docs) {
        const v = d.data() || {};
        const deviceId = v.deviceId || d.id;

        const active = v.active !== false;
        const chOk = v.channels?.publicAlerts !== false; // par défaut OK
        const fcmTok = v.fcmToken || v.fcm;
        const vLat = toNum(v.lat),
          vLng = toNum(v.lng);
        const geoOk = isFiniteNum(vLat) && isFiniteNum(vLng);

        const reasons = [];
        if (!active) {
          reasons.push('inactive');
        }
        if (!chOk) {
          reasons.push('channel_off');
        }
        if (!fcmTok) {
          reasons.push('no_fcmToken');
        }
        if (!geoOk) {
          reasons.push('no_latlng');
        }

        if (!testIncludePublic) {
          if (cepNorm && v.cep && String(v.cep) !== cepNorm) {
            reasons.push('cep_mismatch');
          }
          if (cityIn && v.city && String(v.city).trim() !== String(cityIn).trim()) {
            reasons.push('city_mismatch');
          }
        }

        let distM = null,
          inRadius = false;
        if (geoOk) {
          distM = haversineMeters(lat, lng, vLat, vLng);
          inRadius = distM <= radiusM;
        }

        if (
          active &&
          chOk &&
          fcmTok &&
          geoOk &&
          inRadius &&
          !reasons.some((r) => /mismatch/.test(r))
        ) {
          candidates.push({ deviceId, fcmToken: fcmTok, lat: vLat, lng: vLng, distM });
        } else {
          excluded.push({ deviceId, reasons, lat: vLat, lng: vLng, distM });
        }
      }

      // includeAuthor: soft — on n’injecte pas de fake, on prend ce qui existe
      const selected = uniqBy(candidates, (x) => x.fcmToken);
      const selectedDeviceIds = selected.map((x) => x.deviceId);

      // ---------- Envoi + métriques ----------
      let sent = 0,
        notSent = 0,
        transient = 0;
      const byCode = {};
      await Promise.all(
        selected.map(async (t) => {
          try {
            await bumpPushStats(t.deviceId, alertId, 'attempt');
            const msg = {
              token: t.fcmToken,
              notification: {
                title: severidade === 'high' ? 'ALERTE VigiApp' : 'Info VigiApp',
                body: endereco
                  ? `${endereco}${bairro ? ' · ' + bairro : ''}${cityIn ? ' · ' + cityIn : ''}`
                  : 'Alerte public',
              },
              android: { notification: { channelId: 'alerts-high', sound: 'default' } },
              data: {
                type: 'public-alert',
                alertId: String(alertId),
                deepLink: `vigiapp://public-alerts/${alertId}`,
                severidade,
                color,
              },
            };
            await fcm().send(msg);
            await bumpPushStats(t.deviceId, alertId, 'sent');
            sent++;
          } catch (e) {
            const code = e?.code || 'messaging/unknown';
            const isTransient = /unavailable|internal|quota|timeout/i.test(String(code));
            await bumpPushStats(t.deviceId, alertId, isTransient ? 'transient' : 'notSent');
            if (isTransient) {
              transient++;
            } else {
              notSent++;
            }
            byCode[code] = (byCode[code] || 0) + 1;
          }
        }),
      );

      const recipients = selected.length;
      const attemptsAvg = recipients ? (sent + notSent + transient) / recipients : 0;
      const successPct = recipients ? Math.round((sent / recipients) * 100) : 0;

      // ---------- Audit ----------
      const audit = {
        alertId,
        endereco,
        bairro,
        city: cityIn || null,
        uf,
        cep: cepNorm,
        geo: { lat, lng, radiusM },
        recipients,
        sent,
        notSent,
        transient,
        byCode,
        selectedDeviceIds,
        ts: admin.firestore.Timestamp.now(),
      };
      db()
        .collection('push_audit')
        .doc(String(alertId))
        .set({ ...audit, createdAt: FieldValue.serverTimestamp() }, { merge: true })
        .catch(() => {});

      const out = {
        ok: true,
        alertId,
        geo: { lat, lng, radiusM },
        recipients,
        sent,
        notSent,
        transient,
        fatal: 0,
        otherErr: 0,
        byCode,
        attemptsAvg,
        successPct,
        ms: Date.now() - t0,
      };
      if (wantDebug) {
        out.debug = {
          selectedDeviceIds,
          sampleSelected: selected
            .slice(0, 5)
            .map((x) => ({
              id: x.deviceId,
              distM: Math.round(x.distM || 0),
              token: maskToken(x.fcmToken),
            })),
          sampleExcluded: excluded.slice(0, 5),
          counts: { candidates: candidates.length, excluded: excluded.length },
        };
      }
      return res.json(out);
    } catch (e) {
      console.error('sendPublicAlertByAddress ❌', e?.stack || e?.message || e);
      return res.status(500).json({ ok: false, code: 'exception', msg: e?.message || String(e) });
    }
  },
);

module.exports = { sendPublicAlertByAddress };
// ============================================================================


