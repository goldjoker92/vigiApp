// functions/index.js
// -----------------------------------------------------------------------------
// VigiApp — Cloud Functions (Node 20)
// - sendPublicAlertByCEP: push "public" à tous les devices d'un même CEP
// - sendPrivateAlertByGroup: push "privé" aux membres d'un groupe
//
// Sécu minimale: nécessite un utilisateur authentifié avec custom claim
// role ∈ {"admin","moderator"} (sinon HttpsError "permission-denied").
//
// Firestore attendu:
// - devices/{deviceId} : { expoPushToken, userId, cep, ... }
// - groups/{groupId}   : { memberIds: [userId1, userId2, ...] }
//
// Expo Push API: https://exp.host/--/api/v2/push/send
// -----------------------------------------------------------------------------


const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

functions.setGlobalOptions({
  region: "us-central1", // adapte si tu déploies ailleurs
  maxInstances: 10,
});

admin.initializeApp();
const db = admin.firestore();


// ---------- Utils génériques ----------

/** Partitionne un tableau en sous-tableaux de taille fixe. */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Autorisation minimale par rôle (custom claims). */
function assertRole(context, allowed = ["admin", "moderator"]) {
  const role = context?.auth?.token?.role;
  if (!role || !allowed.includes(role)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Accès refusé: rôle requis (admin/moderator)."
    );
  }
}

/** Envoi via Expo Push API (Node 20: fetch global). */
async function expoPushSend(tokens, title, body, data = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  const results = [];
  for (const batch of chunk(tokens, 100)) {
    const payload = batch.map((to) => ({
      to,
      sound: "default",
      title,
      body,
      data,
      channelId: "default",
    }));

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    try {
      results.push(JSON.parse(text));
    } catch {
      results.push({ raw: text });
    }
  }
  return results;
}

/** Crée un log deliveries/{id} et retourne la ref. */
async function createDeliveryLog(kind, meta) {
  return db.collection("deliveries").add({
    kind,
    ...meta,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** Récupère tous les expoPushToken des devices d'un CEP. */
async function getTokensByCEP(cep) {
  const snap = await db.collection("devices").where("cep", "==", cep).get();
  const tokens = [];
  snap.forEach((doc) => {
    const t = doc.get("expoPushToken");
    if (t) tokens.push(t);
  });
  return tokens;
}

/** Récupère les tokens pour un set de userIds, par batches de 10 (limite Firestore 'in'). */
async function getTokensByUserIds(userIds) {
  const tokens = [];
  for (const ids of chunk(userIds, 10)) {
    const snap = await db.collection("devices").where("userId", "in", ids).get();
    snap.forEach((doc) => {
      const t = doc.get("expoPushToken");
      if (t) tokens.push(t);
    });
  }
  return tokens;
}


// ---------- 1) Public par CEP ----------

/**
 * Callable: sendPublicAlertByCEP
 * data: { cep: string, title?: string, body?: string }
 */
exports.sendPublicAlertByCEP = functions.https.onCall(async (data, context) => {
  try {
    assertRole(context); // admin/moderator required

    const { cep, title, body } = data || {};
    if (!cep || typeof cep !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Paramètre 'cep' requis (string).");
    }

    const tokens = await getTokensByCEP(cep);
    const logRef = await createDeliveryLog("public_cep", {
      cep,
      title: title || "Alerte VigiApp",
      body: body || "Ping CEP",
      dry: { targetsCount: tokens.length, sample: tokens.slice(0, 5) },
    });

    if (!tokens.length) {
      logger.info(`[public_cep] Aucun device pour cep=${cep}`);
      return { ok: true, count: 0, info: "Aucun device", logId: logRef.id };
    }

    const results = await expoPushSend(
      tokens,
      title || "Alerte VigiApp",
      body || "Ping CEP",
      { type: "public_cep", cep }
    );

    await logRef.update({ results });
    logger.info(`[public_cep] done`, { cep, count: tokens.length, logId: logRef.id });
    return { ok: true, count: tokens.length, logId: logRef.id };
  } catch (err) {
    logger.error("[sendPublicAlertByCEP] error", err);
    throw err instanceof functions.https.HttpsError
      ? err
      : new functions.https.HttpsError("internal", err?.message || "unknown error");
  }
});


// ---------- 2) Privé par groupe ----------

/**
 * Callable: sendPrivateAlertByGroup
 * data: { groupId: string, title?: string, body?: string }
 *
 * Firestore attendu:
 * groups/{groupId}: { memberIds: string[] }
 * devices: { userId, expoPushToken }
 */
exports.sendPrivateAlertByGroup = functions.https.onCall(async (data, context) => {
  try {
    assertRole(context); // admin/moderator required

    const { groupId, title, body } = data || {};
    if (!groupId || typeof groupId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Paramètre 'groupId' requis (string).");
    }

    // Récup groupe
    const grpSnap = await db.collection("groups").doc(groupId).get();
    if (!grpSnap.exists) {
      throw new functions.https.HttpsError("not-found", `Groupe introuvable: ${groupId}`);
    }
    const memberIds = grpSnap.get("memberIds") || [];
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return { ok: true, count: 0, info: "Groupe sans membres" };
    }

    const tokens = await getTokensByUserIds(memberIds);
    const logRef = await createDeliveryLog("private_group", {
      groupId,
      membersCount: memberIds.length,
      title: title || "Message privé VigiApp",
      body: body || "Ping groupe",
      dry: { targetsCount: tokens.length, sample: tokens.slice(0, 5) },
    });

    if (!tokens.length) {
      logger.info(`[private_group] Aucun device pour groupId=${groupId}`);
      return { ok: true, count: 0, info: "Aucun device", logId: logRef.id };
    }

    const results = await expoPushSend(
      tokens,
      title || "Message privé VigiApp",
      body || "Ping groupe",
      { type: "private_group", groupId }
    );

    await logRef.update({ results });
    logger.info(`[private_group] done`, { groupId, count: tokens.length, logId: logRef.id });
    return { ok: true, count: tokens.length, logId: logRef.id };
  } catch (err) {
    logger.error("[sendPrivateAlertByGroup] error", err);
    throw err instanceof functions.https.HttpsError
      ? err
      : new functions.https.HttpsError("internal", err?.message || "unknown error");
  }
});


// -----------------------------------------------------------------------------
// Notes d’usage & tests
// -----------------------------------------------------------------------------
// 1) Sécurité: il faut que l’appelant ait un custom claim 'role' = 'admin' ou 'moderator'.
//    Exemple côté admin SDK pour définir un rôle:
//    await admin.auth().setCustomUserClaims(uid, { role: "admin" });
//
// 2) Testing depuis Firebase Console > Functions > sendPublicAlertByCEP:
//    Payload JSON:
//      { "cep": "62595-000", "title": "Alerte test", "body": "Ping quartier — solo" }
//
//    Testing sendPrivateAlertByGroup:
//      { "groupId": "grp_test", "title": "Privé test", "body": "Ping groupe — solo" }
//
// 3) Firestore de contrôle: deliveries/{logId}
//    - kind: "public_cep" | "private_group"
//    - dry.targetsCount, dry.sample
//    - results: réponses de l’Expo Push API (tickets/erreurs)
// -----------------------------------------------------------------------------
