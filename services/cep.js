/* utils/cep.js — robuste (JS pur, commenté + loggé)
 * Exporte: resolveExactCepFromCoords, GOOGLE_MAPS_KEY, hasGoogleKey, withTimeout
 * Cascade: Google → OpenCage (si clé) → LocationIQ (si clé) → fallback
 * Timeouts fermes (8s / provider) + cache mémoire 5 min (lat/lng arrondis)
 * Compat shape: { address, addr } ; CEP normalisé (8 chiffres) + cepMask
 * Logs: [CEP] / [CEP][GOOGLE] / [CEP][OPENCAGE] / [CEP][LOCATIONIQ] / [CEP][VIACEP]
 */

// ---- Clés env ----
export const GOOGLE_MAPS_KEY = (
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  process.env.GOOGLE_MAPS_KEY ||
  ''
).trim();
const OPENCAGE_KEY = (process.env.EXPO_PUBLIC_OPENCAGE_KEY || '').trim();
const LOCATIONIQ_KEY = (
  process.env.EXPO_PUBLIC_LOCATIONIQ_KEY ||
  process.env.LOCATIONIQ_KEY ||
  ''
).trim();

export const hasGoogleKey = () => !!GOOGLE_MAPS_KEY && GOOGLE_MAPS_KEY.length > 10;

// ---- Config ----
const CONF = {
  providerTimeoutMs: 8000, // Timeout max par provider
  viacepTimeoutMs: 3000, // Timeout ViaCEP soft-check
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  cachePrecision: 4, // Lat/lng arrondis à 4 décimales
  googleResultTypes: 'street_address|premise|route|locality',
};

// ---- Utils ----
export function withTimeout(promise, ms, tag = 'timeout') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(tag)), ms);
    Promise.resolve(promise)
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
const padCep8 = (s) => onlyDigits(s).padStart(8, '0');
const maskCep = (cep8) => (cep8 && cep8.length === 8 ? `${cep8.slice(0, 5)}-${cep8.slice(5)}` : '');
const _isGenericCep = (cep8) => !!cep8 && cep8.length === 8 && cep8.slice(5) === '000';

// ---- Cache mémoire ----
const cache = new Map();
const k = (lat, lng) =>
  `${Number(lat).toFixed(CONF.cachePrecision)}:${Number(lng).toFixed(CONF.cachePrecision)}`;

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

  const cep8 = padCep8(find('postal_code')?.long_name);
  const cidade =
    find('locality')?.long_name || find('administrative_area_level_2')?.long_name || '';
  const uf =
    find('administrative_area_level_1')?.short_name ||
    find('administrative_area_level_1')?.long_name ||
    '';

  // Optional: logradouro/bairro si disponibles via formatted_address & comps
  const route = find('route')?.long_name || '';
  const street_number = find('street_number')?.long_name || '';
  const bairro =
    comps.find((c) => (c.types || []).includes('sublocality'))?.long_name ||
    comps.find((c) => (c.types || []).includes('sublocality_level_1'))?.long_name ||
    '';

  const logradouro = [route, street_number].filter(Boolean).join(', ');

  return { cep: cep8, cidade, uf, bairro, logradouro };
}

function extractOpenCage(obj) {
  const c = obj?.components || {};
  return {
    cep: padCep8(c.postcode),
    cidade: c.city || c.town || c.village || '',
    uf: c.state_code || c.state || '',
    bairro: c.suburb || c.neighbourhood || '',
    logradouro: c.road || '',
  };
}

function extractLocationIQ(obj) {
  // LocationIQ reverse renvoie { address: { postcode, city|town|village, state, neighbourhood, road, house_number } }
  const a = obj?.address || {};
  const logradouro = [a.road, a.house_number].filter(Boolean).join(', ');
  return {
    cep: padCep8(a.postcode),
    cidade: a.city || a.town || a.village || '',
    uf: a.state || '',
    bairro: a.neighbourhood || '',
    logradouro,
  };
}

// ---- ViaCEP soft-check + enrich ----
async function softValidateAndEnrichViaCep(cep8) {
  if (!cep8 || cep8.length !== 8) {
    return { ok: false };
  }
  try {
    const url = `https://viacep.com.br/ws/${cep8}/json/`;
    const json = await withTimeout(
      fetch(url).then((r) => r.json()),
      CONF.viacepTimeoutMs,
      'VIACEP_TIMEOUT'
    );
    if (!json || json.erro) {
      console.log('[CEP][VIACEP] not found/erro for', cep8);
      return { ok: false };
    }
    // ViaCEP fields: logradouro, bairro, localidade (cidade), uf, cep (mask)
    const enriched = {
      cep: padCep8(json.cep),
      cidade: json.localidade || '',
      uf: json.uf || '',
      bairro: json.bairro || '',
      logradouro: json.logradouro || '',
    };
    return { ok: true, data: enriched };
  } catch (e) {
    console.log('[CEP][VIACEP] fail:', e?.message || e);
    return { ok: false };
  }
}

