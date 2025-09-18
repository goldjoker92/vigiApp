// utils/geoCep.js
// -------------------------------------------------------------
// CEP -> Lat/Lng avec cache Firestore
// - Normalise le CEP "NNNNNNNN"
// - ViaCEP (adresse) -> OSM/Nominatim (lat/lon)
// - Cache Firestore: /ceps/{cep}
// - Options: forceRefresh, maxAgeDays, userAgent, sleepMs
// -------------------------------------------------------------
import { doc, getDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '@/firebase';

// ====================== Helpers ======================

// Normalise un CEP en "NNNNNNNN"
export function normalizeCep(cep) {
  if (!cep) {
    return null;
  }
  const digits = String(cep).replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

// Petite pause (gentillesse réseau, surtout OSM)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Renvoie true si "updatedAt" est plus vieux que maxAgeDays
function isStale(updatedAt, maxAgeDays) {
  if (!updatedAt || !maxAgeDays || maxAgeDays <= 0) {
    return false;
  }
  const ts = updatedAt?.toDate ? updatedAt.toDate() : new Date(updatedAt);
  const ageMs = Date.now() - ts.getTime();
  return ageMs > maxAgeDays * 24 * 3600 * 1000;
}

// ====================== Providers ======================

// ViaCEP -> adresse (pas de lat/lng)
async function fetchViaCep(cep) {
  const url = `https://viacep.com.br/ws/${cep}/json/`;
  console.log('[geoCep][ViaCEP] GET', url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ViaCEP HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data?.erro) {
    throw new Error('ViaCEP: CEP desconhecido');
  }

  const out = {
    logradouro: data.logradouro || '',
    bairro: data.bairro || '',
    localidade: data.localidade || '',
    uf: data.uf || '',
    cep: data.cep || cep,
  };
  console.log('[geoCep][ViaCEP] OK', out);
  return out;
}

// OSM/Nominatim -> lat/lng
async function geocodeWithOsm({ logradouro, bairro, localidade, uf }, { userAgent } = {}) {
  const parts = [logradouro, bairro, localidade, uf, 'Brasil'].filter(Boolean);
  const q = encodeURIComponent(parts.join(', '));
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=0`;
  console.log('[geoCep][OSM] GET', url);

  const res = await fetch(url, {
    headers: {
      'User-Agent': userAgent || 'VigiApp/1.0 (contact: suporte@exemple.com)',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) {
    throw new Error(`OSM HTTP ${res.status}`);
  }

  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('OSM: no results');
  }

  const item = arr[0];
  const lat = parseFloat(item.lat);
  const lng = parseFloat(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('OSM: invalid coordinates');
  }

  const out = { lat, lng, raw: { display_name: item.display_name || null } };
  console.log('[geoCep][OSM] OK', out);
  return out;
}

// ====================== API principale ======================

/**
 * Résout un CEP -> { lat, lng } avec cache Firestore (/ceps/{cep})
 *
 * @param {string} cepRaw  CEP "NNNNNNNN" (ou avec tiret/espaces)
 * @param {object} options
 *  - forceRefresh?: boolean (ignore le cache et refait les appels)
 *  - maxAgeDays?: number   (si cache plus vieux -> refresh ; défaut: 180j)
 *  - userAgent?: string    (User-Agent pour OSM)
 *  - sleepMs?: number      (pause entre ViaCEP et OSM ; défaut: 200ms)
 *
 * @returns {Promise<{ lat:number, lng:number, source:string, fromCache:boolean, cep:string, address?:object }>}
 */
export async function resolveCepToLatLng(cepRaw, options = {}) {
  const { forceRefresh = false, maxAgeDays = 180, userAgent, sleepMs = 200 } = options;

  const cep = normalizeCep(cepRaw);
  if (!cep) {
    throw new Error('CEP inválido');
  }

  // 1) Cache Firestore
  let needFetch = true;
  try {
    const ref = doc(db, 'ceps', cep);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data();
      const hasCoords = typeof d.lat === 'number' && typeof d.lng === 'number';
      const stale = isStale(d.updatedAt || d.updated_at || d.updated_at_ms, maxAgeDays);
      console.log('[geoCep][CACHE] HIT', { cep, hasCoords, stale, forceRefresh });

      if (hasCoords && !forceRefresh && !stale) {
        // incrémente un compteur à côté (fire-and-forget)
        setDoc(ref, { hitCount: increment(1) }, { merge: true }).catch(() => {});
        return { lat: d.lat, lng: d.lng, source: 'cache', fromCache: true, cep };
      } else {
        needFetch = true;
      }
    } else {
      console.log('[geoCep][CACHE] MISS', cep);
    }
  } catch (e) {
    console.warn('[geoCep][CACHE] read error', e);
    needFetch = true; // continue en réseau
  }

  if (!needFetch) {
    // Sûreté paranoïaque
    throw new Error('Unexpected state: needFetch=false without cache return');
  }

  // 2) ViaCEP -> 3) OSM
  try {
    const address = await fetchViaCep(cep);
    await sleep(sleepMs);
    const geo = await geocodeWithOsm(address, { userAgent });

    // 4) Stockage / Merge Firestore
    const body = {
      lat: geo.lat,
      lng: geo.lng,
      updatedAt: serverTimestamp(),
      source: 'viacep+osm',
      raw: { viaCep: address, osm: geo.raw || null },
      hitCount: increment(1),
    };
    try {
      await setDoc(doc(db, 'ceps', cep), body, { merge: true });
      console.log('[geoCep][CACHE] STORED', cep, { lat: geo.lat, lng: geo.lng });
    } catch (e) {
      console.warn('[geoCep][CACHE] write error', e);
    }

    return { lat: geo.lat, lng: geo.lng, source: 'viacep+osm', fromCache: false, cep, address };
  } catch (e) {
    console.warn('[geoCep] resolve error', e);
    throw e;
  }
}

// ====================== (Optionnel) utilitaires ======================

/**
 * Résout une liste de CEPs en série (évite de spammer OSM).
 * @param {string[]} ceps
 * @param {object} opts  (mêmes options que resolveCepToLatLng)
 * @returns {Promise<Array<{cep:string, ok:boolean, result?:any, error?:string}>>}
 */
export async function resolveCepBatch(ceps, opts = {}) {
  const out = [];
  for (const c of ceps) {
    try {
      const r = await resolveCepToLatLng(c, opts);
      out.push({ cep: normalizeCep(c), ok: true, result: r });
      await sleep(opts.sleepMs || 200);
    } catch (e) {
      out.push({ cep: normalizeCep(c), ok: false, error: String(e?.message || e) });
      // petite pause aussi en cas d'erreur
      await sleep((opts.sleepMs || 200) * 2);
    }
  }
  return out;
}
