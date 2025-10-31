// ============================================================================
// Missing - Trigger Resolve (Gen2 Firestore v2)
// Envoi lors du passage à status=resolved
// Exporte: onUpdateMissing
// ============================================================================
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

let _init = false;
function ensureInit() {
  if (_init) {return;}
  try {
    admin.app();
  } catch {
    admin.initializeApp();
  }
  _init = true;
}

const NS = '🧭 [Missing][Resolve]';
const REGION = 'southamerica-east1';
const COLL = 'missingCases';

// Bornes BR
const BR = { latMin: -34, latMax: 6, lngMin: -74, lngMax: -28 };
const inBR = ({ lat, lng }) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= BR.latMin &&
  lat <= BR.latMax &&
  lng >= BR.lngMin &&
  lng <= BR.lngMax;

// Envoi tile-based si dispo
let publishFCMByTiles = null;
let publishExpoByTiles = null;
try {
  ({ publishFCMByTiles, publishExpoByTiles } = require('./publishMissingPush'));
} catch (e) {
  logger.warn(`${NS} ⚠️ publishMissingPush non chargé (fallback multicast FCM)`, {
    err: e?.message || String(e),
  });
}

const nowIso = () => new Date().toISOString();
const log = (step, extra = {}) => logger.info(`${NS} ${step}`, { t: nowIso(), ...extra });

