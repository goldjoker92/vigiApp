// functions/src/pushPublic.js
// ---------------------------------------------------------
// VigiApp — Cloud Function: sendPublicAlertByAddress
// - Lit les params (POST body ou querystring)
// - (Optionnel) Crée /publicAlerts/{alertId} + /publicAlertsProjection/{alertId} si createDoc=1
// - Puis envoie la notif FCM (ta logique existante, laissée en TODO)
// ---------------------------------------------------------

const { onRequest } = require('firebase-functions/v2/https');
// NOTE: tu m’as dit que admin, db, warn viennent de ./alert-utils
// Garde exactement tes exports existants ici (ajoute info/error si tu les as)
const { admin, db, warn } = require('./alert-utils');

// === 1) Helper: écrire /publicAlerts/{alertId} + /publicAlertsProjection/{alertId}
async function writePublicAlertDoc({ alertId, body }) {
  try {
    const ref = db.collection('publicAlerts').doc(String(alertId));
    await ref.set(
      {
        userId: body.userId || '(test)',
        apelido: body.apelido || '',
        username: body.username || '',
        categoria: body.categoria || body.kind || 'Outros',
        descricao: body.descricao || '',
        gravidade: body.severidade || 'medium',
        color: body.color || '#FFA500',
        ruaNumero: body.endereco || '',
        cidade: body.cidade || '',
        estado: body.uf || '',
        cep: body.cep || '',
        cepPrecision: body.cepPrecision || 'none',
        pais: 'BR',
        location: {
          latitude: Number(body.lat),
          longitude: Number(body.lng),
          accuracy: null,
          heading: null,
          altitudeAccuracy: null,
          speed: null,
        },
        // Tu peux fournir 'date' / 'time' ou laisser createdAt faire foi côté app
        date: body.date || '',
        time: body.time || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: body.expiresAt || null,
        radius: Number(body.radius_m || body.radius) || 1000,
        radius_m: Number(body.radius_m || body.radius) || 1000,
        entryMode: body.mode || 'external',
        isManual: body.mode === 'manual' || false,
        reporter_distance_m: body.reporter_distance_m || 0,
      },
      { merge: true },
    );

    // Projection 1:1 (même logique que recordPublicProjection)
    await db
      .collection('publicAlertsProjection')
      .doc(String(alertId))
      .set(
        {
          projectedAt: admin.firestore.FieldValue.serverTimestamp(),
          alertId: String(alertId),
        },
        { merge: true },
      );
  } catch (e) {
    warn('[PUBLIC ALERT][doc] write failed (non-blocking)', e?.message || e);
  }
}

// === 2) Handler principal
module.exports.sendPublicAlertByAddress = onRequest(
  { timeoutSeconds: 60, cors: true },
  async (req, res) => {
    // Support GET (querystring) et POST (body JSON)
    const b = req.method === 'POST' ? req.body || {} : req.query || {};

    // NEW: flag pour créer le doc Firestore
    const createDoc = String(b.createDoc || b.createdoc || '0') === '1';

    // === Params essentiels
    // id (peut être fourni par le client ; sinon on fabrique un id horodaté)
    const alertId = String(b.alertId || `public_${Date.now()}`);

    // lat/lng de l’incident (requis pour une notif géolocalisée)
    // NOTE: si ta logique fait du géocoding à partir de 'endereco', garde-la AVANT ce bloc et remplis lat/lng ici.
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      // Si tu as un géocodeur plus haut, tu peux enlever ce guard.
      return res.status(400).json({
        ok: false,
        message:
          'Parámetros inválidos: lat/lng obligatórios. (Forneça lat/lng numéricos ou ativa o geocoding antes.)',
      });
    }

    // radius en mètres
    const radiusM = Number(b.radius_m || b.radius) || 1000;

    // Champs facultatifs (utiles pour ton doc & logs)
    const meta = {
      userId: b.userId,
      apelido: b.apelido,
      username: b.username,
      categoria: b.categoria,
      descricao: b.descricao,
      severidade: b.severidade,
      color: b.color,
      endereco: b.endereco,
      cidade: b.cidade,
      uf: b.uf,
      cep: b.cep,
      cepPrecision: b.cepPrecision,
      date: b.date, // si tu veux pousser une date/heure spécifique en plus du serverTimestamp
      time: b.time,
      mode: b.mode || 'external',
      reporter_distance_m: b.reporter_distance_m,
      expiresAt: b.expiresAt || null,
    };

    // === (Optionnel) Création /publicAlerts + /publicAlertsProjection
    if (createDoc) {
      await writePublicAlertDoc({
        alertId,
        body: {
          ...meta,
          lat,
          lng,
          radius_m: radiusM,
        },
      });
    }

    // === TODO: le reste inchangé (sélection des destinataires, envoi FCM, métriques, etc.)
    // Place ici TA logique EXISTANTE :
    //  1) Sélectionner les devices dans le rayon 'radiusM' autour de (lat,lng)
    //  2) Construire le payload FCM (titre, body, data)
    //  3) Envoyer les messages (multicast / topic / tokens)
    //  4) Traquer le nombre 'recipients' & 'sent'
    //
    // Exemple de placeholders pour ne rien casser :
    const recipients = Number(b._mockRecipients) || 1; // remplace par ton vrai calcul
    const sent = Number(b._mockSent) || 1; // remplace par le résultat FCM

    // === Réponse
    return res.json({
      ok: true,
      alertId,
      recipients,
      sent,
      // Tu peux renvoyer lat/lng/radiusM pour debug
      lat,
      lng,
      radius_m: radiusM,
      created: createDoc ? true : false,
      mode: meta.mode,
    });
  },
);
