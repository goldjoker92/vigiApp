// Petit bandeau mis en avant quand on débarque depuis une notification sur la Home
// - Très compact, CTA "Ver detalhes" (route vers /public-alerts/[id])

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Bell } from 'lucide-react-native';

export default function InlineAlertHighlight({ onPress, endereco, color = '#FF3B30' }) {
  return (
    <View
      style={{
        backgroundColor: '#1F222A',
        borderColor: '#2B2F3A',
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Bell size={18} color={color} />
        <Text style={{ color: '#fff', fontWeight: '800', marginLeft: 8 }}>Novo alerta</Text>
      </View>
      {!!endereco && <Text style={{ color: '#cfd3dc', marginBottom: 8 }}>{endereco}</Text>}
      <TouchableOpacity
        onPress={onPress}
        style={{
          backgroundColor: color,
          borderRadius: 10,
          paddingVertical: 10,
          alignItems: 'center',
        }}
        activeOpacity={0.9}
      >
        <Text style={{ color: '#fff', fontWeight: '800' }}>Ver detalhes</Text>
      </TouchableOpacity>
    </View>
  );
}
