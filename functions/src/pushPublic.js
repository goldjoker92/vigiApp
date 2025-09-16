// functions/src/pushPublic.js
// -------------------------------------------------------------
// VigiApp — Public Alert (par adresse complète, CEP optionnel)
// - INPUT: alertId, endereco, lat, lng, radius_m, severidade?, color?, image?, cep?, bairro?, cidade?, uf?, testToken?
// - Ciblage: par RAYON autour (lat,lng) (PRIORITAIRE). Fallback CEP si fourni.
// - CEP: OPTIONNEL pour les alertes publiques (utilisé seulement en fallback si pas de géoloc côté destinataire).
// - Payload FCM: pt-BR dynamique, couleur par gravité, deep-link.
// - Logs verbeux [PUBLIC ALERT] (inclut explicite sur CEP optionnel / adresse prioritaire).
// - Sans régression: répond 200 même si aucun destinataire (mais log clair).
// - Mode smoke-test: param `testToken` pour envoyer à 1 token (debug sans diffusion).
// - Gère les tokens invalides → suppression auto de Firestore.
// -------------------------------------------------------------

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const db = admin.firestore();

// ---------- Utils ----------
const toDigits = (v = '') => String(v).replace(/\D/g, '');
const isHexColor = (c) => /^#?[0-9A-Fa-f]{6}$/.test(String(c || ''));
const normColor = (c) => (c.startsWith('#') ? c : `#${c}`);

// Haversine (mètres)
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

function resolveAccentColor({ severity, formColor }) {
  // 1) Couleur imposée par le formulaire
  if (formColor && isHexColor(formColor)) { return normColor(formColor); }
  // 2) Palette selon gravité
  if (severity === 'high' || severity === 'grave') { return '#FF3B30'; } // rouge
  if (severity === 'low' || severity === 'minor') { return '#FFE600'; }  // jaune
  if (severity === 'medium') { return '#FFA500'; }                        // orange
  // 3) fallback
  return '#0A84FF';
}

function localLabel({ endereco, bairro, cidade, uf }) {
  // Affiché aux destinataires (lisible même si certains champs manquent)
  if (endereco) { return endereco; }
  if (bairro) { return bairro; }
  if (cidade && uf) { return `${cidade}/${uf}`; }
  if (cidade) { return cidade; }
  return 'sua região';
}

function textsBySeverity(sev, local, distText) {
  const sfx = distText ? ` (a ${distText}). Abra para mais detalhes.` : `. Abra para mais detalhes.`;
  switch (sev) {
    case 'low':
    case 'minor':
      return { title: 'VigiApp — Aviso', body: `Aviso informativo em ${local}${sfx}` };
    case 'high':
    case 'grave':
      return { title: 'VigiApp — URGENTE', body: `URGENTE: risco em ${local}${sfx}` };
    case 'medium':
    default:
      return { title: 'VigiApp — Alerta público', body: `Alerta em ${local}${sfx}` };
  }
}

// ---------- Sélection destinataires (adresse prioritaire, CEP fallback/optionnel) ----------
async function selectRecipients({ lat, lng, radius_m, cep }) {
  // NOTE: on parcourt les users (ajuste where/index si tu veux restreindre).
  // Côté user attendu:
  //  - u.fcmTokens: string[]
  //  - u.lastLat / u.lastLng: number (si connu)
  //  - u.cep: string (obligatoire à l'inscription mais ici utilisé en fallback)
  const recipients = [];

  const snap = await db.collection('users').limit(3000).get();

  snap.forEach((doc) => {
    const u = doc.data();
    const tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens.filter(Boolean) : [];
    if (tokens.length === 0) { return; }

    const rec = {
      uid: doc.id,
      tokens,
      lastLat: Number(u.lastLat),
      lastLng: Number(u.lastLng),
      cep: toDigits(u.cep || ''),
      bairro: u.bairro || '',
      cidade: u.cidade || '',
      uf: u.uf || '',
    };

    // 1) Si la géoloc du destinataire est connue → filtre par rayon (PRIORITAIRE)
    if (Number.isFinite(rec.lastLat) && Number.isFinite(rec.lastLng)) {
      const d = distanceMeters(lat, lng, rec.lastLat, rec.lastLng);
      if (d <= radius_m) {
        recipients.push({ ...rec, _distance_m: d });
      }
      return; // on ne passe pas au CEP si la géoloc est connue
    }

    // 2) Fallback CEP si fourni côté alerte ET côté user (CEP OPTIONNEL pour l’alerte publique)
    if (cep && rec.cep && cep === rec.cep) {
      recipients.push({ ...rec, _distance_m: NaN });
    }
  });

  return recipients;
}

// ---------- Envoi FCM ----------
async function sendToToken({ token, title, body, image, androidColor, data }) {
  const message = {
    token,
    notification: {
      title,
      body,
      ...(image ? { image } : {}),
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'default',
        color: androidColor,
        defaultSound: true,
        visibility: 'PUBLIC',
        // Certains OEM lisent encore ces champs ici:
        title,
        body,
        ...(image ? { imageUrl: image } : {}),
      },
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default' } },
    },
    data, // meta pour deep-link, filtrage côté app, etc.
  };

  return admin.messaging().send(message);
}

