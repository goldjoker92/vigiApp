// functions/src/pushPublic.js
// -----------------------------------------------------------------------------
// VigiApp — Public Alert (par adresse complète, CEP optionnel)
// - INPUT: alertId, endereco, lat, lng, radius_m?, severidade?, color?, image?,
//          cep?, bairro?, cidade?, uf?, testToken?, kind?
// - Ciblage par RAYON autour (lat,lng). Priorité geohash+Haversine, fallback scan.
// - CEP: OPTIONNEL (utilisé seulement si l'user n'a pas de géoloc).
// - Rayons par `kind`: publicIncident=1km (défaut), missingChild/missingAnimal/lostObject=3km.
// - Payload FCM: pt-BR, couleur par gravité, deep-link. Tokens invalides nettoyés.
// - (Optionnel) Enqueue des erreurs transitoires vers pushQueue si présent.
// - NEW: Sélection en //, pool d’envoi (20), TTL 600s, footprints 90j, guard x-api-key (optionnel).
// - ZÉRO régression : répond 200 même sans destinataire, “smoke test” via testToken.
// -----------------------------------------------------------------------------

'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const geofire = require('geofire-common');
const { safeForEach } = require('../../safeEach');

// Utils centralisés (logs, db, fcm, helpers…)
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
  resolveRadiusByKind, // kind-aware
  sendToToken,
  isTransientFcmError,
  isFatalFcmError,
  buildRetryJob, // optionnel retries
  recordPublicAlertFootprint, // NEW: empreinte 90j pour heatmap/stat
} = require('../utils');

// ---------- Consts ----------
const DEFAULT_TTL_SECONDS = 600; // NEW: notif “périssable” (10 min)
const SEND_POOL_SIZE = 20; // NEW: débit d’envoi maîtrisé

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

