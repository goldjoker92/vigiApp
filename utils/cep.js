// utils/cep.js
// -------------------------------------------------------------
// Rôle : obtenir un CEP le plus exact possible depuis (lat,lng)
// Ordre : GOOGLE -> ViaCEP (validations/variantes) -> OSM -> Fallback profil -> adresse partielle
// Sans régression : si Google a la clé, on repasse EXACTEMENT par le flux “d’avant”.
// Logs détaillés à chaque étape, sans fuite de clé.
// -------------------------------------------------------------
import { GOOGLE_MAPS_KEY } from './env';

export const CEP_ENGINE_VERSION = 'v3.4-google-first+variants+robust';
console.log('[CEP][VER]', CEP_ENGINE_VERSION);

// ---------- Helpers & Const ----------
const NOMINATIM_UA = 'vigiapp/1.0 (support@vigiapp.app)';
const onlyDigits = (s = '') => String(s || '').replace(/\D/g, '');
const padCepMask = (cep8) =>
  cep8 && cep8.length === 8 ? `${cep8.slice(0, 5)}-${cep8.slice(5)}` : undefined;

const stripUpper = (s = '') =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

const normalize = (s = '') =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

// chiffres portugais (simple & utile pour “Seis de Maio” -> “6 de Maio”)
const PT_NUM_REPL = [
  [/^\bzero\b/gi, '0'],
  [/\bum[ao]?\b/gi, '1'],
  [/\b(dois|duas)\b/gi, '2'],
  [/\b(tr[eé]s)\b/gi, '3'],
  [/\bquatro\b/gi, '4'],
  [/\bcinco\b/gi, '5'],
  [/\bseis\b/gi, '6'],
  [/\bsete\b/gi, '7'],
  [/\boito\b/gi, '8'],
  [/\bnove\b/gi, '9'],
  [/\bdez\b/gi, '10'],
];
const wordsToDigitsPT = (str = '') =>
  PT_NUM_REPL.reduce((acc, [r, v]) => acc.replace(r, v), String(str || ''));

