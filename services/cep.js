/* utils/cep.js — robuste (JS pur, commenté + loggé)
 * Fournit: resolveExactCepFromCoords, GOOGLE_MAPS_KEY, hasGoogleKey, withTimeout
 * Cascade: Google → OpenCage (si clé) → LocationIQ (si clé) → fallback
 * Chaque provider a un timeout ferme (8s)
 * Cache mémoire 5 min (lat/lng arrondis à 4 décimales)
 * Logs: [CEP] / [CEP][GOOGLE] / [CEP][OPENCAGE] / [CEP][LOCATIONIQ]
 */

// ---- Clés env ----
export const GOOGLE_MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || process.env.GOOGLE_MAPS_KEY || '';
const OPENCAGE_KEY = process.env.EXPO_PUBLIC_OPENCAGE_KEY || '';
const LOCATIONIQ_KEY = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY || process.env.LOCATIONIQ_KEY || '';

export const hasGoogleKey = () => !!GOOGLE_MAPS_KEY && GOOGLE_MAPS_KEY.length > 10;

// ---- Config ----
const CONF = {
  providerTimeoutMs: 8000, // Timeout max par provider (8s)
  cacheTtlMs: 5 * 60 * 1000, // Cache 5 minutes
  cachePrecision: 4, // Lat/lng arrondis à 4 décimales
};

// ---- Utils ----
export function withTimeout(promise, ms, tag = 'timeout') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(tag)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

const _normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
const _isGenericCep = (cep8) => !!cep8 && cep8.length === 8 && cep8.slice(5) === '000';

// ---- Cache mémoire ----
const cache = new Map();
const k = (lat, lng) => `${lat.toFixed(CONF.cachePrecision)}:${lng.toFixed(CONF.cachePrecision)}`;

function setCache(lat, lng, value) {
  cache.set(k(lat, lng), { exp: Date.now() + CONF.cacheTtlMs, value });
}
function getCache(lat, lng) {
  const hit = cache.get(k(lat, lng));
  if (!hit) {
    return null;
  }
  if (hit.exp < Date.now()) {
    cache.delete(k(lat, lng));
    return null;
  }
  return hit.value;
}

// ---- Extraction helpers ----
function extractGoogle(ac) {
  const comps = ac?.address_components || [];
  const find = (type) => comps.find((x) => (x.types || []).includes(type));

  const cep = onlyDigits(find('postal_code')?.long_name);
  const cidade =
    find('locality')?.long_name || find('administrative_area_level_2')?.long_name || '';
  const uf = find('administrative_area_level_1')?.short_name || '';

  return { cep, cidade, uf };
}

function extractOpenCage(obj) {
  const c = obj?.components || {};
  return {
    cep: onlyDigits(c.postcode),
    cidade: c.city || c.town || c.village || '',
    uf: c.state_code || c.state || '',
  };
}

function extractLocationIQ(obj) {
  // LocationIQ reverse renvoie { address: { postcode, city | town | village, state } }
  const a = obj?.address || {};
  return {
    cep: onlyDigits(a.postcode),
    cidade: a.city || a.town || a.village || '',
    uf: a.state || '',
  };
}

// ---- Providers ----
async function reverseWithGoogle(lat, lng) {
  if (!hasGoogleKey()) {
    throw new Error('GOOGLE_KEY_MISSING');
  }

  console.log('[CEP][GOOGLE] fetch…');
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}` +
    `&language=pt-BR&result_type=street_address|locality&key=${GOOGLE_MAPS_KEY}`;

  const json = await withTimeout(
    fetch(url).then((r) => r.json()),
    CONF.providerTimeoutMs,
    'GOOGLE_TIMEOUT'
  );

  const first = (json.results || [])[0];
  const base = first ? extractGoogle(first) : {};

  console.log('[CEP][GOOGLE] result=', base);
  return {
    cep: base.cep,
    address: base,
    provider: 'google',
    candidates: json.results,
  };
}

async function reverseWithOpenCage(lat, lng) {
  if (!OPENCAGE_KEY) {
    throw new Error('OPENCAGE_KEY_MISSING');
  }

  console.log('[CEP][OPENCAGE] fetch…');
  const url =
    `https://api.opencagedata.com/geocode/v1/json?q=${lat}%2C${lng}&key=${OPENCAGE_KEY}` +
    `&language=pt-BR&countrycode=br`;

  const json = await withTimeout(
    fetch(url).then((r) => r.json()),
    CONF.providerTimeoutMs,
    'OPENCAGE_TIMEOUT'
  );

  const best = (json.results || [])[0];
  const m = best ? extractOpenCage(best) : {};

  console.log('[CEP][OPENCAGE] result=', m);
  return { cep: m.cep, address: m, provider: 'opencage' };
}

async function reverseWithLocationIQ(lat, lng) {
  if (!LOCATIONIQ_KEY) {
    throw new Error('LOCATIONIQ_KEY_MISSING');
  }

  console.log('[CEP][LOCATIONIQ] fetch…');
  // doc: https://locationiq.com/docs#reverse-geocoding
  // On force le pays et la langue pour maximiser les chances d'un CEP brésilien
  const url =
    `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lng}` +
    `&format=json&normalizeaddress=1&accept-language=pt-BR&addressdetails=1`;

  const json = await withTimeout(
    fetch(url).then((r) => r.json()),
    CONF.providerTimeoutMs,
    'LOCATIONIQ_TIMEOUT'
  );

  const m = extractLocationIQ(json);
  console.log('[CEP][LOCATIONIQ] result=', m);
  return { cep: m.cep, address: m, provider: 'locationiq' };
}

// ---- Export principal ----
export async function resolveExactCepFromCoords(lat, lng) {
  // 1) cache
  const cached = getCache(lat, lng);
  if (cached) {
    console.log('[CEP][CACHE] hit');
    return cached;
  }

  const start = Date.now();

  // 2) Google (first)
  try {
    const g = await reverseWithGoogle(lat, lng);
    setCache(lat, lng, g);
    return { ...g, ms: Date.now() - start };
  } catch (e) {
    console.log('[CEP] google fail:', e.message);
  }

  // 3) OpenCage (si clé dispo)
  if (OPENCAGE_KEY) {
    try {
      const oc = await reverseWithOpenCage(lat, lng);
      setCache(lat, lng, oc);
      return { ...oc, ms: Date.now() - start };
    } catch (e) {
      console.log('[CEP] opencage fail:', e.message);
    }
  }

  // 4) LocationIQ (si clé dispo)
  if (LOCATIONIQ_KEY) {
    try {
      const liq = await reverseWithLocationIQ(lat, lng);
      setCache(lat, lng, liq);
      return { ...liq, ms: Date.now() - start };
    } catch (e) {
      console.log('[CEP] locationiq fail:', e.message);
    }
  }

  // 5) échec total
  console.log('[CEP] all providers failed');
  return { cep: '', address: {}, provider: 'none', ms: Date.now() - start };
}
