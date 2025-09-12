/**
 * Callable: sendPublicAlertByCEP
 * data: { cep: string, title?: string, body?: string }
 * Sécu: custom claim 'role' ∈ {"admin","moderator"}
 */

const {
  functions,
  assertRole,
  getTokensByCEP,
  createDeliveryLog,
  expoPushSend,
} = require('./utils');

exports.sendPublicAlertByCEP = functions.https.onCall(async (data, context) => {
  assertRole(context);

  const { cep, title, body } = data || {};
  if (!cep || typeof cep !== 'string') {
    console.warn('[sendPublicAlertByCEP] bad payload', data);
    throw new functions.https.HttpsError('invalid-argument', "Paramètre 'cep' requis (string).");
  }

  const tokens = await getTokensByCEP(cep);
  const logRef = await createDeliveryLog('public_cep', {
    cep,
    title: title || 'Alerte VigiApp',
    body: body || 'Ping CEP',
    dry: { targetsCount: tokens.length, sample: tokens.slice(0, 5) },
  });

  if (!tokens.length) {
    console.log('[sendPublicAlertByCEP] aucun token', { cep });
    return { ok: true, count: 0, info: 'Aucun device', logId: logRef.id };
  }

  const results = await expoPushSend(tokens, title || 'Alerte VigiApp', body || 'Ping CEP', {
    type: 'public_cep',
    cep,
  });

  await logRef.update({ results });
  console.log('[sendPublicAlertByCEP] done', { cep, count: tokens.length, logId: logRef.id });
  return { ok: true, count: tokens.length, logId: logRef.id };
});
