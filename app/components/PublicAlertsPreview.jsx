// Aperçu pour la Home (2–3 dernières alertes, même style que la liste)
// - Pas de scroll interne (scrollEnabled={false}) pour éviter l’empilement
// - Bouton "Ver todos" -> page /public-alerts

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, MapPin, Clock } from 'lucide-react-native';
import usePublicAlerts24h, { timeLeft } from '../../app/public-alerts/parts/usePublicAlerts24h';

export default function PublicAlertsPreview({ limit = 3, containerStyle }) {
  const router = useRouter();
  const { alerts, loading } = usePublicAlerts24h();

  const visible = alerts ? alerts.slice(0, limit) : null;

  return (
    <View style={[{ marginTop: 18 }, containerStyle]}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
          Últimos alertas (24h)
        </Text>
        <TouchableOpacity onPress={() => router.push('/public-alerts')}>
          <Text style={{ color: '#60a5fa', fontWeight: '700' }}>Ver todos</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 12 }}>
          <ActivityIndicator color="#22C55E" />
        </View>
      ) : !visible || visible.length === 0 ? (
        <View
          style={{
            backgroundColor: '#1F222A',
            borderRadius: 14,
            padding: 14,
            borderWidth: 1,
            borderColor: '#2B2F3A',
          }}
        >
          <Text style={{ color: '#9aa3b2' }}>Nenhum alerta nas últimas 24 horas.</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
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
                borderColor: '#2B2F3A',
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
                <Text style={{ color: '#cfd3dc', marginBottom: 8 }} numberOfLines={2}>
                  {item.descricao}
                </Text>
              )}

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}
                >
                  <MapPin size={14} color="#9aa3b2" />
                  <Text style={{ color: '#9aa3b2', marginLeft: 6 }} numberOfLines={1}>
                    {item.ruaNumero
                      ? `${item.ruaNumero} — ${item.cidade}/${item.estado}`
                      : item.cidade || ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Clock size={14} color="#8fa0b3" />
                  <Text style={{ color: '#8fa0b3', fontSize: 12, marginLeft: 6 }}>
                    {timeLeft(item.createdAt)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
          contentContainerStyle={{ paddingBottom: 2 }}
        />
      )}
    </View>
  );
}
