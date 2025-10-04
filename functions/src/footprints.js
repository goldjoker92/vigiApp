// functions/src/footprints.js
// -----------------------------------------------------------------------------
// VigiApp — Alert Footprints (READ-ONLY, BACK-ONLY)
// - Source: collection 'alertFootprints' (écrite par utils.recordPublicAlertFootprint)
// - Périmètre: 90 jours rolling (réductible via sinceDays ou since=YYYY-MM-DD)
// - Requêtes: par cercle (center+radius) OU par bbox (north/south/east/west)
// - Sortie: points + méta (incident/kind, date, adresse, alertId, userId, radius_m)
// - Sécurité: x-api-key optionnelle (recommandée pour l’admin/backoffice)
// - Perf: requêtes géohash parallélisées + filtre Haversine/bbox serveur
// - Pagination: 'limit' simple (capé). Pour très gros volumes: batch côté back.
// -----------------------------------------------------------------------------
//
// 🧭 PRÉREQUIS
// -----------------------------------------------------------------------------
// 1) La collection 'alertFootprints' est remplie par utils.recordPublicAlertFootprint()
//    (appelée lors de l’émission ou la création d’une alerte publique).
// 2) (Optionnel) Active le TTL Firestore (sur le champ expireAt) pour purge auto après 90j.
// 3) (Recommandé) Protéger l’endpoint avec une clé API :
//      firebase functions:config:set footprints.apikey="tonsecret"
//    ou variable d’environnement FOOTPRINTS_API_KEY.
//
// 🔐 SÉCURITÉ (x-api-key)
// -----------------------------------------------------------------------------
// - Header: x-api-key: tonsecret
// - Si non défini côté serveur, l’endpoint reste accessible (lecture).
//
// 📡 PARAMS SUPPORTÉS
// -----------------------------------------------------------------------------
// mode        : "circle" | "bbox"            (default: circle si lat/lng présents)
// lat,lng     : nombre (requis pour circle)
// radius_m    : rayon en mètres (default: 1000 pour circle si absent)
// north,south,east,west : bbox (requis pour bbox)
// sinceDays   : nombre de jours à remonter (default: 90, max interne 90)
// since       : "YYYY-MM-DD" (prioritaire sur sinceDays si valide)
// limit       : nombre d’items (default: 2000, min 1, max cap 10000)
//
// 🧪 EXEMPLES D’APPEL — cURL
// -----------------------------------------------------------------------------
// 1) Cercle (Fortaleza, 5 km, 60 jours, cap 1500):
// curl -G "https://<region>-<project>.cloudfunctions.net/getAlertFootprints" \
//   -H "x-api-key: tonsecret" \
//   --data-urlencode "mode=circle" \
//   --data-urlencode "lat=-3.7305" \
//   --data-urlencode "lng=-38.5218" \
//   --data-urlencode "radius_m=5000" \
//   --data-urlencode "sinceDays=60" \
//   --data-urlencode "limit=1500"
//
// 2) BBox (viewport):
// curl -G "https://<region>-<project>.cloudfunctions.net/getAlertFootprints" \
//   -H "x-api-key: tonsecret" \
//   --data-urlencode "mode=bbox" \
//   --data-urlencode "north=-3.70" \
//   --data-urlencode "south=-3.80" \
//   --data-urlencode "east=-38.45" \
//   --data-urlencode "west=-38.60" \
//   --data-urlencode "limit=2000"
//
// 3) Tout le Brésil (bbox couvrant le pays, 90 jours):
//   (approx BRA: north=5.27, south=-33.75, west=-73.98, east=-34.79)
// curl -G "https://<region>-<project>.cloudfunctions.net/getAlertFootprints" \
//   -H "x-api-key: tonsecret" \
//   --data-urlencode "mode=bbox" \
//   --data-urlencode "north=5.27" \
//   --data-urlencode "south=-33.75" \
//   --data-urlencode "east=-34.79" \
//   --data-urlencode "west=-73.98" \
//   --data-urlencode "limit=10000"
//
// 🧪 EXEMPLES D’APPEL — PowerShell
// -----------------------------------------------------------------------------
// $headers = @{ "x-api-key" = "tonsecret" }
// $params = @{
//   mode="circle"; lat="-3.7305"; lng="-38.5218"; radius_m="5000"; sinceDays="60"; limit="1500"
// }
// Invoke-RestMethod -Method Get -Uri "https://<region>-<project>.cloudfunctions.net/getAlertFootprints" -Headers $headers -Body $params
//
// 🧪 EXEMPLES D’APPEL — Thunder Client (VS Code)
// -----------------------------------------------------------------------------
// - Méthode: GET
// - URL: https://<region>-<project>.cloudfunctions.net/getAlertFootprints
// - Headers: x-api-key = tonsecret
// - Params (tab "Params"):
//     mode=circle
//     lat=-3.7305
//     lng=-38.5218
//     radius_m=5000
//     sinceDays=60
//     limit=1500
//
// 🧪 EXEMPLES D’APPEL — Node.js (fetch)
// -----------------------------------------------------------------------------
// const url = new URL("https://<region>-<project>.cloudfunctions.net/getAlertFootprints");
// url.searchParams.set("mode", "circle");
// url.searchParams.set("lat", "-3.7305");
// url.searchParams.set("lng", "-38.5218");
// url.searchParams.set("radius_m", "5000");
// url.searchParams.set("sinceDays", "60");
// url.searchParams.set("limit", "1500");
// const res = await fetch(url.toString(), { headers: { "x-api-key": "tonsecret" } });
// const json = await res.json();
//
// 🗺️ INTÉGRATION HEATMAP (Leaflet)
// -----------------------------------------------------------------------------
// // 1) Heatmap simple (heatmap.js plugin):
// const points = data.items.map(p => [p.lat, p.lng, 1]);
// const heat = L.heatLayer(points, { radius: 25 }).addTo(map);
//
// // 2) Cercles “footprints” + Tooltip au survol (centre du cercle):
// data.items.forEach(p => {
//   const c = L.circle([p.lat, p.lng], { radius: p.radius_m, color: '#ff4444', weight: 1, fill:false });
//   c.bindTooltip(
//     `${p.tooltip.title}<br>${p.tooltip.subtitle}<br>` +
//     `alertId: ${p.tooltip.meta.alertId}<br>userId: ${p.tooltip.meta.userId}`,
//     { sticky: true }
//   );
//   c.addTo(map);
// });
//
// 🗺️ INTÉGRATION HEATMAP (Mapbox GL JS)
// -----------------------------------------------------------------------------
// map.addSource('alerts', {
//   type: 'geojson',
//   data: {
//     type: 'FeatureCollection',
//     features: data.items.map(p => ({
//       type: 'Feature',
//       geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
//       properties: { radius_m: p.radius_m, ...p.tooltip.meta }
//     }))
//   }
// });
// map.addLayer({
//   id: 'alerts-heat',
//   type: 'heatmap',
//   source: 'alerts',
//   paint: { 'heatmap-radius': 20 }
// });
//
// -----------------------------------------------------------------------------
// Réponse JSON (exemple):
// {
//   "ok": true,
//   "mode": "circle",
//   "count": 2,
//   "items": [
//     {
//       "id": "fp_123",
//       "lat": -3.7304,
//       "lng": -38.5219,
//       "radius_m": 1000,
//       "kind": "publicIncident",
//       "alertId": "alert_abc",
//       "userId": "uid_xyz",
//       "createdAt": 1737327320000,
//       "tooltip": {
//         "title": "publicIncident",
//         "subtitle": "Rua X — Fortaleza/CE",
//         "meta": { "alertId": "alert_abc", "userId": "uid_xyz", "radiusText": "1.0 km" }
//       }
//     }
//   ]
// }
// -----------------------------------------------------------------------------

