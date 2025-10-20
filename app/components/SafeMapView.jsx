import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MapView from 'react-native-maps';

const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

export default function SafeMapView(props) {
  const hasKey = !!apiKey && apiKey.trim() !== '';

  // Fallback visuel si la clé n'est pas dispo (Android)
  if (Platform.OS === 'android' && !hasKey) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.title}>Carte indisponible</Text>
        <Text style={styles.subtitle}>Service de localisation désactivé</Text>
      </View>
    );
  }

  return <MapView {...props} />;
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f1f1',
    borderRadius: 12,
    padding: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
});
