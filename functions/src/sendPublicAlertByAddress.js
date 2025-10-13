// functions/src/sendPublicAlertByAddress.js
// =============================================================================
// VigiApp — CF v2: sendPublicAlertByAddress (adresse/CEP -> lat/lng -> envoi par rayon)
// - Ajout: data.deepLink + data.url dans la payload FCM (sécurité / compat)
// =============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

// ---- Charge .env (local/dev)
try {
  require('dotenv').config();
} catch {
  /* noop */
}

// ---- Super-cache géocodage
const { keyFromAddress, keyFromCEP, withGeoCache } = require('./geoCache');

// ---- ENV (fallbacks + mapping EXPO_PUBLIC_*)
const ENV = {
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info').toLowerCase(), // debug|info|warn|error
  DISABLE_FCM_COLOR: String(process.env.DISABLE_FCM_COLOR || 'false').toLowerCase() === 'true',

  DEVICES_COLLECTION: process.env.DEVICES_COLLECTION || 'devices',
  DEVICE_LAST_SEEN_FIELD: process.env.DEVICE_LAST_SEEN_FIELD || 'updatedAt',
  DEVICE_CITY_FIELD: process.env.DEVICE_CITY_FIELD || 'city',
  DEVICE_CEP_FIELD: process.env.DEVICE_CEP_FIELD || 'cep',
  DEVICE_LAT_FIELD: process.env.DEVICE_LAT_FIELD || 'lat',
  DEVICE_LNG_FIELD: process.env.DEVICE_LNG_FIELD || 'lng',
  DEVICE_CHANNEL_PUBLIC_FIELD: process.env.DEVICE_CHANNEL_PUBLIC_FIELD || 'channels.publicAlerts',
  DEVICE_ENABLED_FIELD: process.env.DEVICE_ENABLED_FIELD || 'active',

  ANDROID_CHANNEL_ID: process.env.ANDROID_CHANNEL_ID || 'alerts-high',
  DEFAULT_TTL_SECONDS: Number(process.env.DEFAULT_TTL_SECONDS || 3600),

  MIN_RADIUS_M: Number(process.env.MIN_RADIUS_M || 50),
  MAX_RADIUS_M: Number(process.env.MAX_RADIUS_M || 3000),
  DEFAULT_RADIUS_M: Number(process.env.DEFAULT_RADIUS_M || 1000),

  BATCH_SIZE: Number(process.env.BATCH_SIZE || 500),

  GMAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || process.env.GMAPS_KEY || '',
  LOCATIONIQ_KEY: process.env.EXPO_PUBLIC_LOCATIONIQ_KEY || process.env.LOCATIONIQ_KEY || '',
};

// ---- Logger simple
const log = {
  debug: (...a) => (ENV.LOG_LEVEL === 'debug' ? console.log('[DEBUG]', ...a) : null),
  info: (...a) => (['info', 'debug'].includes(ENV.LOG_LEVEL) ? console.log('[INFO ]', ...a) : null),
  warn: (...a) =>
    ['warn', 'info', 'debug'].includes(ENV.LOG_LEVEL) ? console.warn('[WARN ]', ...a) : null,
  error: (...a) => console.error('[ERROR]', ...a),
};

// ---- Helpers généraux
const getByPath = (obj, path, def = undefined) => {
  if (!obj || !path) {
    return def;
  }
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
      cur = cur[p];
    } else {
      return def;
    }
  }
  return cur;
};

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

// ---------- fetch JSON (timeout court + UA)
async function _fetchJson(url, { timeoutMs = 900 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'VigiApp-CF/send/2 (contact: support@vigiapp)',
      },
    });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------- Géocodage : Google / LocationIQ / OSM ----------
