// functions/src/missing/onUpdateMissing.js
// ============================================================================
// Missing - Trigger Resolve (Gen2 Firestore v2)
// Envoi lors du passage à status=resolved
// Exporte: onUpdateMissing
// ============================================================================
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

let _init = false;
function ensureInit() {
  if (_init) return;
  try { admin.app(); } catch { admin.initializeApp(); }
  _init = true;
}

const NS = "[Missing][Resolve]";
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
  logger.warn(`${NS} publishMissingPush non chargé (fallback multicast FCM)`, { err: e?.message || String(e) });
}

const log = (step, extra = {}) =>
  logger.info(`${NS} ${step}`, { t: new Date().toISOString(), ...extra });

const onUpdateMissing = onDocumentUpdated(
  { region: REGION, document: `${COLL}/{caseId}` },
  async (event) => {
    ensureInit();

    const before = event.data?.before?.data() || {};
    const after  = event.data?.after?.data()  || {};
    const caseId = event.params.caseId;

    const from = before?.status || "";
    const to   = after?.status  || "";

    // Déclenche uniquement sur transition -> resolved depuis open/validated
    if (!((from === "validated" || from === "open") && to === "resolved")) {
      log("SKIP_STATUS", { caseId, from, to });
      return;
    }

    log("BEGIN", { caseId, from, to });

    // Position: after prioritaire, sinon before
    const loc = after?.location || before?.location || null;
    const dev = (after?.submitMeta?.geo || before?.submitMeta?.geo) || null;

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
      logger.warn(`${NS} no_valid_point_resolve`, { caseId, src, p });
      return;
    }

    log("POINT_OK", { caseId, src, p, approx });

    const title = "Missing resolvido";
    const body  = "Obrigado pela atenção — caso encerrado.";
    const kind  = after?.kind || before?.kind || "child";

    // Envoi tile-based si dispo
    if (publishFCMByTiles || publishExpoByTiles) {
      try {
        if (publishFCMByTiles) {
          await publishFCMByTiles({ lat: p.lat, lng: p.lng, caseId, kind, event: "resolved", title, body, approx });
        }
        if (publishExpoByTiles) {
          await publishExpoByTiles({ lat: p.lat, lng: p.lng, caseId, kind, event: "resolved", title, body, approx });
        }
        log("PUSH_SENT_TILES", { caseId, approx, src });
        log("END", { caseId });
        return;
      } catch (e) {
        logger.error(`${NS} tiles_push_err`, { caseId, err: e?.message || String(e) });
      }
    }

    // Fallback multicast FCM
    try {
      const db = admin.firestore();

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
      const collectTokens = (snap) => {
        snap.forEach((d) => {
          const x = d.data() || {};
          if (x.fcmToken) tokenSet.add(x.fcmToken);
          else if (x.fcm) tokenSet.add(x.fcm);
        });
      };
      collectTokens(cgSnap);
      collectTokens(rootSnap);

      const tokens = Array.from(tokenSet);
      log("DEVICES_SELECTED_FALLBACK", { caseId, count: tokens.length });

      if (!tokens.length) {
        logger.warn(`${NS} no_tokens_fallback`, { caseId });
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
          event: "resolved",
        },
      };

      const chunkSize = 500;
      let success = 0, failure = 0;

      for (let i = 0; i < tokens.length; i += chunkSize) {
        const chunk = tokens.slice(i, i + chunkSize);
        const res = await admin.messaging().sendEachForMulticast({ tokens: chunk, ...payload });
        success += res.successCount || 0;
        failure += res.failureCount || 0;
      }

      log("PUSH_SENT_FALLBACK", { caseId, success, failure });
    } catch (e) {
      logger.error(`${NS} PUSH_ERR_FALLBACK`, { caseId, err: e?.message || String(e) });
    }

    log("END", { caseId });
  }
);

module.exports = { onUpdateMissing };
