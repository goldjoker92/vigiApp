'use strict';

/**
 * pushPublic.js
 * -----------------------------------------------------------------------------
 * VigiApp — Public Alerts (rayon autour d’un centre, CEP optionnel)
 *
 * Endpoints exposés:
 * - sendPublicAlertByAddress (EXISTANT, inchangé)
 * - sendPublicAlertByCenterUser (NOUVEAU) : centre = (lat,lng) ou adresse/CEP (Google-first)
 *
 * Règles produit:
 * - Le CENTRE de propagation n’est JAMAIS "CEP seul".
 * - Adresse/CEP peuvent aider à résoudre un centre, mais s’il n’y a que CEP → 400.
 * - Rayon : par kind (publicIncident=1km, missingChild/Animal/lostObject=3km) ou override radius_m.
 *
 * Sélection:
 * - geohash bounds + Haversine // (prioritaire)
 * - fallback scan (schéma ancien) + CEP comme critère de secours (jamais centre)
 *
 * Envoi:
 * - Pool de 20, TTL 600s, nettoyage tokens invalides, retry en pushQueue pour transitoires
 *
 * Geo:
 * - Google Geocoding (FIRST), fallback OpenCage → LocationIQ
 * - Logs précis pour corrélation front/back
 * -----------------------------------------------------------------------------
 */

const { onRequest } = require('firebase-functions/v2/https');
const geofire = require('geofire-common');
const fetch = require('node-fetch');

// Utils centralisés (déjà présents dans ton repo)
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
  resolveRadiusByKind,
  sendToToken,
  isTransientFcmError,
  isFatalFcmError,
  buildRetryJob,
  recordPublicAlertFootprint,
} = require('../utils');

// ---------- Consts ----------
const DEFAULT_TTL_SECONDS = 600;
const SEND_POOL_SIZE = 20;

// ---------- Texte PT-BR ----------
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
  if (!Array.isArray(bounds) || bounds.length === 0) {return [];}

  const snaps = await Promise.all(
    bounds.map(([start, end]) =>
      db.collection('users').orderBy('geohash').startAt(start).endAt(end).get()
    )
  );

  const out = [];
  const seenToken = new Set();
  const seenUid = new Set();

  for (const snap of snaps) {
    snap.forEach((doc) => {
      const u = doc.data() || {};
      const tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens.filter(Boolean) : [];
      if (tokens.length === 0) {return;}

      const uLat = Number(u.lastLocation?.lat ?? u.lastLat);
      const uLng = Number(u.lastLocation?.lng ?? u.lastLng);
      if (!Number.isFinite(uLat) || !Number.isFinite(uLng)) {return;}

      const d = distanceMeters(lat, lng, uLat, uLng);
      if (d <= radiusM) {
        const uniq = tokens.filter((t) => t && !seenToken.has(t));
        uniq.forEach((t) => seenToken.add(t));
        if (uniq.length) {
          if (!seenUid.has(doc.id)) {seenUid.add(doc.id);}
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
    if (tokens.length === 0) {return;}

    const uLat = Number(u.lastLocation?.lat ?? u.lastLat);
    const uLng = Number(u.lastLocation?.lng ?? u.lastLng);
    const uCep = toDigits(u.cep || '');

    if (Number.isFinite(uLat) && Number.isFinite(uLng)) {
      const d = distanceMeters(lat, lng, uLat, uLng);
      if (d <= radiusM) {
        const uniq = tokens.filter((t) => t && !seen.has(t));
        uniq.forEach((t) => seen.add(t));
        if (uniq.length) {out.push({ uid: doc.id, tokens: uniq, _distance_m: d });}
      }
      return;
    }

    // CEP = critère de SECOURS (pas centre)
    if (cep && uCep && uCep === cep) {
      const uniq = tokens.filter((t) => t && !seen.has(t));
      uniq.forEach((t) => seen.add(t));
      if (uniq.length) {out.push({ uid: doc.id, tokens: uniq, _distance_m: NaN });}
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
    if (isFatalFcmError(code)) {
      try {
        await db.collection('users').doc(uid).update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
        });
        warn('[PUBLIC ALERT] removed invalid token', { uid, token: `${token.slice(0, 16)}…` });
      } catch (remErr) {
        warn('[PUBLIC ALERT] failed to remove token', { uid, err: remErr?.message });
      }
      return { ok: false, fatal: true, code };
    }
    if (enqueueRetries && isTransientFcmError(code)) {
      const job = buildRetryJob({ alertId, token, payload: fcmPayload, attempt: 0 });
      await db.collection('pushQueue').doc(job._id).set(job, { merge: true });
      return { ok: false, transient: true, code };
    }
    return { ok: false, code };
  }
}

// ---------- Pool d’envoi (limite de concurrence) ----------
async function sendWithPool(tasks, concurrency = SEND_POOL_SIZE) {
  let idx = 0, running = 0, ok = 0, transient = 0, fatal = 0, otherErr = 0;

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
            if (r?.ok) {ok++;}
            else if (r?.fatal) {fatal++;}
            else if (r?.transient) {transient++;}
            else {otherErr++;}
          })
          .catch(() => { otherErr++; })
          .finally(() => { running--; maybeNext(); });
      }
    };
    maybeNext();
  });
}

