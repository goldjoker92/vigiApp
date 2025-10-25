// functions/src/missing/onCreateMissing.js
// ============================================================================
// Missing - Trigger Create (Gen2 Firestore v2)
// Adresse prioritaire → fallback device GPS
// Export: onCreateMissing
// ============================================================================

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

let _init = false;
function ensureInit() {
  if (_init) return;
  try {
    admin.app();
  } catch {
    admin.initializeApp();
  }
  _init = true;
}

const NS = "[Missing][Create]";
const REGION = "southamerica-east1";
const COLL = "missingCases";

// Bornes Brésil
const BR = { latMin: -34, latMax: 6, lngMin: -74, lngMax: -28 };
const inBR = ({ lat, lng }) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= BR.latMin &&
  lat <= BR.latMax &&
  lng >= BR.lngMin &&
  lng <= BR.lngMax;

// ---------------------------------------------------------------------------
// Helpers logging
// ---------------------------------------------------------------------------
const logI = (step, extra = {}) =>
  logger.info(`${NS} ${step}`, { t: new Date().toISOString(), ...extra });
const logW = (step, extra = {}) =>
  logger.warn(`${NS} ${step}`, { t: new Date().toISOString(), ...extra });
const logE = (step, extra = {}) =>
  logger.error(`${NS} ${step}`, { t: new Date().toISOString(), ...extra });

// ---------------------------------------------------------------------------
// Topics FCM — règles & sanitization
//  - Admin SDK attend `message.topic` SANS `/topics/`
//  - Regex autorisée: ^[a-zA-Z0-9\-_.~%]{1,900}$
//  - On remplace tout char hors whitelist par "-"
// ---------------------------------------------------------------------------
function sanitizeTopic(raw) {
  if (typeof raw !== "string") return null;
  let name = raw.replace(/^\/?topics\//, "").trim();
  name = name.replace(/[^a-zA-Z0-9\-_.~%]/g, "-");
  if (!/^[a-zA-Z0-9\-_.~%]{1,900}$/.test(name)) return null;
  return name;
}

// ---------------------------------------------------------------------------
// Tuiles 3×3 autour d’un point
// Convention déduite de tes logs: topic "t_<latIdx>_<lngIdx>"
// avec latIdx = round(lat*20) et lngIdx = round(lng*20)
// (≈ 0.05° par tuile → ~5.5 km en latitude)
// ---------------------------------------------------------------------------
function tileIndexFromLat(lat) {
  return Math.round(lat * 20);
}
function tileIndexFromLng(lng) {
  return Math.round(lng * 20);
}
function makeTileName(latIdx, lngIdx) {
  return `t_${latIdx}_${lngIdx}`;
}
function tiles3x3({ lat, lng }) {
  const cy = tileIndexFromLat(lat); // lat index
  const cx = tileIndexFromLng(lng); // lng index
  const names = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      names.push(makeTileName(cy + dy, cx + dx));
    }
  }
  return { center: makeTileName(cy, cx), all: names };
}

// ---------------------------------------------------------------------------
// Envoi FCM par tuiles
// - Une notif par topic (simple et robuste). Tu peux grouper si besoin.
// - En cas d’erreur sur une tuile, on loggue et on continue.
// - Si 0 succès au final → on throw pour déclencher le fallback.
// ---------------------------------------------------------------------------
async function sendByTilesFCM({ p, caseId, title, body, kind, approx }) {
  const msgBase = {
    notification: { title, body },
    data: {
      alertId: caseId,
      openTarget: "missingDetail",
      channelId: "alerts-high",
      approx: approx ? "1" : "0",
      kind,
      // (ajoute d'autres champs si besoin)
    },
  };

  const { center, all } = tiles3x3(p);
  logI("[Geo] tiles", { center, count: all.length });

  let ok = 0;
  for (const raw of all) {
    const topic = sanitizeTopic(raw);
    if (!topic) {
      logE("[Publish] topic_skip_invalid", { raw });
      continue;
    }
    try {
      await admin.messaging().send({ ...msgBase, topic });
      ok++;
    } catch (e) {
      logE("[Publish] topic_fail", { topic, err: e?.message || String(e) });
    }
  }

  if (!ok) {
    throw new Error("tiles_push_err");
  }
  logI("PUSH_SENT_TILES", { caseId, ok });
}

