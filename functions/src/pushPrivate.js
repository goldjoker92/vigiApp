/**
 * Callable: sendPrivateAlertByGroup
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
  expoPushSend,
} = require('./utils');

exports.sendPrivateAlertByGroup = functions.https.onCall(async (data, context) => {
  assertRole(context);

  const { groupId, title, body } = data || {};
  if (!groupId || typeof groupId !== 'string') {
    console.warn('[sendPrivateAlertByGroup] bad payload', data);
    throw new functions.https.HttpsError(
      'invalid-argument',
      "Paramètre 'groupId' requis (string).",
    );
  }

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
    dry: { targetsCount: tokens.length, sample: tokens.slice(0, 5) },
  });

  if (!tokens.length) {
    console.log('[sendPrivateAlertByGroup] aucun token', { groupId });
    return { ok: true, count: 0, info: 'Aucun device', logId: logRef.id };
  }

  const results = await expoPushSend(
    tokens,
    title || 'Message privé VigiApp',
    body || 'Ping groupe',
    { type: 'private_group', groupId },
  );

  await logRef.update({ results });
  console.log('[sendPrivateAlertByGroup] done', {
    groupId,
    count: tokens.length,
    logId: logRef.id,
  });
  return { ok: true, count: tokens.length, logId: logRef.id };
});
