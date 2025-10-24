// app/public-alerts/[id].jsx
// -----------------------------------------------------------------------------
// Route de détail pour les alertes PUBLIQUES.
// Ouvre le renderer commun avec channel="public" et l'alertId issu du deep link.
// Deep link CF attendu : vigiapp://public-alerts/:id
// -----------------------------------------------------------------------------

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import AlertDetailScreen from '../../src/alerts/AlertDetailScreen';

const TAG = '[ROUTE_PUBLIC_ALERT]';

export default function PublicAlertDetailRoute() {
  const { id } = useLocalSearchParams();
  const alertId = id ? String(id) : '';

  if (!alertId) {
    console.warn(TAG, 'missing:id');
    return (
      <View style={S.center}>
        <ActivityIndicator color="#22C55E" />
        <Text style={S.msg}>Abrindo alerta…</Text>
      </View>
    );
  }

  console.log(TAG, 'open', { alertId, channel: 'public' });
  return <AlertDetailScreen channel="public" alertId={alertId} />;
}

const S = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#0b0f14', alignItems: 'center', justifyContent: 'center' },
  msg: { color: '#e5e7eb', marginTop: 10, fontWeight: '700' },
});