// ---------------------------------------------------------------------------
// Fallback multicast FCM
// - Récupère tokens à partir de /users/*/devices/* et /devices
// - Chunking par 500 (limite FCM)
// ---------------------------------------------------------------------------
async function sendFallbackMulticastFCM({ caseId, title, body, kind, approx }) {
  const db = admin.firestore();

  // 1) /users/*/devices/*
  const cgSnap = await db
    .collectionGroup("devices")
    .where("active", "==", true)
    .where("channels.missingAlerts", "==", true)
    .get();

  // 2) /devices (racine)
  const rootSnap = await db
    .collection("devices")
    .where("active", "==", true)
    .where("channels.missingAlerts", "==", true)
    .get();

  const tokenSet = new Set();
  const collect = (snap) =>
    snap.forEach((d) => {
      const x = d.data() || {};
      if (x.fcmToken) tokenSet.add(x.fcmToken);
      else if (x.fcm) tokenSet.add(x.fcm);
    });

  collect(cgSnap);
  collect(rootSnap);

  const tokens = Array.from(tokenSet);
  logI("DEVICES_SELECTED_FALLBACK", { caseId, count: tokens.length });

  if (!tokens.length) {
    logW("no_tokens_fallback", { caseId });
    return { success: 0, failure: 0 };
  }

  const payload = {
    notification: { title, body },
    data: {
      alertId: caseId,
      openTarget: "missingDetail",
      channelId: "alerts-high",
      approx: approx ? "1" : "0",
      kind,
    },
  };

  const chunkSize = 500;
  let success = 0,
    failure = 0;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      ...payload,
    });
    success += res.successCount || 0;
    failure += res.failureCount || 0;
    // Optionnel: log des erreurs typées
    if (res.failureCount) {
      const codes = res.responses
        .filter((r) => !r.success && r.error)
        .map((r) => r.error.code);
      logW("[Fallback] partial_failures", {
        batch: `${i}-${i + chunk.length - 1}`,
        failureCount: res.failureCount,
        codes,
      });
    }
  }
  logI("PUSH_SENT_FALLBACK", { caseId, success, failure });
  return { success, failure };
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------
const onCreateMissing = onDocumentCreated(
  { region: REGION, document: `${COLL}/{caseId}` },
  async (event) => {
    ensureInit();

    const snap = event.data;
    if (!snap) return;

    const data = snap.data() || {};
    const caseId = event.params.caseId;
    const kind = data?.kind || "child";

    logI("BEGIN", { caseId, kind });

    // Position: adresse prioritaire si fiable, sinon GPS device
    const loc = data?.location || null;
    const dev = data?.submitMeta?.geo || null;

    let p = null;
    let approx = false;
    let src = "none";

    if (
      loc &&
      Number.isFinite(+loc.lat) &&
      Number.isFinite(+loc.lng) &&
      loc.source === "address" &&
      Number(loc.addressConfidence || 0) >= 0.7
    ) {
      p = { lat: +loc.lat, lng: +loc.lng };
      approx = false;
      src = "address";
    } else if (dev && Number.isFinite(+dev.lat) && Number.isFinite(+dev.lng)) {
      p = { lat: +dev.lat, lng: +dev.lng };
      approx = true;
      src = "device";
    }

    if (!p || !inBR(p)) {
      logW("no_valid_point", { caseId, src, p });
      return;
    }

    logI("POINT_OK", { caseId, src, p, approx });

    // Message
    const rua = (data?.lastKnownAddress?.rua || "").trim();
    const cidade = (data?.lastKnownAddress?.cidade || "").trim();
    const uf = (data?.lastKnownAddress?.uf || "").toString().trim().toUpperCase();

    const title = approx
      ? "Alerta Missing (zona aproximada)"
      : "Alerta Missing";

    const body =
      rua || cidade || uf
        ? `Visto por último perto de ${[
            rua,
            [cidade, uf].filter(Boolean).join(" / "),
          ]
            .filter(Boolean)
            .join(" · ")}`
        : "Ajude com qualquer informação útil";

    // Envoi par tuiles (toggle via env)
    const USE_TILES = String(process.env.USE_TILES || "1") === "1";
    if (USE_TILES) {
      try {
        await sendByTilesFCM({
          p,
          caseId,
          title,
          body,
          kind,
          approx,
        });
        logI("END", { caseId });
        return;
      } catch (e) {
        // On laisse une trace lisible comme dans tes logs
        logE("tiles_push_err", { caseId, err: e?.message || String(e) });
      }
    } else {
      logW("tiles_disabled_env", { caseId });
    }

    // Fallback multicast FCM
    try {
      await sendFallbackMulticastFCM({ caseId, title, body, kind, approx });
    } catch (e) {
      logE("PUSH_ERR_FALLBACK", { caseId, err: e?.message || String(e) });
    }

    logI("END", { caseId });
  }
);

module.exports = { onCreateMissing };
