/**
 * Callable: sendPrivateAlertByGroup (VERBOSE + CLEAN)
 * data: { groupId: string, title?: string, body?: string }
 * Firestore: groups/{groupId} -> { memberIds: string[] }
 * Sécu: custom claim 'role' ∈ {"admin","moderator"}
 */

const {
  functions,
  db,
  assertRole,
  getTokensByUserIds,
  createDeliveryLog,
  expoPushSendWithMap,
  summarizeExpoResults,
  cleanInvalidTokens,
  maskToken,
  admin,
} = require('./utils');

exports.sendPrivateAlertByGroup = functions.https.onCall(async (data, context) => {
  const start = Date.now();
  assertRole(context);

  const { groupId, title, body } = data || {};
  if (!groupId || typeof groupId !== 'string') {
    console.warn('[sendPrivateAlertByGroup] bad payload', data);
    throw new functions.https.HttpsError(
      'invalid-argument',
      "Paramètre 'groupId' requis (string).",
    );
  }

  console.log('[sendPrivateAlertByGroup] start', { groupId, title, body });

  const grpSnap = await db.collection('groups').doc(groupId).get();
  if (!grpSnap.exists) {
    throw new functions.https.HttpsError('not-found', `Groupe introuvable: ${groupId}`);
  }

  const memberIds = grpSnap.get('memberIds') || [];
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    console.log('[sendPrivateAlertByGroup] groupe vide', { groupId });
    return { ok: true, count: 0, info: 'Groupe sans membres' };
  }

  const tokens = await getTokensByUserIds(memberIds);

  const logRef = await createDeliveryLog('private_group', {
    groupId,
    membersCount: memberIds.length,
    title: title || 'Message privé VigiApp',
    body: body || 'Ping groupe',
    targetsCount: tokens.length,
    sample: tokens.slice(0, 5).map(maskToken),
  });

  if (!tokens.length) {
    console.log('[sendPrivateAlertByGroup] aucun token', { groupId, logId: logRef.id });
    return { ok: true, count: 0, info: 'Aucun device', logId: logRef.id };
  }

  // Envoi + map index→token
  const { results, map } = await expoPushSendWithMap(
    tokens,
    title || 'Message privé VigiApp',
    body || 'Ping groupe',
    { type: 'private_group', groupId },
  );

  // Résumé + nettoyage des tokens invalides en DB
  const summary = summarizeExpoResults(results);
  const cleaned = await cleanInvalidTokens(results, map);

  await logRef.update({
    results,
    summary,
    cleaned, // audit only
    deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log('[sendPrivateAlertByGroup] done', {
    groupId,
    count: tokens.length,
    delivered: summary.ok,
    failed: summary.error,
    cleaned: cleaned?.removed || 0,
    durationMs: Date.now() - start,
    logId: logRef.id,
  });

  // ⚠️ Sans régression: shape identique
  return {
    ok: true,
    count: tokens.length,
    delivered: summary.ok,
    failed: summary.error,
    errorsByCode: summary.errorsByCode,
    logId: logRef.id,
  };
});
