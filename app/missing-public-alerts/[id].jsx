// app/missing-public-alerts/[id].jsx
// -----------------------------------------------------------------------------
// Route de détail pour les alertes "Missing" (enfants/animaux/objets perdus).
// Ouvre le renderer commun avec channel="missing" et l'alertId du deep link.
// Deep link CF attendu : vigiapp://missing-public-alerts/:id
// -----------------------------------------------------------------------------

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import AlertDetailScreen from '../../src/alerts/AlertDetailScreen';

const TAG = '[ROUTE_MISSING_ALERT]';

export default function MissingAlertDetailRoute() {
  const { id } = useLocalSearchParams();
  const alertId = id ? String(id) : '';

  if (!alertId) {
    console.warn(TAG, 'missing:id');
    return (
      <View style={S.center}>
        <ActivityIndicator color="#FF3B30" />
        <Text style={S.msg}>Abrindo caso…</Text>
      </View>
    );
  }

  console.log(TAG, 'open', { alertId, channel: 'missing' });
  return <AlertDetailScreen channel="missing" alertId={alertId} />;
}

const S = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#0b0f14', alignItems: 'center', justifyContent: 'center' },
  msg: { color: '#e5e7eb', marginTop: 10, fontWeight: '700' },
});
