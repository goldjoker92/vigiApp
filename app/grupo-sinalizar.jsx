// screens/GrupoSinalizarScreen.jsx
// -------------------------------------------------------------
// Flux "Sinalizar" blindé :
// 1) Permissions + GPS (retry court)
// 2) Reverse geocode (Google-first), normalisation CEP
// 3) Résolution du groupId (route → user → membership Firestore)
// 4) Si pas de groupe → public (toast + /report)
// 5) Si groupe & “chez soi” → modale (groupe / public / annuler)
// 6) Si groupe & hors zone → public (toast + /report)
// 7) Watchdog après coords (timeout geocode/signaux)
// 8) Signals intégrés (NetInfo / Expo Network / Expo Device) → logs détaillés
// -------------------------------------------------------------

import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import * as Network from 'expo-network';
import * as Device from 'expo-device';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthGuard } from '../hooks/useAuthGuard';
import CustomTopToast from './components/CustomTopToast';

// CEP utils (Google-first avec cascades internes)
import { resolveExactCepFromCoords, hasGoogleKey, GOOGLE_MAPS_KEY } from '@/utils/cep';

// Firestore
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';

// --- OPTION: selon ton schéma groupe ---
const GROUPS_USE_ARRAY_OF_CEPS = true; // true si { ceps: string[] }, false si { cep: string }
const ONLY_ACTIVE_GROUPS = true;

// ---------------- Loader téléphone ↔ satellite ----------------
const PhoneSatelliteLoader = memo(function PhoneSatelliteLoader() {
  const pulse = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1000,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 2600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [pulse, orbit]);

  const { width } = Dimensions.get('window');
  const isSmall = width < 360;

  const orbitRotate = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.05] });

  return (
    <View style={styles.loaderWrap}>
      <Animated.View style={[styles.satOrbit, { transform: [{ rotate: orbitRotate }] }]}>
        <View style={styles.satBody}>
          <View style={styles.satPanel} />
          <View style={[styles.satPanel, { right: -14 }]} />
        </View>
      </Animated.View>
      <Animated.View style={[styles.phone, { transform: [{ scale: pulseScale }] }]}>
        <View style={styles.phoneScreen} />
      </Animated.View>
      <Animated.View
        style={[styles.wave, { opacity: ringOpacity, transform: [{ scale: pulseScale }] }]}
      />
      <Animated.View
        style={[
          styles.wave,
          { opacity: ringOpacity, transform: [{ scale: Animated.add(0.6, pulse) }] },
        ]}
      />
      <Text style={[styles.loaderText, isSmall && { fontSize: 14 }]}>Detectando localização…</Text>
    </View>
  );
});

