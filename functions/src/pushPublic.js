/* eslint-env node */
'use strict';

/**
 * VigiApp — Public Alerts (CEP & Adresse)
 * - Envoi FCM “heads-up” via canal Android `alerts-high`
 * - Données `data` stringifiées (exigence FCM)
 * - Titre/corps présents => bannière quand l’app est fermée
 * - Upsert optionnel du doc Firestore publicAlerts/{alertId}
 * - Nettoyage des tokens invalides côté users/{uid}.fcmTokens
 * - Logs détaillés, sans casser les exports existants
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Helpers centralisés
const {
  db,
  toDigits,
  coerceBool,
  resolveAccentColor,
  localLabel,
  textsBySeverity,
  sendToToken,
  upsertPublicAlertDoc,
} = require('./utils');

// Canal Android attendu par l’app
const ANDROID_CHANNEL_ID = 'alerts-high';

// ======================================================================
// Helpers internes
// ======================================================================
function ok(res, body)  { return res.status(200).json({ ok: true,  ...body }); }
function ko(res, code, msg) { return res.status(code).json({ ok: false, error: msg }); }
const num = (v, d = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// ======================================================================
// Envoi par CEP (HTTP v2)
// ======================================================================
module.exports.sendPublicAlertByCEP = onRequest({ timeoutSeconds: 60, cors: true }, async (req, res) => {
  console.log('[PUBLIC ALERT/CEP] START');

  try {
    const b = req.method === 'POST' ? (req.body || {}) : (req.query || {});

    // Requis
    const alertId = String(b.alertId || '').trim();
    const cepRaw  = String(b.cep || '').trim();
    const cep     = toDigits(cepRaw);

    // Contexte optionnel (affichage / doc)
    const bairro   = String(b.bairro || '').trim();
    const cidade   = String(b.cidade || '').trim();
    const uf       = String(b.uf || '').trim();
    const endereco = String(b.endereco || '').trim();

    // Localisation/rayon (affichage)
    const lat       = num(b.lat, null);
    const lng       = num(b.lng, null);
    const radius_m  = num(b.radius_m ?? b.radius, 1000);

    // Contenu & style
    const titulo    = b.titulo ? String(b.titulo).trim() : '';
    const descricao = b.descricao ? String(b.descricao).trim() : '';
    const severity  = (b.severidade || 'medium').toString();
    const formColor = b.color ? String(b.color).trim() : null;
    const image     = b.image ? String(b.image).trim() : null;

    // Flags / Durée
    const testToken       = b.testToken ? String(b.testToken).trim() : null;
    const registerDoc     = coerceBool(b.registerDoc);
    const expiresInMin    = num(b.expiresInMinutes, 60);
    const expiresAt       = admin.firestore.Timestamp.fromDate(new Date(Date.now() + (expiresInMin * 60 * 1000)));

    console.log('[PUBLIC ALERT/CEP] req =', {
      alertId, cep, cepRaw, bairro, cidade, uf, endereco,
      lat, lng, radius_m, severity, formColor, hasImage: !!image,
      testToken: testToken ? testToken.slice(0, 12) + '…' : null,
      registerDoc, expiresInMin
    });

    // Validation
    if (!alertId || !cep) {
      console.warn('[PUBLIC ALERT/CEP] Missing params (alertId/cep)');
      return ko(res, 400, 'Params requis: alertId, cep');
    }

    const accent     = resolveAccentColor({ severity, formColor });
    const local      = localLabel({ endereco, bairro, cidade, uf });
    const openTarget = (severity === 'grave' || severity === 'high') ? 'detail' : 'home';
    const deepLink   = `vigiapp://public-alerts/${alertId}`;
    const { title, body } = textsBySeverity(severity, local, '');

    // Upsert doc Firestore (optionnel)
    if (registerDoc) {
      await upsertPublicAlertDoc({
        alertId,
        titulo,
        descricao,
        endereco: endereco || (bairro ? `${bairro}, ${cidade || ''} ${uf || ''}`.trim() : null),
        cidade,
        uf,
        cep,
        lat,
        lng,
        radius_m,
        severity,
        accent,
        image,
        expiresAt,
      });
      console.log('[PUBLIC ALERT/CEP] publicAlerts/%s upsert OK', alertId);
    } else {
      console.log('[PUBLIC ALERT/CEP] registerDoc=false → aucun write Firestore');
    }

    // -------------------------
    // Mode test: un seul token
    // -------------------------
    if (testToken) {
      try {
        const id = await sendToToken({
          token: testToken,
          title,
          body,
          image,
          androidColor: accent,
          data: {
            type: 'alert_public',
            alertId,
            deepLink,
            openTarget,
            endereco: local,
            bairro,
            cidade,
            uf,
            cep,
            distancia: '',
            severidade: severity,
            color: accent,
            radius_m: String(radius_m),
            lat: lat != null ? String(lat) : '',
            lng: lng != null ? String(lng) : '',
            channelId: ANDROID_CHANNEL_ID, // debug côté app
          },
        });

        console.log('[PUBLIC ALERT/CEP] Smoke test sent =>', id);
        return ok(res, {
          mode: 'testToken',
          messageId: id,
          wroteDoc: registerDoc,
          route: `/public-alerts/${alertId}`,
          expiresInMinutes: expiresInMin,
        });
      } catch (e) {
        console.error('[PUBLIC ALERT/CEP] Smoke test error', e);
        return ko(res, 500, e?.message || String(e));
      }
    }

    // -------------------------
    // Diffusion réelle par CEP
    // -------------------------
    console.log('[PUBLIC ALERT/CEP] Selecting recipients by CEP…');
    const recipients = [];
    const snap = await db.collection('users').limit(3000).get();

    snap.forEach((doc) => {
      const u = doc.data() || {};
      const tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens.filter(Boolean) : [];
      if (tokens.length === 0) return;

      const userCep = toDigits(u.cep || '');
      if (userCep && userCep === cep) {
        recipients.push({
          uid: doc.id,
          tokens,
          bairro: u.bairro || '',
          cidade: u.cidade || '',
          uf: u.uf || '',
        });
      }
    });

    console.log('[PUBLIC ALERT/CEP] recipients =', recipients.length);

    if (recipients.length === 0) {
      console.warn('[PUBLIC ALERT/CEP] No recipients for CEP', cep);
      return ok(res, {
        sent: 0,
        note: 'Aucun destinataire pour ce CEP',
        wroteDoc: registerDoc,
        route: `/public-alerts/${alertId}`,
        expiresInMinutes: expiresInMin,
      });
    }

    let sent = 0;
    const errors = [];

    for (const r of recipients) {
      for (const token of r.tokens) {
        const shortTok = token.slice(0, 16) + '…';
        try {
          await sendToToken({
            token,
            title,
            body,
            image,
            androidColor: accent,
            data: {
              type: 'alert_public',
              alertId,
              deepLink,
              openTarget,
              endereco: local,
              bairro: r.bairro || bairro,
              cidade: r.cidade || cidade,
              uf: r.uf || uf,
              cep,
              distancia: '',
              severidade: severity,
              color: accent,
              radius_m: String(radius_m),
              lat: lat != null ? String(lat) : '',
              lng: lng != null ? String(lng) : '',
              channelId: ANDROID_CHANNEL_ID,
            },
          });
          sent++;
        } catch (e) {
          const code = e.code || '';
          const msg  = e.message || String(e);
          console.warn('[PUBLIC ALERT/CEP] send error', { token: shortTok, code, msg });

          // Nettoyage des tokens invalides
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-argument'
          ) {
            await db.collection('users').doc(r.uid).update({
              fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
            });
            console.log('[PUBLIC ALERT/CEP] removed invalid token from user', r.uid, shortTok);
          }
          errors.push({ token: shortTok, code, msg });
        }
      }
    }

    console.log('[PUBLIC ALERT/CEP] END', { sent, errors: errors.length });
    return ok(res, {
      sent,
      errors,
      wroteDoc: registerDoc,
      route: `/public-alerts/${alertId}`,
      expiresInMinutes: expiresInMin,
    });
  } catch (e) {
    console.error('[PUBLIC ALERT/CEP] ERROR', e);
    return ko(res, 500, e?.message || String(e));
  }
});

// (si tu as déjà d’autres exports (sendPublicAlertByAddress, etc.), garde-les ici)
