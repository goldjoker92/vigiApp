// src/log/mapLog.js
// -------------------------------------------------------------
// Logger de carte compact, sûr (pas de groupEnd orphelin)
// - createMapLogger('SCREEN:MAP') → { info, warn, err, group, groupEndAll, handlers:{...} }
// - handlers à brancher directement sur <MapView />
// -------------------------------------------------------------

export function createMapLogger(screen = 'MAP') {
  const tag = `[${screen}]`;
  const gstack = []; // pile des groups ouverts pour fermer proprement

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

  const info = (msg, obj) =>
    obj !== undefined ? console.log(`${tag} ${msg}`, obj) : console.log(`${tag} ${msg}`);
  const warn = (msg, obj) =>
    obj !== undefined ? console.warn(`${tag} ⚠️ ${msg}`, obj) : console.warn(`${tag} ⚠️ ${msg}`);
  const err = (msg, obj) =>
    obj !== undefined ? console.error(`${tag} ❌ ${msg}`, obj) : console.error(`${tag} ❌ ${msg}`);

  // Handlers prêts à l’emploi pour <MapView />
  const onLayout = (e) => {
    const { width: w, height: h } = e?.nativeEvent?.layout ?? {};
    info(`[EVENT] onLayout`, { w, h, ok: !!(w && h) });
  };
  const onMapReady = () => info(`[EVENT] onMapReady ✅`);
  const onMapLoaded = () => info(`[EVENT] onMapLoaded 🗺️`);
  const onRegionChangeComplete = (r) =>
    info(`[EVENT] onRegionChangeComplete`, {
      lat: Number(r?.latitude?.toFixed?.(5)),
      lng: Number(r?.longitude?.toFixed?.(5)),
      // zoom pas exposé par RN Maps → on trace delta comme approximation utile
      latDelta: r?.latitudeDelta,
      lngDelta: r?.longitudeDelta,
    });
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
    handlers: { onLayout, onMapReady, onMapLoaded, onRegionChangeComplete, onPress },
  };
}
