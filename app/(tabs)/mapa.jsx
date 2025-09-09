import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Dimensions, Text } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuthGuard } from '../../hooks/useAuthGuard';

const { width, height } = Dimensions.get('window');

export default function MapPage() {
  const user = useAuthGuard();
  const [region, setRegion] = useState(null);
  const [location, setLocation] = useState(null);
  const [alerts, setAlerts] = useState([]);

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

  useEffect(() => {
    const now = new Date();
    const timestamp48hAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const q = query(collection(db, "publicAlerts"));
    const unsub = onSnapshot(q, snapshot => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(alert =>
          alert.location
          && alert.location.latitude
          && alert.location.longitude
          && alert.createdAt
          && alert.createdAt.toDate
          && alert.createdAt.toDate() > timestamp48hAgo
        );
      setAlerts(data);
    });
    return unsub;
  }, []);

  // Store refs for each marker by alert id
  const markerRefs = useRef({});

  if (!user) return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;

  if (!region)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );

  return (
    <MapView
      style={styles.map}
      region={region}
      showsUserLocation
      showsMyLocationButton
    >
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
      {alerts.map(alert => {
        const color = alert.color || "#FF3B30";
        return (
          <Marker
            key={alert.id}
            ref={ref => { markerRefs.current[alert.id] = ref; }}
            coordinate={{
              latitude: alert.location.latitude,
              longitude: alert.location.longitude
            }}
            pinColor={color}
          >
            <Callout
              tooltip={false}
              onPress={() => {
                markerRefs.current[alert.id]?.hideCallout();
              }}
            >
              <View style={styles.calloutContent}>
                <Text style={[styles.calloutTitle, { color }]}>{alert.categoria || 'Alerta'}</Text>
                <Text style={styles.calloutDate}>
                  {alert.date} às {alert.time}
                  {"\n"}{alert.cidade} - {alert.estado}
                </Text>
                <Text style={styles.calloutTap}>Toque para fechar</Text>
              </View>
            </Callout>
          </Marker>
        )
      })}
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
  },
  calloutContent: {
    minWidth: 120,
    maxWidth: 160,
    padding: 9,
    backgroundColor: "#fff",
    borderRadius: 10,
    elevation: 7,
    shadowColor: '#222',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    alignItems: 'flex-start'
  },
  calloutTitle: {
    fontWeight: 'bold',
    fontSize: 15,
    marginBottom: 4
  },
  calloutDate: {
    fontSize: 12,
    color: "#666",
    marginBottom: 5
  },
  calloutTap: {
    color: '#00C859',
    fontSize: 12,
    marginTop: 1,
    alignSelf: 'center'
  }
});