async function geocodeGoogle(q, planLogs, timeoutMs = 900) {
  const key = ENV.GMAPS_KEY;
  if (!key) {
    throw new Error('GMAPS_KEY missing (.env EXPO_PUBLIC_GOOGLE_MAPS_KEY)');
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&language=pt-BR&key=${key}`;
  const json = await _fetchJson(url, { timeoutMs });
  planLogs.push({ provider: 'google', status: json.status, results: json.results?.length || 0 });
  if (json.status !== 'OK' || !json.results?.length) {
    throw new Error(`google:${json.status}`);
  }
  const best = json.results[0];
  const loc = best.geometry?.location;
  if (!loc) {
    throw new Error('google:no_loc');
  }
  return {
    lat: loc.lat,
    lng: loc.lng,
    precision: best.geometry?.location_type || 'UNKNOWN',
    provider: 'google',
  };
}
async function geocodeLocationIQ(q, planLogs, timeoutMs = 900) {
  const key = ENV.LOCATIONIQ_KEY;
  if (!key) {
    throw new Error('LOCATIONIQ_KEY missing (.env EXPO_PUBLIC_LOCATIONIQ_KEY)');
  }
  const url = `https://us1.locationiq.com/v1/search?key=${key}&q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=1`;
  const json = await _fetchJson(url, { timeoutMs });
  planLogs.push({ provider: 'locationiq', results: Array.isArray(json) ? json.length : 0 });
  if (!Array.isArray(json) || !json.length) {
    throw new Error('locationiq:no_result');
  }
  const r = json[0];
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    precision: r.type || 'UNKNOWN',
    provider: 'locationiq',
  };
}
async function geocodeOSM(q, planLogs, timeoutMs = 900) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
  const json = await _fetchJson(url, { timeoutMs });
  planLogs.push({ provider: 'osm', results: Array.isArray(json) ? json.length : 0 });
  if (!Array.isArray(json) || !json.length) {
    throw new Error('osm:no_result');
  }
  const r = json[0];
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    precision: r.class || 'UNKNOWN',
    provider: 'osm',
  };
}

// ---------- CEP → centroïde ----------
async function cepToCentroidViaCEP(cep, planLogs, timeoutMs = 900) {
  const cepNum = String(cep || '')
    .replace(/\D+/g, '')
    .slice(0, 8);
  if (!cepNum) {
    throw new Error('cep:empty');
  }
  const url = `https://viacep.com.br/ws/${cepNum}/json/`;
  const json = await _fetchJson(url, { timeoutMs });
  if (json?.erro) {
    throw new Error('viacep:not_found');
  }
  planLogs.push({ provider: 'viacep', cep: cepNum, city: json.localidade, uf: json.uf });
  const addr = [json.logradouro, json.bairro, json.localidade, json.uf, 'Brasil']
    .filter(Boolean)
    .join(', ');
  try {
    const p = await geocodeOSM(addr, planLogs, timeoutMs);
    return { ...p, provider: p.provider + '+viacep' };
  } catch {
    const p = await geocodeGoogle(addr, planLogs, timeoutMs);
    return { ...p, provider: p.provider + '+viacep' };
  }
}
async function cepToCentroidBrasilAPI(cep, planLogs, timeoutMs = 900) {
  const cepNum = String(cep || '')
    .replace(/\D+/g, '')
    .slice(0, 8);
  if (!cepNum) {
    throw new Error('cep:empty');
  }
  const url = `https://brasilapi.com.br/api/cep/v2/${cepNum}`;
  const json = await _fetchJson(url, { timeoutMs });
  planLogs.push({ provider: 'brasilapi', cep: cepNum, city: json.city, state: json.state });
  const addr = [json.street, json.neighborhood, json.city, json.state, 'Brasil']
    .filter(Boolean)
    .join(', ');
  try {
    const p = await geocodeOSM(addr, planLogs, timeoutMs);
    return { ...p, provider: p.provider + '+brasilapi' };
  } catch {
    const p = await geocodeGoogle(addr, planLogs, timeoutMs);
    return { ...p, provider: p.provider + '+brasilapi' };
  }
}

