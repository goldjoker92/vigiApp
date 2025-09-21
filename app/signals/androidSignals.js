// signals/androidSignals.js
// -------------------------------------------------------------
// Android signals (fiables, façon Uber “lite”)
// - Wi-Fi scan (SSID/BSSID/RSSI, WPA…)
// - NetInfo (type réseau, qualité, reachability)
// - DeviceInfo (opérateur/SIM/emulator/ABIs)
// Pas d’APIs “cell towers brutes” instables.
// Chaque appel est protégé par timeout + try/catch.
// Logs à consommer côté écran: [SINALIZAR][WIFI] / [SINALIZAR][RADIO]
// -------------------------------------------------------------

import { PermissionsAndroid, Platform } from 'react-native';
import WifiManager from 'react-native-wifi-reborn';
import NetInfo from '@react-native-community/netinfo';
import DeviceInfo from 'react-native-device-info';

// ---------- Utils ----------
const withTimeout = (p, ms = 3000, tag = 'SIGNAL_TIMEOUT') =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(tag)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });

async function ensureAndroidPerms() {
  if (Platform.OS !== 'android') {
    return;
  }
  // Android 10+ exige la localisation pour scanner le Wi-Fi
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_WIFI_STATE);
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CHANGE_WIFI_STATE);
}

// ---------- Wi-Fi Snapshot ----------
export async function getWifiSnapshot() {
  try {
    await ensureAndroidPerms();

    const list = await withTimeout(WifiManager.reScanAndLoadWifiList(), 3500, 'WIFI_TIMEOUT');

    const top = (list || []).slice(0, 8).map((x) => ({
      ssid: x.SSID,
      bssid: x.BSSID,
      level: x.level, // RSSI (dBm)
      frequency: x.frequency,
      capabilities: x.capabilities, // WPA/WPA2/…
    }));

    return { ok: true, count: top.length, top };
  } catch (e) {
    return { ok: false, err: e?.message || String(e) };
  }
}

// ---------- Réseau (NetInfo) + Opérateur (DeviceInfo) ----------
export async function getRadioSnapshot() {
  try {
    const net = await withTimeout(NetInfo.fetch(), 2500, 'NETINFO_TIMEOUT');

    const [
      carrier, // ex: "Vivo", "TIM"
      simCount, // nombre de SIM détectées (si dispo)
      isEmulator,
      supportedAbis,
      deviceName,
      brand,
      systemVersion,
    ] = await withTimeout(
      Promise.all([
        DeviceInfo.getCarrier(),
        DeviceInfo.getSimCount?.() ?? Promise.resolve(undefined),
        DeviceInfo.isEmulator(),
        DeviceInfo.supportedAbis(),
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

    return {
      ok: true,
      net: {
        type: net?.type, // 'wifi' | 'cellular' | 'ethernet' | 'unknown' | 'none'
        isConnected: net?.isConnected,
        isInternetReachable: net?.isInternetReachable,
        details: net?.details || null, // ipAddress, ssid (parfois), strength, etc. selon plate-forme
      },
      carrier: carrier || null,
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
  } catch (e) {
    return { ok: false, err: e?.message || String(e) };
  }
}

// ---------- Option: mini helper de log sécurisé ----------
export function safeLog(label, payload) {
  try {
    // évite d’exploser la console avec des structures cycliques
    const json = JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

    console.log(label, json?.length > 4000 ? json.slice(0, 4000) + '…(truncated)' : json);
  } catch {
    console.log(label, payload);
  }
}