'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const geofire = require('geofire-common');

const { db, log, warn, err, fmtDist, distanceMeters } = require('../utils');

// ---------- Utils parse & clamp ----------
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// ---------- Guard API key (optionnel, non bloquant si absente) ----------
function checkApiKey(req) {
  // Priorité aux env vars explicites. Supporte aussi functions:config:set footprints.apikey=...
  const cfgKey =
    process.env.FOOTPRINTS_API_KEY ||
    process.env.PUBLIC_ALERT_API_KEY ||
    (process.env.FIREBASE_CONFIG &&
      typeof process.env.FIREBASE_CONFIG === 'object' &&
      process.env.FIREBASE_CONFIG.footprints &&
      process.env.FIREBASE_CONFIG.footprints.apikey) ||
    '';
  if (!cfgKey) {
    return true;
  }
  const got = req.get('x-api-key') || req.get('X-API-Key') || '';
  return got && got === cfgKey;
}

// ---------- Build tooltip helper ----------
function buildTooltip(doc) {
  const kind = String(doc.kind || 'publicIncident');
  const city = doc.cidade || '';
  const uf = doc.uf || '';
  const address = doc.endereco
    ? `${doc.endereco} — ${city}${uf ? `/${uf}` : ''}`
    : city || (uf ? `/${uf}` : '') || 'sua região';
  return {
    title: kind,
    subtitle: address,
    meta: {
      alertId: doc.alertId || '',
      userId: doc.userId || '',
      radiusText: fmtDist(Number(doc.radius_m || 0)),
    },
  };
}

// ---------- Geohash scans (parallel) ----------
async function queryByGeohashBounds({ bounds, sinceTs, limitCap }) {
  // Exécute les requêtes en parallèle puis concatène
  const queries = bounds.map(([start, end]) =>
    db
      .collection('alertFootprints')
      .orderBy('geohash')
      .startAt(start)
      .endAt(end)
      .where('createdAt', '>=', sinceTs)
      .limit(limitCap) // sécurité locale
      .get(),
  );
  const snaps = await Promise.all(queries);
  const all = [];
  for (const snap of snaps) {
    snap.forEach((d) => all.push({ id: d.id, ...d.data() }));
  }
  return all;
}

// ---------- Exact filters ----------
function filterCircle(items, { lat, lng, radiusM }) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) {
      continue;
    }
    const d = distanceMeters(lat, lng, it.lat, it.lng);
    if (d <= radiusM) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        out.push(it);
      }
    }
  }
  return out;
}

