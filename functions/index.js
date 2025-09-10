// functions/index.js
// -------------------------------------------------------------
// Cloud Function: sendPublicAlertByCEP (callable v1)
// - Input: { cep, title, body }
// - Cible: devices où devices.cep == cep
// - Envoi: Expo Push API (Android routé via FCM)
// - Logs: deliveries/{id} avec dry-run + résultats
// -------------------------------------------------------------

const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Options globales (tu en avais déjà)
functions.setGlobalOptions({
  maxInstances: 10,
  region: "us-central1", // change si besoin (ex: southamerica-east1)
});

admin.initializeApp();
const db = admin.firestore();

// Envoi via Expo Push API — Node 20+ a 'fetch' global
async function expoPushSend(tokens, title, body, data = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return { error: "no-tokens" };

  const results = [];
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100).map((t) => ({
      to: t,
      sound: "default",
      title,
      body,
      data,
      channelId: "default",
    }));

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(chunk),
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

exports.sendPublicAlertByCEP = functions.https.onCall(async (data, context) => {
  try {
    const { cep, title, body } = data || {};
    if (!cep || typeof cep !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "cep requis (string)");
    }

    // Récupère les tokens ciblés
    const snap = await db.collection("devices").where("cep", "==", cep).get();
    const tokens = [];
    snap.forEach((doc) => {
      const t = doc.get("expoPushToken");
      if (t) tokens.push(t);
    });

    // Log initial (dry-run)
    const logRef = await db.collection("deliveries").add({
      kind: "public_cep",
      cep,
      title: title || "Alerte VigiApp",
      body: body || "Ping CEP",
      dry: { targetsCount: tokens.length, sample: tokens.slice(0, 5) },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!tokens.length) {
      logger.info(`[public_cep] Aucun device pour cep=${cep}`);
      return { ok: true, count: 0, info: "Aucun device", logId: logRef.id };
    }

    // Envoi
    const results = await expoPushSend(
      tokens,
      title || "Alerte VigiApp",
      body || "Ping CEP",
      { type: "public_cep", cep }
    );

    await logRef.update({ results });
    logger.info(`[public_cep] Envoi terminé`, { cep, count: tokens.length, logId: logRef.id });
    return { ok: true, count: tokens.length, logId: logRef.id };
  } catch (e) {
    logger.error("[sendPublicAlertByCEP] error:", e);
    throw new functions.https.HttpsError("internal", e?.message || "unknown error");
  }
});

// Exemple helloWorld (facultatif, laisse commenté si inutile)
// exports.helloWorld = functions.https.onRequest((req, res) => {
//   logger.info("Hello logs!", { structuredData: true });
//   res.send("Hello from Firebase!");
// });
