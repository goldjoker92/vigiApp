// functions/src/pushPublic.js
// -----------------------------------------------------------------------------
// VigiApp — Public Alert (par adresse complète, CEP optionnel)
// - INPUT: alertId, endereco, lat, lng, radius_m?, severidade?, color?, image?,
//          cep?, bairro?, cidade?, uf?, testToken?, kind?
// - Ciblage par RAYON autour (lat,lng). Priorité geohash+Haversine, fallback scan.
// - CEP: OPTIONNEL (utilisé seulement si l'user n'a pas de géoloc).
// - Rayons par `kind`: publicIncident=1km (défaut), missingChild/missingAnimal/lostObject=3km (prêt).
// - Payload FCM: pt-BR, couleur par gravité, deep-link. Tokens invalides nettoyés.
// - (Optionnel) Enqueue des erreurs transitoires vers pushQueue si présent.
// - ZÉRO régression : répond 200 même sans destinataire, “smoke test” via testToken.
// -----------------------------------------------------------------------------

'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const geofire = require('geofire-common');

// On réutilise utils central (logs, db, fcm, helpers…)
const {
  admin,
  db,
  log,
  warn,
  err,
  toDigits,
  localLabel,
  resolveAccentColor,
  distanceMeters,
  fmtDist,
  resolveRadiusByKind, //  kind-aware
  sendToToken,
  isTransientFcmError,
  isFatalFcmError,
  buildRetryJob, // optionnel retries
} = require('../utils');

// ---------- Texte PT-BR par gravité ----------
function textsBySeverity(sev, local, distText) {
  const sfx = distText
    ? ` (a ${distText}). Abra para mais detalhes.`
    : `. Abra para mais detalhes.`;
  switch ((sev || '').toLowerCase()) {
    case 'low':
    case 'minor':
      return { title: 'VigiApp — Aviso', body: `Aviso informativo em ${local}${sfx}` };
    case 'high':
    case 'grave':
      return { title: 'VigiApp — URGENTE', body: `URGENTE: risco em ${local}${sfx}` };
    case 'medium':
    default:
      return { title: 'VigiApp — Alerta público', body: `Alerta em ${local}${sfx}` };
  }
}

// ---------- Sélection destinataires : geohash + Haversine ----------
async function selectRecipientsGeohash({ lat, lng, radiusM }) {
  const bounds = geofire.geohashQueryBounds([lat, lng], radiusM);
  const out = [];
  const seen = new Set();

  for (const b of bounds) {
    const snap = await db.collection('users').orderBy('geohash').startAt(b[0]).endAt(b[1]).get();

    snap.forEach((doc) => {
      const u = doc.data() || {};
      const tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens.filter(Boolean) : [];
      if (tokens.length === 0) {
        return;
      }

      const uLat = Number(u.lastLocation?.lat ?? u.lastLat);
      const uLng = Number(u.lastLocation?.lng ?? u.lastLng);
      if (!Number.isFinite(uLat) || !Number.isFinite(uLng)) {
        return;
      }

      const d = distanceMeters(lat, lng, uLat, uLng);
      if (d <= radiusM) {
        const uniq = tokens.filter((t) => t && !seen.has(t));
        uniq.forEach((t) => seen.add(t));
        if (uniq.length) {
          out.push({ uid: doc.id, tokens: uniq, _distance_m: d });
        }
      }
    });
  }

  return out;
}

// ---------- Fallback scan (schéma ancien) + CEP optionnel ----------
async function selectRecipientsFallbackScan({ lat, lng, radiusM, cep }) {
  const out = [];
  const seen = new Set();
  const snap = await db.collection('users').limit(3000).get();

  snap.forEach((doc) => {
    const u = doc.data() || {};
    const tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens.filter(Boolean) : [];
    if (tokens.length === 0) {
      return;
    }

    const uLat = Number(u.lastLocation?.lat ?? u.lastLat);
    const uLng = Number(u.lastLocation?.lng ?? u.lastLng);
    const uCep = toDigits(u.cep || '');

    if (Number.isFinite(uLat) && Number.isFinite(uLng)) {
      const d = distanceMeters(lat, lng, uLat, uLng);
      if (d <= radiusM) {
        const uniq = tokens.filter((t) => t && !seen.has(t));
        uniq.forEach((t) => seen.add(t));
        if (uniq.length) {
          out.push({ uid: doc.id, tokens: uniq, _distance_m: d });
        }
      }
      return;
    }

    if (cep && uCep && uCep === cep) {
      const uniq = tokens.filter((t) => t && !seen.has(t));
      uniq.forEach((t) => seen.add(t));
      if (uniq.length) {
        out.push({ uid: doc.id, tokens: uniq, _distance_m: NaN });
      }
    }
  });

  return out;
}

// ---------- Envoi unitaire + ménage + enqueue (transient) ----------
async function safeSend({ token, fcmPayload, uid, alertId, enqueueRetries }) {
  try {
    await sendToToken(fcmPayload);
    return { ok: true };
  } catch (e) {
    const code = e?.errorInfo?.code || e?.code || e?.message || 'unknown';
    // Token mort → on retire
    if (isFatalFcmError(code)) {
      try {
        await db
          .collection('users')
          .doc(uid)
          .update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
          });
        warn('[PUBLIC ALERT] removed invalid token', { uid, token: `${token.slice(0, 16)}…` });
      } catch (remErr) {
        warn('[PUBLIC ALERT] failed to remove token', { uid, err: remErr?.message });
      }
      return { ok: false, fatal: true, code };
    }
    // Erreur transitoire → job de retry si activé
    if (enqueueRetries && isTransientFcmError(code)) {
      const job = buildRetryJob({
        alertId,
        token,
        payload: fcmPayload,
        attempt: 0,
      });
      await db.collection('pushQueue').doc(job._id).set(job, { merge: true });
      return { ok: false, transient: true, code };
    }
    return { ok: false, code };
  }
}

