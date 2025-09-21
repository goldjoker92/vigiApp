// screens/GrupoSinalizarScreen.jsx
// -------------------------------------------------------------
// Rôle : quand l’utilisateur tape “Sinalizar”
// 1) Demande permission + récupère coords (retry court GPS)
// 2) Résolution CEP Google-first (avec timeout strict 8s)
//    - Fallback possible en utils/cep (OpenCage / LocationIQ)
// 3) Compare CEP géoloc vs CEP profil
//    - Si strict match ou Ville+UF (si CEP sectoriel/ambigü) → modale
//    - Sinon → toast + /report
// 4) Filet de sécurité : watchdog global (15 s) pour sortie garantie
// 5) Logs [SINALIZAR] + [SIGNALS] partout pour traçabilité
// -------------------------------------------------------------

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useAuthGuard } from '../hooks/useAuthGuard';
import CustomTopToast from './components/CustomTopToast';
import { resolveExactCepFromCoords, GOOGLE_MAPS_KEY, hasGoogleKey } from '@/utils/cep';
import { getWifiSnapshot, getRadioSnapshot } from './signals/androidSignals';

export default function GrupoSinalizarScreen() {
  const router = useRouter();
  const user = useAuthGuard();

  const [toastVisible, setToastVisible] = useState(false);
  const isRunningRef = useRef(false);
  const watchdogRef = useRef(null);

  const TOAST_DURATION = 6000;
  const WATCHDOG_TOTAL_MS = 15000; // sécurité absolue

  // ---------- Helpers ----------
  const normalize = useCallback(
    (s) =>
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim(),
    []
  );

  const toUF = useCallback((s) => {
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
  }, []);

  const isGenericCep = (cep8) => !!cep8 && cep8.length === 8 && cep8.slice(5) === '000';

  const withTimeout = useCallback(
    (p, ms = 9000, tag = 'LOCATION_TIMEOUT') =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(tag)), ms);
        p.then((v) => {
          clearTimeout(t);
          resolve(v);
        }).catch((e) => {
          clearTimeout(t);
          reject(e);
        });
      }),
    []
  );

  const sameZone = useCallback(
    (currentCep8, userCep8, addrCidade, addrUF, userCidade, userUF) => {
      if (currentCep8 && userCep8 && currentCep8 === userCep8) {
        console.log('[SINALIZAR] sameZone = true (CEP strict)');
        return true;
      }
      const villeOk = normalize(addrCidade) === normalize(userCidade);
      const ufOk = toUF(addrUF) === toUF(userUF);
      const cepAmbigu = !currentCep8 || isGenericCep(currentCep8) || isGenericCep(userCep8);

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
    },
    [normalize, toUF]
  );

  // ---------- GPS avec retry court ----------
  const getBestCoordsRetry = useCallback(async () => {
    console.log('[SINALIZAR] T#1 getCurrentPositionAsync (BestForNavigation)…');
    try {
      const g1 = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          mayShowUserSettingsDialog: true,
        }),
        9000,
        'LOCATION_TIMEOUT_1'
      );
      console.log('[SINALIZAR] T#1 OK coords =', g1.coords);
      return g1.coords;
    } catch (e) {
      console.log('[SINALIZAR] T#1 FAIL =', e?.message || e);
    }

    console.log('[SINALIZAR] T#2 watchPositionAsync (2s)…');
    return new Promise(async (resolve, reject) => {
      let best = null;
      let unsub = null;
      const timer = setTimeout(() => {
        try {
          if (unsub) {
            if (typeof unsub.remove === 'function') {
              unsub.remove();
            } else {
              unsub();
            }
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
            best = loc?.coords || best;
          }
        );
      } catch (e) {
        clearTimeout(timer);
        console.log('[SINALIZAR] watchPositionAsync error =', e?.message || e);
        reject(e);
      }
    });
  }, [withTimeout]);

  // ---------- Main flow ----------
  const checkLocationAndDispatch = useCallback(async () => {
    if (isRunningRef.current) {
      console.log('[SINALIZAR] Ignoré (déjà en cours)');
      return;
    }
    isRunningRef.current = true;

    // Watchdog absolu
    watchdogRef.current = setTimeout(() => {
      if (isRunningRef.current) {
        console.log('[SINALIZAR][WATCHDOG] timeout global → toast + /report');
        setToastVisible(true);
        setTimeout(() => {
          setToastVisible(false);
          try {
            router.replace('/report');
          } catch {}
        }, TOAST_DURATION);
        isRunningRef.current = false;
      }
    }, WATCHDOG_TOTAL_MS);

    console.log('[SINALIZAR] START — hasGoogleKey =', hasGoogleKey(), 'user =', {
      cep: user?.cep,
      cidade: user?.cidade,
      estado: user?.estado,
      groupId: user?.groupId,
    });

    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      console.log('[SINALIZAR] Permission status =', status);

      if (status !== 'granted') {
        const ask = await Location.requestForegroundPermissionsAsync();
        status = ask.status;
        console.log('[SINALIZAR] Permission asked →', status);
      }

      if (status !== 'granted') {
        console.log('[SINALIZAR] Permission refusée → retour /home');
        Alert.alert('Permissão negada', 'Autorize a localização para sinalizar.');
        router.replace('/(tabs)/home');
        return;
      }

      const coords = await getBestCoordsRetry();
      console.log('[SINALIZAR] Coords finales =', coords);

      // ---- Extra signals façon Uber ----
      try {
        const [wifi, radio] = await Promise.all([getWifiSnapshot(), getRadioSnapshot()]);
        console.log('[SINALIZAR][WIFI]', wifi);
        console.log('[SINALIZAR][RADIO]', radio);
      } catch (e) {
        console.log('[SINALIZAR][SIGNALS] FAIL', e?.message || e);
      }

      const userCepRef = String(user?.cep || user?.cepRef || '').replace(/\D/g, '');
      const userCidade = String(user?.cidade || '');
      const userUF = toUF(user?.estado);

      console.log('[SINALIZAR] Call resolveExactCepFromCoords…', {
        lat: coords.latitude,
        lng: coords.longitude,
        hasKey: !!GOOGLE_MAPS_KEY,
      });

      const res = await withTimeout(
        resolveExactCepFromCoords(coords.latitude, coords.longitude, {
          googleApiKey: GOOGLE_MAPS_KEY,
          expectedCep: userCepRef,
          expectedCity: userCidade,
          expectedUF: userUF,
        }),
        8000,
        'CEP_TIMEOUT'
      );

      const currentCep8 = String(res.cep || '').replace(/\D/g, '');
      console.log('[SINALIZAR] RESOLVE DONE →', {
        cep: res.cep,
        addr: res.address,
        candidates: (res.candidates || []).length,
      });

      if (
        sameZone(currentCep8, userCepRef, res.address?.cidade, res.address?.uf, userCidade, userUF)
      ) {
        console.log('[SINALIZAR] SAME ZONE → afficher modale 2 choix');
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
                    groupId: user?.groupId || '',
                    cep: userCepRef || currentCep8 || '',
                    cidade: res.address?.cidade || userCidade || '',
                    estado: res.address?.uf || userUF || '',
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
        console.log('[SINALIZAR] HORS ZONE → toast + /report');
        setToastVisible(true);
        setTimeout(() => {
          setToastVisible(false);
          router.replace('/report');
        }, TOAST_DURATION);
      }
    } catch (err) {
      console.log('[SINALIZAR] ERREUR =', err?.message || err);
      Alert.alert('Erro', 'Não foi possível obter sua localização.');
      router.replace('/(tabs)/home');
    } finally {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
      }
      isRunningRef.current = false;
      console.log('[SINALIZAR] END');
    }
  }, [router, user, getBestCoordsRetry, toUF, sameZone, withTimeout]);

  useEffect(() => {
    if (user) {
      checkLocationAndDispatch();
    }
  }, [user, checkLocationAndDispatch]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#00C859" size="large" />
      <Text style={styles.txt}>Detectando localização...</Text>
      {toastVisible && (
        <CustomTopToast
          text1="📍 Fora da sua zona de vizinhança – sinalização pública apenas."
          duration={TOAST_DURATION}
          textColor="#FFD600"
          containerStyle={{ marginTop: 60 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181A20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  txt: { color: '#fff', marginTop: 15, fontSize: 17 },
});
