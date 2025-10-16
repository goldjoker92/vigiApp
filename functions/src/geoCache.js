// functions/src/geoCache.js
// =============================================================================
// Super Cache Géocodage — plug & play (mémoire locale + Firestore)
// - keyFromAddress(endereco?, bairro?, city?, uf?) => "geo:addr:<clé normalisée>"
// - keyFromCEP(cep)                                  => "geo:cep:<numéro>"
// - getCachedGeo(cacheKey)                           => {lat,lng,precision,provider}|null
// - setCachedGeo(cacheKey, payload, ttlMs?)          => écrit en mémoire + Firestore
// - withGeoCache(cacheKey, resolverFn, ttlMs?)       => lit cache, sinon résout + écrit
// - purgeExpired(batchSize?)                         => (optionnel) supprime les expirés
// =============================================================================

const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore'); // ⬅️ IMPORTANT

// -------- Mémoire locale (par instance CF) --------
const _mem = new Map();
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours

// -------- Utils normalisation --------
function _normStr(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/\s+/g, ' ') // espaces multiples -> simple
    .replace(/[^\w\s,-]/g, '') // retire les symboles parasites
    .trim()
    .toLowerCase();
}

function keyFromAddress(endereco, bairro, city, uf) {
  const parts = [_normStr(endereco), _normStr(bairro), _normStr(city), _normStr(uf), 'brasil']
    .filter(Boolean)
    .join('|');
  if (!parts) {
    return null;
  }
  return `geo:addr:${parts}`;
}

function keyFromCEP(cep) {
  const num = String(cep || '')
    .replace(/\D+/g, '')
    .slice(0, 8);
  if (!num) {
    return null;
  }
  return `geo:cep:${num}`;
}

// -------- Accès Firestore --------
function _db() {
  try {
    admin.app();
  } catch {
    admin.initializeApp();
  }
  return admin.firestore();
}

async function _readFS(cacheKey) {
  const snap = await _db().collection('geo_cache').doc(cacheKey).get();
  if (!snap.exists) {
    return null;
  }
  const doc = snap.data() || {};

  // expiration
  if (doc.expiresAt && doc.expiresAt.toMillis && doc.expiresAt.toMillis() < Date.now()) {
    return null;
  }

  if (typeof doc.lat === 'number' && typeof doc.lng === 'number') {
    return {
      lat: doc.lat,
      lng: doc.lng,
      precision: doc.precision || 'UNKNOWN',
      provider: doc.provider || 'cache',
      updatedAt: doc.updatedAt || null,
      expiresAt: doc.expiresAt || null,
    };
  }
  return null;
}

async function _writeFS(cacheKey, payload, ttlMs = DEFAULT_TTL_MS) {
  const now = Timestamp.now(); // ✅
  const exp = Timestamp.fromMillis(Date.now() + Math.max(60_000, ttlMs)); // ✅ min 1 min
  const body = {
    lat: payload.lat,
    lng: payload.lng,
    precision: payload.precision || 'UNKNOWN',
    provider: payload.provider || 'unknown',
    updatedAt: now,
    expiresAt: exp,
  };
  await _db().collection('geo_cache').doc(cacheKey).set(body, { merge: true });
  return body;
}

// -------- API publique --------
async function getCachedGeo(cacheKey) {
  if (!cacheKey) {
    return null;
  }

  // 1) mémoire
  const m = _mem.get(cacheKey);
  if (m && m.expiresMs && m.expiresMs > Date.now()) {
    return { lat: m.lat, lng: m.lng, precision: m.precision, provider: m.provider };
  }

  // 2) Firestore
  const fs = await _readFS(cacheKey);
  if (fs) {
    _mem.set(cacheKey, {
      lat: fs.lat,
      lng: fs.lng,
      precision: fs.precision,
      provider: fs.provider || 'cache',
      expiresMs: fs.expiresAt?.toMillis ? fs.expiresAt.toMillis() : Date.now() + DEFAULT_TTL_MS,
    });
    return { lat: fs.lat, lng: fs.lng, precision: fs.precision, provider: 'cache' };
  }

  return null;
}

async function setCachedGeo(cacheKey, payload, ttlMs = DEFAULT_TTL_MS) {
  if (!cacheKey || !payload || typeof payload.lat !== 'number' || typeof payload.lng !== 'number') {
    return;
  }

  // mémoire
  _mem.set(cacheKey, {
    lat: payload.lat,
    lng: payload.lng,
    precision: payload.precision || 'UNKNOWN',
    provider: payload.provider || 'unknown',
    expiresMs: Date.now() + Math.max(60_000, ttlMs),
  });

  // Firestore
  await _writeFS(cacheKey, payload, ttlMs);
}

async function withGeoCache(cacheKey, resolverFn, ttlMs = DEFAULT_TTL_MS) {
  const cached = await getCachedGeo(cacheKey);
  if (cached) {
    return { ...cached, provider: 'cache' };
  }

  const resolved = await resolverFn(); // -> {lat, lng, precision?, provider?}
  if (resolved && typeof resolved.lat === 'number' && typeof resolved.lng === 'number') {
    await setCachedGeo(cacheKey, resolved, ttlMs);
  }
  return resolved;
}

// -------- Housekeeping (optionnel) --------
async function purgeExpired(batchSize = 50) {
  const now = Timestamp.now(); // ✅
  const q = await _db().collection('geo_cache').where('expiresAt', '<', now).limit(batchSize).get();

  const batch = _db().batch();
  q.docs.forEach((d) => batch.delete(d.ref));
  if (!q.empty) {
    await batch.commit();
  }
  return q.size;
}

module.exports = {
  keyFromAddress,
  keyFromCEP,
  getCachedGeo,
  setCachedGeo,
  withGeoCache,
  purgeExpired,
  DEFAULT_TTL_MS,
};
