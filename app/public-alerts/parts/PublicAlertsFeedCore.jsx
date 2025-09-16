// Liste complète des alertes (24h), réutilisable par la page /public-alerts
// - UI sombre, cartes lisibles, pas d’empilement
// - Clique une carte => route vers le détail

import React from 'react';
import { View, ActivityIndicator, FlatList, TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, MapPin, Clock } from 'lucide-react-native';
import usePublicAlerts24h, { timeLeft, timeAgo } from './usePublicAlerts24h';

export default function PublicAlertsFeedCore() {
  const router = useRouter();
  const { alerts, loading } = usePublicAlerts24h();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#181A20', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#22C55E" />
      </View>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#181A20', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#9aa3b2', textAlign: 'center' }}>
          Nenhum alerta nas últimas 24 horas nesta região.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: '#181A20', paddingHorizontal: 16 }}
      data={alerts}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => router.push(`/public-alerts/${item.id}`)}
          style={{
            backgroundColor: '#1F222A',
            borderRadius: 14,
            padding: 14,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: '#2B2F3A'
          }}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Bell size={18} color={item?.color || '#FFA500'} />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8 }}>
              {item.categoria || 'Alerta público'}
            </Text>
          </View>

          {!!item.descricao && (
            <Text style={{ color: '#cfd3dc', marginBottom: 8 }}>
              {item.descricao}
            </Text>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
              <MapPin size={14} color="#9aa3b2" />
              <Text style={{ color: '#9aa3b2', marginLeft: 6 }} numberOfLines={1}>
                {item.ruaNumero ? `${item.ruaNumero} — ${item.cidade}/${item.estado}` : (item.cidade || '')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Clock size={14} color="#8fa0b3" />
              <Text style={{ color: '#8fa0b3', fontSize: 12, marginLeft: 6 }}>
                {timeLeft(item.createdAt)}
              </Text>
            </View>
          </View>

          <Text style={{ color: '#8fa0b3', fontSize: 12, marginTop: 6 }}>
            {timeAgo(item.createdAt)}
          </Text>
        </TouchableOpacity>
      )}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}