// ---------- Endpoint principal ----------
module.exports.sendPublicAlertByAddress = onRequest(
  { timeoutSeconds: 60, cors: true },
  async (req, res) => {
    const start = Date.now();
    log('[PUBLIC ALERT] START');

    try {
      const b = req.method === 'POST' ? req.body || {} : req.query || {};
      const alertId = String(b.alertId || '').trim();
      const endereco = String(b.endereco || '').trim();
      const cidade = String(b.cidade || '').trim();
      const uf = String(b.uf || '').trim();
      const kind = String(b.kind || 'publicIncident').trim();

      const lat = Number.parseFloat(b.lat);
      const lng = Number.parseFloat(b.lng);

      // Rayon : override si fourni, sinon par kind (1km par défaut)
      const radiusM = resolveRadiusByKind(kind, b.radius_m ?? b.radius);

      // Optionnels
      const bairro = String(b.bairro || '').trim();
      const cep = toDigits(b.cep || '');
      const image = b.image ? String(b.image).trim() : null;
      const severity = String(b.severidade || 'medium');
      const formColor = b.color ? String(b.color).trim() : null;
      const testToken = b.testToken ? String(b.testToken).trim() : null;

      log('[PUBLIC ALERT] req', {
        alertId,
        endereco,
        cidade,
        uf,
        lat,
        lng,
        radiusM,
        kind,
        bairro,
        cep: cep || '(vide/public-optionnel)',
        severity,
        formColor,
        hasImage: !!image,
        testToken: testToken ? `${testToken.slice(0, 12)}…` : null,
      });

      if (!alertId || !endereco || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        warn('[PUBLIC ALERT] Missing params (alertId/endereco/lat/lng)');
        return res.status(400).json({
          ok: false,
          error: 'Params requis: alertId, endereco, lat, lng (radius conseillé)',
        });
      }

      const accent = resolveAccentColor({ severity, formColor });
      const local = localLabel({ endereco, bairro, cidade, uf });

      // ----- Smoke test : 1 token -----
      if (testToken) {
        const { title, body } = textsBySeverity(severity, local, '');
        const deepLink = `vigiapp://alert/public/${alertId}`;
        const payload = {
          token: testToken,
          title,
          body,
          image,
          androidColor: accent,
          data: {
            type: 'alert_public',
            alertId,
            deepLink,
            endereco: local,
            bairro,
            cidade,
            uf,
            cep,
            distancia: '',
            severidade: severity,
            color: accent,
            radius_m: String(radiusM),
            lat: String(lat),
            lng: String(lng),
            ack: '0',
          },
        };
        const r = await safeSend({
          token: testToken,
          fcmPayload: payload,
          uid: '(test)',
          alertId,
          enqueueRetries: false,
        });
        log('[PUBLIC ALERT] Smoke test result', r);
        return res.status(200).json({ ok: true, mode: 'testToken', result: r });
      }

      // ----- Sélection destinataires -----
      log('[PUBLIC ALERT] Selecting recipients… (geohash+Haversine, CEP fallback)');
      let recipients = await selectRecipientsGeohash({ lat, lng, radiusM });
      if (recipients.length === 0) {
        warn('[PUBLIC ALERT] geohash=0 → fallback scan');
        recipients = await selectRecipientsFallbackScan({ lat, lng, radiusM, cep });
      }

      log('[PUBLIC ALERT] recipients =', recipients.length);
      if (recipients.length === 0) {
        warn('[PUBLIC ALERT] No recipients in area.');
        return res.status(200).json({ ok: true, sent: 0, note: 'Aucun destinataire' });
      }

      // ----- Envoi -----
      let sent = 0,
        transient = 0,
        fatal = 0,
        otherErr = 0;

      for (const r of recipients) {
        const distText = Number.isFinite(r._distance_m) ? fmtDist(r._distance_m) : '';
        const { title, body } = textsBySeverity(severity, local, distText);
        const deepLink = `vigiapp://alert/public/${alertId}`;

        for (const token of r.tokens) {
          const result = await safeSend({
            token,
            uid: r.uid,
            alertId,
            enqueueRetries: true,
            fcmPayload: {
              token,
              title,
              body,
              image,
              androidColor: accent,
              data: {
                type: 'alert_public',
                alertId,
                deepLink,
                endereco: local,
                bairro,
                cidade,
                uf,
                cep,
                distancia: distText,
                severidade: severity,
                color: accent,
                radius_m: String(radiusM),
                lat: String(lat),
                lng: String(lng),
                ack: '0',
              },
            },
          });

          if (result.ok) {
            sent += 1;
            continue;
          }
          if (result.fatal) {
            fatal += 1;
            continue;
          }
          if (result.transient) {
            transient += 1;
            continue;
          }
          otherErr += 1;
        }
      }

      const ms = Date.now() - start;
      log('[PUBLIC ALERT] END', { sent, transient, fatal, otherErr, ms });
      return res.status(200).json({ ok: true, sent, transient, fatal, otherErr, ms });
    } catch (e) {
      err('[PUBLIC ALERT] ERROR', e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }
);
