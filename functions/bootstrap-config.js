/* ============================================================================
   /functions/bootstrap-config.js
   Bootstrap config pour Cloud Functions v2

   - Charge .env (local) et merge avec functions.config() (prod / émulateur)
   - Normalise et dérive les variables (bool/int/bytes)
   - Paramètres upload: ALLOWED_MIME, MAX_UPLOAD_MB → UPLOAD_MAX_BYTES, UPLOAD_BUCKET, UPLOAD_IDEM_TTL_MIN
   - Logging JSON + console.table (sans secrets)
   - Idempotent: un seul bootstrap par process
   - Export léger: getConfig() renvoie un objet propre, typé
   ============================================================================ */

'use strict';

(() => {
  // ---------------------------------------------------------------------------
  // 0) Idempotence process-wide
  // ---------------------------------------------------------------------------
  if (global.__VIGI_BOOTSTRAP_DONE__) {
     
    console.log('[BOOTSTRAP] SKIP (déjà initialisé)');
    // Retourne le cache si déjà prêt
     
    module.exports = module.exports || {
      getConfig() {
        return global.__VIGI_BOOT_CONF__ || {};
      },
    };
    return;
  }

  const T0 = Date.now();
   
  console.log('[BOOTSTRAP] START');

  // ---------------------------------------------------------------------------
  // 1) Utils (log/format/cast)
  // ---------------------------------------------------------------------------
  const nowIso = () => new Date().toISOString();
  const logJ = (lvl, msg, extra = {}) => {
     
    (lvl === 'error'
      ? console.error
      : lvl === 'warn'
        ? console.warn
        : console.log)(
      JSON.stringify({ ts: nowIso(), lvl, mod: 'bootstrap', msg, ...extra }),
    );
  };

  const safeMask = (s) => {
    if (!s) {
      return '';
    }
    const str = String(s);
    if (str.length <= 8) {
      return '********';
    }
    return `${str.slice(0, 2)}…${str.slice(-4)}`;
  };

  const toBool = (v, def = false) => {
    if (typeof v === 'boolean') {
      return v;
    }
    if (typeof v === 'number') {
      return v !== 0;
    }
    if (typeof v !== 'string') {
      return def;
    }
    const s = v.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(s)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off', ''].includes(s)) {
      return false;
    }
    return def;
  };

  const toInt = (v, def) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  };

  const setIfMissing = (key, val) => {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val === undefined || val === null ? '' : String(val);
    }
  };

  const printTable = (pairs) => {
    const rows = pairs.map(([k, v, isSecret]) => ({
      key: k,
      value: isSecret ? safeMask(v) : String(v),
    }));
    try {
       
      console.log('\n[BOOTSTRAP][TABLE] ENV RÉSUMÉ');
       
      console.table(rows);
    } catch {
       
      console.log('[BOOTSTRAP] ENV:', rows);
    }
  };

  // ---------------------------------------------------------------------------
  // 2) Charger .env (local/dev)
  // ---------------------------------------------------------------------------
  try {
     
    require('dotenv').config();
    logJ('info', '.env chargé');
  } catch {
    logJ('warn', '.env absent (OK si prod)');
  }

  // ---------------------------------------------------------------------------
  // 3) Charger functions.config() (prod/emulator)
  //    On merge app + vigi (+ push si présent) dans un flat
  // ---------------------------------------------------------------------------
  let cfgFn = {};
  try {
     
    const functions = require('firebase-functions');
    const appCfg = (functions.config && functions.config().app) || {};
    const vigiCfg = (functions.config && functions.config().vigi) || {};
    cfgFn = { ...appCfg, ...vigiCfg };
    if (cfgFn.push && typeof cfgFn.push === 'object') {
      cfgFn = { ...cfgFn, ...cfgFn.push };
    }
    logJ('info', 'functions.config() chargé');
  } catch {
    logJ('warn', 'functions.config() indisponible (local pur ?)');
  }

  // ---------------------------------------------------------------------------
  // 4) Defaults sûrs (alignés avec le code)
  // ---------------------------------------------------------------------------
  const defaults = {
    // Region CF
    HTTP_REGION: 'southamerica-east1',

    // Logs
    LOG_LEVEL: 'info', // info|debug|warn|error

    // Devices/alerts
    DEVICES_COLLECTION: 'devices',
    DEVICE_CITY_FIELD: 'city',
    DEVICE_CEP_FIELD: 'cep',
    DEVICE_LAT_FIELD: 'lat',
    DEVICE_LNG_FIELD: 'lng',
    DEVICE_CHANNEL_PUBLIC_FIELD: 'channels.publicAlerts',
    DEVICE_ENABLED_FIELD: 'active',
    DEVICE_LAST_SEEN_FIELD: 'lastSeenAt',

    ANDROID_CHANNEL_ID: 'alerts-high',
    DEFAULT_TTL_SECONDS: '3600',
    MIN_RADIUS_M: '50',
    MAX_RADIUS_M: '3000',
    DEFAULT_RADIUS_M: '1000',
    BATCH_SIZE: '500',
    DISABLE_FCM_COLOR: 'false',

    // Uploads (CF upload)
    ALLOWED_MIME: 'image/jpeg,image/png,image/webp,image/heic,application/pdf',
    MAX_UPLOAD_MB: '15',            // humain
    UPLOAD_MAX_BYTES: '',           // dérivé si vide
    STORAGE_BUCKET: '',             // bucket par défaut si vide
    UPLOAD_BUCKET: '',              // alias lisible par le handler
    UPLOAD_IDEM_TTL_MIN: '15',      // idempotency TTL (minutes)

    // Project
    PROJECT_ID: '',
  };

  // ---------------------------------------------------------------------------
  // 5) Mapping functions.config() -> env (alias tolérants)
  // ---------------------------------------------------------------------------
  const mapFromCfg = {
    // Infra
    HTTP_REGION: ['http_region', 'region'],
    LOG_LEVEL: ['log_level'],

    // Devices/alerts
    DEVICES_COLLECTION: ['devices_collection', 'devices', 'device_collection'],
    DEVICE_CITY_FIELD: ['device_city_field', 'city_field', 'cidade_field'],
    DEVICE_CEP_FIELD: ['device_cep_field', 'cep_field'],
    DEVICE_LAT_FIELD: ['device_lat_field', 'lat_field'],
    DEVICE_LNG_FIELD: ['device_lng_field', 'lng_field'],
    DEVICE_CHANNEL_PUBLIC_FIELD: ['device_channel_public_field', 'channel_public_field'],
    DEVICE_ENABLED_FIELD: ['device_enabled_field', 'enabled_field', 'active_field'],
    DEVICE_LAST_SEEN_FIELD: ['device_last_seen_field', 'last_seen_field'],

    ANDROID_CHANNEL_ID: ['android_channel_id'],
    DEFAULT_TTL_SECONDS: ['default_ttl_seconds', 'ttl_sec'],
    MIN_RADIUS_M: ['min_radius_m'],
    MAX_RADIUS_M: ['max_radius_m'],
    DEFAULT_RADIUS_M: ['default_radius_m'],
    BATCH_SIZE: ['batch_size'],
    DISABLE_FCM_COLOR: ['disable_fcm_color'],

    // Uploads
    ALLOWED_MIME: ['allowed_mime', 'uploads_allowed_mime'],
    MAX_UPLOAD_MB: ['max_upload_mb', 'uploads_max_mb'],
    UPLOAD_MAX_BYTES: ['upload_max_bytes', 'uploads_max_bytes'],
    STORAGE_BUCKET: ['storage_bucket'],
    UPLOAD_BUCKET: ['uploads_bucket', 'upload_bucket'],
    UPLOAD_IDEM_TTL_MIN: ['upload_idem_ttl_min', 'uploads_idem_ttl_min'],

    // Project
    PROJECT_ID: ['project_id', 'project'],
  };

  // ---------------------------------------------------------------------------
  // 6) Appliquer defaults, puis override par .env, puis functions.config()
  // ---------------------------------------------------------------------------
  Object.entries(defaults).forEach(([k, v]) => setIfMissing(k, v));

  for (const [envKey, aliases] of Object.entries(mapFromCfg)) {
     
    for (const alias of aliases) {
      if (cfgFn && cfgFn[alias] !== undefined && cfgFn[alias] !== '') {
        setIfMissing(envKey, cfgFn[alias]);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 7) Normalisation forte (écrit dans process.env)
  // ---------------------------------------------------------------------------
  // Logs & infra
  process.env.HTTP_REGION = String(process.env.HTTP_REGION || defaults.HTTP_REGION);
  process.env.LOG_LEVEL = String(process.env.LOG_LEVEL || defaults.LOG_LEVEL);

  // Alerts/devices
  process.env.DEFAULT_TTL_SECONDS = String(toInt(process.env.DEFAULT_TTL_SECONDS, 3600));
  process.env.MIN_RADIUS_M = String(toInt(process.env.MIN_RADIUS_M, 50));
  process.env.MAX_RADIUS_M = String(toInt(process.env.MAX_RADIUS_M, 3000));
  process.env.DEFAULT_RADIUS_M = String(toInt(process.env.DEFAULT_RADIUS_M, 1000));
  process.env.BATCH_SIZE = String(Math.max(1, toInt(process.env.BATCH_SIZE, 500)));
  process.env.DISABLE_FCM_COLOR = String(toBool(process.env.DISABLE_FCM_COLOR, false));

  // Uploads (MB → bytes si UPLOAD_MAX_BYTES non fourni)
  process.env.MAX_UPLOAD_MB = String(toInt(process.env.MAX_UPLOAD_MB, 15));
  if (!process.env.UPLOAD_MAX_BYTES || String(process.env.UPLOAD_MAX_BYTES).trim() === '') {
    const mb = toInt(process.env.MAX_UPLOAD_MB, 15);
    process.env.UPLOAD_MAX_BYTES = String(mb * 1024 * 1024);
  }
  // ALLOWED_MIME: si vide, fallback defaults
  if (!process.env.ALLOWED_MIME || process.env.ALLOWED_MIME.trim() === '') {
    process.env.ALLOWED_MIME = defaults.ALLOWED_MIME;
  }
  // UPLOAD_BUCKET: si vide, tomber sur STORAGE_BUCKET (si présent)
  if ((!process.env.UPLOAD_BUCKET || process.env.UPLOAD_BUCKET.trim() === '') && process.env.STORAGE_BUCKET) {
    process.env.UPLOAD_BUCKET = process.env.STORAGE_BUCKET;
  }
  // TTL idempotency (min)
  process.env.UPLOAD_IDEM_TTL_MIN = String(toInt(process.env.UPLOAD_IDEM_TTL_MIN, 15));

  // PROJECT_ID: utile pour scripts CI, bucket par défaut
  if (!process.env.PROJECT_ID || process.env.PROJECT_ID.trim() === '') {
    process.env.PROJECT_ID =
      process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID || '';
  }

  // ---------------------------------------------------------------------------
  // 8) Sanity checks
  // ---------------------------------------------------------------------------
  const requiredKeys = [
    'HTTP_REGION',
    'LOG_LEVEL',
    'DEVICES_COLLECTION',
    'DEVICE_CITY_FIELD',
    'DEVICE_CEP_FIELD',
    'DEVICE_LAT_FIELD',
    'DEVICE_LNG_FIELD',
    'ANDROID_CHANNEL_ID',
  ];
  const missing = requiredKeys.filter((k) => !process.env[k] || process.env[k] === '');
  if (missing.length) {
    logJ('warn', 'clés manquantes (defaults couvrent peut-être)', { missing });
  }

  // ---------------------------------------------------------------------------
  // 9) Logging de synthèse (sans secrets)
  // ---------------------------------------------------------------------------
  printTable([
    // Infra
    ['PROJECT_ID', process.env.PROJECT_ID],
    ['HTTP_REGION', process.env.HTTP_REGION],
    ['LOG_LEVEL', process.env.LOG_LEVEL],

    // Devices / Alerts
    ['DEVICES_COLLECTION', process.env.DEVICES_COLLECTION],
    ['DEVICE_CITY_FIELD', process.env.DEVICE_CITY_FIELD],
    ['DEVICE_CEP_FIELD', process.env.DEVICE_CEP_FIELD],
    ['DEVICE_LAT_FIELD', process.env.DEVICE_LAT_FIELD],
    ['DEVICE_LNG_FIELD', process.env.DEVICE_LNG_FIELD],
    ['DEVICE_CHANNEL_PUBLIC_FIELD', process.env.DEVICE_CHANNEL_PUBLIC_FIELD],
    ['DEVICE_ENABLED_FIELD', process.env.DEVICE_ENABLED_FIELD],
    ['DEVICE_LAST_SEEN_FIELD', process.env.DEVICE_LAST_SEEN_FIELD],
    ['ANDROID_CHANNEL_ID', process.env.ANDROID_CHANNEL_ID],
    ['DEFAULT_TTL_SECONDS', process.env.DEFAULT_TTL_SECONDS],
    ['MIN_RADIUS_M', process.env.MIN_RADIUS_M],
    ['MAX_RADIUS_M', process.env.MAX_RADIUS_M],
    ['DEFAULT_RADIUS_M', process.env.DEFAULT_RADIUS_M],
    ['BATCH_SIZE', process.env.BATCH_SIZE],
    ['DISABLE_FCM_COLOR', process.env.DISABLE_FCM_COLOR],

    // Uploads
    ['ALLOWED_MIME', process.env.ALLOWED_MIME],
    ['MAX_UPLOAD_MB', process.env.MAX_UPLOAD_MB],
    ['UPLOAD_MAX_BYTES', process.env.UPLOAD_MAX_BYTES],
    ['STORAGE_BUCKET', process.env.STORAGE_BUCKET || '(default)'],
    ['UPLOAD_BUCKET', process.env.UPLOAD_BUCKET || '(default|via STORAGE_BUCKET)'],
    ['UPLOAD_IDEM_TTL_MIN', process.env.UPLOAD_IDEM_TTL_MIN],
  ]);

  // ---------------------------------------------------------------------------
  // 10) Export d’un getter propre et typé
  // ---------------------------------------------------------------------------
  const exported = {
    HTTP_REGION: process.env.HTTP_REGION,
    LOG_LEVEL: process.env.LOG_LEVEL,

    // Devices / Alerts
    DEVICES_COLLECTION: process.env.DEVICES_COLLECTION,
    DEVICE_CITY_FIELD: process.env.DEVICE_CITY_FIELD,
    DEVICE_CEP_FIELD: process.env.DEVICE_CEP_FIELD,
    DEVICE_LAT_FIELD: process.env.DEVICE_LAT_FIELD,
    DEVICE_LNG_FIELD: process.env.DEVICE_LNG_FIELD,
    DEVICE_CHANNEL_PUBLIC_FIELD: process.env.DEVICE_CHANNEL_PUBLIC_FIELD,
    DEVICE_ENABLED_FIELD: process.env.DEVICE_ENABLED_FIELD,
    DEVICE_LAST_SEEN_FIELD: process.env.DEVICE_LAST_SEEN_FIELD,
    ANDROID_CHANNEL_ID: process.env.ANDROID_CHANNEL_ID,
    DEFAULT_TTL_SECONDS: toInt(process.env.DEFAULT_TTL_SECONDS, 3600),
    MIN_RADIUS_M: toInt(process.env.MIN_RADIUS_M, 50),
    MAX_RADIUS_M: toInt(process.env.MAX_RADIUS_M, 3000),
    DEFAULT_RADIUS_M: toInt(process.env.DEFAULT_RADIUS_M, 1000),
    BATCH_SIZE: toInt(process.env.BATCH_SIZE, 500),
    DISABLE_FCM_COLOR: toBool(process.env.DISABLE_FCM_COLOR, false),

    // Uploads
    ALLOWED_MIME: process.env.ALLOWED_MIME,
    MAX_UPLOAD_MB: toInt(process.env.MAX_UPLOAD_MB, 15),
    UPLOAD_MAX_BYTES: toInt(process.env.UPLOAD_MAX_BYTES, 15 * 1024 * 1024),
    STORAGE_BUCKET: process.env.STORAGE_BUCKET || '',
    UPLOAD_BUCKET: process.env.UPLOAD_BUCKET || '',
    UPLOAD_IDEM_TTL_MIN: toInt(process.env.UPLOAD_IDEM_TTL_MIN, 15),

    // Project
    PROJECT_ID: process.env.PROJECT_ID || '',
  };

  global.__VIGI_BOOT_CONF__ = exported;
  global.__VIGI_BOOTSTRAP_DONE__ = true;

   
  console.log('[BOOTSTRAP] END', { ms: Date.now() - T0 });

  // Point d’entrée public
   
  module.exports = {
    getConfig() {
      return global.__VIGI_BOOT_CONF__;
    },
  };
})();