// ---------- métriques device ----------
async function bumpPushStats(deviceId, alertId, kind /* attempt|sent|notSent|transient */) {
  if (!deviceId) {
    return;
  }
  await db()
    .collection(ENV.DEVICES_COLLECTION)
    .doc(deviceId)
    .set(
      {
        [ENV.DEVICE_LAST_SEEN_FIELD]: FieldValue.serverTimestamp(),
        lastBlastAt: FieldValue.serverTimestamp(),
        lastBlastId: String(alertId),
        pushStats: { total: FieldValue.increment(1), [kind]: FieldValue.increment(1) },
      },
      { merge: true },
    );
}

// ---------- NEW: écriture du doc publicAlerts + projection ----------
async function writePublicAlertDoc({ alertId, body }) {
  try {
    const ref = db().collection('publicAlerts').doc(String(alertId));
    await ref.set(
      {
        userId: body.userId || '(test)',
        apelido: body.apelido || '',
        username: body.username || '',
        categoria: body.categoria || body.kind || 'Outros',
        descricao: body.descricao || '',
        gravidade: body.severidade || 'medium',
        color: body.color || '#FFA500',
        ruaNumero: body.endereco || '',
        cidade: body.cidade || '',
        estado: body.uf || '',
        cep: body.cep || '',
        cepPrecision: body.cepPrecision || 'none',
        pais: 'BR',
        location: {
          latitude: Number(body.lat),
          longitude: Number(body.lng),
          accuracy: null,
          heading: null,
          altitudeAccuracy: null,
          speed: null,
        },
        date: body.date || '',
        time: body.time || '',
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: body.expiresAt || null,
        radius: Number(body.radius_m || body.radius) || 1000,
        radius_m: Number(body.radius_m || body.radius) || 1000,
        entryMode: body.mode || 'external',
        isManual: body.mode === 'manual' || false,
        reporter_distance_m: body.reporter_distance_m || 0,
      },
      { merge: true },
    );

    await db()
      .collection('publicAlertsProjection')
      .doc(String(alertId))
      .set(
        {
          projectedAt: FieldValue.serverTimestamp(),
          alertId: String(alertId),
        },
        { merge: true },
      );
  } catch (e) {
    log.warn('[PUBLIC ALERT][doc] write failed (non-blocking)', e?.message || e);
  }
}

// ============================================================================

