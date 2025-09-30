// functions/src/sendPublicAlertByAddress.js
// ============================================================================
// VigiApp — Public Alert (HTTP Cloud Function, prod-ready MVP)
// ----------------------------------------------------------------------------
// - Admin init idempotent
// - Upsert Firestore publicAlerts/{alertId}
// - Envoi FCM (title/body/data) robuste, tri erreurs (fatal/transient)
// - Sélection destinataires "soft" (helpers optionnels)
// - Anti-timeout: fast-exit si 0 dest., micro-yield entre batchs
// - Couleur Android: normalisée et envoyée SEULEMENT si valide + non désactivée
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// -- Admin init (idempotent)
try {
  admin.app();
} catch {
  admin.initializeApp();
}

// -- Méta config
const DEFAULT_TTL_SECONDS = 3600; // 1h
const MAX_RADIUS_M = 3000;
const MIN_RADIUS_M = 50;
const DEFAULT_RADIUS_M = 1000;
const ANDROID_CHANNEL_ID = 'alerts-high';
const BATCH_SIZE = 500;

// Kill switch couleur pour prod (mettre DISABLE_FCM_COLOR=true pour couper)
const DISABLE_FCM_COLOR = process.env.DISABLE_FCM_COLOR === 'true';

// -- Helpers optionnels (défauts sûrs si absents)
let textsBySeverity, resolveAccentColor, localLabel;
try {
  ({ textsBySeverity, resolveAccentColor, localLabel } = require('../lib/alert-utils'));
} catch {
  resolveAccentColor = ({ severity, formColor }) =>
    formColor || (severity === 'high' ? '#DC3545' : '#FFA500');
  localLabel = ({ endereco, bairro, cidade, uf }) =>
    [endereco, bairro, [cidade, uf].filter(Boolean).join('/')].filter(Boolean).join(' — ');
  textsBySeverity = (severity, local) => ({
    title: `Alerta ${severity || 'médio'}`,
    body: local || 'Alerta público',
  });
}

let selectRecipientsGeohash, selectRecipientsFallbackScan, auditPushBlastResult, enqueueDLQ;
try {
  ({
    selectRecipientsGeohash,
    selectRecipientsFallbackScan,
    auditPushBlastResult,
    enqueueDLQ,
  } = require('../lib/push-infra'));
} catch {
  /* soft-fail */
}

// -- Utils
function clampRadiusM(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) {
    return DEFAULT_RADIUS_M;
  }
  return Math.max(MIN_RADIUS_M, Math.min(n, MAX_RADIUS_M));
}

// FCM exige "#RRGGBB". Si invalide → undefined (on n'envoie pas la propriété).
function normalizeAndroidColor(color) {
  if (!color || DISABLE_FCM_COLOR) {
    return undefined;
  }
  const hex = String(color).trim();
  const withHash = hex.startsWith('#') ? hex : `#${hex}`;
  return /^#[A-Fa-f0-9]{6}$/.test(withHash) ? withHash : undefined;
}

