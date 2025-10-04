// app/services/footprintsGateway.js
// -----------------------------------------------------------------------------
// Passerelle Front ⇄ Cloud Functions (getAlertFootprints)
// - x-api-key: optionnelle (non bloquante si absente côté serveur)
// - Défauts: Fortaleza (lat/lng), radius 5km, fenêtre 90 jours
// - Deux modes de fetch: circle() et bbox()
// - Helper vision nationale Brésil
// - Rendu Leaflet: cercles bleus semi-transparents + tooltips riches
// - Safe-by-default: try/catch, logs, pas de dépendance externe (fetch natif)
// -----------------------------------------------------------------------------
//
// BACK attendu (déjà en place côté functions/src/footprints.js):
//   exports.getAlertFootprints = onRequest(...)
//
// URL par défaut (prod):
//   https://<region>-<project>.cloudfunctions.net/getAlertFootprints
//
// Tu peux surcharger via ENV (optionnel):
//   process.env.PUBLIC_ENDPOINT_FOOTPRINTS  (ex: .env/.env.local)
//
// -----------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  // Fortaleza par défaut
  lat: -3.7305,
  lng: -38.5218,
  radius_m: 5000,
  sinceDays: 90,
  limit: 1500,
  // Couleurs/couches Leaflet
  circleColor: '#3B82F6', // bleu
  fillColor: '#93C5FD',
  fillOpacity: 0.18,
  weight: 2,
});

// Bornes “vision nationale” du Brésil (approximatives)
const BRAZIL_BOUNDS = Object.freeze({
  north: 5.27,
  south: -33.75,
  east: -32.39,
  west: -73.98,
});

function getBaseUrl() {
  // Essaie ENV sinon path relatif (si tu proxifies via ton backend)
  return (
    process.env.PUBLIC_ENDPOINT_FOOTPRINTS ||
    process.env.NEXT_PUBLIC_ENDPOINT_FOOTPRINTS ||
    '/getAlertFootprints'
  );
}

function fmtKm(m) {
  if (!Number.isFinite(m)) {
    return '';
  }
  if (m < 1000) {
    return `${m} m`;
  }
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtDate(ms) {
  // server renvoie createdAt ms → on formatte pt-BR pour cohérence
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

// Concat adresse proprement
function fmtEndereco({ endereco, bairro, cidade, uf }) {
  const p = [];
  if (endereco) {
    p.push(endereco);
  }
  const cityUF = cidade && uf ? `${cidade}/${uf}` : cidade ? cidade : uf ? `/${uf}` : '';
  if (bairro) {
    p.push(bairro);
  }
  if (cityUF) {
    p.push(cityUF);
  }
  return p.join(' — ') || 'sua região';
}

async function httpGet(params = {}, { apiKey } = {}) {
  const base = getBaseUrl();
  const url = new URL(
    base,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  );

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.append(k, String(v));
    }
  });

  const headers = {};
  // ⚠️ Optionnel: si tu as une clé, on la passe; sinon on n’envoie rien.
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  console.log('[footprintsGateway] GET', url.toString());
  const res = await fetch(url.toString(), { method: 'GET', headers });
  const txt = await res.text();
  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    console.warn('[footprintsGateway] non-JSON response:', txt.slice(0, 300));
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  if (!res.ok || json?.ok === false) {
    console.warn('[footprintsGateway] error payload:', json);
    throw new Error(json?.error || `HTTP ${res.status} ${res.statusText}`);
  }
  return json;
}

// ----------------------- API PUBLICS (fetch) -----------------------

/**
 * Récupérer des empreintes par CERCLE (Fortaleza par défaut).
 * @param {Object} opts
 * @param {number} opts.lat
 * @param {number} opts.lng
 * @param {number} opts.radius_m
 * @param {number} opts.sinceDays
 * @param {number} opts.limit
 * @param {string=} opts.apiKey
 */
async function getFootprintsByCircle(opts = {}) {
  const p = {
    mode: 'circle',
    lat: Number.isFinite(opts.lat) ? opts.lat : DEFAULTS.lat,
    lng: Number.isFinite(opts.lng) ? opts.lng : DEFAULTS.lng,
    radius_m: Number.isFinite(opts.radius_m) ? opts.radius_m : DEFAULTS.radius_m,
    sinceDays: Number.isFinite(opts.sinceDays) ? opts.sinceDays : DEFAULTS.sinceDays,
    limit: Number.isFinite(opts.limit) ? opts.limit : DEFAULTS.limit,
  };
  return httpGet(p, { apiKey: opts.apiKey });
}

/**
 * Récupérer des empreintes par BBOX (vision carte / pays).
 * @param {Object} opts
 * @param {number} opts.north
 * @param {number} opts.south
 * @param {number} opts.east
 * @param {number} opts.west
 * @param {number} opts.sinceDays
 * @param {number} opts.limit
 * @param {string=} opts.apiKey
 */
