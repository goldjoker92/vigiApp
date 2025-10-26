// ============================================================================
// Missing - Trigger Create (Gen2 Firestore v2)
// Envoi lors de la création d'un cas (event: "created")
// Exporte: onCreateMissing
// ============================================================================
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

let _init = false;
function ensureInit() {
  if (_init) return;
  try { admin.app(); } catch { admin.initializeApp(); }
  _init = true;
}

const NS = "🧭 [Missing][Create]";
const REGION = "southamerica-east1";
const COLL = "missingCases";

// Bornes Brésil
const BR = { latMin: -34, latMax: 6, lngMin: -74, lngMax: -28 };
const inBR = ({ lat, lng }) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= BR.latMin && lat <= BR.latMax && lng >= BR.lngMin && lng <= BR.lngMax;

let publishFCMByTiles = null;
let publishExpoByTiles = null;
try {
  ({ publishFCMByTiles, publishExpoByTiles } = require("./publishMissingPush"));
} catch (e) {
  logger.warn(`${NS} ⚠️ publishMissingPush non chargé (fallback multicast FCM)`, { err: e?.message || String(e) });
}

const nowIso = () => new Date().toISOString();
const log = (step, extra = {}) =>
  logger.info(`${NS} ${step}`, { t: nowIso(), ...extra });

function maskToken(tok) {
  if (!tok) return null;
  const s = String(tok);
  if (s.length <= 8) return '***';
  return `${s.slice(0,4)}…${s.slice(-4)}`;
}

exports.onCreateMissing = onDocumentCreated(
  { region: REGION, document: `${COLL}/{caseId}` },
  async (event) => {
    ensureInit();

    const after  = event.data?.data()  || {};
    const caseId = event.params.caseId || 'unknown';

    console.log('🚀 [TRIGGER] Missing Create start', { region: REGION, coll: COLL, caseId });
    log("🚀 TRIGGER_START", { caseId });

    // Position (prend address si fiable, sinon geo device si présent)
    const loc = after?.location || null;
    const dev = after?.submitMeta?.geo || null;

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
      console.log('⚠️ [POINT] invalid or outside BR', { caseId, src, p });
      logger.warn(`${NS} ⚠️ no_valid_point_create`, { caseId, src, p });
      log("END", { caseId });
      return;
    }

    console.log('🧭 [POINT_OK]', { caseId, src, p, approx });
    log("POINT_OK", { caseId, src, p, approx });

    const title = "Alerta de desaparecido";
    const body  = "Novo caso próximo a você.";
    const kind  = after?.kind || "child";

    // Envoi tile-based si dispo
    if (publishFCMByTiles || publishExpoByTiles) {
      try {
        console.log('📡 [ABOUT_TO_SEND_TILES]', {
          caseId, approx, src, kind, hasFCM: !!publishFCMByTiles, hasExpo: !!publishExpoByTiles
        });
        log("ABOUT_TO_SEND_TILES", { caseId, approx, src, kind });

        if (publishFCMByTiles) {
          await publishFCMByTiles({ lat: p.lat, lng: p.lng, caseId, kind, event: "created", title, body, approx });
          console.log('✅ [FCM_TILES_SENT]', { caseId });
          log("FCM_TILES_SENT", { caseId });
        }
        if (publishExpoByTiles) {
          await publishExpoByTiles({ lat: p.lat, lng: p.lng, caseId, kind, event: "created", title, body, approx });
          console.log('✅ [EXPO_TILES_SENT]', { caseId });
          log("EXPO_TILES_SENT", { caseId });
        }

        console.log('🎉 [PUSH_SENT_TILES]', { caseId });
        log("PUSH_SENT_TILES", { caseId, approx, src });
        log("END", { caseId });
        return;
      } catch (e) {
        console.log('💥 [TILES_PUSH_ERR]', { caseId, err: e?.message || String(e) });
        logger.error(`${NS} 💥 tiles_push_err`, { caseId, err: e?.message || String(e) });
      }
    }

    // Fallback multicast FCM
    try {
      const db = admin.firestore();

      console.log('🔎 [FALLBACK] query devices', { caseId });
      const cgSnap = await db
        .collectionGroup("devices")
        .where("active", "==", true)
        .where("channels.missingAlerts", "==", true)
        .get();

      const rootSnap = await db
        .collection("devices")
        .where("active", "==", true)
        .where("channels.missingAlerts", "==", true)
        .get();

      const tokenSet = new Set();
      const collect = (snap) => snap.forEach(d => {
        const x = d.data() || {};
        if (x.fcmToken) tokenSet.add(x.fcmToken);
        else if (x.fcm) tokenSet.add(x.fcm);
      });
      collect(cgSnap); collect(rootSnap);

      const tokens = Array.from(tokenSet);
      console.log('🧮 [FALLBACK] selected tokens', { caseId, count: tokens.length });
      log("DEVICES_SELECTED_FALLBACK", { caseId, count: tokens.length });

      if (!tokens.length) {
        console.log('⚠️ [FALLBACK] no tokens', { caseId });
        logger.warn(`${NS} ⚠️ no_tokens_fallback`, { caseId });
        log("END", { caseId });
        return;
      }

      const payload = {
        notification: { title, body },
        data: {
          alertId: caseId,
          openTarget: "missingDetail",
          channelId: "alerts-high",
          approx: approx ? "1" : "0",
          kind,
          event: "created",
        },
      };

      const chunkSize = 500;
      let success = 0, failure = 0;
      console.log('📤 [FALLBACK] about to send', { caseId, chunks: Math.ceil(tokens.length / chunkSize) });

      for (let i = 0; i < tokens.length; i += chunkSize) {
        const chunk = tokens.slice(i, i + chunkSize);
        console.log('📦 [CHUNK] sending', { caseId, idx: i / chunkSize, size: chunk.length });
        const res = await admin.messaging().sendEachForMulticast({ tokens: chunk, ...payload });
        success += res.successCount || 0;
        failure += res.failureCount || 0;
        console.log('🧾 [CHUNK_RESULT]', { caseId, idx: i / chunkSize, success: res.successCount, failure: res.failureCount });
      }

      console.log('✅ [FALLBACK_SENT]', { caseId, success, failure });
      log("PUSH_SENT_FALLBACK", { caseId, success, failure });
    } catch (e) {
      console.log('💥 [PUSH_ERR_FALLBACK]', { caseId, err: e?.message || String(e) });
      logger.error(`${NS} 💥 PUSH_ERR_FALLBACK`, { caseId, err: e?.message || String(e) });
    }

    console.log('🏁 [END] Missing Create', { caseId });
    log("END", { caseId });
  }
);
