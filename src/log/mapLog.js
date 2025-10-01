// src/log/mapLog.js
// -------------------------------------------------------------
// Logger de carte compact, sûr (pas de groupEnd orphelin)
// - createMapLogger('SCREEN:MAP') → { info, warn, err, group, groupEndAll, handlers:{...} }
// - handlers à brancher directement sur <MapView />
// -------------------------------------------------------------

// src/log/mapLog.js
// -------------------------------------------------------------
// Logger de carte compact, sûr (pas de groupEnd orphelin)
// - createMapLogger('SCREEN:MAP') → { info, warn, err, group, groupEndAll, handlers:{...}, enter, summaryOnce }
// - handlers à brancher directement sur <MapView />
// - Anti-spam intégré : throttle + dédup global, region-change compact
// -------------------------------------------------------------

// ------- AJOUT: niveau global + anti-spam -------
const _rank = { error: 0, warn: 1, info: 2, debug: 3, verbose: 4 };
let _GLOBAL_LEVEL = typeof __DEV__ !== "undefined" && __DEV__ ? "info" : "warn";
const _lastAt = new Map();   // throttle par clé
const _lastHash = new Map(); // dédup par clé

export function setMapLogLevel(level = "info") {
  _GLOBAL_LEVEL = level;
}

function _should(level) {
  return _rank[level] <= _rank[_GLOBAL_LEVEL];
}

function _throttle(key, ms) {
  const now = Date.now();
  const prev = _lastAt.get(key) ?? 0;
  if (now - prev < ms) { return true; } // skip
  _lastAt.set(key, now);
  return false;
}

function _same(key, payload) {
  let h;
  try { h = JSON.stringify(payload ?? ""); } catch { h = String(payload); }
  if (_lastHash.get(key) === h) {
    return true;
  }
  _lastHash.set(key, h);
  return false;
}

const _approx = (a, b, eps = 0.0008) => Math.abs((a ?? 0) - (b ?? 0)) < eps;

// -------------------------------------------------------------

export function createMapLogger(screen = 'MAP') {
  const tag = `[${screen}]`;
  const gstack = []; // pile des groups ouverts pour fermer proprement

  // État local pour ENTER / SUMMARY et region compacte
  let _entered = false;
  let _summarized = false;
  let _lastRegion = { lat: null, lng: null, latDelta: null, lngDelta: null };

  // Wrapper centralisé (niveau + throttle + dédup)
  const _log = (level, msg, obj, { throttleMs = 800 } = {}) => {
    if (!_should(level)) { return; }
    const key = `${tag}:${level}:${msg}`;
    if (_throttle(key, throttleMs)) { return; }
    if (_same(key, obj ?? msg)) { return; }

    const line = `${tag} ${msg}`;
    if (level === "error") {
      if (obj !== undefined) {
        console.error(line, obj);
      } else {
        console.error(line);
      }
    } else if (level === "warn") {
      if (obj !== undefined) {
        console.warn(line, obj);
      } else {
        console.warn(line);
      }
    } else {
      if (obj !== undefined) {
        console.log(line, obj);
      } else {
        console.log(line);
      }
    }
  };

  // API d’origine (compat)
  const group = (label) => {
    const name = `${tag} ${label}`;
    console.groupCollapsed(name);
    gstack.push(name);
  };
  const groupEndAll = () => {
    while (gstack.length) {
      console.groupEnd();
      gstack.pop();
    }
  };

  const info = (msg, obj) => _log("info", msg, obj);
  const warn = (msg, obj) => _log("warn", `⚠️ ${msg}`, obj);
  const err  = (msg, obj) => _log("error", `❌ ${msg}`, obj, { throttleMs: 200 }); // erreurs moins throttlées

  // ✅ Nouveau: 1 seul log d’entrée
  const enter = () => {
    if (_entered) { return; }
    _entered = true;
    info("ENTER");
  };

  // ✅ Nouveau: 1 seul résumé quand tout est prêt
  const summaryOnce = (state) => {
    if (_summarized) { return; }
    _summarized = true;
    info("SUMMARY", state);
  };

  // Handlers prêts à l’emploi pour <MapView />
  const onLayout = (e) => {
    const { width: w, height: h } = e?.nativeEvent?.layout ?? {};
    info(`[EVENT] onLayout`, { w, h, ok: !!(w && h) });
  };
  const onMapReady = () => info(`[EVENT] onMapReady ✅`);
  const onMapLoaded = () => info(`[EVENT] onMapLoaded 🗺️`);

  // Region change compacté : ignore mini-variations + throttle interne
  const onRegionChangeComplete = (r) => {
    const next = {
      lat: Number(r?.latitude?.toFixed?.(5)),
      lng: Number(r?.longitude?.toFixed?.(5)),
      latDelta: r?.latitudeDelta,
      lngDelta: r?.longitudeDelta,
    };
    const same =
      _approx(next.lat, _lastRegion.lat) &&
      _approx(next.lng, _lastRegion.lng) &&
      _approx(next.latDelta, _lastRegion.latDelta, 0.0015) &&
      _approx(next.lngDelta, _lastRegion.lngDelta, 0.0015);

    if (!same) {
      _lastRegion = next;
      _log("debug", `[EVENT] onRegionChangeComplete`, next); // sera throttlé + dédupliqué
    }
  };

  const onPress = (e) => {
    const c = e?.nativeEvent?.coordinate;
    info(`[EVENT] onPress`, c ? { lat: c.latitude, lng: c.longitude } : null);
  };

  return {
    tag,
    group,
    groupEndAll,
    info,
    warn,
    err,
    // 👇 nouveaux helpers, optionnels (pas besoin de toucher Mapa si tu ne les utilises pas)
    enter,
    summaryOnce,
    handlers: { onLayout, onMapReady, onMapLoaded, onRegionChangeComplete, onPress },
  };
}