function canonStreet(raw = '') {
  const withDigits = wordsToDigitsPT(String(raw || '').trim());
  const s = withDigits
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
  const noType = s
    .replace(/^(rua|avenida|av\.?|travessa|tv\.?|alameda|estrada|rodovia|pra[çc]a)\s+/i, '')
    .trim();
  return noType
    .replace(/\b(d[eaos]{1,2})\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const UF_MAP = {
  ACRE: 'AC',
  ALAGOAS: 'AL',
  AMAPA: 'AP',
  AMAPÁ: 'AP',
  AMAZONAS: 'AM',
  BAHIA: 'BA',
  CEARA: 'CE',
  CEARÁ: 'CE',
  'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES',
  'ESPÍRITO SANTO': 'ES',
  GOIAS: 'GO',
  GOIÁS: 'GO',
  MARANHAO: 'MA',
  MARANHÃO: 'MA',
  'MATO GROSSO': 'MT',
  'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG',
  PARA: 'PA',
  PARÁ: 'PA',
  PARAIBA: 'PB',
  PARAÍBA: 'PB',
  PARANA: 'PR',
  PARANÁ: 'PR',
  PERNAMBUCO: 'PE',
  PIAUI: 'PI',
  PIAUÍ: 'PI',
  'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS',
  RONDONIA: 'RO',
  RONDÔNIA: 'RO',
  RORAIMA: 'RR',
  'SANTA CATARINA': 'SC',
  'SAO PAULO': 'SP',
  'SÃO PAULO': 'SP',
  SERGIPE: 'SE',
  TOCANTINS: 'TO',
};
const stateToUF = (s = '') => {
  const up = stripUpper(s);
  if (UF_MAP[up]) {
    return UF_MAP[up];
  }
  if (/^[A-Z]{2}$/.test(up)) {
    return up;
  }
  return '';
};

async function fetchJSON(url, init = {}, timeoutMs = 9000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { ...(init || {}), signal: ctrl?.signal });
    if (!res.ok) {
      throw new Error(`HTTP_${res.status}`);
    }
    return await res.json();
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

// ---------- Providers ----------
async function reverseGoogle(lat, lng, apiKey) {
  if (!apiKey) {
    return null;
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&key=${apiKey}&result_type=street_address|premise|route`;
  console.log('[CEP] Google reverse →', url.replace(apiKey, '***'));
  try {
    const data = await fetchJSON(url, {}, 9000);
    console.log('[CEP] Google status =', data?.status, 'error =', data?.error_message || '');
    if (data?.status !== 'OK' || !Array.isArray(data?.results) || data.results.length === 0) {
      return null;
    }

    const res = data.results[0];
    const comps = res.address_components || [];
    const get = (type) => comps.find((x) => (x.types || []).includes(type));
    const out = {
      cep: onlyDigits(get('postal_code')?.long_name || ''),
      street:
        get('route')?.long_name ||
        get('premise')?.long_name ||
        get('point_of_interest')?.long_name ||
        '',
      number: get('street_number')?.long_name || '',
      neighborhood:
        get('sublocality')?.long_name ||
        get('political')?.long_name ||
        get('neighborhood')?.long_name ||
        '',
      city: get('administrative_area_level_2')?.long_name || get('locality')?.long_name || '',
      state: get('administrative_area_level_1')?.short_name || '',
      lat,
      lng,
      source: 'google',
      place_id: res.place_id,
    };
    console.log('[CEP] Google parsed =', {
      cep: out.cep,
      street: out.street,
      city: out.city,
      state: out.state,
    });
    return out;
  } catch (e) {
    console.log('[CEP] Google reverse FAIL:', e?.message || e);
    return null;
  }
}

async function nominatimReverse(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&zoom=19`;
  console.log('[CEP] OSM reverse →', url);
  try {
    const j = await fetchJSON(url, { headers: { 'User-Agent': NOMINATIM_UA } }, 9000);
    const a = j.address || {};
    const out = {
      street: a.road || a.pedestrian || a.footway,
      number: a.house_number,
      neighborhood: a.suburb || a.neighbourhood || a.village || a.hamlet,
      city: a.city || a.town || a.municipality || a.locality || a.county,
      state: a.state,
      postcode: a.postcode ? onlyDigits(a.postcode) : undefined,
      lat,
      lng,
      source: 'nominatim',
    };
    console.log('[CEP] OSM parsed =', out);
    return out;
  } catch (e) {
    console.log('[CEP] OSM reverse FAIL:', e?.message || e);
    return null;
  }
}

async function viaCepByStreet(uf, city, street) {
  if (!uf || !city || !street) {
    return [];
  }
  const variants = [];
  const base = street.trim();
  const noType = base
    .replace(/^(rua|avenida|av\.?|travessa|tv\.?|alameda|estrada|rodovia|pra[çc]a)\s+/i, '')
    .trim();
  const digitsBase = wordsToDigitsPT(base);
  const digitsNoType = wordsToDigitsPT(noType);
  variants.push(base, noType, digitsBase, digitsNoType);

  for (const s of [...new Set(variants)].filter(Boolean)) {
    const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(city.toUpperCase())}/${encodeURIComponent(s)}/json/`;
    try {
      console.log('[CEP] ViaCEP street search →', { uf, city: city.toUpperCase(), street: s });
      const j = await fetchJSON(url, {}, 9000);
      const arr = Array.isArray(j) ? j : [];
      console.log('[CEP] ViaCEP results =', arr.length, '(variant =', s, ')');
      if (arr.length) {
        return arr;
      }
    } catch (e) {
      console.log('[CEP] ViaCEP street FAIL (variant=', s, '):', e?.message || e);
    }
  }
  return [];
}

async function viaCepByCep(cep8) {
  if (!cep8 || cep8.length !== 8) {
    return null;
  }
  const url = `https://viacep.com.br/ws/${cep8}/json/`;
  try {
    console.log('[CEP] ViaCEP by CEP →', url.replace(cep8, cep8.replace(/\d/g, '*')));
    const j = await fetchJSON(url, {}, 9000);
    if (j?.erro) {
      return null;
    }
    return j;
  } catch (e) {
    console.log('[CEP] ViaCEP by CEP FAIL:', e?.message || e);
    return null;
  }
}

const isGenericCep = (cep8) => !!cep8 && cep8.length === 8 && cep8.slice(5) === '000';

// ---------- API ----------
/**
 * @param {number} lat
 * @param {number} lng
 * @param {{ googleApiKey?: string, expectedCep?: string, expectedCity?: string, expectedUF?: string }} [opts]
 * @returns {Promise<{cep?:string, candidates?:any[], address:{logradouro?:string,numero?:string,bairro?:string,cidade?:string,uf?:string}}>}
 */
export async function resolveExactCepFromCoords(lat, lng, opts = {}) {
  console.log('[CEP] resolveExactCepFromCoords START:', { lat, lng, ver: CEP_ENGINE_VERSION });
  const candidates = [];
  const key = (opts.googleApiKey || GOOGLE_MAPS_KEY || '').trim();
  console.log('[CEP] googleApiKey present =', !!key);

  // 0) GOOGLE FIRST (comportement d’avant)
  const g = await reverseGoogle(lat, lng, key);
  if (g) {
    candidates.push(g);
    const uf = stateToUF(g.state || '');
    const city = g.city || '';
    const street = g.street || '';

    if (g.cep && g.cep.length >= 8) {
      const cep8 = onlyDigits(g.cep).slice(0, 8);
      const via = await viaCepByCep(cep8);

      if (via?.logradouro) {
        const cepMasked = padCepMask(cep8);
        console.log('[CEP] ACCEPT Google CEP (ViaCEP OK) →', cepMasked);
        return {
          cep: cepMasked,
          candidates,
          address: {
            logradouro: via.logradouro || street || '',
            numero: g.number || '',
            bairro: via.bairro || g.neighborhood || '',
            cidade: via.localidade || city || '',
            uf: (via.uf || uf).slice(0, 2).toUpperCase(),
          },
        };
      }

      if (isGenericCep(cep8) || !via) {
        console.log('[CEP] Google CEP gen./noVia → tenter ViaCEP par rue…');
        if (uf && city && street) {
          const list = await viaCepByStreet(uf, city, street);
          const canon = canonStreet(street);
          const strict = list.filter((x) => canonStreet(x.logradouro || '') === canon);
          const pick = strict[0] || list[0];
          if (pick?.cep) {
            const c8 = onlyDigits(pick.cep);
            const cepMasked = padCepMask(c8);
            console.log('[CEP] ACCEPT by Street (Google→ViaCEP) →', cepMasked);
            return {
              cep: cepMasked,
              candidates,
              address: {
                logradouro: pick.logradouro || street || '',
                numero: g.number || '',
                bairro: pick.bairro || g.neighborhood || '',
                cidade: pick.localidade || city || '',
                uf: (pick.uf || uf).slice(0, 2).toUpperCase(),
              },
            };
          }
        }
        const cepMasked = padCepMask(cep8);
        console.log('[CEP] FALLBACK keep Google CEP (sectorial/no Via logradouro) →', cepMasked);
        return {
          cep: cepMasked,
          candidates,
          address: {
            logradouro: street || '',
            numero: g.number || '',
            bairro: g.neighborhood || '',
            cidade: city || '',
            uf: (uf || '').slice(0, 2).toUpperCase(),
          },
        };
      }
    }

    if (!g.cep && street && city && uf) {
      console.log('[CEP] Google sans CEP → ViaCEP par rue…');
      const list = await viaCepByStreet(uf, city, street);
      if (list.length) {
        const canon = canonStreet(street);
        const strict = list.filter((x) => canonStreet(x.logradouro || '') === canon);
        const pick = strict[0] || list[0];
        if (pick?.cep) {
          const c8 = onlyDigits(pick.cep);
          const cepMasked = padCepMask(c8);
          console.log('[CEP] ACCEPT by Street (Google→ViaCEP) →', cepMasked);
          return {
            cep: cepMasked,
            candidates,
            address: {
              logradouro: pick.logradouro || street || '',
              numero: g.number || '',
              bairro: pick.bairro || g.neighborhood || '',
              cidade: pick.localidade || city || '',
              uf: (pick.uf || uf).slice(0, 2).toUpperCase(),
            },
          };
        }
      }
    }
  }

  // 1) OSM (secours)
  const rev = await nominatimReverse(lat, lng);
  let basis = rev || null;
  if (rev) {
    candidates.push(rev);
    const uf = stateToUF(rev.state || '');
    const city = rev.city || '';
    const street = rev.street || '';
    if (uf && city && street) {
      console.log('[CEP] OSM→ViaCEP par rue…');
      const list = await viaCepByStreet(uf, city, street);
      const canon = canonStreet(street);
      const strict = list.filter((x) => canonStreet(x.logradouro || '') === canon);
      const pick = strict[0] || list[0];
      if (pick?.cep) {
        const c8 = onlyDigits(pick.cep);
        const cepMasked = padCepMask(c8);
        console.log('[CEP] ACCEPT by Street (OSM→ViaCEP) →', cepMasked);
        return {
          cep: cepMasked,
          candidates,
          address: {
            logradouro: pick.logradouro || street || '',
            numero: rev.number || '',
            bairro: pick.bairro || rev.neighborhood || '',
            cidade: pick.localidade || rev.city || '',
            uf: (pick.uf || uf).slice(0, 2).toUpperCase(),
          },
        };
      }
    }
    if (rev.postcode && !isGenericCep(rev.postcode)) {
      const c8 = onlyDigits(rev.postcode).slice(0, 8);
      const via = await viaCepByCep(c8);
      if (via?.logradouro) {
        const cepMasked = padCepMask(c8);
        console.log('[CEP] ACCEPT OSM postcode (ViaCEP OK) →', cepMasked);
        return {
          cep: cepMasked,
          candidates,
          address: {
            logradouro: via.logradouro || rev.street || '',
            numero: rev.number || '',
            bairro: via.bairro || rev.neighborhood || '',
            cidade: via.localidade || rev.city || '',
            uf: (via.uf || stateToUF(rev.state || '')).slice(0, 2).toUpperCase(),
          },
        };
      }
    }
  }

  // 2) Fallback profil (ville/UF strictes si CEP attendu donné)
  const expectedCep8 = onlyDigits(opts?.expectedCep || '');
  const expUF = stateToUF(opts?.expectedUF || '');
  const expCityNorm = normalize(opts?.expectedCity || '');
  if (expectedCep8) {
    console.log('[CEP] Fallback profil → vérifier CEP user', expectedCep8);
    const viaUser = await viaCepByCep(expectedCep8);
    if (viaUser?.localidade && viaUser?.uf) {
      const cidadeOk = normalize(viaUser.localidade) === expCityNorm;
      const ufOk = stateToUF(viaUser.uf) === expUF;
      console.log('[CEP] Fallback checks =', {
        cidadeOk,
        ufOk,
        localidade: viaUser.localidade,
        uf: viaUser.uf,
      });
      if (cidadeOk && ufOk) {
        const cepMasked = padCepMask(expectedCep8);
        console.log('[CEP] ACCEPT fallback profile CEP →', cepMasked);
        return {
          cep: cepMasked,
          candidates: [...candidates, { ...viaUser, source: 'fallback_usercep' }],
          address: {
            logradouro: viaUser.logradouro || basis?.street || g?.street || '',
            numero: basis?.number || g?.number || '',
            bairro: viaUser.bairro || basis?.neighborhood || g?.neighborhood || '',
            cidade: viaUser.localidade,
            uf: viaUser.uf,
          },
        };
      }
    }
  }

  // 3) Échec — adresse partielle (toujours utile à afficher)
  console.log('[CEP] Échec CEP EXATO → retour adresse partielle, sem cep');
  const addr = {
    logradouro: basis?.street || g?.street || '',
    numero: basis?.number || g?.number || '',
    bairro: basis?.neighborhood || g?.neighborhood || '',
    cidade: basis?.city || g?.city || '',
    uf: stateToUF(basis?.state || g?.state || ''),
  };
  return { cep: undefined, candidates, address: addr };
}
// -------------------------------------------------------------
