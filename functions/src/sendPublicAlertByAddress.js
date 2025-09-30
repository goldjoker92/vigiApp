// ============================================================================
// VigiApp — Public Alert (HTTP Cloud Function, prod-grade)
// ----------------------------------------------------------------------------
// - Admin init idempotent
// - Upsert Firestore publicAlerts/{alertId}
// - Sélection destinataires prioritaire GEO → widen → CEP → city sample
// - Envoi FCM robuste: batch 500, retry transitoires, DLQ tokens morts
// - Logs & métriques: counts, % succès, moy. tentatives, byCode, samples
// - Audit Firestore pushAudits/{autoId}
// - Anti-timeout: fast-exit si 0 dest., micro-yield entre batchs
// - Couleur Android: normalisée et envoyée SEULEMENT si valide + non désactivée
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

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

let selectRecipientsGeohash,
  selectRecipientsFallbackScan,
  selectRecipientsCitySample,
  auditPushBlastResult,
  enqueueDLQ;
try {
  ({
    selectRecipientsGeohash,
    selectRecipientsFallbackScan,
    selectRecipientsCitySample,
    auditPushBlastResult,
    enqueueDLQ,
  } = require('../lib/push-infra'));
} catch {
  /* soft-fail, les helpers resteront undefined → recipients=0 */
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

// -- FCM bas niveau
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

// Retry exponentiel + jitter pour erreurs transitoires, avec rapport d’attentes
async function sendWithRetry(token, message, { max = 3 } = {}) {
  let attempt = 0;
  let last;
  while (attempt < max) {
    attempt += 1;
    const r = await sendFCM(token, message);
    if (r.ok || r.fatal) {
      return { ...r, attempts: attempt };
    }
    last = r; // transient
    const base = 200 * Math.pow(2, attempt - 1); // 200, 400, 800...
    const jitter = Math.floor(Math.random() * 100);
    const wait = Math.min(2000, base + jitter);
    console.warn('[ALERT_API] retry', { token: maskToken(token), attempt, code: r.code, wait });
    await new Promise((res) => setTimeout(res, wait));
  }
  return { ...(last || {}), attempts: max };
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
    const androidColor = normalizeAndroidColor(accent);
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

    // -- Mode test : un seul device (n’affecte pas la sélection publique)
    if (testToken) {
      const { title, body } = textsBySeverity(severity, local, '');
      const androidNotif = {
        channelId: ANDROID_CHANNEL_ID,
        ...(androidColor ? { color: androidColor } : {}),
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
      const r = await sendWithRetry(testToken, msg, { max: 3 });
      console.log('[ALERT_API] testToken result', r);
      // On continue le flux public en parallèle (pas de return ici) ? Non: tests unitaires → on return.
      return res.status(200).json({ ok: true, mode: 'testToken', result: r, ms: Date.now() - t0 });
    }

    // -------------------------
    // Métriques agrégées blast
    // -------------------------
    const metrics = {
      t0,
      params: { alertId, lat, lng, radiusM, severity, cep: cep || '' },
      recipients: 0,
      sent: 0,
      transient: 0,
      fatal: 0,
      otherErr: 0,
      attemptsTotal: 0,
      byCode: {},
      samples: { fatal: [], transient: [], other: [] }, // max 20 chacun
    };

    // -- Sélection destinataires (A → B → widen → C)
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

      if (recipients.length === 0 && typeof selectRecipientsCitySample === 'function' && cidade) {
        console.warn('[ALERT_API] C=0 → city sample', { cidade });
        recipients = await selectRecipientsCitySample({ city: cidade });
      }
    } else {
      console.warn('[ALERT_API] Sélection destinataires NON branchée → recipients=0');
    }

    metrics.recipients = recipients.length;
    console.log('[ALERT_METRICS] selection', {
      alertId,
      recipients: metrics.recipients,
      radiusM,
      severity,
      cep: cep || '(vide)',
    });

    if (metrics.recipients === 0) {
      const ms0 = Date.now() - t0;
      const summary0 = {
        alertId,
        geo: { lat, lng, radiusM },
        recipients: 0,
        sent: 0,
        notSent: 0,
        transient: 0,
        fatal: 0,
        otherErr: 0,
        byCode: {},
        attemptsAvg: 0,
        successPct: 0,
        ms: ms0,
      };
      console.log('[ALERT_METRICS] summary', summary0);
      // Audit minimal
      try {
        if (typeof auditPushBlastResult === 'function') {
          await auditPushBlastResult({
            ...summary0,
            kind: 'publicIncident',
            cidade,
            uf,
            cep,
            ts: admin.firestore.FieldValue.serverTimestamp(),
            samples: metrics.samples,
          }).catch(() => {});
        } else {
          await admin
            .firestore()
            .collection('pushAudits')
            .add({
              ...summary0,
              kind: 'publicIncident',
              cidade,
              uf,
              cep,
              ts: admin.firestore.FieldValue.serverTimestamp(),
              samples: metrics.samples,
            });
        }
      } catch (e) {
        console.warn('[ALERT_METRICS] audit_write_fail', String(e?.message || e));
      }
      return res.status(200).json({ ok: true, ...summary0 });
    }

    // -- Envoi batché (avec retry & métriques)
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
          const r = await sendWithRetry(u.token, msg, { max: 3 });
          metrics.attemptsTotal += r.attempts || 1;

          if (r.ok) {
            return { kind: 'sent' };
          }

          const code = r.code || 'unknown';
          metrics.byCode[code] = (metrics.byCode[code] || 0) + 1;

          if (r.transient) {
            if (metrics.samples.transient.length < 20) {
              metrics.samples.transient.push({
                token: maskToken(u.token),
                code,
                msg: r.msg?.slice(0, 120),
              });
            }
            return { kind: 'transient', code };
          }
          if (r.fatal) {
            if (enqueueDLQ && code === 'messaging/registration-token-not-registered') {
              await enqueueDLQ({
                kind: 'alert_public',
                alertId,
                token: u.token,
                reason: r.msg || r.code,
              });
            }
            if (metrics.samples.fatal.length < 20) {
              metrics.samples.fatal.push({
                token: maskToken(u.token),
                code,
                msg: r.msg?.slice(0, 120),
              });
            }
            return { kind: 'fatal', code };
          }
          if (metrics.samples.other.length < 20) {
            metrics.samples.other.push({
              token: maskToken(u.token),
              code,
              msg: r.msg?.slice(0, 120),
            });
          }
          return { kind: 'other', code };
        }),
      );

      for (const rr of results) {
        if (rr.status !== 'fulfilled') {
          metrics.otherErr += 1;
          continue;
        }
        const k = rr.value?.kind;
        if (k === 'sent') {
          metrics.sent += 1;
        } else if (k === 'transient') {
          metrics.transient += 1;
        } else if (k === 'fatal') {
          metrics.fatal += 1;
        } else {
          metrics.otherErr += 1;
        }
      }

      console.log('[ALERT_METRICS] batch', {
        i,
        sent: metrics.sent,
        transient: metrics.transient,
        fatal: metrics.fatal,
        otherErr: metrics.otherErr,
      });
      await new Promise((r) => setImmediate(r));
    }

    // -- Résumé & audit
    const ms = Date.now() - t0;
    const notSent = Math.max(metrics.recipients - metrics.sent, 0);
    const successPct = metrics.recipients
      ? Math.round((metrics.sent / metrics.recipients) * 1000) / 10
      : 0;
    const denom = metrics.sent + metrics.transient + metrics.fatal + metrics.otherErr;
    const attemptsAvg = denom ? Math.round((metrics.attemptsTotal * 10) / denom) / 10 : 0;

    const summary = {
      alertId,
      geo: { lat, lng, radiusM },
      recipients: metrics.recipients,
      sent: metrics.sent,
      notSent,
      transient: metrics.transient,
      fatal: metrics.fatal,
      otherErr: metrics.otherErr,
      byCode: metrics.byCode,
      attemptsAvg,
      successPct,
      ms,
    };

    console.log('[ALERT_METRICS] summary', summary);

    try {
      if (typeof auditPushBlastResult === 'function') {
        await auditPushBlastResult({
          ...summary,
          kind: 'publicIncident',
          cidade,
          uf,
          cep,
          ts: admin.firestore.FieldValue.serverTimestamp(),
          samples: metrics.samples,
        }).catch(() => {});
      } else {
        await admin
          .firestore()
          .collection('pushAudits')
          .add({
            ...summary,
            kind: 'publicIncident',
            cidade,
            uf,
            cep,
            ts: admin.firestore.FieldValue.serverTimestamp(),
            samples: metrics.samples,
          });
      }
    } catch (e) {
      console.warn('[ALERT_METRICS] audit_write_fail', String(e?.message || e));
    }

    return res.status(200).json({
      ok: true,
      recipients: metrics.recipients,
      sent: metrics.sent,
      transient: metrics.transient,
      fatal: metrics.fatal,
      otherErr: metrics.otherErr,
      byCode: metrics.byCode,
      attemptsAvg,
      successPct,
      ms,
    });
  } catch (e) {
    console.error('[ALERT_API] FATAL', e?.stack || e?.message || e);
    return res.status(500).json({ ok: false, error: 'internal', detail: String(e?.message || e) });
  }
}

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
