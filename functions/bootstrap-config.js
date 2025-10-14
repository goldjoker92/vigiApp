// /functions/bootstrap-config.js
// ============================================================================
// Bootstrap config pour Functions (v2)
// ----------------------------------------------------------------------------
// - Charge .env en local (facultatif), merge avec functions.config() (prod)
// - Définit des defaults sûrs
// - Cast bool/nombre pour éviter les strings ambigus
// - Log START/END + tableau récap (sans secrets)
// - Idempotent : plusieurs require() ne re-fusent pas tout
//
// ⚠️ Les SECRETS (ex: SECURITY_PEPPER_V1) restent gérés par
//    firebase functions:secrets:set + defineSecret dans la CF.
//    On NE les charge pas ici ni ne les logge, jamais.
// ============================================================================

let _alreadyBootstrapped = global.__VIGI_BOOTSTRAP_DONE__;
if (_alreadyBootstrapped) {
  console.log('[BOOTSTRAP] SKIP (déjà fait)');
  module.exports = module.exports || {};
  return;
}

const BOOT_T0 = Date.now();
console.log('[BOOTSTRAP] START');

try {
  // ------------------------------
  // 1) .env (développement local)
  // ------------------------------
  try {
    require('dotenv').config();
    console.log('[BOOTSTRAP] .env chargé');
  } catch {
    console.log('[BOOTSTRAP] .env absent (ok en prod)');
  }

  // ------------------------------------------
  // 2) functions.config() (prod / emulateur)
  // ------------------------------------------
  let cfgFn = {};
  try {
    const functions = require('firebase-functions');
    const appCfg = (functions.config && functions.config().app) || {};
    const vigiCfg = (functions.config && functions.config().vigi) || {};
    cfgFn = { ...appCfg, ...vigiCfg };
    if (cfgFn.push && typeof cfgFn.push === 'object') {
      cfgFn = { ...cfgFn, ...cfgFn.push };
    }
    console.log('[BOOTSTRAP] functions.config() chargé');
  } catch {
    console.log('[BOOTSTRAP] functions.config() indisponible (local pur ?)');
  }

  // ------------------------------------------
  // 3) Helpers: cast / set / redaction
  // ------------------------------------------
  const toBool = (v, def = false) => {
    if (typeof v === 'boolean') {return v;}
    if (typeof v === 'number') {return v !== 0;}
    if (typeof v !== 'string') {return def;}
    const s = v.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(s)) {return true;}
    if (['0', 'false', 'no', 'n', 'off', ''].includes(s)) {return false;}
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

  const mask = (s) => {
    if (!s) {return '';}
    const str = String(s);
    if (str.length <= 8) {return '********';}
    return `${str.slice(0, 2)}…${str.slice(-4)}`;
  };

  const printPairs = (pairs) => {
    const rows = pairs.map(([k, v, isSecret]) => ({
      key: k,
      value: isSecret ? mask(v) : String(v),
    }));
    try {
      console.log('\n[BOOTSTRAP][TABLE] env résumé');
      console.table(rows);
    } catch {
      console.log('[BOOTSTRAP] env résumé:', rows);
    }
  };

  // ------------------------------------------
  // 4) Defaults sûrs
  //    ⚠️ Alignés avec nos champs actuels
  // ------------------------------------------
  const defaults = {
    // Collections / champs devices
    DEVICES_COLLECTION: 'devices',
    DEVICE_CITY_FIELD: 'city',
    DEVICE_CEP_FIELD: 'cep',
    DEVICE_LAT_FIELD: 'lat',
    DEVICE_LNG_FIELD: 'lng',
    DEVICE_CHANNEL_PUBLIC_FIELD: 'channels.publicAlerts',
    DEVICE_ENABLED_FIELD: 'active',
    DEVICE_LAST_SEEN_FIELD: 'lastSeenAt',

    // Region Functions v2
    HTTP_REGION: 'southamerica-east1',

    // Notif Android
    ANDROID_CHANNEL_ID: 'alerts-high',

    // Paramétrage d’alerte publique
    DEFAULT_TTL_SECONDS: '3600', // 1h
    MIN_RADIUS_M: '50',
    MAX_RADIUS_M: '3000',
    DEFAULT_RADIUS_M: '1000',
    BATCH_SIZE: '500',

    // Divers
    DISABLE_FCM_COLOR: 'false',
    LOG_LEVEL: 'info', // info|debug|warn|error

    // Uploads (CF uploadMissingChildDoc)
    ALLOWED_MIME: 'image/jpeg,image/png,image/webp,image/heic,application/pdf',
    MAX_UPLOAD_MB: '15',
    STORAGE_BUCKET: '', // vide = bucket par défaut du projet
  };

  // ------------------------------------------
  // 5) Mapping depuis functions.config() → env
  // ------------------------------------------
  const mapFromCfg = {
    // Devices
    DEVICES_COLLECTION: ['devices_collection', 'devices', 'device_collection'],
    DEVICE_CITY_FIELD: ['device_city_field', 'city_field', 'cidade_field'],
    DEVICE_CEP_FIELD: ['device_cep_field', 'cep_field'],
    DEVICE_LAT_FIELD: ['device_lat_field', 'lat_field'],
    DEVICE_LNG_FIELD: ['device_lng_field', 'lng_field'],
    DEVICE_CHANNEL_PUBLIC_FIELD: ['device_channel_public_field', 'channel_public_field'],
    DEVICE_ENABLED_FIELD: ['device_enabled_field', 'enabled_field', 'active_field'],
    DEVICE_LAST_SEEN_FIELD: ['device_last_seen_field', 'last_seen_field'],

    // Infra
    HTTP_REGION: ['http_region', 'region'],
    ANDROID_CHANNEL_ID: ['android_channel_id'],

    // Alert params
    DEFAULT_TTL_SECONDS: ['default_ttl_seconds', 'ttl_sec'],
    MIN_RADIUS_M: ['min_radius_m'],
    MAX_RADIUS_M: ['max_radius_m'],
    DEFAULT_RADIUS_M: ['default_radius_m'],
    BATCH_SIZE: ['batch_size'],

    DISABLE_FCM_COLOR: ['disable_fcm_color'],
    LOG_LEVEL: ['log_level'],

    // Upload CF
    ALLOWED_MIME: ['allowed_mime', 'uploads_allowed_mime'],
    MAX_UPLOAD_MB: ['max_upload_mb', 'uploads_max_mb'],
    STORAGE_BUCKET: ['storage_bucket', 'uploads_bucket'],
  };

  // ------------------------------------------
  // 6) Appliquer defaults, puis override .env, puis functions.config()
  // ------------------------------------------
  Object.entries(defaults).forEach(([k, v]) => setIfMissing(k, v));

  for (const [envKey, aliases] of Object.entries(mapFromCfg)) {
    for (const alias of aliases) {
      if (cfgFn && cfgFn[alias] !== undefined && cfgFn[alias] !== '') {
        setIfMissing(envKey, cfgFn[alias]);
        break;
      }
    }
  }

  // Cast/normalize (on réécrit process.env)
  process.env.DEFAULT_TTL_SECONDS = String(toInt(process.env.DEFAULT_TTL_SECONDS, 3600));
  process.env.MIN_RADIUS_M = String(toInt(process.env.MIN_RADIUS_M, 50));
  process.env.MAX_RADIUS_M = String(toInt(process.env.MAX_RADIUS_M, 3000));
  process.env.DEFAULT_RADIUS_M = String(toInt(process.env.DEFAULT_RADIUS_M, 1000));
  process.env.BATCH_SIZE = String(Math.max(1, toInt(process.env.BATCH_SIZE, 500)));
  process.env.DISABLE_FCM_COLOR = String(toBool(process.env.DISABLE_FCM_COLOR, false));
  process.env.LOG_LEVEL = String(process.env.LOG_LEVEL || 'info');

  // Uploads
  process.env.MAX_UPLOAD_MB = String(toInt(process.env.MAX_UPLOAD_MB, 15));
  if (!process.env.ALLOWED_MIME || process.env.ALLOWED_MIME.trim() === '') {
    process.env.ALLOWED_MIME = defaults.ALLOWED_MIME;
  }
  // STORAGE_BUCKET peut rester vide (= bucket par défaut)

  // ------------------------------------------
  // 7) Sanity checks minimaux
  // ------------------------------------------
  const requiredKeys = [
    'DEVICES_COLLECTION',
    'DEVICE_CITY_FIELD',
    'DEVICE_CEP_FIELD',
    'DEVICE_LAT_FIELD',
    'DEVICE_LNG_FIELD',
    'HTTP_REGION',
    'ANDROID_CHANNEL_ID',
  ];
  const missing = requiredKeys.filter((k) => !process.env[k] || process.env[k] === '');
  if (missing.length) {
    console.warn('[BOOTSTRAP] ⚠️ clés manquantes (defaults peuvent couvrir) →', missing.join(', '));
  }

  // ------------------------------------------
  // 8) Log résumé (sans secrets)
  // ------------------------------------------
  printPairs([
    // Infra
    ['HTTP_REGION', process.env.HTTP_REGION],
    ['LOG_LEVEL', process.env.LOG_LEVEL],

    // Devices / alertes
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
    ['STORAGE_BUCKET', process.env.STORAGE_BUCKET || '(default)'],
  ]);

  // Marqueur global d’idempotence
  global.__VIGI_BOOTSTRAP_DONE__ = true;

  // END
  console.log('[BOOTSTRAP] END', { ms: Date.now() - BOOT_T0 });

  // ------------------------------------------
  // Export compact (utilisable dans n’importe quelle CF)
  // ------------------------------------------
  module.exports = {
    getConfig() {
      const toInt2 = (k, d) => toInt(process.env[k], d);
      const toBool2 = (k, d) => toBool(process.env[k], d);
      return {
        HTTP_REGION: process.env.HTTP_REGION,

        // devices / notif
        DEVICES_COLLECTION: process.env.DEVICES_COLLECTION,
        DEVICE_CITY_FIELD: process.env.DEVICE_CITY_FIELD,
        DEVICE_CEP_FIELD: process.env.DEVICE_CEP_FIELD,
        DEVICE_LAT_FIELD: process.env.DEVICE_LAT_FIELD,
        DEVICE_LNG_FIELD: process.env.DEVICE_LNG_FIELD,
        DEVICE_CHANNEL_PUBLIC_FIELD: process.env.DEVICE_CHANNEL_PUBLIC_FIELD,
        DEVICE_ENABLED_FIELD: process.env.DEVICE_ENABLED_FIELD,
        DEVICE_LAST_SEEN_FIELD: process.env.DEVICE_LAST_SEEN_FIELD,
        ANDROID_CHANNEL_ID: process.env.ANDROID_CHANNEL_ID,

        DEFAULT_TTL_SECONDS: toInt2('DEFAULT_TTL_SECONDS', 3600),
        MIN_RADIUS_M: toInt2('MIN_RADIUS_M', 50),
        MAX_RADIUS_M: toInt2('MAX_RADIUS_M', 3000),
        DEFAULT_RADIUS_M: toInt2('DEFAULT_RADIUS_M', 1000),
        BATCH_SIZE: toInt2('BATCH_SIZE', 500),

        DISABLE_FCM_COLOR: toBool2('DISABLE_FCM_COLOR', false),
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',

        // uploads
        ALLOWED_MIME: process.env.ALLOWED_MIME,
        MAX_UPLOAD_MB: toInt2('MAX_UPLOAD_MB', 15),
        STORAGE_BUCKET: process.env.STORAGE_BUCKET || '',
      };
    },
  };
} catch (e) {
  console.error('[BOOTSTRAP] FATAL', e?.stack || e?.message || e);
  global.__VIGI_BOOTSTRAP_DONE__ = true;
  console.log('[BOOTSTRAP] END (fatal)', { ms: Date.now() - BOOT_T0 });
  module.exports = { getConfig() { return {}; } };
}
// ============================================================================
