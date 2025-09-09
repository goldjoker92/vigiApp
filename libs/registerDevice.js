// lib/registerDevice.js
// -------------------------------------------------------------
// Enregistre l'appareil dans Firestore avec token Expo, CEP,
// (lat/lng/geo/groupes optionnels). À appeler après obtention token.
// -------------------------------------------------------------
import { Platform } from "react-native";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import * as Device from "expo-device";

export async function upsertDevice({ userId, expoPushToken, cep, lat, lng, geohash, groups = [] }) {
  try {
    const db = getFirestore();
    const deviceId = `${userId || "anon"}:${Device.deviceName || "unknown"}:${Platform.OS}`;
    const ref = doc(db, "devices", deviceId);

    const payload = {
      userId: userId || null,
      expoPushToken: expoPushToken || null,
      platform: Platform.OS,
      cep: cep || null,
      lat: typeof lat === "number" ? lat : null,
      lng: typeof lng === "number" ? lng : null,
      geohash: geohash || null,
      groups: Array.isArray(groups) ? groups : [],
      updatedAt: Date.now(),
      updatedAtServer: serverTimestamp(),
    };

    console.log("📝 [upsertDevice] payload:", payload);
    await setDoc(ref, payload, { merge: true });
    console.log("✅ [upsertDevice] saved at", ref.path);
    return { ok: true, id: ref.id };
  } catch (e) {
    console.error("❌ [upsertDevice] error", e);
    return { ok: false, error: e?.message || "unknown error" };
  }
}