exports.onUpdateMissing = onDocumentUpdated(
  { region: REGION, document: `${COLL}/{caseId}` },
  async (event) => {
    ensureInit();

    console.log('🚀 [TRIGGER] Missing Resolve start', {
      region: REGION,
      coll: COLL,
      params: event?.params || null,
      hasBefore: !!event.data?.before?.data(),
      hasAfter: !!event.data?.after?.data(),
    });
    log('TRIGGER_START', { params: event?.params || null });

    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const caseId = event.params.caseId;

    const from = before?.status || '';
    const to = after?.status || '';

    // Seulement open/validated -> resolved
    if (!((from === 'validated' || from === 'open') && to === 'resolved')) {
      console.log('⏭️ [SKIP_STATUS]', { caseId, from, to });
      log('SKIP_STATUS', { caseId, from, to });
      return;
    }

    console.log('🧭 [BEGIN]', { caseId, from, to });
    log('BEGIN', { caseId, from, to });

    const loc = after?.location || before?.location || null;
    const dev = after?.submitMeta?.geo || before?.submitMeta?.geo || null;

    let p = null;
    let approx = false;
    let src = 'none';

    if (
      loc &&
      Number.isFinite(+loc.lat) &&
      Number.isFinite(+loc.lng) &&
      loc.source === 'address' &&
      Number(loc.addressConfidence || 0) >= 0.7
    ) {
      p = { lat: +loc.lat, lng: +loc.lng };
      approx = false;
      src = 'address';
    } else if (dev && Number.isFinite(+dev.lat) && Number.isFinite(+dev.lng)) {
      p = { lat: +dev.lat, lng: +dev.lng };
      approx = true;
      src = 'device';
    }

    if (!p || !inBR(p)) {
      console.log('⚠️ [NO_VALID_POINT]', { caseId, src, p });
      logger.warn(`${NS} ⚠️ no_valid_point_resolve`, { caseId, src, p });
      return;
    }

    console.log('🧭 [POINT_OK]', { caseId, src, p, approx });
    log('POINT_OK', { caseId, src, p, approx });

    const title = 'Missing resolvido';
    const body = 'Obrigado pela atenção — caso encerrado.';
    const kind = after?.kind || before?.kind || 'child';

    // --------- Envoi tile-based (prioritaire) ---------
    if (publishFCMByTiles || publishExpoByTiles) {
      try {
        console.log('📡 [ABOUT_TO_SEND_TILES]', {
          caseId,
          approx,
          src,
          kind,
          hasFCM: !!publishFCMByTiles,
          hasExpo: !!publishExpoByTiles,
        });
        log('ABOUT_TO_SEND_TILES', { caseId, approx, src, kind });

        const common = {
          lat: p.lat,
          lng: p.lng,
          caseId,
          kind,
          approx,
          event: 'resolved',
          title,
          body,
        };

        if (publishFCMByTiles) {
          await publishFCMByTiles(common);
          console.log('✅ [FCM_TILES_SENT]', { caseId });
          log('FCM_TILES_SENT', { caseId });
        }
        if (publishExpoByTiles) {
          await publishExpoByTiles(common);
          console.log('✅ [EXPO_TILES_SENT]', { caseId });
          log('EXPO_TILES_SENT', { caseId });
        }

        console.log('🎉 [PUSH_SENT_TILES]', { caseId });
        log('PUSH_SENT_TILES', { caseId, approx, src });
        log('END', { caseId });
        return;
      } catch (e) {
        console.log('💥 [TILES_PUSH_ERR]', { caseId, err: e?.message || String(e) });
        logger.error(`${NS} 💥 tiles_push_err`, { caseId, err: e?.message || String(e) });
      }
    }

    // --------- Fallback multicast FCM ---------
    try {
      const db = admin.firestore();

      console.log('🔎 [FALLBACK] query devices', { caseId });
      const cgSnap = await db
        .collectionGroup('devices')
        .where('active', '==', true)
        .where('channels.missingAlerts', '==', true)
        .get();

      const rootSnap = await db
        .collection('devices')
        .where('active', '==', true)
        .where('channels.missingAlerts', '==', true)
        .get();

      const tokenSet = new Set();
      const collectTokens = (snap) => {
        snap.forEach((d) => {
          const x = d.data() || {};
          if (x.fcmToken) {tokenSet.add(x.fcmToken);}
          else if (x.fcm) {tokenSet.add(x.fcm);}
        });
      };
      collectTokens(cgSnap);
      collectTokens(rootSnap);

      const tokens = Array.from(tokenSet);
      console.log('🧮 [FALLBACK] selected tokens', { caseId, count: tokens.length });
      log('DEVICES_SELECTED_FALLBACK', { caseId, count: tokens.length });

      if (!tokens.length) {
        console.log('⚠️ [FALLBACK] no tokens', { caseId });
        logger.warn(`${NS} ⚠️ no_tokens_fallback`, { caseId });
        log('END', { caseId });
        return;
      }

      const payload = {
        notification: { title, body },
        data: {
          alertId: caseId,
          openTarget: 'missingDetail',
          channelId: 'missing-alerts-urgent', // ✅ canal Missing
          type: 'missing', // ✅ détection fiable
          deeplink: `vigiapp://missing/${caseId}`, // ✅ routing explicite
          approx: approx ? '1' : '0',
          kind,
          event: 'resolved',
        },
      };

      const chunkSize = 500;
      let success = 0,
        failure = 0;

      console.log('📤 [FALLBACK] about to send', {
        caseId,
        chunks: Math.ceil(tokens.length / chunkSize),
      });
      for (let i = 0; i < tokens.length; i += chunkSize) {
        const chunk = tokens.slice(i, i + chunkSize);
        console.log('📦 [CHUNK] sending', { caseId, idx: i / chunkSize, size: chunk.length });
        const res = await admin.messaging().sendEachForMulticast({ tokens: chunk, ...payload });
        success += res.successCount || 0;
        failure += res.failureCount || 0;
        console.log('🧾 [CHUNK_RESULT]', {
          caseId,
          idx: i / chunkSize,
          success: res.successCount,
          failure: res.failureCount,
        });
      }

      console.log('✅ [FALLBACK_SENT]', { caseId, success, failure });
      log('PUSH_SENT_FALLBACK', { caseId, success, failure });
    } catch (e) {
      console.log('💥 [PUSH_ERR_FALLBACK]', { caseId, err: e?.message || String(e) });
      logger.error(`${NS} 💥 PUSH_ERR_FALLBACK`, { caseId, err: e?.message || String(e) });
    }

    console.log('🏁 [END] Missing Resolve', { caseId });
    log('END', { caseId });
  },
);
