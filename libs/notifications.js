// notifications.js
// -------------------------------------------------------------
// Expo SDK 53+ / expo-notifications (JS pur)
// - Demande permissions
// - Crée le channel Android ("default")
// - Récupère le Expo Push Token (via EAS projectId)
// - Attache des listeners (réception / clic)
// - Envoi d'un test push via Expo Push API (DEV)
// - Helpers "local notifications"
// -------------------------------------------------------------

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => {
    console.log("[Notif] Handler: display in foreground = true");
    return { shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false };
  },
});

export async function registerForPushNotificationsAsync() {
  console.log("🔔 [register] start");

  if (!Device.isDevice) {
    console.warn("⚠️ [register] Not a physical device. Push may not work.");
  }

  if (Platform.OS === "android") {
    console.log("🔧 [register] Creating Android channel 'default'");
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      showBadge: true,
      sound: "default",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  console.log("🔐 [register] existing permission =", existingStatus);
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    throw new Error("Notifications permission not granted");
  }

  const extra = (Constants?.expoConfig?.extra) || {};
  const projectId = extra?.eas?.projectId || (Constants?.easConfig && Constants.easConfig.projectId) || undefined;
  console.log("🪪 [register] EAS projectId =", projectId);

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  console.log("✅ [register] Expo push token =", token);
  return token;
}

export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  console.log("🧷 [listeners] attaching");
  const receivedSub = Notifications.addNotificationReceivedListener((n) => {
    console.log("📥 [listeners] RECEIVED:", JSON.stringify(n, null, 2));
    onReceive && onReceive(n);
  });
  const responseSub = Notifications.addNotificationResponseReceivedListener((r) => {
    console.log("👆 [listeners] RESPONSE:", JSON.stringify(r, null, 2));
    onResponse && onResponse(r);
  });
  return () => {
    console.log("🧹 [listeners] cleanup");
    try { receivedSub.remove(); } catch {}
    try { responseSub.remove(); } catch {}
  };
}

export async function sendExpoTestPushAsync(expoPushToken, message = "Ping VigiApp 🚨 — test Expo Push API") {
  if (!expoPushToken) throw new Error("Expo push token manquant");
  console.log("📤 [sendExpoTestPush] to", expoPushToken);

  const payload = {
    to: expoPushToken,
    sound: "default",
    title: "VigiApp — Test push",
    body: message,
    data: { ts: Date.now(), kind: "test" },
    channelId: "default",
  };

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log("📬 [sendExpoTestPush] response:", text);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function fireLocalNow() {
  console.log("⏱️ [local] immediate");
  return Notifications.scheduleNotificationAsync({
    content: { title: "VigiApp — Local immédiate", body: "Ceci est une notification locale", data: { kind: "local_now", ts: Date.now() } },
    trigger: null,
  });
}

export async function scheduleLocalIn(seconds) {
  const s = Number(seconds || 5);
  console.log(`🕒 [local] schedule in ${s}s`);
  return Notifications.scheduleNotificationAsync({
    content: { title: "VigiApp — Local programmée", body: `Déclenchée après ${s}s`, data: { kind: "local_scheduled", ts: Date.now(), delay: s } },
    trigger: { seconds: s },
  });
}

export async function cancelAll() {
  console.log("🧽 [local] cancelAll");
  return Notifications.cancelAllScheduledNotificationsAsync();
}