// ---------- Sélection destinataires : geohash + Haversine (PARALLÉLISÉ) ----------
async function selectRecipientsGeohash({ lat, lng, radiusM }) {
  const bounds = geofire.geohashQueryBounds([lat, lng], radiusM);
  if (!Array.isArray(bounds) || bounds.length === 0) {
    return [];
  }

  // Requêtes Firestore en // sur chaque borne
  const snaps = await Promise.all(
    bounds.map(([start, end]) =>
      db.collection('users').orderBy('geohash').startAt(start).endAt(end).get()
    )
  );

  const out = [];
  const seenToken = new Set(); // dédupe cross-bounds
  const seenUid = new Set(); // dédupe uid si nécessaire (pas critique)

  for (const snap of snaps) {
    safeForEach(snap, (doc) => {
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
        const uniq = tokens.filter((t) => t && !seenToken.has(t));
        safeForEach(uniq, (t) => seenToken.add(t));
        if (uniq.length) {
          // on peut garder multi-entrées par uid si distances diff, mais on dédupe léger
          if (!seenUid.has(doc.id)) {
            seenUid.add(doc.id);
          }
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

  safeForEach(snap, (doc) => {
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
        safeForEach(uniq, (t) => seen.add(t));
        if (uniq.length) {
          out.push({ uid: doc.id, tokens: uniq, _distance_m: d });
        }
      }
      return;
    }

    if (cep && uCep && uCep === cep) {
      const uniq = tokens.filter((t) => t && !seen.has(t));
      safeForEach(uniq, (t) => seen.add(t));
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

// ---------- Pool d’envoi (limite de concurrence) ----------
async function sendWithPool(tasks, concurrency = SEND_POOL_SIZE) {
  let idx = 0,
    running = 0,
    ok = 0,
    transient = 0,
    fatal = 0,
    otherErr = 0;

  return new Promise((resolve) => {
    const maybeNext = () => {
      if (idx >= tasks.length && running === 0) {
        return resolve({ ok, transient, fatal, otherErr });
      }
      while (running < concurrency && idx < tasks.length) {
        const myIdx = idx++;
        running += 1;
        tasks[myIdx]()
          .then((r) => {
            if (r?.ok) {
              ok += 1;
            } else if (r?.fatal) {
              fatal += 1;
            } else if (r?.transient) {
              transient += 1;
            } else {
              otherErr += 1;
            }
          })
          .catch(() => {
            otherErr += 1;
          })
          .finally(() => {
            running -= 1;
            maybeNext();
          });
      }
    };
    maybeNext();
  });
}

// ---------- Guard API Key (optionnel) ----------
function checkApiKey(req) {
  const expected = process.env.PUBLIC_ALERT_API_KEY;
  if (!expected) {
    return true;
  } // pas bloquant si non configuré
  const got = req.get('x-api-key') || req.get('X-API-Key') || '';
  if (got && got === expected) {
    return true;
  }
  warn('[PUBLIC ALERT] missing/invalid x-api-key');
  return false;
}

// ---------- Endpoint principal ----------
module.exports.sendPublicAlertByAddress = onRequest(
  { timeoutSeconds: 60, cors: true },
  async (req, res) => {
    const start = Date.now();
    log('[PUBLIC ALERT] START');

    try {
      // Guard optionnel
      if (!checkApiKey(req)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }

      const b = req.method === 'POST' ? req.body || {} : req.query || {};
      const alertId = String(b.alertId || '').trim();
      const endereco = String(b.endereco || '').trim();
      const cidade = String(b.cidade || '').trim();
      const uf = String(b.uf || '').trim();
      const kind = String(b.kind || 'publicIncident').trim();

      const lat = Number.parseFloat(b.lat);
      const lng = Number.parseFloat(b.lng);

      // Rayon : override si fourni, sinon par kind (1km par défaut, 3km pour missing*)
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

      // --- NEW: Empreinte 90j (pour heatmap/stat) — non bloquant
      try {
        await recordPublicAlertFootprint({
          alertId,
          userId: null, // si tu as un userId émetteur, passe-le ici
          kind,
          lat,
          lng,
          radius_m: radiusM,
          endereco,
          bairro,
          cidade,
          uf,
        });
      } catch (fpErr) {
        warn('[PUBLIC ALERT] footprint failed (non-blocking)', fpErr?.message || fpErr);
      }

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
          ttlSeconds: DEFAULT_TTL_SECONDS, // NEW: TTL
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
      log('[PUBLIC ALERT] Selecting recipients… (geohash+Haversine //, CEP fallback)');
      let recipients = await selectRecipientsGeohash({ lat, lng, radiusM });
      if (recipients.length === 0) {
        warn('[PUBLIC ALERT] geohash=0 → fallback scan');
        recipients = await selectRecipientsFallbackScan({ lat, lng, radiusM, cep });
      }

      log('[PUBLIC ALERT] recipients =', recipients.length);
      if (recipients.length === 0) {
        warn('[PUBLIC ALERT] No recipients in area.');
        const ms0 = Date.now() - start;
        return res.status(200).json({
          ok: true,
          sent: 0,
          transient: 0,
          fatal: 0,
          otherErr: 0,
          ms: ms0,
          note: 'Aucun destinataire',
        });
      }

      // ----- Envoi (POOL 20) -----
      const tasks = [];
      for (const r of recipients) {
        const distText = Number.isFinite(r._distance_m) ? fmtDist(r._distance_m) : '';
        const { title, body } = textsBySeverity(severity, local, distText);
        const deepLink = `vigiapp://alert/public/${alertId}`;

        for (const token of r.tokens) {
          tasks.push(() =>
            safeSend({
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
                ttlSeconds: DEFAULT_TTL_SECONDS, // NEW: TTL 10 min
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
            })
          );
        }
      }

      const { ok, transient, fatal, otherErr } = await sendWithPool(tasks, SEND_POOL_SIZE);

      const ms = Date.now() - start;
      log('[PUBLIC ALERT] END', { sent: ok, transient, fatal, otherErr, ms });
      return res.status(200).json({ ok: true, sent: ok, transient, fatal, otherErr, ms });
    } catch (e) {
      err('[PUBLIC ALERT] ERROR', e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }
);
