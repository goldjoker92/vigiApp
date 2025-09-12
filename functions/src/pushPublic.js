/**
 * Callable: sendPublicAlertByCEP (VERBOSE + CLEAN)
 * data: { cep: string, title?: string, body?: string }
 * Sécu: custom claim 'role' ∈ {"admin","moderator"}
 */

const {
  functions,
  assertRole,
  getTokensByCEP,
  createDeliveryLog,
  expoPushSendWithMap,
  summarizeExpoResults,
  cleanInvalidTokens,
  maskToken,
  admin,
} = require('./utils');

exports.sendPublicAlertByCEP = functions.https.onCall(async (data, context) => {
  const start = Date.now();
  assertRole(context);

  const { cep, title, body } = data || {};
  if (!cep || typeof cep !== 'string') {
    console.warn('[sendPublicAlertByCEP] bad payload', data);
    throw new functions.https.HttpsError('invalid-argument', "Paramètre 'cep' requis (string).");
  }

  console.log('[sendPublicAlertByCEP] start', { cep, title, body });

  const tokens = await getTokensByCEP(cep);
  const logRef = await createDeliveryLog('public_cep', {
    cep,
    title: title || 'Alerte VigiApp',
    body: body || 'Ping CEP',
    targetsCount: tokens.length,
    sample: tokens.slice(0, 5).map(maskToken),
  });

  if (!tokens.length) {
    console.log('[sendPublicAlertByCEP] aucun token', { cep, logId: logRef.id });
    return { ok: true, count: 0, info: 'Aucun device', logId: logRef.id };
  }

  // Envoi + map index→token
  const { results, map } = await expoPushSendWithMap(
    tokens,
    title || 'Alerte VigiApp',
    body || 'Ping CEP',
    { type: 'public_cep', cep },
  );

  // Résumé + nettoyage des tokens invalides en DB
  const summary = summarizeExpoResults(results);
  const cleaned = await cleanInvalidTokens(results, map); // { removed, matchedDocs, tokens }

  await logRef.update({
    results,
    summary,
    cleaned, // consigné en log uniquement (pas dans le retour public)
    deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('[sendPublicAlertByCEP] done', {
    cep,
    count: tokens.length,
    delivered: summary.ok,
    failed: summary.error,
    cleaned: cleaned?.removed || 0,
    durationMs: Date.now() - start,
    logId: logRef.id,
  });

  // ⚠️ Sans régression: on ne change PAS la shape de retour
  return {
    ok: true,
    count: tokens.length,
    delivered: summary.ok,
    failed: summary.error,
    errorsByCode: summary.errorsByCode,
    logId: logRef.id,
  };
});