const sendPublicAlertByAddress = onRequest(
  {
    region: process.env.HTTP_REGION || 'southamerica-east1',
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
      const createDoc = String(b.createDoc || b.createdoc || '0') === '1';

      // ---------- Entrée ----------
      const alertId = String(b.alertId || `debug_${Math.random().toString(16).slice(2, 8)}`);
      const endereco = b.endereco || null;
      const bairro = b.bairro || null;
      const cityIn = b.city || b.cidade || null;
      const uf = b.uf || null;
      const cepNorm = b.cep ? String(b.cep).replace(/\D+/g, '').slice(0, 8) : null;

      let lat = clamp(toNum(b.lat), -90, 90);
      let lng = clamp(toNum(b.lng), -180, 180);
      let hasLatLng = isFiniteNum(lat) && isFiniteNum(lng);

      let radiusM = clamp(toNum(b.radius_m) || ENV.DEFAULT_RADIUS_M, ENV.MIN_RADIUS_M, 50000);
      const severidade = String(b.severidade || 'medium');
      const color = String(b.color || '#FFA500');
      const testToken = b.testToken || null;

      if (ENV.LOG_LEVEL !== 'error') {
        log.info('[SEND][in]', {
          alertId,
          endereco,
          bairro,
          cityIn,
          uf,
          cepNorm,
          lat: hasLatLng ? lat : null,
          lng: hasLatLng ? lng : null,
          radiusM,
          hasLatLng,
          keys: { gmaps: !!ENV.GMAPS_KEY, lociq: !!ENV.LOCATIONIQ_KEY },
        });
      }

      // ---------- Mode test (bypass sélection) ----------
      if (testToken) {
        try {
          const msg = {
            token: testToken,
            notification: {
              title: severidade === 'high' ? 'ALERTE VigiApp' : 'Info VigiApp',
              body: endereco
                ? `${endereco}${bairro ? ' · ' + bairro : ''}${cityIn ? ' · ' + cityIn : ''}`
                : 'Alerta público',
            },
            android: { notification: { channelId: ENV.ANDROID_CHANNEL_ID, sound: 'default' } },
            data: {
              type: 'public-alert',
              alertId: String(alertId),
              deepLink: `vigiapp://public-alerts/${alertId}`,
              url: `vigiapp://public-alerts/${alertId}`, // ← sécurité
              severidade,
              ...(ENV.DISABLE_FCM_COLOR ? {} : { color }),
            },
          };
          const id = await fcm().send(msg);
          return res.json({
            ok: true,
            mode: 'testToken',
            result: { ok: true, id, attempts: 1 },
            ms: Date.now() - t0,
          });
        } catch (e) {
          log.warn('[SEND][testToken] fail', e?.message || e);
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

      // ---------- Géocodage (adresse prioritaire -> CEP fallback) ----------
      const planLogs = [];
      if (!hasLatLng) {
        const addrQuery = [endereco, bairro, cityIn, uf, 'Brasil'].filter(Boolean).join(', ');
        const addrKey = keyFromAddress(endereco, bairro, cityIn, uf);
        let resolved = null;

        if (addrQuery && addrKey) {
          resolved = await withGeoCache(
            addrKey,
            async () => {
              const chain = [
                () => geocodeGoogle(addrQuery, planLogs, 900),
                () => geocodeLocationIQ(addrQuery, planLogs, 900),
                () => geocodeOSM(addrQuery, planLogs, 900),
              ];
              for (const step of chain) {
                try {
                  const r = await step();
                  if (r) {
                    return r;
                  }
                } catch {}
              }
              return null;
            },
            /* TTL addr */ 1000 * 60 * 60 * 24 * 30,
          );
        }

        if (!resolved && cepNorm) {
          const isGeneral = /000$/.test(cepNorm);
          const cepKey = keyFromCEP(cepNorm);
          resolved = await withGeoCache(
            cepKey,
            async () => {
              const chain = [
                () => cepToCentroidViaCEP(cepNorm, planLogs, 900),
                () => cepToCentroidBrasilAPI(cepNorm, planLogs, 900),
              ];
              for (const step of chain) {
                try {
                  const r = await step();
                  if (r) {
                    return r;
                  }
                } catch {}
              }
              return null;
            },
            /* TTL CEP */ 1000 * 60 * 60 * 24 * 60,
          );

          if (isGeneral) {
            radiusM = Math.min(Math.max(radiusM, 2000), 8000);
          }
        }

        if (resolved) {
          lat = resolved.lat;
          lng = resolved.lng;
          hasLatLng = true;
          planLogs.push({ picked: resolved.provider, lat, lng, precision: resolved.precision });
        } else {
          return res
            .status(400)
            .json({
              ok: false,
              code: 'bad_geo',
              msg: 'Impossible de géocoder (fournir lat/lng ou adresse/cep)',
            });
        }
      }

      // Rayon clamp
      radiusM = clamp(radiusM, ENV.MIN_RADIUS_M, 8000);

      // (Optionnel) Écrire le doc avant l’envoi si demandé
      if (createDoc) {
        await writePublicAlertDoc({
          alertId,
          body: {
            userId: b.userId,
            apelido: b.apelido,
            username: b.username,
            categoria: b.categoria,
            descricao: b.descricao,
            severidade: b.severidade,
            color: b.color,
            endereco: b.endereco,
            cidade: b.cidade,
            uf: b.uf,
            cep: b.cep,
            cepPrecision: b.cepPrecision,
            lat,
            lng,
            radius_m: radiusM,
            mode: b.mode || 'external',
            reporter_distance_m: b.reporter_distance_m,
            expiresAt: b.expiresAt || null,
            date: b.date,
            time: b.time,
          },
        });
      }

      // ---------- Sélection des devices + envoi ----------
      const snap = await db().collection(ENV.DEVICES_COLLECTION).limit(10000).get(); // MVP scan
      const candidates = [],
        excluded = [];
      for (const d of snap.docs) {
        const v = d.data() || {};
        const deviceId = v.deviceId || d.id;

        const active = getByPath(v, ENV.DEVICE_ENABLED_FIELD, true) !== false;
        const chOk = getByPath(v, ENV.DEVICE_CHANNEL_PUBLIC_FIELD, true) !== false;
        const fcmTok = v.fcmToken || v.fcm;

        const vLat = toNum(getByPath(v, ENV.DEVICE_LAT_FIELD));
        const vLng = toNum(getByPath(v, ENV.DEVICE_LNG_FIELD));
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

        let distM = null,
          inRadius = false;
        if (geoOk) {
          distM = haversineMeters(lat, lng, vLat, vLng);
          inRadius = distM <= radiusM;
        }

        if (active && chOk && fcmTok && geoOk && inRadius) {
          candidates.push({ deviceId, fcmToken: fcmTok, lat: vLat, lng: vLng, distM });
        } else {
          excluded.push({ deviceId, reasons, lat: vLat, lng: vLng, distM });
        }
      }

      const selected = uniqBy(candidates, (x) => x.fcmToken);
      const selectedDeviceIds = selected.map((x) => x.deviceId);

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
                  : 'Alerta público',
              },
              android: { notification: { channelId: ENV.ANDROID_CHANNEL_ID, sound: 'default' } },
              data: {
                type: 'public-alert',
                alertId: String(alertId),
                deepLink: `vigiapp://public-alerts/${alertId}`,
                url: `vigiapp://public-alerts/${alertId}`, // ← sécurité
                severidade,
                ...(ENV.DISABLE_FCM_COLOR ? {} : { color }),
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
        planLogs,
        ts: Timestamp.now(),
      };
      db()
        .collection('push_audit')
        .doc(String(alertId))
        .set({ ...audit, createdAt: FieldValue.serverTimestamp() }, { merge: true })
        .catch(() => {});

      // ---------- Metrics ----------
      const rawCategory = String(b.categoria || b.severidade || 'unknown');
      const categoryDocId =
        rawCategory
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, '_')
          .replace(/^_+|_+$/g, '') || 'unknown';

      await db()
        .collection('metrics')
        .doc('publicAlerts')
        .collection('byCategory')
        .doc(categoryDocId)
        .set(
          {
            total: FieldValue.increment(1),
            sent: FieldValue.increment(sent),
            notSent: FieldValue.increment(notSent),
            transient: FieldValue.increment(transient),
            lastAt: FieldValue.serverTimestamp(),
            lastRadiusM: radiusM,
          },
          { merge: true },
        )
        .catch((e) => console.error('[METRICS][byCategory] fail:', e));

      const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      await db()
        .collection('metrics')
        .doc('publicAlerts')
        .collection('byDay')
        .doc(dayKey)
        .set(
          {
            total: FieldValue.increment(1),
            sent: FieldValue.increment(sent),
            notSent: FieldValue.increment(notSent),
            transient: FieldValue.increment(transient),
            lastAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        .catch((e) => console.error('[METRICS][byDay] fail:', e));

      // ---------- Sortie ----------
      const out = {
        ok: true,
        alertId,
        geo: { lat, lng, radiusM },
        recipients,
        sent,
        notSent,
        transient,
        byCode,
        attemptsAvg,
        successPct,
        ms: Date.now() - t0,
      };
      if (wantDebug) {
        out.debug = {
          selectedDeviceIds,
          sampleSelected: selected.slice(0, 5).map((x) => ({
            id: x.deviceId,
            distM: Math.round(x.distM || 0),
            token: maskToken(x.fcmToken),
          })),
          sampleExcluded: excluded.slice(0, 5),
          counts: { candidates: candidates.length, excluded: excluded.length },
          planLogs,
        };
      }
      log.info('[SEND][out]', { alertId, recipients, sent, notSent, transient, ms: out.ms });
      return res.json(out);
    } catch (e) {
      log.error('sendPublicAlertByAddress ❌', e?.stack || e?.message || e);
      return res.status(500).json({ ok: false, code: 'exception', msg: e?.message || String(e) });
    }
  },
);

module.exports = { sendPublicAlertByAddress };
