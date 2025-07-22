import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useAuthGuard } from '../hooks/useAuthGuard';
import CustomTopToast from './components/CustomTopToast';

export default function GrupoSinalizarScreen() {
  const router = useRouter();
  const user = useAuthGuard();
  const [toastVisible, setToastVisible] = useState(false);

  // 6000 ms pour le toast ET la redirection
  const TOAST_DURATION = 6000;

  const checkLocationAndDispatch = React.useCallback(async () => {
    console.log('[SINALIZAR] Début du flux');
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[SINALIZAR] Permission location status:', status);

      if (status !== 'granted') {
        console.log('[SINALIZAR] Permission refusée');
        Alert.alert('Permissão negada', 'Autorize a localização para sinalizar.');
        router.replace('/tabs/home');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      console.log('[SINALIZAR] Localisation brute:', location);

      let [addr] = await Location.reverseGeocodeAsync(location.coords);
      console.log('[SINALIZAR] Adresse géolocalisée:', addr);

      // Formatage strict des CEPs
      const formatCep = val => String(val || '').replace(/[^0-9]/g, '').trim();
      const currentCep = formatCep(addr?.postalCode);
      const userCepRef = formatCep(user?.cep || user?.cepRef);

      console.log('[SINALIZAR] Données de comparaison:', {
        currentCep,
        userCepRef,
        rawUserCep: user?.cep,
        rawGeoCep: addr?.postalCode,
        geoAddr: addr,
        user
      });

      if (currentCep && userCepRef && currentCep === userCepRef) {
        console.log('[SINALIZAR] CEPs identiques (chez soi)');
        Alert.alert(
          'Tipo de alerta',
          'Como deseja sinalizar?',
          [
            {
              text: 'Para vizinhos (grupo)',
              onPress: () => {
                console.log('[SINALIZAR] Choix: groupe');
                router.replace({
                  pathname: '/grupo-report',
                  params: {
                    groupId: user?.groupId || '',
                    cep: userCepRef,
                    cidade: addr.city || '',
                    estado: addr.region || '',
                  },
                });
              },
            },
            {
              text: 'Público',
              onPress: () => {
                console.log('[SINALIZAR] Choix: public');
                router.replace('/report');
              },
              style: 'default'
            },
            {
              text: 'Cancelar',
              style: 'cancel',
              onPress: () => {
                console.log('[SINALIZAR] Choix: annuler');
                router.replace('/tabs/home');
              }
            },
          ],
          { cancelable: true }
        );
      } else {
        // Pas chez soi → toast + redirection DELAYÉE (6000ms)
        console.log('[SINALIZAR] CEPs différents (hors zone) – toast public only');
        setToastVisible(true);
        setTimeout(() => {
          setToastVisible(false);
          router.replace('/report');
        }, TOAST_DURATION);
      }
    } catch (err) {
      console.log('[SINALIZAR] ERREUR:', err);
      Alert.alert('Erro', 'Não foi possível obter sua localização.');
      router.replace('/tabs/home');
    }
  }, [router, user]);

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
          duration={8000}
          textColor="#FFD600"
          containerStyle={{ marginTop: 60 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#181A20", justifyContent: 'center', alignItems: 'center' },
  txt: { color: "#fff", marginTop: 15, fontSize: 17 }
});
