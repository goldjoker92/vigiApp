// app/components/PublicAlertsFeedCore.jsx
// -----------------------------------------------------------------------------
// Liste des alertes publiques (24h) pour /public-alerts
// - Thème sombre, cartes compactes & lisibles
// - Tap = navigate vers le détail `/public-alerts/[id]`
// - SANS régression: mêmes champs consommés (descricao, ruaNumero, cidade/estado, color…)
// - Fallbacks sûrs: utilise titulo si descricao absente, kind/categoria si dispo
// - Petites améliorations: renderItem mémo, keyExtractor stable, états vides propres
// -----------------------------------------------------------------------------

import React, { useCallback } from 'react';
import { View, ActivityIndicator, FlatList, TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, MapPin, Clock } from 'lucide-react-native';
import usePublicAlerts24h, { timeLeft, timeAgo } from './usePublicAlerts24h';

/**
 * @typedef {Object} AlertDoc
 * @property {string} id
 * @property {string=} descricao
 * @property {string=} titulo
 * @property {string=} categoria
 * @property {string=} kind
 * @property {string=} color
 * @property {string=} ruaNumero
 * @property {string=} cidade
 * @property {string=} estado
 * @property {string=} uf
 * @property {*} [createdAt]
 */

export default function PublicAlertsFeedCore() {
  const router = useRouter();
  const { alerts, loading } = usePublicAlerts24h();

  // ----------- Hooks (must be before any early return) -----------
  const keyExtractor = useCallback((i) => i.id, []);
  const onPressItem = useCallback(
    (id) => {
      // route standard (garde la compat avec ta page détail)
      router.push(`/public-alerts/${id}`);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }) => {
      // Fallbacks sûrs
      const cat = item.categoria || item.kind || 'Alerta público';
      const desc = item.descricao || item.titulo || 'Alerta público';
      const uf = item.estado || item.uf || '';
      const loc = item.ruaNumero
        ? `${item.ruaNumero} — ${item.cidade || ''}${uf ? `/${uf}` : ''}`
        : item.cidade || (uf ? `/${uf}` : '') || '';

      return (
        <TouchableOpacity
          onPress={() => onPressItem(item.id)}
          style={{
            backgroundColor: '#1F222A',
            borderRadius: 14,
            padding: 14,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: '#2B2F3A',
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Abrir alerta ${cat}`}
        >
          {/* En-tête (icône + catégorie) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Bell size={18} color={item?.color || '#FFA500'} />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8 }}>
              {cat}
            </Text>
          </View>

          {/* Description */}
          {!!desc && (
            <Text style={{ color: '#cfd3dc', marginBottom: 8 }} numberOfLines={3}>
              {desc}
            </Text>
          )}

          {/* Lieu + échéance */}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
              <MapPin size={14} color="#9aa3b2" />
              <Text style={{ color: '#9aa3b2', marginLeft: 6 }} numberOfLines={1}>
                {loc || 'sua região'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Clock size={14} color="#8fa0b3" />
              <Text style={{ color: '#8fa0b3', fontSize: 12, marginLeft: 6 }}>
                {timeLeft(item.createdAt)}
              </Text>
            </View>
          </View>

          {/* time ago */}
          <Text style={{ color: '#8fa0b3', fontSize: 12, marginTop: 6 }}>
            {timeAgo(item.createdAt)}
          </Text>
        </TouchableOpacity>
      );
    },
    [onPressItem]
  );

  // ----------- UI States -----------
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#181A20',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color="#22C55E" />
      </View>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#181A20',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
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
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={{ paddingVertical: 12, paddingBottom: 24 }}
      // perf hints
      initialNumToRender={8}
      windowSize={10}
      removeClippedSubviews
    />
  );
}
