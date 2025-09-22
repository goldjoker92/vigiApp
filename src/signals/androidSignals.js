// signals/androidSignals.js
// -------------------------------------------------------------
// Android signals (fiables, façon Uber “lite”)
// - Wi-Fi scan (SSID/BSSID/RSSI, WPA…)
// - NetInfo (type réseau, reachability, détails utiles)
// - DeviceInfo (opérateur/SIM/emulator/ABIs)
// Pas d’APIs “cell towers brutes” instables.
// Chaque appel est protégé par timeout + try/catch.
// Logs côté écran attendus : [SINALIZAR][WIFI] / [SINALIZAR][RADIO]
// Ici, on log modérément avec le prefixe [SIGNALS] pour diagnostic.
// -------------------------------------------------------------

import { PermissionsAndroid, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import DeviceInfo from 'react-native-device-info';

// WifiManager est parfois absent en dev / web / iOS, on protège l'import
let WifiManager = null;
try {
  WifiManager = require('react-native-wifi-reborn');
} catch (e) {
  // Pas de wifi manager (ex: Expo Go sans module natif)
  // On trace soft pour debug, mais jamais bloquant
  console.log('[SIGNALS] wifi module not available:', e?.message || e);
}

// ---------- Utils ----------
export const withTimeout = (p, ms = 3000, tag = 'SIGNAL_TIMEOUT') =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(tag)), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });

// Logging “safe” pour gros objets / cycles
export function safeLog(label, payload) {
  try {
    const json = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    const out = json?.length > 4000 ? `${json.slice(0, 4000)}…(truncated)` : json;
    console.log(label, out);
  } catch {
    console.log(label, payload);
  }
}