function maskToken(tok) {
  if (!tok) {
    return '(empty)';
  }
  const s = String(tok);
  return s.length <= 12 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`;
}

// -- Firestore upsert
async function upsertPublicAlertDoc({
  alertId,
  endereco,
  cidade,
  uf,
  bairro,
  lat,
  lng,
  radius_m,
  severidade,
  color,
}) {
  const docRef = admin.firestore().collection('publicAlerts').doc(alertId);
  const payload = {
    type: 'alert_public',
    endereco: endereco || '',
    cidade: cidade || '',
    uf: uf || '',
    bairro: bairro || '',
    status: 'ativo',
    gravidade: severidade || 'médio',
    descricao: 'Alerta público (via endpoint)',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    location:
      Number.isFinite(lat) && Number.isFinite(lng)
        ? { latitude: lat, longitude: lng }
        : admin.firestore.FieldValue.delete(),
    radius_m: Number.isFinite(radius_m) ? radius_m : DEFAULT_RADIUS_M,
    color: color || '#FFA500',
  };
  await docRef.set(payload, { merge: true });
  console.log('[ALERT_API] Firestore upsert publicAlerts/', alertId, '→ OK');
}

// -- FCM
async function sendFCM(token, message) {
  try {
    const id = await admin.messaging().send(message, /* dryRun */ false);
    return { ok: true, id };
  } catch (e) {
    const code = e?.errorInfo?.code || e?.code || '';
    const msg = e?.message || String(e);
    const fatal = [
      'messaging/invalid-argument',
      'messaging/invalid-recipient',
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
    ].includes(code);
    const transient = [
      'messaging/internal-error',
      'messaging/server-unavailable',
      'messaging/unavailable',
      'messaging/unknown-error',
      'deadline-exceeded',
    ].includes(code);
    console.warn('[ALERT_API] FCM SEND FAIL', code, maskToken(token), msg);
    return { ok: false, fatal, transient, code, msg };
  }
}

// -- Handler principal
async function handleSendPublicAlertByAddress(req, res) {
  const t0 = Date.now();
  console.log('[ALERT_API] START sendPublicAlertByAddress');

  try {
    const b = req.method === 'POST' ? req.body || {} : req.query || {};
    const alertId = String(b.alertId || '').trim();
    const endereco = String(b.endereco || '').trim();
    const cidade = String(b.cidade || '').trim();
    const uf = String(b.uf || '').trim();
    const bairro = String(b.bairro || '').trim();
    const severity = String(b.severidade || 'medium').trim();
    const formColor = b.color ? String(b.color).trim() : null;
    const cep = String(b.cep || '').replace(/\D+/g, '');
    const testToken = b.testToken ? String(b.testToken).trim() : null;

    const lat = Number.parseFloat(b.lat);
    const lng = Number.parseFloat(b.lng);

    if (!alertId || !endereco) {
      console.warn('[ALERT_API] 400 missing alertId/endereco');
      return res.status(400).json({ ok: false, error: 'alertId et endereco requis' });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.warn('[ALERT_API] 400 coords invalides', { lat, lng });
      return res
        .status(400)
        .json({ ok: false, error: 'coords invalides (lat/lng numériques requis)' });
    }

    let radiusM = clampRadiusM(b.radius_m ?? b.radius);
    const accent = resolveAccentColor({ severity, formColor });
    const androidColor = normalizeAndroidColor(accent); // ← valide ou undefined
    const local = localLabel({ endereco, bairro, cidade, uf });
    const deepLink = `vigiapp://public-alerts/${alertId}`;

    console.log('[ALERT_API] params', {
      alertId,
      local,
      lat,
      lng,
      radiusM,
      severity,
      cep: cep || '(vide)',
      hasTestToken: !!testToken,
    });

    // -- upsert doc (page /public-alerts/[id])
    await upsertPublicAlertDoc({
      alertId,
      endereco,
      cidade,
      uf,
      bairro,
      lat,
      lng,
      radius_m: radiusM,
      severidade: severity,
      color: accent,
    });

    // -- Mode test : un seul device
    if (testToken) {
      const { title, body } = textsBySeverity(severity, local, '');
      const androidNotif = {
        channelId: ANDROID_CHANNEL_ID,
        ...(androidColor ? { color: androidColor } : {}), // seulement si valide + non désactivée
      };
      const msg = {
        token: testToken,
        notification: { title, body },
        android: { priority: 'high', ttl: DEFAULT_TTL_SECONDS * 1000, notification: androidNotif },
        data: {
          type: 'alert_public',
          alertId,
          deepLink,
          endereco: local,
          bairro,
          cidade,
          uf,
          cep,
          severidade: severity,
          color: accent,
          radius_m: String(radiusM),
          lat: String(lat),
          lng: String(lng),
          ack: '0',
          channelId: ANDROID_CHANNEL_ID,
        },
      };
      const r = await sendFCM(testToken, msg);
      console.log('[ALERT_API] testToken result', r);
      return res.status(200).json({ ok: true, mode: 'testToken', result: r, ms: Date.now() - t0 });
    }

    // -- Sélection destinataires
    let recipients = [];
    if (typeof selectRecipientsGeohash === 'function') {
      console.log('[ALERT_API] select A geohash/haversine…');
      recipients = await selectRecipientsGeohash({ lat, lng, radiusM });

      if (recipients.length === 0 && typeof selectRecipientsFallbackScan === 'function') {
        console.warn('[ALERT_API] A=0 → B fallback scan/CEP…');
        recipients = await selectRecipientsFallbackScan({ lat, lng, radiusM, cep });
      }

      if (recipients.length === 0 && radiusM < MAX_RADIUS_M) {
        const widened = Math.min(Math.floor(radiusM * 1.3), MAX_RADIUS_M);
        console.warn('[ALERT_API] B=0 → widen', { from: radiusM, to: widened });
        const rA = await selectRecipientsGeohash({ lat, lng, radiusM: widened });
        recipients = rA.length
          ? rA
          : typeof selectRecipientsFallbackScan === 'function'
            ? await selectRecipientsFallbackScan({ lat, lng, radiusM: widened, cep })
            : [];
        radiusM = widened;
      }
    } else {
      console.warn('[ALERT_API] Sélection destinataires NON branchée → recipients=0');
    }

    console.log('[ALERT_API] recipients', { count: recipients.length });

    if (recipients.length === 0) {
      const ms0 = Date.now() - t0;
      console.log('[ALERT_API] DONE (no recipients)', { ms: ms0 });
      return res
        .status(200)
        .json({ ok: true, recipients: 0, sent: 0, transient: 0, fatal: 0, otherErr: 0, ms: ms0 });
    }

    // -- Envoi batché
    let sent = 0,
      transient = 0,
      fatal = 0,
      otherErr = 0;
    const { title, body } = textsBySeverity(severity, local, '');

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (u) => {
          const androidNotif = {
            channelId: ANDROID_CHANNEL_ID,
            ...(androidColor ? { color: androidColor } : {}),
          };
          const msg = {
            token: u.token,
            notification: { title, body },
            android: {
              priority: 'high',
              ttl: DEFAULT_TTL_SECONDS * 1000,
              notification: androidNotif,
            },
            data: {
              type: 'alert_public',
              alertId,
              deepLink,
              endereco: local,
              bairro,
              cidade,
              uf,
              cep,
              severidade: severity,
              color: accent,
              radius_m: String(radiusM),
              lat: String(lat),
              lng: String(lng),
              ack: '0',
              channelId: ANDROID_CHANNEL_ID,
              distancia: u.distance_m ? String(Math.round(u.distance_m)) : '',
            },
          };
          const r = await sendFCM(u.token, msg);
          if (r.ok) {
            return { kind: 'sent' };
          }
          if (r.transient) {
            return { kind: 'transient' };
          }
          if (r.fatal) {
            if (enqueueDLQ && r.code === 'messaging/registration-token-not-registered') {
              await enqueueDLQ({
                kind: 'alert_public',
                alertId,
                token: u.token,
                reason: r.msg || r.code,
              });
            }
            return { kind: 'fatal' };
          }
          return { kind: 'other' };
        }),
      );

      for (const rr of results) {
        if (rr.status !== 'fulfilled') {
          otherErr += 1;
          continue;
        }
        const k = rr.value?.kind;
        if (k === 'sent') {
          sent += 1;
        } else if (k === 'transient') {
          transient += 1;
        } else if (k === 'fatal') {
          fatal += 1;
        } else {
          otherErr += 1;
        }
      }

      console.log('[ALERT_API] batch', { i, sent, transient, fatal, otherErr });
      await new Promise((r) => setImmediate(r));
    }

    const ms = Date.now() - t0;
    if (typeof auditPushBlastResult === 'function') {
      await auditPushBlastResult({
        alertId,
        kind: 'publicIncident',
        lat,
        lng,
        radiusM,
        recipients: recipients.length,
        sent,
        transient,
        fatal,
        otherErr,
        ms,
      }).catch(() => {});
    }

    console.log('[ALERT_API] DONE', {
      recipients: recipients.length,
      sent,
      transient,
      fatal,
      otherErr,
      ms,
    });
    return res
      .status(200)
      .json({ ok: true, recipients: recipients.length, sent, transient, fatal, otherErr, ms });
  } catch (e) {
    console.error('[ALERT_API] FATAL', e?.stack || e?.message || e);
    return res.status(500).json({ ok: false, error: 'internal', detail: String(e?.message || e) });
  }
}

// -- Export HTTP v2 (runtime local à la fonction)
const sendPublicAlertByAddress = onRequest(
  {
    region: 'southamerica-east1',
    cors: true,
    timeoutSeconds: 60,
    memory: '256MiB',
    concurrency: 40,
  },
  handleSendPublicAlertByAddress,
);

module.exports = { sendPublicAlertByAddress };
// module.exports._sendPublicAlertByAddressHandler = handleSendPublicAlertByAddress; // si Cloud Run/Express
