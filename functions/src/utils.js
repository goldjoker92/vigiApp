/**
 * utils.js
 * - Initialisation ADMIN (idempotente)
 * - Accès Firestore
 * - Helpers partagés (auth, batching, Expo push, logs)
 */

const functions = require("firebase-functions");
const v1functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

// Init admin — idempotent (évite "already exists")
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/** Découpe un tableau en sous-tableaux de taille fixe */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Autorisation minimale par rôle via custom claims */
function assertRole(context, allowed = ["admin", "moderator"]) {
  const role = context?.auth?.token?.role;
  if (!role || !allowed.includes(role)) {
    console.warn("[assertRole] refusé — role:", role, "required:", allowed);
    throw new functions.https.HttpsError(
      "permission-denied",
      "Accès refusé: rôle requis (admin/moderator)."
    );
  }
}

/** Envoi vers Expo Push API (Node 20 → fetch global) */
async function expoPushSend(tokens, title, body, data = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  console.log("[expoPushSend] start", { count: tokens.length, title, body });

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
      const json = JSON.parse(text);
      results.push(json);
      console.log("[expoPushSend] batch ok", { size: batch.length });
    } catch {
      results.push({ raw: text });
      console.warn("[expoPushSend] batch raw response", text?.slice(0, 256));
    }
  }

  console.log("[expoPushSend] done", { batches: results.length });
  return results;
}

/** Log de livraison (deliveries/{id}) */
async function createDeliveryLog(kind, meta) {
  const ref = await db.collection("deliveries").add({
    kind,
    ...meta,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("[createDeliveryLog]", { kind, logId: ref.id });
  return ref;
}

/** Tokens par CEP */
async function getTokensByCEP(cep) {
  console.log("[getTokensByCEP] cep=", cep);
  const snap = await db.collection("devices").where("cep", "==", cep).get();
  const tokens = [];
  snap.forEach((doc) => {
    const t = doc.get("expoPushToken");
    if (t) tokens.push(t);
  });
  console.log("[getTokensByCEP] found tokens:", tokens.length);
  return tokens;
}

/** Tokens par userIds (batch Firestore 'in' de 10) */
async function getTokensByUserIds(userIds) {
  console.log("[getTokensByUserIds] userIds length=", userIds?.length || 0);
  const tokens = [];
  for (const ids of chunk(userIds, 10)) {
    const snap = await db.collection("devices").where("userId", "in", ids).get();
    snap.forEach((doc) => {
      const t = doc.get("expoPushToken");
      if (t) tokens.push(t);
    });
  }
  console.log("[getTokensByUserIds] tokens total:", tokens.length);
  return tokens;
}

/** Wrapper loggé d’erreurs — centralise l’errorLog Firestore */
async function errorHandlingWrapper(functionName, callback) {
  try {
    console.log(`[${functionName}] start`);
    const result = await callback();
    console.log(`[${functionName}] success`);
    return result;
  } catch (error) {
    console.error(`❌ [${functionName}]`, error?.message, error?.stack);
    await db.collection("errorLogs").add({
      functionName,
      error: error?.message,
      stack: error?.stack,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    return null;
  }
}

module.exports = {
  functions,
  v1functions,
  admin,
  db,
  chunk,
  assertRole,
  expoPushSend,
  createDeliveryLog,
  getTokensByCEP,
  getTokensByUserIds,
  errorHandlingWrapper
};
