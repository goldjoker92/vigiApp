// -------------------------------------------------------------
// VigiApp — Public Alert (par CEP)
// - INPUT minimal: alertId, cep
// - Optionnels: bairro, cidade, uf, endereco?, lat?, lng?, radius_m?,
//               severidade?, color?, image?, titulo?, descricao?,
//               testToken?, registerDoc?, expiresInMinutes?
// - Ciblage: tous les users dont le CEP (normalisé) === cep.
// - registerDoc: écrit/merge publicAlerts/{alertId} (même schéma standard
//                que l’endpoint “adresse”).
// - Deep-link: vigiapp://public-alerts/{alertId}
// - Sans régression: répond 200 même si aucun destinataire;
//                    nettoyage des tokens invalides.
// -------------------------------------------------------------
/* eslint-env node */
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Helpers centralisés (utils.js)
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

// Canal Android attendu côté app
const ANDROID_CHANNEL_ID = 'alerts-high';

module.exports.sendPublicAlertByCEP = onRequest(
  { timeoutSeconds: 60, cors: true },
  async (req, res) => {
    console.log('[PUBLIC ALERT/CEP] START');

    try {
      const b = req.method === 'POST' ? req.body : req.query;

      // Requis
      const alertId = (b.alertId || '').toString().trim();
      const cepRaw  = (b.cep || '').toString().trim();
      const cep     = toDigits(cepRaw); // on normalise toujours

      // Contexte optionnel (affichage / doc)
      const bairro = (b.bairro || '').toString().trim();
      const cidade = (b.cidade || '').toString().trim();
      const uf     = (b.uf || '').toString().trim();
      const endereco = (b.endereco || '').toString().trim();

      // Coords/rayon facultatifs (affichage)
      const lat = Number.isFinite(parseFloat(b.lat)) ? parseFloat(b.lat) : null;
      const lng = Number.isFinite(parseFloat(b.lng)) ? parseFloat(b.lng) : null;
      const radius_m = Number(b.radius_m ?? b.radius) || 1000;

      // Contenu et style
      const titulo = b.titulo ? b.titulo.toString().trim() : '';
      const descricao = b.descricao ? b.descricao.toString().trim() : '';
      const severity = (b.severidade || 'medium').toString();
      const formColor = b.color ? b.color.toString().trim() : null;
      const image = b.image ? b.image.toString().trim() : null;

      // Flags/temps
      const testToken = b.testToken ? b.testToken.toString().trim() : null;
      const registerDoc = coerceBool(b.registerDoc);
      const expiresInMinutes = Number(b.expiresInMinutes) > 0 ? Number(b.expiresInMinutes) : 60;
      const expiresAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + expiresInMinutes * 60 * 1000)
      );

      console.log('[PUBLIC ALERT/CEP] req =', {
        alertId, cep, cepRaw, bairro, cidade, uf, endereco,
        lat, lng, radius_m,
        severity, formColor, hasImage: !!image,
        testToken: testToken ? testToken.slice(0, 12) + '…' : null,
        registerDoc, expiresInMinutes
      });

      // Validation stricte
      if (!alertId || !cep) {
        console.warn('[PUBLIC ALERT/CEP] Missing params (alertId/cep)');
        return res.status(400).json({ ok: false, error: 'Params requis: alertId, cep' });
      }

      const accent = resolveAccentColor({ severity, formColor });
      const local = localLabel({ endereco, bairro, cidade, uf });
      const openTarget = (severity === 'grave' || severity === 'high') ? 'detail' : 'home';
      const buildDeepLink = (id) => `vigiapp://public-alerts/${id}`;

      // ✅ Upsert du doc si demandé
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
      } else {
        console.log('[PUBLIC ALERT/CEP] registerDoc=false → aucun write Firestore');
      }

      // ---------------------------
      // Mode smoke test: un seul token (plus verbeux)
      // ---------------------------
      if (testToken) {
        const { title, body } = textsBySeverity(severity, local, '');
        const deepLink = buildDeepLink(alertId);

        try {
          // NB: utils.sendToToken met déjà android.notification.channelId = alerts-high.
          // On double l’info dans data.channelId pour debug côté app.
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
              lat: lat !== null ? String(lat) : '',
              lng: lng !== null ? String(lng) : '',
              channelId: ANDROID_CHANNEL_ID, // <— pour logs côté app
            },
          });

          console.log('[PUBLIC ALERT/CEP] Smoke test sent =>', id);
          return res.status(200).json({
            ok: true,
            mode: 'testToken',
            messageId: id,
            wroteDoc: registerDoc,
            route: `/public-alerts/${alertId}`,
            expiresInMinutes
          });
        } catch (e) {
          console.error('[PUBLIC ALERT/CEP] Smoke test error', e);
          return res.status(500).json({ ok: false, error: e.message || String(e) });
        }
      }

      // ---------------------------
      // Diffusion réelle: sélection par CEP
      // ---------------------------
      console.log('[PUBLIC ALERT/CEP] Selecting recipients by CEP…');
      const recipients = [];
      const snap = await db.collection('users').limit(3000).get();

      snap.forEach((doc) => {
        const u = doc.data();
        const tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens.filter(Boolean) : [];
        if (tokens.length === 0) {
          return;
        }

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
        return res.status(200).json({
          ok: true,
          sent: 0,
          note: 'Aucun destinataire pour ce CEP',
          wroteDoc: registerDoc,
          route: `/public-alerts/${alertId}`,
          expiresInMinutes
        });
      }

      let sent = 0;
      const errors = [];
      const deepLink = buildDeepLink(alertId);
      const { title, body } = textsBySeverity(severity, local, '');

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
                lat: lat !== null ? String(lat) : '',
                lng: lng !== null ? String(lng) : '',
                channelId: ANDROID_CHANNEL_ID, // <— pour logs côté app
              },
            });
            sent++;
          } catch (e) {
            const code = e.code || '';
            const msg = e.message || String(e);
            console.warn('[PUBLIC ALERT/CEP] send error', { token: shortTok, code, msg });

            // 🔥 Nettoyage des tokens invalides
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
      return res.status(200).json({
        ok: true,
        sent,
        errors,
        wroteDoc: registerDoc,
        route: `/public-alerts/${alertId}`,
        expiresInMinutes
      });
    } catch (e) {
      console.error('[PUBLIC ALERT/CEP] ERROR', e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }
);