// ---------- Guard API Key (optionnel) ----------
function checkApiKey(req) {
  const expected = process.env.PUBLIC_ALERT_API_KEY;
  if (!expected) {return true;}
  const got = req.get('x-api-key') || req.get('X-API-Key') || '';
  if (got && got === expected) {return true;}
  warn('[PUBLIC ALERT] missing/invalid x-api-key');
  return false;
}

// -----------------------------------------------------------------------------
// Helpers de géocodage (Google-first)
// -----------------------------------------------------------------------------
const normDigits = (s='') => String(s).replace(/\D/g, '');
const buildAddr = ({ endereco, address, cidade, uf, cep }) => {
  const base = (endereco || address || '').trim();
  const parts = [base, cidade, uf, cep && cep.length === 8 ? cep : ''].filter(Boolean);
  return parts.join(', ');
};

async function geocodeGoogle(q) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {return null;}
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=br&language=pt-BR&key=${key}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  const best = j?.results?.[0];
  const loc = best?.geometry?.location;
  if (!loc?.lat || !loc?.lng) {return null;}

  let cep = '';
  const comps = best?.address_components || [];
  const pc = comps.find((c) => (c.types || []).includes('postal_code'));
  if (pc?.long_name) {cep = normDigits(pc.long_name);}

  return {
    lat: Number(loc.lat),
    lng: Number(loc.lng),
    provider: 'google',
    formatted: best?.formatted_address || q,
    cep,
  };
}

async function geocodeOpenCage(q) {
  const key = process.env.OPENCAGE_API_KEY;
  if (!key) {return null;}
  const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(q)}&key=${key}&language=pt&countrycode=br&no_annotations=1&limit=1`;
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  const best = j?.results?.[0];
  if (!best?.geometry) {return null;}
  return {
    lat: Number(best.geometry.lat),
    lng: Number(best.geometry.lng),
    provider: 'opencage',
    formatted: best.formatted || q,
    cep: '',
  };
}

async function geocodeLocationIQ(q) {
  const key = process.env.LOCATIONIQ_KEY;
  if (!key) {return null;}
  const url = `https://us1.locationiq.com/v1/search?key=${key}&q=${encodeURIComponent(q)}&countrycodes=br&format=json&limit=1&normalizeaddress=1`;
  const r = await fetch(url);
  const j = await r.json().catch(() => null);
  const best = Array.isArray(j) ? j[0] : null;
  if (!best?.lat || !best?.lon) {return null;}
  const cep = normDigits(best?.address?.postcode || '');
  return {
    lat: Number(best.lat),
    lng: Number(best.lon),
    provider: 'locationiq',
    formatted: best.display_name || q,
    cep,
  };
}

