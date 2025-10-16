/* eslint-env node */
'use strict';

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const {
  log,
  warn,
  err,
  resolveRadiusByKind,
  resolveAccentColor,
  localLabel,
  textsBySeverity,
  getFcmTokensByCEP,
  sendToToken,
  createDeliveryLog,
  recordPublicAlertFootprint,
} = require('./alert-utils');

const fanoutPublicAlert = onDocumentCreated('publicAlerts/{alertId}', async (event) => {
  const alertId = event?.params?.alertId;
  const data = event?.data?.data?.();
  if (!data) {
    warn('[fanoutPublicAlert] no data', { alertId });
    return;
  }

  const {
    titulo,
    descricao,
    endereco,
    bairro,
    cidade,
    uf,
    cep,
    lat,
    lng,
    radius_m,
    gravidade,
    color: formColor,
    image,
    kind,
    ttlSeconds,
  } = data;

  const radiusM = resolveRadiusByKind(kind, radius_m);
  const androidColor = resolveAccentColor({ severity: gravidade, formColor });
  const local = localLabel({ endereco, bairro, cidade, uf });
  const { title, body } = textsBySeverity(gravidade || 'medium', local, null);

  // Footprint (analytics 90j)
  try {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      await recordPublicAlertFootprint({
        alertId,
        kind: kind || 'publicIncident',
        lat,
        lng,
        radius_m: radiusM,
        endereco,
        bairro,
        cidade,
        uf,
        createdAt: data.createdAt || null,
      });
    }
  } catch (e) {
    warn('[fanoutPublicAlert] footprint error', e?.message || e);
  }

  // Sélection basique par CEP (plug & play avec tes helpers)
  let tokens = [];
  try {
    if (cep) {
      tokens = await getFcmTokensByCEP(cep);
    } else {
      warn('[fanoutPublicAlert] CEP manquant', { alertId });
    }
  } catch (e) {
    err('[fanoutPublicAlert] token query failed', e?.message || e);
  }

  if (!tokens.length) {
    await createDeliveryLog('publicAlert', {
      alertId,
      method: 'fcm',
      selected: 0,
      delivered: 0,
      radiusM,
      cep: cep || null,
      city: cidade || null,
      kind: kind || 'publicIncident',
    });
    return;
  }

  const dataPayload = {
    type: 'publicAlert',
    alertId: String(alertId || ''),
    kind: String(kind || 'publicIncident'),
    cidade: String(cidade || ''),
    uf: String(uf || ''),
    cep: String(cep || ''),
    radius_m: String(radiusM || ''),
    lat: Number.isFinite(lat) ? String(lat) : '',
    lng: Number.isFinite(lng) ? String(lng) : '',
  };

  const ttl = Number.isFinite(ttlSeconds) ? ttlSeconds : 900;
  let delivered = 0;
  const batchSize = 100;
  for (let i = 0; i < tokens.length; i += batchSize) {
    const slice = tokens.slice(i, i + batchSize);
    const results = await Promise.all(
      slice.map((token) =>
        sendToToken({
          token,
          title: titulo || title,
          body: descricao || body,
          image,
          androidColor,
          data: dataPayload,
          ttlSeconds: ttl,
        })
          .then(() => true)
          .catch(() => false),
      ),
    );
    delivered += results.filter(Boolean).length;
  }

  await createDeliveryLog('publicAlert', {
    alertId,
    method: 'fcm',
    selected: tokens.length,
    delivered,
    radiusM,
    cep: cep || null,
    city: cidade || null,
    kind: kind || 'publicIncident',
    ttlSeconds: ttl,
  });

  log('[fanoutPublicAlert] done', { alertId, selected: tokens.length, delivered });
});

module.exports = { fanoutPublicAlert };