// ---- Providers ----
async function reverseWithGoogle(lat, lng) {
  if (!hasGoogleKey()) {
    throw new Error('GOOGLE_KEY_MISSING');
  }

  console.log('[CEP][GOOGLE] fetch…');
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}` +
    `&language=pt-BR&result_type=${encodeURIComponent(CONF.googleResultTypes)}&key=${GOOGLE_MAPS_KEY}`;

  const json = await withTimeout(
    fetch(url).then((r) => r.json()),
    CONF.providerTimeoutMs,
    'GOOGLE_TIMEOUT'
  );

  const first = (json.results || [])[0];
  const base = first ? extractGoogle(first) : {};

  console.log('[CEP][GOOGLE] result =', base);

  // Soft-validate + enrich (non bloquant)
  let verifiedBy = null;
  if (base?.cep) {
    const chk = await softValidateAndEnrichViaCep(base.cep);
    if (chk.ok) {
      verifiedBy = 'viacep';
      // merge enrich sans écraser ville/uf si vides côté Google
      base.cidade = base.cidade || chk.data.cidade;
      base.uf = base.uf || chk.data.uf;
      base.bairro = base.bairro || chk.data.bairro;
      base.logradouro = base.logradouro || chk.data.logradouro;
      console.log('[CEP][GOOGLE] ViaCEP soft-check OK', base.cep);
    } else {
      console.log('[CEP][GOOGLE] ViaCEP soft-check FAIL pour', base.cep);
    }
  }

  return {
    cep: base.cep,
    cepMask: maskCep(base.cep),
    address: base,
    addr: base, // alias compat
    provider: 'google',
    verifiedBy,
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

  // Soft-validate (non bloquant)
  let verifiedBy = null;
  if (m?.cep) {
    const chk = await softValidateAndEnrichViaCep(m.cep);
    if (chk.ok) {
      verifiedBy = 'viacep';
      m.cidade = m.cidade || chk.data.cidade;
      m.uf = m.uf || chk.data.uf;
      m.bairro = m.bairro || chk.data.bairro;
      m.logradouro = m.logradouro || chk.data.logradouro;
      console.log('[CEP][OPENCAGE] ViaCEP soft-check OK', m.cep);
    } else {
      console.log('[CEP][OPENCAGE] ViaCEP soft-check FAIL pour', m.cep);
    }
  }

  console.log('[CEP][OPENCAGE] result =', m);
  return {
    cep: m.cep,
    cepMask: maskCep(m.cep),
    address: m,
    addr: m,
    provider: 'opencage',
    verifiedBy,
  };
}

async function reverseWithLocationIQ(lat, lng) {
  if (!LOCATIONIQ_KEY) {
    throw new Error('LOCATIONIQ_KEY_MISSING');
  }

  console.log('[CEP][LOCATIONIQ] fetch…');
  // doc: https://locationiq.com/docs#reverse-geocoding
  const url =
    `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lng}` +
    `&format=json&normalizeaddress=1&accept-language=pt-BR&addressdetails=1`;

  const json = await withTimeout(
    fetch(url).then((r) => r.json()),
    CONF.providerTimeoutMs,
    'LOCATIONIQ_TIMEOUT'
  );

  const m = extractLocationIQ(json);

  // Soft-validate (non bloquant)
  let verifiedBy = null;
  if (m?.cep) {
    const chk = await softValidateAndEnrichViaCep(m.cep);
    if (chk.ok) {
      verifiedBy = 'viacep';
      m.cidade = m.cidade || chk.data.cidade;
      m.uf = m.uf || chk.data.uf;
      m.bairro = m.bairro || chk.data.bairro;
      m.logradouro = m.logradouro || chk.data.logradouro;
      console.log('[CEP][LOCATIONIQ] ViaCEP soft-check OK', m.cep);
    } else {
      console.log('[CEP][LOCATIONIQ] ViaCEP soft-check FAIL pour', m.cep);
    }
  }

  console.log('[CEP][LOCATIONIQ] result =', m);
  return {
    cep: m.cep,
    cepMask: maskCep(m.cep),
    address: m,
    addr: m,
    provider: 'locationiq',
    verifiedBy,
  };
}

// ---- Export principal ----
// NOTE: accepte un 3e param "opts" (non bloquant) pour compat:
// { expectedCep, expectedCity, expectedUF } — utilisés uniquement pour logs/debug.
export async function resolveExactCepFromCoords(lat, lng, opts = {}) {
  const { expectedCep, expectedCity, expectedUF } = opts || {};
  // 1) cache
  const cached = getCache(lat, lng);
  if (cached) {
    console.log('[CEP][CACHE] hit', {
      expectedCep: expectedCep ? padCep8(expectedCep) : undefined,
      expectedCity: expectedCity ? _normalize(expectedCity) : undefined,
      expectedUF: expectedUF ? _normalize(expectedUF) : undefined,
    });
    return cached;
  }

  const start = Date.now();

  // 2) Google (first)
  try {
    const g = await reverseWithGoogle(lat, lng);
    const out = { ...g, ms: Date.now() - start };
    setCache(lat, lng, out);
    return out;
  } catch (e) {
    console.log('[CEP] google fail:', e?.message || e);
  }

  // 3) OpenCage (si clé dispo)
  if (OPENCAGE_KEY) {
    try {
      const oc = await reverseWithOpenCage(lat, lng);
      const out = { ...oc, ms: Date.now() - start };
      setCache(lat, lng, out);
      return out;
    } catch (e) {
      console.log('[CEP] opencage fail:', e?.message || e);
    }
  }

  // 4) LocationIQ (si clé dispo)
  if (LOCATIONIQ_KEY) {
    try {
      const liq = await reverseWithLocationIQ(lat, lng);
      const out = { ...liq, ms: Date.now() - start };
      setCache(lat, lng, out);
      return out;
    } catch (e) {
      console.log('[CEP] locationiq fail:', e?.message || e);
    }
  }

  // 5) Échec total
  console.log('[CEP] all providers failed');
  const out = {
    cep: '',
    cepMask: '',
    address: {},
    addr: {},
    provider: 'none',
    verifiedBy: null,
    ms: Date.now() - start,
  };
  setCache(lat, lng, out);
  return out;
}