/**
 * Résout le centre:
 * - Si b.center.lat/lng (ou lat/lng legacy) → pass-through
 * - Sinon, tente Google (FIRST) → OpenCage → LocationIQ en construisant une requête
 *   à partir de (endereco | address, cidade, uf, cep)
 * - Si aucun input pour centrer (ou CEP seul) → erreur
 */
async function resolveCenterSmart({ center, address, endereco, cidade, uf, cep }) {
  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    return {
      ok: true, mode: 'compat', provider: 'client',
      lat: Number(center.lat), lng: Number(center.lng),
      formatted: buildAddr({ endereco, address, cidade, uf, cep }),
    };
  }
  const query = buildAddr({ endereco, address, cidade, uf, cep });

  // Interdit: CEP seul comme centre
  const onlyCep = !!cep && !(endereco || address || cidade || uf);
  if (onlyCep) {return { ok: false, error: 'CEP_NOT_CENTER' };}

  if (!query) {return { ok: false, error: 'NO_CENTER_INPUT' };}

  const g = await geocodeGoogle(query);
  if (g) {return { ok: true, mode: 'smart', ...g };}
  const o = await geocodeOpenCage(query);
  if (o) {return { ok: true, mode: 'smart', ...o };}
  const l = await geocodeLocationIQ(query);
  if (l) {return { ok: true, mode: 'smart', ...l };}

  return { ok: false, error: 'GEOCODE_FAILED_ALL' };
}

