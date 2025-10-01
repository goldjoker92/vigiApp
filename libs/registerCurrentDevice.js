// libs/registerCurrentDevice.js
// Orchestrateur Expo: récupère token FCM via expo-notifications, position, et upsert Firestore.
// Pas de @react-native-firebase/messaging ici.

import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { getDeviceLocation } from "./getDeviceLocation";
import { upsertDevice } from "./registerDevice";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getFcmTokenExpoWithRetry(maxTries = 5) {
  for (let i = 1; i <= maxTries; i++) {
    try {
      const { data } = await Notifications.getDevicePushTokenAsync({ type: "fcm" });
      if (typeof data === "string" && data.length > 0) {
        return data;
      }
    } catch {
      // ignore and retry
    }
    await sleep(600 * i); // backoff léger
  }
  return null;
}

let inFlight = false;
let lastKey = null;

function normalizeCep(cep) {
  const d = String(cep || "").replace(/\D+/g, "");
  return d.length === 8 ? d : null;
}
function snapshotKey(p) {
  const lat = Number.isFinite(p.lat) ? p.lat.toFixed(4) : "null";
  const lng = Number.isFinite(p.lng) ? p.lng.toFixed(4) : "null";
  const cep = p.cep || "null";
  const fcm = (p.fcmDeviceToken || "").slice(0, 16);
  const expo = (p.expoPushToken || "").slice(0, 16);
  const groups = Array.isArray(p.groups) ? p.groups.join(",") : "";
  return `${p.userId}|${fcm}|${expo}|${lat}|${lng}|${cep}|${groups}|${p.active ? 1 : 0}`;
}

export async function registerCurrentDevice({
  userId,
  userCep,
  userCity,
  groups = [],
  force = false,
} = {}) {
  if (!userId) { return { ok: false, error: "userId requis" }; }
  if (inFlight) {
    return { ok: false, error: "in-flight" };
  }
  inFlight = true;

  try {
    // 1) Token FCM (via Expo)
    const fcmDeviceToken = await getFcmTokenExpoWithRetry(5);
    if (!fcmDeviceToken) {
      console.warn("[Device] FCM introuvable (Expo). Upsert annulé pour respecter les rules.");
      return { ok: false, error: "fcmDeviceToken absent" };
    }

    // 2) Expo Push token (optionnel)
    let expoPushToken = null;
    try {
      const resp = await Notifications.getExpoPushTokenAsync();
      expoPushToken = resp?.data || null;
    } catch {}

    // 3) Position robuste
    const loc = await getDeviceLocation({ enableHighAccuracy: true, timeoutMs: 5000 });

    // 4) Payload
    const payload = {
      userId,
      expoPushToken,
      fcmDeviceToken,                  // requis par tes rules
      cep: normalizeCep(userCep),
      city: userCity?.trim?.() || null,
      lat: Number.isFinite(loc?.lat) ? loc.lat : null,
      lng: Number.isFinite(loc?.lng) ? loc.lng : null,
      groups,
      active: true,
    };

    const key = snapshotKey(payload);
    if (!force && key === lastKey) {
      return { ok: true, skipped: true, reason: "no-diff" };
    }

    const res = await upsertDevice(payload);
    if (res?.ok) { lastKey = key; }
    return res;
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    inFlight = false;
  }
}

export function attachDeviceAutoRefresh({ userId, userCep, userCity, groups }) {
  if (!userId) {
    console.warn("[Device] attachDeviceAutoRefresh: userId manquant");
    return () => {};
  }

  // 1) Boot
  registerCurrentDevice({ userId, userCep, userCity, groups })
    .then((r) => console.log("[Device] boot upsert =>", r))
    .catch(() => {});

  // 2) Retour au foreground
  const onState = async (s) => {
    if (s === "active") {
      await registerCurrentDevice({ userId, userCep, userCity, groups });
    }
  };
  const unsubAppState = AppState.addEventListener("change", onState);

  // 3) Refresh périodique (6h)
  const intervalId = setInterval(() => {
    registerCurrentDevice({ userId, userCep, userCity, groups }).catch(() => {});
  }, 6 * 60 * 60 * 1000);

  return () => {
    try { unsubAppState?.remove?.(); } catch {}
    try { clearInterval(intervalId); } catch {}
  };
}
