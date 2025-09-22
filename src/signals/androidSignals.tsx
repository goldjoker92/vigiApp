// signals/androidSignals.ts
// -------------------------------------------------------------
// Snapshots "réseau" non bloquants, pensés pour le debug terrain.
// - NetInfo: type de connexion, cellularGeneration, isConnected, SSID (si dispo)
// - Expo Network: IPv4, DNS (si dispo), "isInternetReachable"
// - Expo Device: brand/model + API level (pour deviner restrictions SSID)
// Tout est try/catch pour ne jamais casser le flux Sinalizar.
// -------------------------------------------------------------

import NetInfo from '@react-native-community/netinfo';
import * as Network from 'expo-network';
import * as Device from 'expo-device';

type WifiSnapshot = {
  ssid?: string | null;
  isWifi?: boolean;
  strength?: number | null; // souvent indispo sans module natif
  frequency?: number | null; // idem
  ipv4?: string | null;
  dns?: string | null;
  ts: string;
  note?: string;
};

type RadioSnapshot = {
  carrier?: string | null; // Android: rarement dispo sans module opé; on infère peu
  type?: string; // 'wifi' | 'cellular' | 'ethernet' | 'unknown' ...
  cellularGeneration?: string | null; // '2g' | '3g' | '4g' | '5g' | null
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
  apiLevel?: number | null;
  brand?: string | null;
  model?: string | null;
  ts: string;
  note?: string;
};

export async function getWifiSnapshot(): Promise<WifiSnapshot> {
  const ts = new Date().toISOString();

  try {
    const [net, ip] = await Promise.all([NetInfo.fetch(), safe(Network.getIpAddressAsync())]);

    const isWifi = net.type === 'wifi';
    // Android 10+ → SSID souvent masqué → null (privacy)
    // iOS → SSID souvent null aussi sans entitlement particulier
    const ssid = (net.details as any)?.ssid ?? null;

    // DNS pas garanti via Expo Network — renvoyé null si indispo
    const dns = null;

    const snap: WifiSnapshot = {
      ssid,
      isWifi,
      strength: null,
      frequency: null,
      ipv4: ip ?? null,
      dns,
      ts,
    };

    // Notes de contexte utiles en log
    if (!ssid && isWifi) {
      snap.note = 'SSID indisponible (Android 10+ ou permissions/location OFF)';
    }

    return snap;
  } catch (e: any) {
    return {
      ssid: null,
      isWifi: false,
      strength: null,
      frequency: null,
      ipv4: null,
      dns: null,
      ts,
      note: `wifi snapshot fail: ${e?.message || String(e)}`,
    };
  }
}

export async function getRadioSnapshot(): Promise<RadioSnapshot> {
  const ts = new Date().toISOString();

  try {
    const net = await NetInfo.fetch();

    // Type-safe access to cellular properties
    const cellularGeneration =
      net.type === 'cellular' && net.details
        ? ((net.details as any).cellularGeneration ?? null)
        : null;

    const carrier =
      net.type === 'cellular' && net.details ? ((net.details as any).carrier ?? null) : null;

    return {
      carrier,
      type: net.type ?? 'unknown',
      cellularGeneration, // Now safely assigned
      isConnected: net.isConnected ?? null,
      isInternetReachable: net.isInternetReachable ?? null,
      apiLevel: Device.platformApiLevel ?? null,
      brand: Device.brand ?? null,
      model: Device.modelName ?? null,
      ts,
      note: !net.isConnected ? 'Device non connecté' : undefined,
    };
  } catch (e: any) {
    return {
      carrier: null,
      type: 'unknown',
      cellularGeneration: null,
      isConnected: null,
      isInternetReachable: null,
      apiLevel: null,
      brand: Device.brand ?? null,
      model: Device.modelName ?? null,
      ts,
      note: `radio snapshot fail: ${e?.message || String(e)}`,
    };
  }
}

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

// Your function with proper type checking
export async function getCellularInfo() {
  try {
    const netInfo = await NetInfo.fetch();

    // Type guard: only access cellularGeneration if it's a cellular connection
    if (netInfo.type === 'cellular' && netInfo.isConnected) {
      return {
        cellularGeneration: netInfo.details.cellularGeneration,
        carrier: netInfo.details.carrier,
        isConnected: true,
        connectionType: 'cellular' as const,
      };
    }

    // Handle non-cellular connections
    return {
      cellularGeneration: null,
      carrier: null,
      isConnected: netInfo.isConnected ?? false,
      connectionType: netInfo.type,
    };
  } catch (error) {
    console.error('[getCellularInfo] Error:', error);
    return {
      cellularGeneration: null,
      carrier: null,
      isConnected: false,
      error: (error as Error).message,
    };
  }
}