// ----------------------- Helpers ----------------------
function normalizeCep(v) {
  if (!v) {
    return null;
  }
  const clean = String(v).replace(/\D/g, '');
  return clean.length === 8 ? clean : null;
}
function isGenericCep(cep8) {
  return !!cep8 && cep8.length === 8 && cep8.slice(5) === '000';
}
function toUF(s) {
  const up = String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  const map = {
    AC: 'AC',
    AL: 'AL',
    AP: 'AP',
    AM: 'AM',
    BA: 'BA',
    CE: 'CE',
    DF: 'DF',
    ES: 'ES',
    GO: 'GO',
    MA: 'MA',
    MT: 'MT',
    MS: 'MS',
    MG: 'MG',
    PA: 'PA',
    PB: 'PB',
    PR: 'PR',
    PE: 'PE',
    PI: 'PI',
    RJ: 'RJ',
    RN: 'RN',
    RS: 'RS',
    RO: 'RO',
    RR: 'RR',
    SC: 'SC',
    SP: 'SP',
    SE: 'SE',
    TO: 'TO',
    ACRE: 'AC',
    ALAGOAS: 'AL',
    AMAPA: 'AP',
    AMAPÁ: 'AP',
    AMAZONAS: 'AM',
    BAHIA: 'BA',
    CEARA: 'CE',
    CEARÁ: 'CE',
    'DISTRITO FEDERAL': 'DF',
    'ESPIRITO SANTO': 'ES',
    'ESPÍRITO SANTO': 'ES',
    GOIAS: 'GO',
    GOIÁS: 'GO',
    MARANHAO: 'MA',
    MARANHÃO: 'MA',
    'MATO GROSSO': 'MT',
    'MATO GROSSO DO SUL': 'MS',
    'MINAS GERAIS': 'MG',
    PARA: 'PA',
    PARÁ: 'PA',
    PARAIBA: 'PB',
    PARAÍBA: 'PB',
    PARANA: 'PR',
    PARANÁ: 'PR',
    PERNAMBUCO: 'PE',
    PIAUI: 'PI',
    PIAUÍ: 'PI',
    'RIO DE JANEIRO': 'RJ',
    'RIO GRANDE DO NORTE': 'RN',
    'RIO GRANDE DO SUL': 'RS',
    RONDONIA: 'RO',
    RONDÔNIA: 'RO',
    RORAIMA: 'RR',
    'SANTA CATARINA': 'SC',
    'SAO PAULO': 'SP',
    'SÃO PAULO': 'SP',
    SERGIPE: 'SE',
    TOCANTINS: 'TO',
  };
  return map[up] || (/^[A-Z]{2}$/.test(up) ? up : '');
}
function normalizeTxt(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}
function sameZone(currentCep8, userCep8, addrCidade, addrUF, userCidade, userUF) {
  if (currentCep8 && userCep8 && currentCep8 === userCep8) {
    console.log('[SINALIZAR] sameZone = true (CEP strict)');
    return true;
  }
  const villeOk =
    !!addrCidade && !!userCidade && normalizeTxt(addrCidade) === normalizeTxt(userCidade);
  const ufOk = !!addrUF && !!userUF && toUF(addrUF) === toUF(userUF);
  const cepAmbigu =
    !currentCep8 || !userCep8 || isGenericCep(currentCep8) || isGenericCep(userCep8);
  console.log('[SINALIZAR] sameZone check:', {
    villeOk,
    ufOk,
    cepAmbigu,
    addrCidade,
    userCidade,
    addrUF,
    userUF,
    currentCep8,
    userCep8,
  });
  return villeOk && ufOk && cepAmbigu;
}
function withTimeout(p, ms = 9000, tag = 'TIMEOUT') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(tag)), ms);
    Promise.resolve(p)
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

// --- Firestore: lookups ---
async function lookupGroupByMembership(uid) {
  if (!uid) {
    return undefined;
  }
  console.log('[SINALIZAR][GROUP][FS] query', {
    field: 'membersIds',
    op: 'array-contains',
    value: uid,
  });
  const q = query(collection(db, 'groups'), where('membersIds', 'array-contains', uid), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d0 = snap.docs[0];
    console.log('[SINALIZAR][GROUP][FS] resolved membership:', d0.id, d0.data()?.name);
    return d0.id;
  }
  return undefined;
}

async function lookupGroupByCep(cep8) {
  if (!cep8) {
    return null;
  }
  const clauses = GROUPS_USE_ARRAY_OF_CEPS
    ? [where('ceps', 'array-contains', cep8)]
    : [where('cep', '==', cep8)];
  if (ONLY_ACTIVE_GROUPS) {
    clauses.push(where('isActive', '==', true));
  }
  console.log('[SINALIZAR][GROUP][FS] query', {
    field: GROUPS_USE_ARRAY_OF_CEPS ? 'ceps' : 'cep',
    op: GROUPS_USE_ARRAY_OF_CEPS ? 'array-contains' : '==',
    value: cep8,
  });
  const q = query(collection(db, 'groups'), ...clauses, limit(1));
  const snap = await getDocs(q);
  if (snap.empty) {
    return null;
  }
  const doc0 = snap.docs[0];
  return { id: doc0.id, data: doc0.data() };
}

