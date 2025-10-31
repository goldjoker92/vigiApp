// app/missing-public-alerts/[id].jsx
// -----------------------------------------------------------------------------
// Détail alerte Missing (animal/enfant/objet)
// ID = caseId dans Firestore
// -----------------------------------------------------------------------------

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import AlertDetailScreen from '../../src/alerts/AlertDetailScreen';

const TAG = '[ROUTE_MISSING_ALERT]';

export default function MissingAlertDetailRoute() {
  const params = useLocalSearchParams();

  // ✅ ID Firestore des "missing" === caseId (pas alertId)
  const caseId = params?.id ? String(params.id) : '';

  // ✅ type / “hint” pour l’UI immédiate avant fetch : animal / child / object...
  const kindHint = params?.kind ? String(params.kind).toLowerCase() : '';

  if (!caseId) {
    console.warn(TAG, 'missing:id');
    return (
      <View style={S.center}>
        <ActivityIndicator color="#FF3B30" />
        <Text style={S.msg}>Abrindo caso…</Text>
      </View>
    );
  }

  console.log(TAG, 'open', { caseId, kindHint });

  return (
    <AlertDetailScreen
      channel="missing"
      caseId={caseId} // ✅ ce que l'écran attend pour aller chercher Firestore
      alertId={caseId} // ✅ rétro-compat pour tes anciens fetch
      kindHint={kindHint} // ✅ pour afficher direct "animal" si connu
    />
  );
}

const S = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#0b0f14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  msg: {
    color: '#e5e7eb',
    marginTop: 10,
    fontWeight: '700',
  },
});
