// Contenant très léger qui affiche la liste complète (24h)
// - Titre + SafeArea + PublicAlertsFeedCore

import React from 'react';
import { View, Text, SafeAreaView } from 'react-native';
import PublicAlertsFeedCore from '@/app/public-alerts/parts/PublicAlertsFeedCore';

export default function PublicAlertsPage() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#181A20' }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 12 }}>
          Alertas públicos (últimas 24h)
        </Text>
      </View>
      <PublicAlertsFeedCore />
    </SafeAreaView>
  );
}