// ---------- Endpoint principal ----------
module.exports.sendPublicAlertByAddress = onRequest(
  { timeoutSeconds: 60, cors: true },
  async (req, res) => {
    console.log('[PUBLIC ALERT] START');

    try {
      const b = req.method === 'POST' ? req.body : req.query;

      // Requis (adresse prioritaire)
      const alertId = (b.alertId || '').toString().trim();
      const endereco = (b.endereco || '').toString().trim();
      const cidade = (b.cidade || '').toString().trim();
      const uf = (b.uf || '').toString().trim();

      const lat = parseFloat(b.lat);
      const lng = parseFloat(b.lng);
      const radius_m = Number(b.radius_m ?? b.radius) || 1000;

      // Optionnels
      const bairro = (b.bairro || '').toString().trim();
      const cep = toDigits(b.cep || ''); // CEP OPTIONNEL ici
      const image = b.image ? b.image.toString().trim() : null;
      const severity = (b.severidade || 'medium').toString();
      const formColor = b.color ? b.color.toString().trim() : null;

      // Smoke test (debug)
      const testToken = b.testToken ? b.testToken.toString().trim() : null;

      console.log('[PUBLIC ALERT] req =', {
        alertId,
        endereco,
        cidade,
        uf,
        lat,
        lng,
        radius_m,
        bairro,
        cep: cep || '(vide: optionnel/public)',
        severity,
        formColor,
        hasImage: !!image,
        testToken: testToken ? testToken.slice(0, 12) + '…' : null,
      });
      if (!cep) {
        console.log('[PUBLIC ALERT] INFO: CEP non fourni → aucun impact (optionnel en public). Ciblage par rayon uniquement pour les users sans géoloc.');
      } else {
        console.log('[PUBLIC ALERT] INFO: CEP fourni → utilisé en fallback si géoloc absente côté destinataire.');
      }

      // Validation stricte (adresse & coords obligatoires)
      if (!alertId || !endereco || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.warn('[PUBLIC ALERT] Missing params (alertId/endereco/lat/lng)');
        return res.status(400).json({
          ok: false,
          error: 'Params requis: alertId, endereco, lat, lng (radius_m conseillé)',
        });
      }

      // Présentation / couleur / deep-link
      const accent = resolveAccentColor({ severity, formColor });
      const local = localLabel({ endereco, bairro, cidade, uf });

      // --- Mode smoke test: envoi à 1 token fourni (ne diffuse pas)
      if (testToken) {
        const { title, body } = textsBySeverity(severity, local, '');
        const deepLink = `vigiapp://alert/public/${alertId}`;

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
              endereco: local,
              bairro,
              cidade,
              uf,
              cep,
              distancia: '',
              severidade: severity,
              color: accent,
              radius_m: String(radius_m),
              lat: String(lat),
              lng: String(lng),
            },
          });
          console.log('[PUBLIC ALERT] Smoke test sent =>', id);
          return res.status(200).json({ ok: true, mode: 'testToken', messageId: id });
        } catch (e) {
          console.error('[PUBLIC ALERT] Smoke test error', e);
          return res.status(500).json({ ok: false, error: e.message || String(e) });
        }
      }

      // --- Diffusion réelle
      console.log('[PUBLIC ALERT] Selecting recipients… (adresse prioritaire, CEP fallback)');
      const recipients = await selectRecipients({ lat, lng, radius_m, cep });
      console.log('[PUBLIC ALERT] recipients =', recipients.length);

      if (recipients.length === 0) {
        console.warn('[PUBLIC ALERT] No recipients in area.');
        return res.status(200).json({ ok: true, sent: 0, note: 'Aucun destinataire' });
      }

      let sent = 0;
      const errors = [];

      for (const r of recipients) {
        // Distances personnalisées si géoloc connue
        const distText = Number.isFinite(r._distance_m) ? fmtDist(r._distance_m) : '';
        const { title, body } = textsBySeverity(severity, local, distText);
        const deepLink = `vigiapp://alert/public/${alertId}`;

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
                endereco: local,
                bairro,
                cidade,
                uf,
                cep,
                distancia: distText,
                severidade: severity,
                color: accent,
                radius_m: String(radius_m),
                lat: String(lat),
                lng: String(lng),
              },
            });
            sent++;
          } catch (e) {
            const code = e.code || '';
            const msg = e.message || String(e);
            console.warn('[PUBLIC ALERT] send error', { token: shortTok, code, msg });

            // 🔥 Nettoyage des tokens invalides côté user
            if (
              code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-argument'
            ) {
              try {
                await db.collection('users').doc(r.uid).update({
                  fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
                });
                console.log('[PUBLIC ALERT] removed invalid token from user', r.uid, shortTok);
              } catch (remErr) {
                console.error('[PUBLIC ALERT] failed to remove token', shortTok, remErr);
              }
            }

            errors.push({ token: shortTok, code, msg });
          }
        }
      }

      console.log('[PUBLIC ALERT] END', { sent, errors: errors.length });
      return res.status(200).json({ ok: true, sent, errors });
    } catch (e) {
      console.error('[PUBLIC ALERT] ERROR', e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }
);