// ----------------------- Signals intégrés ----------------------
async function getWifiSnapshot() {
  const ts = new Date().toISOString();
  try {
    const [net, ip, netState] = await Promise.all([
      NetInfo.fetch(),
      safe(Network.getIpAddressAsync()),
      safe(Network.getNetworkStateAsync()),
    ]);
    const isWifi = net.type === 'wifi';
    // SSID souvent null (Android 10+ privacy / iOS entitlement)
    const ssid = net?.details?.ssid ?? null;
    const snap = {
      ssid,
      isWifi,
      strength: null,
      frequency: null,
      ipv4: ip ?? null,
      dns: null, // Expo Network ne renvoie pas les DNS
      ts,
    };
    if (!ssid && isWifi) {
      snap.note = 'SSID indisponible (Android 10+ ou permissions/location OFF)';
    }
    if (netState?.isInternetReachable === false) {
      snap.note = 'Internet non joignable';
    }
    return snap;
  } catch (e) {
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

async function getRadioSnapshot() {
  const ts = new Date().toISOString();
  try {
    const net = await NetInfo.fetch();
    const apiLevel = await safe(Device.getApiLevelAsync());
    const brand = Device.brand ?? null;
    const model = Device.modelName ?? null;
    return {
      carrier: null, // non dispo via Expo
      type: net.type ?? 'unknown',
      cellularGeneration: net.details?.cellularGeneration ?? null,
      isConnected: net.isConnected ?? null,
      isInternetReachable: net.isInternetReachable ?? null,
      apiLevel: apiLevel ?? null,
      brand,
      model,
      ts,
      note: !net.isConnected ? 'Device non connecté' : undefined,
    };
  } catch (e) {
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

async function safe(promise) {
  try {
    return await promise;
  } catch {
    return null;
  }
}

// ----------------------- Écran principal ----------------------
export default function GrupoSinalizarScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams?.() || {};
  const user = useAuthGuard();

  const [toastVisible, setToastVisible] = useState(false);
  const isRunningRef = useRef(false);
  const watchdogRef = useRef(null);
  const toastTimerRef = useRef(null);

  const TOAST_DURATION = 6000;
  const WATCHDOG_AFTER_COORDS_MS = 12000; // couvre geocode (8s) + marge

  useEffect(() => {
    console.log('[SINALIZAR][BTN] tapped → screen mounted @', new Date().toISOString());
  }, []);

  // GPS avec retry court
  const getBestCoordsRetry = useCallback(async () => {
    console.log('[SINALIZAR][PHASE] GPS/T#1 getCurrentPositionAsync…');
    try {
      const g1 = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          mayShowUserSettingsDialog: true,
        }),
        7000,
        'LOCATION_TIMEOUT_1'
      );
      console.log('[SINALIZAR] T#1 OK coords =', g1.coords);
      return g1.coords;
    } catch (e) {
      console.log('[SINALIZAR] T#1 FAIL =', e?.message || e);
    }

    console.log('[SINALIZAR][PHASE] GPS/T#2 watchPositionAsync (2s)…');
    return new Promise(async (resolve, reject) => {
      let best = null;
      let unsub = null;
      const timer = setTimeout(() => {
        try {
          if (unsub) {
            typeof unsub.remove === 'function' ? unsub.remove() : unsub();
          }
        } catch {}
        if (best) {
          console.log('[SINALIZAR] T#2 OK best fix =', best);
          resolve(best);
        } else {
          console.log('[SINALIZAR] T#2 FAIL aucun fix');
          reject(new Error('WATCH_TIMEOUT'));
        }
      }, 2000);

      try {
        unsub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 500, distanceInterval: 0 },
          (loc) => {
            if (loc?.coords) {
              best = loc.coords;
            }
          }
        );
      } catch (e) {
        clearTimeout(timer);
        console.log('[SINALIZAR] watchPositionAsync error =', e?.message || e);
        reject(e);
      }
    });
  }, []);

  // Résolution du groupId (route → user → Firestore membersIds)
  const fetchEffectiveGroupId = useCallback(async (u, rp) => {
    if (rp?.groupId) {
      return String(rp.groupId);
    }
    const direct = u?.groupId || u?.grupoId;
    if (direct) {
      return String(direct);
    }

    try {
      const uid = (u?.id ?? u?.uid ?? '').toString().trim();
      if (!uid) {
        console.log('[SINALIZAR][GROUP][FS] skip lookup: no uid');
        return undefined;
      }
      return await lookupGroupByMembership(uid);
    } catch (e) {
      console.log('[SINALIZAR][GROUP][FS] lookup fail:', e?.message || e);
      return undefined;
    }
  }, []);

  const checkLocationAndDispatch = useCallback(async () => {
    if (isRunningRef.current) {
      console.log('[SINALIZAR] Ignoré (déjà en cours)');
      return;
    }
    isRunningRef.current = true;

    let hk = false;
    try {
      hk = hasGoogleKey();
    } catch {}

    const signalsBound = true; // intégré localement

    console.log('[SINALIZAR][PHASE] START', {
      hasGoogleKey: hk,
      utilsBound: typeof resolveExactCepFromCoords === 'function',
      signalsBound,
      userPreview: {
        cep: user?.cep,
        cidade: user?.cidade,
        estado: user?.estado,
        groupId: user?.groupId || '∅',
      },
    });

    try {
      // Permissions
      console.log('[SINALIZAR][PHASE] permissions.getForeground');
      let { status } = await withTimeout(
        Location.getForegroundPermissionsAsync(),
        4000,
        'PERM_TIMEOUT_1'
      );
      console.log('[SINALIZAR] Permission status =', status);
      if (status !== 'granted') {
        console.log('[SINALIZAR][PHASE] permissions.request');
        const ask = await withTimeout(
          Location.requestForegroundPermissionsAsync(),
          6000,
          'PERM_TIMEOUT_2'
        );
        status = ask.status;
        console.log('[SINALIZAR] Permission asked →', status);
      }
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Autorize a localização para sinalizar.');
        router.replace('/(tabs)/home');
        return;
      }

      // Coords
      console.log('[SINALIZAR][PHASE] GPS acquire');
      const coords = await getBestCoordsRetry();
      console.log('[SINALIZAR] Coords finales =', coords);

      // Watchdog après coords
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
      }
      watchdogRef.current = setTimeout(() => {
        if (isRunningRef.current) {
          console.log('[SINALIZAR][WATCHDOG] timeout après coords → toast + /report');
          setToastVisible(true);
          toastTimerRef.current = setTimeout(() => {
            setToastVisible(false);
            try {
              router.replace('/report');
            } catch {}
          }, TOAST_DURATION);
          isRunningRef.current = false;
        }
      }, WATCHDOG_AFTER_COORDS_MS);

      // --------- Signals (non bloquants) ----------
      try {
        console.log('[SINALIZAR][PHASE] signals');
        const [wifi, radio] = await withTimeout(
          Promise.all([getWifiSnapshot(), getRadioSnapshot()]),
          2500,
          'SIGNALS_TIMEOUT'
        );
        console.log('[SINALIZAR][SIGNALS][WIFI]', wifi);
        console.log('[SINALIZAR][SIGNALS][RADIO]', radio);
      } catch (e) {
        console.log('[SINALIZAR][SIGNALS] FAIL/Timeout', e?.message || e);
      }
      // --------------------------------------------

      // User refs
      const userCepRef = normalizeCep(user?.cep ?? user?.cepRef);
      const userCidade = String(user?.cidade || '');
      const userUF = toUF(user?.estado);

      // Resolver CEP (Google-first)
      console.log('[SINALIZAR][PHASE] geocode.resolve', {
        hasKey: hk,
        lat: coords?.latitude,
        lng: coords?.longitude,
      });
      const rawRes = await withTimeout(
        resolveExactCepFromCoords(coords.latitude, coords.longitude, {
          googleApiKey: GOOGLE_MAPS_KEY,
          expectedCep: userCepRef || undefined,
          expectedCity: userCidade || undefined,
          expectedUF: userUF || undefined,
        }),
        8000,
        'CEP_TIMEOUT'
      );

      const addr = rawRes?.addr ?? rawRes?.address ?? {};
      const currentCep8 = normalizeCep(rawRes?.cep);
      const addrCidade = String(addr.cidade || addr.city || '');
      const addrUF = String(addr.uf || addr.state || '');

      console.log('[SINALIZAR] RESOLVE DONE →', {
        cep: rawRes?.cep,
        provider: rawRes?.provider,
        candidates: Array.isArray(rawRes?.candidates) ? rawRes.candidates.length : 0,
        addr,
      });

      // Hydrate groupId (route → user → Firestore membership)
      const effectiveGroupId = await fetchEffectiveGroupId(user, routeParams);
      console.log('[SINALIZAR][GROUP] effectiveGroupId =', effectiveGroupId || '∅');

      // “Comme avant” : si pas de group → essai par CEP (profil → géoloc)
      let finalGroupId = effectiveGroupId;
      if (!finalGroupId) {
        if (userCepRef) {
          const g1 = await lookupGroupByCep(userCepRef);
          if (g1) {
            finalGroupId = g1.id;
          }
        }
        if (!finalGroupId && currentCep8) {
          const g2 = await lookupGroupByCep(currentCep8);
          if (g2) {
            finalGroupId = g2.id;
          }
        }
      }

      console.log('[SINALIZAR][CEP] profile=', userCepRef, '| geo=', currentCep8);
      const inSame = sameZone(currentCep8, userCepRef, addrCidade, addrUF, userCidade, userUF);
      const hasGroup = !!finalGroupId;
      console.log('[SINALIZAR][ZONE] sameZone =', inSame);
      console.log('[SINALIZAR][GROUP] hasGroup =', hasGroup);

      if (!hasGroup) {
        console.log('[SINALIZAR][DECISION] PAS de groupe → public (toast + /report)');
        setToastVisible(true);
        toastTimerRef.current = setTimeout(() => {
          setToastVisible(false);
          router.replace('/report');
        }, TOAST_DURATION);
        return;
      }

      if (hasGroup && inSame) {
        console.log('[SINALIZAR][DECISION] AVEC groupe & CHEZ SOI → modale (privé/public)');
        Alert.alert(
          'Tipo de alerta',
          'Como deseja sinalizar?',
          [
            {
              text: 'Para vizinhos (grupo)',
              onPress: () => {
                console.log('[SINALIZAR] Choix: groupe → /grupo-report');
                router.replace({
                  pathname: '/grupo-report',
                  params: {
                    groupId: finalGroupId,
                    cep: userCepRef || currentCep8 || '',
                    cidade: addrCidade || userCidade || '',
                    estado: addrUF || userUF || '',
                  },
                });
              },
            },
            {
              text: 'Público',
              onPress: () => {
                console.log('[SINALIZAR] Choix: public → /report');
                router.replace('/report');
              },
              style: 'default',
            },
            {
              text: 'Cancelar',
              style: 'cancel',
              onPress: () => {
                console.log('[SINALIZAR] Choix: annuler → /home');
                router.replace('/(tabs)/home');
              },
            },
          ],
          { cancelable: true }
        );
      } else {
        console.log('[SINALIZAR][DECISION] AVEC groupe MAIS HORS ZONE → public (toast + /report)', {
          currentCep8,
          userCepRef,
          addrCidade,
          addrUF,
          userCidade,
          userUF,
        });
        setToastVisible(true);
        toastTimerRef.current = setTimeout(() => {
          setToastVisible(false);
          router.replace('/report');
        }, TOAST_DURATION);
      }
    } catch (err) {
      console.log('[SINALIZAR] ERREUR (main) =', err?.message || err);
      Alert.alert('Erro', 'Não foi possível obter sua localização.');
      router.replace('/(tabs)/home');
    } finally {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      isRunningRef.current = false;
      console.log('[SINALIZAR][PHASE] END');
    }
  }, [router, routeParams, user, getBestCoordsRetry]);

  useEffect(() => {
    if (user) {
      console.log('[SINALIZAR] useEffect → checkLocationAndDispatch()');
      checkLocationAndDispatch();
    }
  }, [user, checkLocationAndDispatch]);

  // (optionnel) bouton caché de test
  const handlePress = () => console.log('Button pressed!');

  return (
    <View style={styles.container}>
      <PhoneSatelliteLoader />
      {toastVisible && (
        <CustomTopToast
          text1="📍 Fora da sua zona de vizinhança – sinalização pública apenas."
          duration={TOAST_DURATION}
          textColor="#FFD600"
          containerStyle={{ marginTop: 60 }}
        />
      )}
      <TouchableOpacity onPress={handlePress} style={{ marginTop: 16 }}>
        <Text style={{ color: '#9BA3AF' }}>Press me</Text>
      </TouchableOpacity>
    </View>
  );
}

// ----------------------------- Styles -----------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  loaderWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  loaderText: { color: '#D0D7DE', marginTop: 18, fontSize: 16 },
  phone: {
    width: 84,
    height: 150,
    borderRadius: 20,
    backgroundColor: '#161B22',
    borderWidth: 2,
    borderColor: '#30363D',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  phoneScreen: { width: 66, height: 120, borderRadius: 14, backgroundColor: '#0B1220' },
  satOrbit: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(88,166,255,0.25)',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  satBody: {
    width: 34,
    height: 22,
    marginTop: 8,
    backgroundColor: '#58A6FF',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#58A6FF',
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  satPanel: {
    position: 'absolute',
    left: -14,
    width: 12,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#1F6FEB',
  },
  wave: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 2,
    borderColor: 'rgba(56,139,253,0.25)',
  },
});