// Permissions Android nécessaires au scan Wi-Fi (Android 10+)
// On demande large pour maximiser les chances de succès
export async function ensureAndroidPerms() {
  if (Platform.OS !== 'android') {
    return { ok: true, platform: Platform.OS };
  }

  const results = {};
  async function ask(perm) {
    try {
      const res = await PermissionsAndroid.request(perm);
      results[perm] = res;
    } catch (e) {
      results[perm] = `error:${e?.message || e}`;
    }
  }

  try {
    await ask(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    await ask(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
    // Ces deux-là ne demandent pas toujours un prompt, mais on les tente:
    if (PermissionsAndroid.PERMISSIONS.ACCESS_WIFI_STATE) {
      await ask(PermissionsAndroid.PERMISSIONS.ACCESS_WIFI_STATE);
    }
    if (PermissionsAndroid.PERMISSIONS.CHANGE_WIFI_STATE) {
      await ask(PermissionsAndroid.PERMISSIONS.CHANGE_WIFI_STATE);
    }

    // Android 13+ "Nearby Wi-Fi devices"
    const NEARBY =
      PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES ||
      'android.permission.NEARBY_WIFI_DEVICES';
    if (Platform.Version >= 33) {
      await ask(NEARBY);
    }
  } catch (e) {
    console.log('[SIGNALS] ensureAndroidPerms error:', e?.message || e);
  }

  safeLog('[SIGNALS] perms', results);
  return { ok: true, results };
}

// ---------- Wi-Fi Snapshot ----------
export async function getWifiSnapshot() {
  try {
    if (Platform.OS !== 'android') {
      // iOS / web : pas de scan
      return { ok: true, count: 0, top: [], note: 'wifi-scan not supported on this platform' };
    }

    await ensureAndroidPerms();

    const api = WifiManager?.reScanAndLoadWifiList || WifiManager?.loadWifiList;
    if (!api) {
      // Module pas lié ou dev client
      return { ok: false, err: 'Wifi API not available (native module missing)' };
    }

    // Sur certains devices, reScanAndLoadWifiList relance déjà un scan, sinon loadWifiList lit la cache
    const list = await withTimeout(
      Promise.resolve(api.call(WifiManager)),
      3500,
      'WIFI_TIMEOUT'
    ).catch((e) => {
      // Certains environnements rejettent avec un string; on capture proprement
      throw new Error(e?.message || String(e));
    });

    // Normalisation des objets (lib peut renvoyer un format différent selon versions)
    const arr = Array.isArray(list) ? list : [];
    const top = arr.slice(0, 8).map((x) => ({
      ssid: x?.SSID ?? x?.ssid ?? null,
      bssid: x?.BSSID ?? x?.bssid ?? null,
      level: x?.level ?? x?.signalLevel ?? null, // RSSI (dBm)
      frequency: x?.frequency ?? null,
      capabilities: x?.capabilities ?? null, // WPA/WPA2/…
    }));

    // Log interne (l’écran loguera lui en [SINALIZAR][WIFI])
    safeLog('[SIGNALS][WIFI] top', top);

    return { ok: true, count: top.length, top };
  } catch (e) {
    const err = e?.message || String(e);
    console.log('[SIGNALS][WIFI] error:', err);
    return { ok: false, err };
  }
}

// ---------- Réseau (NetInfo) + Opérateur (DeviceInfo) ----------
export async function getRadioSnapshot() {
  try {
    // NetInfo est cross-plateforme
    const net = await withTimeout(NetInfo.fetch(), 2500, 'NETINFO_TIMEOUT');

    // DeviceInfo : on enveloppe chaque appel pour éviter les crashs
    const [carrier, simCount, isEmulator, supportedAbis, deviceName, brand, systemVersion] =
      await withTimeout(
        Promise.all([
          DeviceInfo.getCarrier?.() ?? Promise.resolve(undefined),
          DeviceInfo.getSimCount?.() ?? Promise.resolve(undefined),
          DeviceInfo.isEmulator?.() ?? Promise.resolve(undefined),
          DeviceInfo.supportedAbis?.() ?? Promise.resolve([]),
          DeviceInfo.getDeviceName?.() ?? Promise.resolve(undefined),
          DeviceInfo.getBrand?.() ?? Promise.resolve(undefined),
          DeviceInfo.getSystemVersion?.() ?? Promise.resolve(undefined),
        ]),
        2500,
        'DEVICEINFO_TIMEOUT'
      );

    // Type radio approximatif (via NetInfo)
    // net.details.cellularGeneration: '2g' | '3g' | '4g' | '5g' | null
    const radio =
      net?.type === 'cellular'
        ? net?.details?.cellularGeneration || null
        : net?.type === 'wifi'
          ? 'wifi'
          : null;

    const snap = {
      ok: true,
      net: {
        type: net?.type || null, // 'wifi' | 'cellular' | 'ethernet' | 'unknown' | 'none'
        isConnected: net?.isConnected ?? null,
        isInternetReachable: net?.isInternetReachable ?? null,
        details: net?.details || null, // ipAddress, ssid (parfois), strength, etc.
      },
      carrier: carrier || null, // ex: "Vivo", "TIM"
      radio, // '4g' / '5g' / 'wifi' / null
      simCount: simCount ?? null,
      device: {
        name: deviceName || null,
        brand: brand || null,
        systemVersion: systemVersion || null,
        abis: supportedAbis || [],
        isEmulator: !!isEmulator,
      },
    };

    // Log interne (l’écran loguera lui en [SINALIZAR][RADIO])
    safeLog('[SIGNALS][RADIO]', snap);

    return snap;
  } catch (e) {
    const err = e?.message || String(e);
    console.log('[SIGNALS][RADIO] error:', err);
    return { ok: false, err };
  }
}

// ---------- Agrégateur optionnel (non utilisé par l’écran mais dispo) ----------
export async function getSignalsSnapshot() {
  try {
    const [wifi, radio] = await Promise.allSettled([getWifiSnapshot(), getRadioSnapshot()]);
    const wifiVal =
      wifi.status === 'fulfilled'
        ? wifi.value
        : { ok: false, err: wifi.reason?.message || String(wifi.reason) };
    const radioVal =
      radio.status === 'fulfilled'
        ? radio.value
        : { ok: false, err: radio.reason?.message || String(radio.reason) };
    return { ok: true, wifi: wifiVal, radio: radioVal };
  } catch (e) {
    return { ok: false, err: e?.message || String(e) };
  }
}

// ---------- No-op export pour Expo Router (si fichier sous /app) ----------
export default function AndroidSignals() {
  return null;
}