function filterBBox(items, { north, south, east, west }) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) {
      continue;
    }
    if (it.lat <= north && it.lat >= south && it.lng <= east && it.lng >= west) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        out.push(it);
      }
    }
  }
  return out;
}

// ---------- Endpoint principal ----------
module.exports.getAlertFootprints = onRequest(
  { timeoutSeconds: 60, cors: true },
  async (req, res) => {
    const t0 = Date.now();
    try {
      // Auth (soft)
      if (!checkApiKey(req)) {
        warn('[FOOTPRINTS] invalid x-api-key');
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }

      const q = req.method === 'GET' ? req.query || {} : req.body || {};
      const mode = String(q.mode || '').toLowerCase();

      // since / sinceDays → bornage 90 jours
      const MAX_DAYS = 90;
      let sinceMs = 0;
      if (q.since) {
        const d = new Date(String(q.since));
        if (!isNaN(d.getTime())) {
          sinceMs = d.getTime();
        }
      }
      if (!sinceMs) {
        const days = clamp(toNum(q.sinceDays), 1, MAX_DAYS);
        const useDays = Number.isFinite(days) ? days : MAX_DAYS;
        sinceMs = Date.now() - useDays * 24 * 60 * 60 * 1000;
      }
      const sinceTs = new Date(sinceMs);

      // limit (cap)
      const LIMIT_DEFAULT = 2000;
      const LIMIT_MAX = 10000;
      const limit = clamp(toNum(q.limit), 1, LIMIT_MAX) || LIMIT_DEFAULT;

      log('[FOOTPRINTS] START', {
        mode: mode || '(auto)',
        since: sinceTs.toISOString(),
        limit,
      });

      let items = [];
      if (mode === 'bbox' || (!mode && q.north && q.south && q.east && q.west)) {
        // --------- MODE BBOX ---------
        const north = toNum(q.north);
        const south = toNum(q.south);
        const east = toNum(q.east);
        const west = toNum(q.west);
        if (![north, south, east, west].every(Number.isFinite) || south > north || west > east) {
          warn('[FOOTPRINTS] invalid bbox', { north, south, east, west });
          return res.status(400).json({ ok: false, error: 'bbox invalide' });
        }

        // Approche: rayon = moitié de la diagonale du bbox → centre, puis filtres exacts bbox
        const centerLat = (north + south) / 2;
        const centerLng = (east + west) / 2;
        const dNorthWest = distanceMeters(centerLat, centerLng, north, west);
        const dSouthEast = distanceMeters(centerLat, centerLng, south, east);
        const halfDiag = Math.max(dNorthWest, dSouthEast);

        const bounds = geofire.geohashQueryBounds([centerLat, centerLng], halfDiag);
        const raw = await queryByGeohashBounds({ bounds, sinceTs, limitCap: limit });

        // Filtre exact bbox + trim limit
        items = filterBBox(raw, { north, south, east, west }).slice(0, limit);

        log('[FOOTPRINTS] bbox done', {
          requested: raw.length,
          kept: items.length,
        });
      } else {
        // --------- MODE CIRCLE (par défaut si lat/lng fournis) ---------
        const lat = toNum(q.lat);
        const lng = toNum(q.lng);
        let radiusM = toNum(q.radius_m);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          warn('[FOOTPRINTS] missing lat/lng for circle');
          return res.status(400).json({ ok: false, error: 'lat/lng requis pour mode=circle' });
        }
        if (!Number.isFinite(radiusM) || radiusM <= 0) {
          radiusM = 1000; // défaut safe
        }

        const bounds = geofire.geohashQueryBounds([lat, lng], radiusM);
        const raw = await queryByGeohashBounds({ bounds, sinceTs, limitCap: limit });

        // Filtre exact cercle + trim limit
        items = filterCircle(raw, { lat, lng, radiusM }).slice(0, limit);

        log('[FOOTPRINTS] circle done', {
          requested: raw.length,
          kept: items.length,
          radiusM,
        });
      }

      // Mapping sortie + tooltips
      const out = items.map((d) => {
        const createdAt =
          (d.createdAt && d.createdAt.toMillis && d.createdAt.toMillis()) ||
          (d.createdAt && d.createdAt._seconds && d.createdAt._seconds * 1000) ||
          Number(d.createdAt) ||
          0;

        return {
          id: d.id,
          lat: d.lat,
          lng: d.lng,
          radius_m: d.radius_m,
          kind: d.kind || 'publicIncident',
          alertId: d.alertId || '',
          userId: d.userId || '',
          createdAt,
          tooltip: buildTooltip(d),
        };
      });

      const ms = Date.now() - t0;
      log('[FOOTPRINTS] END', { count: out.length, ms });

      return res.status(200).json({
        ok: true,
        mode: mode === 'bbox' ? 'bbox' : 'circle',
        since: sinceTs.toISOString(),
        count: out.length,
        items: out,
      });
    } catch (e) {
      err('[FOOTPRINTS] ERROR', e?.message || e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  },
);
