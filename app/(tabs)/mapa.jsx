import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuthGuard } from '../../hooks/useAuthGuard';

const { width, height } = Dimensions.get('window');

const alerts = [
  {
    id: '1',
    latitude: -3.7275,
    longitude: -38.5255,
    gravidade: 'grave',
    titulo: 'Incêndio',
    descricao: 'Incêndio em apartamento',
    cidade: 'Fortaleza',
    estado: 'CE',
    hora: '15:40',
    data: '12/07/2025'
  },
  {
    id: '2',
    latitude: -3.7285,
    longitude: -38.5240,
    gravidade: 'medio',
    titulo: 'Roubo',
    descricao: 'Roubo de carro',
    cidade: 'Fortaleza',
    estado: 'CE',
    hora: '13:20',
    data: '12/07/2025'
  },
  {
    id: '3',
    latitude: -3.7260,
    longitude: -38.5230,
    gravidade: 'leve',
    titulo: 'Festa barulhenta',
    descricao: 'Festa na rua',
    cidade: 'Fortaleza',
    estado: 'CE',
    hora: '22:10',
    data: '11/07/2025'
  },
];

const GRAVITY_COLORS = {
  grave: '#FF3B30',
  medio: '#FF9500',
  leve: '#FFD600',
};

export default function MapPage() {
  const user = useAuthGuard();
  const [region, setRegion] = useState(null);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      setRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.013,
        longitudeDelta: 0.013,
      });
    })();
  }, []);

  if (!user) return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;

  if (!region)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );

  return (
    <MapView style={styles.map} region={region} showsUserLocation>
      {location && (
        <Marker
          coordinate={{
            latitude: location.latitude,
            longitude: location.longitude
          }}
          title="Você está aqui"
          pinColor="#007AFF"
        />
      )}
      {alerts.map(alert => (
        <Marker
          key={alert.id}
          coordinate={{
            latitude: alert.latitude,
            longitude: alert.longitude
          }}
          title={alert.titulo}
          description={`${alert.descricao}\n${alert.cidade}, ${alert.estado} - ${alert.hora}`}
          pinColor={GRAVITY_COLORS[alert.gravidade]}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    width,
    height: height - 120,
    borderRadius: 24,
    marginTop: 0,
    overflow: 'hidden'
  },
  loading: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: "#181A20"
  }
});