async function getFootprintsByBBox(opts = {}) {
  const p = {
    mode: 'bbox',
    north: Number.isFinite(opts.north) ? opts.north : BRAZIL_BOUNDS.north,
    south: Number.isFinite(opts.south) ? opts.south : BRAZIL_BOUNDS.south,
    east: Number.isFinite(opts.east) ? opts.east : BRAZIL_BOUNDS.east,
    west: Number.isFinite(opts.west) ? opts.west : BRAZIL_BOUNDS.west,
    sinceDays: Number.isFinite(opts.sinceDays) ? opts.sinceDays : DEFAULTS.sinceDays,
    limit: Number.isFinite(opts.limit) ? opts.limit : Math.max(DEFAULTS.limit, 3000),
  };
  return httpGet(p, { apiKey: opts.apiKey });
}

/**
 * Helper: vision nationale Brésil (90 jours, 10k points)
 * @param {Object} opts { sinceDays, limit, apiKey }
 */
async function loadBrazilFootprints(opts = {}) {
  return getFootprintsByBBox({
    north: BRAZIL_BOUNDS.north,
    south: BRAZIL_BOUNDS.south,
    east: BRAZIL_BOUNDS.east,
    west: BRAZIL_BOUNDS.west,
    sinceDays: Number.isFinite(opts.sinceDays) ? opts.sinceDays : DEFAULTS.sinceDays,
    limit: Number.isFinite(opts.limit) ? opts.limit : 10000,
    apiKey: opts.apiKey,
  });
}

// ----------------------- RENDU LEAFLET -----------------------

/**
 * Affiche des cercles bleus + tooltips riches sur une carte Leaflet.
 * @param {Object} args
 * @param {*} args.L      // l’objet Leaflet importé (global ou module)
 * @param {*} args.map    // instance L.Map
 * @param {Array} args.items // items renvoyés par l’API (lat, lng, radius_m, tooltip, etc.)
 * @param {Object} args.style // override style
 * @returns {Array<L.Circle>} couches ajoutées (pour clear/cleanup si besoin)
 */
function renderLeafletCircles({ L, map, items = [], style = {} }) {
  if (!L || !map) {
    console.warn('[footprintsGateway] renderLeafletCircles: L/map manquants');
    return [];
  }
  const s = {
    color: style.color || DEFAULTS.circleColor,
    fillColor: style.fillColor || DEFAULTS.fillColor,
    fillOpacity: Number.isFinite(style.fillOpacity) ? style.fillOpacity : DEFAULTS.fillOpacity,
    weight: Number.isFinite(style.weight) ? style.weight : DEFAULTS.weight,
  };

  const layers = [];

  items.forEach((p) => {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng) || !Number.isFinite(p?.radius_m)) {
      return;
    }

    const c = L.circle([p.lat, p.lng], {
      radius: p.radius_m,
      color: s.color,
      weight: s.weight,
      fill: true,
      fillColor: s.fillColor,
      fillOpacity: s.fillOpacity,
      bubblingMouseEvents: true,
      pane: 'overlayPane',
    });

    // Tooltip riche (au survol)
    const meta = p.tooltip || {};
    const title = meta.title || p.kind || 'Alerta';
    const subtitle = meta.subtitle || fmtEndereco(p);
    const radiusText = fmtKm(p.radius_m);
    const createdLabel = p.createdAt ? fmtDate(p.createdAt) : '';

    const html = `<div style="font-size:12px;line-height:1.35;">
        <div style="font-weight:700;margin-bottom:2px;">${escapeHtml(title)}</div>
        <div style="color:#94a3b8;margin-bottom:4px;">${escapeHtml(subtitle)}</div>
        <div><b>alertId:</b> ${escapeHtml(p.alertId || '-')}&nbsp; &nbsp;<b>userId:</b> ${escapeHtml(p.userId || '-')}</div>
        <div><b>rayon:</b> ${radiusText}&nbsp; &nbsp;<b>date:</b> ${escapeHtml(createdLabel)}</div>
      </div>`;

    c.bindTooltip(html, {
      direction: 'top',
      permanent: false,
      sticky: true,
      className: 'vigiapp-fp-tooltip',
      opacity: 0.95,
      offset: L.point(0, -8),
    });

    c.addTo(map);
    layers.push(c);
  });

  console.log('[footprintsGateway] rendered circles:', layers.length);
  return layers;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ----------------------- EXPORTS -----------------------

const gw = {
  getFootprintsByCircle,
  getFootprintsByBBox,
  loadBrazilFootprints,
  renderLeafletCircles,
  // Utils
  BRAZIL_BOUNDS,
  DEFAULTS,
};

export default gw;
export {
  getFootprintsByCircle,
  getFootprintsByBBox,
  loadBrazilFootprints,
  renderLeafletCircles,
  BRAZIL_BOUNDS,
  DEFAULTS,
};
