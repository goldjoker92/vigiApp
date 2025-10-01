// libs/getDeviceLocation.js
// ============================================================
// Récupération robuste de la localisation de l'utilisateur
// - GPS haute précision -> dernière position -> fallback IP -> null
// ============================================================

import * as Location from "expo-location"; // ou react-native-location si bare

export async function getDeviceLocation(options = {}) {
  const {
    enableHighAccuracy = true,
    timeoutMs = 5000,
    fallbackToLast = true,
    fallbackToIP = true,
  } = options;

  let finalLoc = null;

  try {
    // 1️⃣ Demander les permissions
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      console.warn("[Location] Permission refusée");
      throw new Error("permission_denied");
    }

    // 2️⃣ Tentative GPS directe avec timeout
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: enableHighAccuracy
          ? Location.Accuracy.Highest
          : Location.Accuracy.Balanced,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      ),
    ]);

    if (loc?.coords) {
      finalLoc = loc.coords;
    }
  } catch (e) {
    console.warn("[Location] GPS direct KO:", e.message);
  }

  // 3️⃣ Dernière position connue
  if (!finalLoc && fallbackToLast) {
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last?.coords) {
        console.log("[Location] Fallback → dernière position connue");
        finalLoc = last.coords;
      }
    } catch {}
  }

  // 4️⃣ Fallback IP (API externe)
  if (!finalLoc && fallbackToIP) {
    try {
      const resp = await fetch("https://ipapi.co/json/");
      const data = await resp.json();
      if (data?.latitude && data?.longitude) {
        console.log("[Location] Fallback → IP geo");
        finalLoc = { latitude: data.latitude, longitude: data.longitude };
      }
    } catch {}
  }

  if (!finalLoc) {
    console.warn("[Location] Aucun fallback n’a fonctionné");
    return null;
  }

  return {
    lat: finalLoc.latitude,
    lng: finalLoc.longitude,
    source: "gps|last|ip",
  };
}
