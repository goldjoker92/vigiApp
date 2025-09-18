// src/notifications-bootstrap.js (ou remplace ton fichier existant)
// -------------------------------------------------------------
// Handler foreground + création des canaux Android
// - default  : importance DEFAULT (compat)
// - alerts-high : importance MAX (heads-up), pour ton backend FCM
// - “general” : alias legacy pointant sur default (évite régression)
// -------------------------------------------------------------

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const DEFAULT_CHANNEL_ID = 'default';
const ALERTS_HIGH_CHANNEL_ID = 'alerts-high';

// Handler foreground moderne (SDK 53+)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Crée/MAJ le canal “default”
async function ensureDefaultChannel() {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Par défaut',
    description: 'Notifications générales',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

// Crée/MAJ le canal “alerts-high” (prioritaire)
async function ensureAlertsHighChannel() {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(ALERTS_HIGH_CHANNEL_ID, {
    name: 'Alertes publiques (élevé)',
    description: 'Alertes importantes et critiques',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 240, 200, 240],
    enableVibrate: true,
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// Public: crée tous les canaux nécessaires
export async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') {
    return;
  }
  await ensureDefaultChannel();
  await ensureAlertsHighChannel();
  // Log utile pour diagnostiquer l’importance réelle
  try {
    const list = await Notifications.getNotificationChannelsAsync?.();
    console.log(
      '[NOTIF] channels:',
      list?.map((c) => ({ id: c.id, importance: c.importance }))
    );
  } catch {}
}

// ⚠️ Legacy: ancien nom utilisé dans ton code — on garde pour éviter la régression.
// Redirige vers ensureAndroidChannels(), et crée aussi “general” (alias de default).
export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }
  await ensureAndroidChannels();
  await Notifications.setNotificationChannelAsync('general', {
    name: 'General (alias)',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6A00',
  });
}