// -----------------------------------------------------------------------------
// Endpoint existant — inchangé (compat totale)
// -----------------------------------------------------------------------------
module.exports.sendPublicAlertByAddress = onRequest(
  { timeoutSeconds: 60, cors: true },
  async (req, res) => {
    const start = Date.now();
    log('[PUBLIC ALERT] START');

    try {
      if (!checkApiKey(req)) {return res.status(403).json({ ok: false, error: 'forbidden' });}

      const b = req.method === 'POST' ? req.body || {} : req.query || {};
      const alertId = String(b.alertId || '').trim();
      const endereco = String(b.endereco || '').trim();
      const cidade = String(b.cidade || '').trim();
      const uf = String(b.uf || '').trim();
      const kind = String(b.kind || 'publicIncident').trim();

      const lat = Number.parseFloat(b.lat);
      const lng = Number.parseFloat(b.lng);

      const radiusM = resolveRadiusByKind(kind, b.radius_m ?? b.radius);
      const bairro = String(b.bairro || '').trim();
      const cep = toDigits(b.cep || '');
      const image = b.image ? String(b.image).trim() : null;
      const severity = String(b.severidade || 'medium');
      const formColor = b.color ? String(b.color).trim() : null;
      const testToken = b.testToken ? String(b.testToken).trim() : null;

      log('[PUBLIC ALERT] req', {
        alertId, endereco, cidade, uf, lat, lng, radiusM, kind, bairro,
        cep: cep || '(vide/public-optionnel)',
        severity, formColor, hasImage: !!image,
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

      // Footprint (non-bloquant)
      try {
        await recordPublicAlertFootprint({
          alertId, userId: null, kind, lat, lng, radius_m: radiusM, endereco, bairro, cidade, uf,
        });
      } catch (fpErr) {
        warn('[PUBLIC ALERT] footprint failed (non-blocking)', fpErr?.message || fpErr);
      }

      // Smoke test
      if (testToken) {
        const { title, body } = textsBySeverity(severity, local, '');
        const deepLink = `vigiapp://alert/public/${alertId}`;
        const payload = {
          token: testToken,
          title, body, image, androidColor: accent, ttlSeconds: DEFAULT_TTL_SECONDS,
          data: {
            type: 'alert_public', alertId, deepLink, endereco: local, bairro, cidade, uf, cep,
            distancia: '', severidade: severity, color: accent, radius_m: String(radiusM),
            lat: String(lat), lng: String(lng), ack: '0',
          },
        };
        const r = await safeSend({ token: testToken, fcmPayload: payload, uid: '(test)', alertId, enqueueRetries: false });
        log('[PUBLIC ALERT] Smoke test result', r);
        return res.status(200).json({ ok: true, mode: 'testToken', result: r });
      }

      // Recipients
      log('[PUBLIC ALERT] Selecting recipients… (geohash+Haversine //, CEP fallback)');
      let recipients = await selectRecipientsGeohash({ lat, lng, radiusM });
      if (recipients.length === 0) {
        warn('[PUBLIC ALERT] geohash=0 → fallback scan');
        recipients = await selectRecipientsFallbackScan({ lat, lng, radiusM, cep });
      }

      log('[PUBLIC ALERT] recipients =', recipients.length);
      if (recipients.length === 0) {
        const ms0 = Date.now() - start;
        return res.status(200).json({
          ok: true, sent: 0, transient: 0, fatal: 0, otherErr: 0, ms: ms0, note: 'Aucun destinataire',
        });
      }

      // Envoi (POOL 20)
      const tasks = [];
      for (const r of recipients) {
        const distText = Number.isFinite(r._distance_m) ? fmtDist(r._distance_m) : '';
        const { title, body } = textsBySeverity(severity, local, distText);
        const deepLink = `vigiapp://alert/public/${alertId}`;
        for (const token of r.tokens) {
          tasks.push(() => safeSend({
            token, uid: r.uid, alertId, enqueueRetries: true,
            fcmPayload: {
              token, title, body, image, androidColor: accent, ttlSeconds: DEFAULT_TTL_SECONDS,
              data: {
                type: 'alert_public', alertId, deepLink, endereco: local, bairro, cidade, uf, cep,
                distancia: distText, severidade: severity, color: accent, radius_m: String(radiusM),
                lat: String(lat), lng: String(lng), ack: '0',
              },
            },
          }));
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

// -----------------------------------------------------------------------------
// NOUVEAU — Public alert par "center user" (adresse/CEP → centre résolu)
// -----------------------------------------------------------------------------
module.exports.sendPublicAlertByCenterUser = onRequest(
  { timeoutSeconds: 60, cors: true },
  async (req, res) => {
    const start = Date.now();
    const requestId = Math.random().toString(36).slice(2, 10);
    log('[PUBLIC CENTER] START', { requestId });

    try {
      if (!checkApiKey(req)) {return res.status(403).json({ ok: false, error: 'forbidden' });}

      const b = req.method === 'POST' ? (req.body || {}) : (req.query || {});
      const alertId = String(b.alertId || '').trim();
      const endereco = String(b.endereco || '').trim();
      const address = String(b.address || '').trim();
      const cidade = String(b.cidade || '').trim();
      const uf = String(b.uf || '').trim();
      const kind = String(b.kind || 'publicIncident').trim();

      const cep = normDigits(b.cep || '');
      const image = b.image ? String(b.image).trim() : null;
      const severity = String(b.severidade || 'medium');
      const formColor = b.color ? String(b.color).trim() : null;
      const testToken = b.testToken ? String(b.testToken).trim() : null;

      const center = (b.center && typeof b.center === 'object')
        ? { lat: Number(b.center.lat), lng: Number(b.center.lng) }
        : (Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng)))
          ? { lat: Number(b.lat), lng: Number(b.lng) }
          : null;

      const radiusM = resolveRadiusByKind(kind, b.radius_m ?? b.radius);
      if (!alertId) {return res.status(400).json({ ok: false, error: 'alertId requerido' });}

      const rc = await resolveCenterSmart({ center, address, endereco, cidade, uf, cep });
      if (!rc.ok) {
        const code = rc.error || 'CENTER_RESOLUTION_FAILED';
        warn('[PUBLIC CENTER] resolve failed', { requestId, alertId, code, endereco, address, cidade, uf, cep });
        const status = (code === 'CEP_NOT_CENTER' || code === 'NO_CENTER_INPUT') ? 400 : 422;
        return res.status(status).json({ ok: false, error: code });
      }

      const lat = rc.lat, lng = rc.lng;
      const mode = rc.mode;
      const provider = rc.provider || 'unknown';

      const accent = resolveAccentColor({ severity, formColor });
      const local = localLabel({
        endereco: (endereco || address || rc.formatted || '').trim(),
        bairro: '', cidade, uf,
      });

      // Footprint (non-bloquant)
      try {
        await recordPublicAlertFootprint({
          alertId, userId: null, kind, lat, lng, radius_m: radiusM, endereco: local, bairro: '', cidade, uf,
        });
      } catch (fpErr) { warn('[PUBLIC CENTER] footprint failed', fpErr?.message || fpErr); }

      // Smoke test?
      if (testToken) {
        const { title, body } = textsBySeverity(severity, local, '');
        const deepLink = `vigiapp://alert/public/${alertId}`;
        const payload = {
          token: testToken,
          title, body, image, androidColor: accent, ttlSeconds: DEFAULT_TTL_SECONDS,
          data: {
            type: 'alert_public', alertId, deepLink, endereco: local, bairro: '', cidade, uf, cep,
            distancia: '', severidade: severity, color: accent, radius_m: String(radiusM),
            lat: String(lat), lng: String(lng), ack: '0',
          },
        };
        const r = await safeSend({ token: testToken, fcmPayload: payload, uid: '(test)', alertId, enqueueRetries: false });
        log('[PUBLIC CENTER] Smoke test result', r);
        return res.status(200).json({ ok: true, mode: 'testToken', result: r });
      }

      // Recipients
      log('[PUBLIC CENTER] Selecting recipients… (geohash+Haversine //, CEP fallback)', {
        requestId, lat: lat?.toFixed?.(5), lng: lng?.toFixed?.(5), radiusM,
        mode, provider, cep: cep || '(optional)',
      });

      let recipients = await selectRecipientsGeohash({ lat, lng, radiusM });
      if (recipients.length === 0) {
        warn('[PUBLIC CENTER] geohash=0 → fallback scan');
        recipients = await selectRecipientsFallbackScan({ lat, lng, radiusM, cep });
      }

      log('[PUBLIC CENTER] recipients =', recipients.length);
      if (recipients.length === 0) {
        const ms0 = Date.now() - start;
        return res.status(200).json({ ok: true, sent: 0, ms: ms0, note: 'Aucun destinataire', center: { lat, lng }, radius_m: radiusM });
      }

      // Envoi
      const tasks = [];
      const deepLink = `vigiapp://alert/public/${alertId}`;
      for (const r of recipients) {
        const distText = Number.isFinite(r._distance_m) ? fmtDist(r._distance_m) : '';
        const { title, body } = textsBySeverity(severity, local, distText);
        for (const token of r.tokens) {
          tasks.push(() => safeSend({
            token, uid: r.uid, alertId, enqueueRetries: true,
            fcmPayload: {
              token, title, body, image, androidColor: accent, ttlSeconds: DEFAULT_TTL_SECONDS,
              data: {
                type: 'alert_public', alertId, deepLink, endereco: local, bairro: '', cidade, uf, cep,
                distancia: distText, severidade: severity, color: accent, radius_m: String(radiusM),
                lat: String(lat), lng: String(lng), ack: '0',
              },
            },
          }));
        }
      }
      const { ok, transient, fatal, otherErr } = await sendWithPool(tasks, SEND_POOL_SIZE);
      const ms = Date.now() - start;

      log('[PUBLIC CENTER] END', { sent: ok, transient, fatal, otherErr, ms, mode, provider });
      return res.status(200).json({ ok: true, mode, provider, sent: ok, transient, fatal, otherErr, ms, center: { lat, lng }, radius_m: radiusM });
    } catch (e) {
      err('[PUBLIC CENTER] ERROR', { requestId, msg: e?.message || e });
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  }
);
