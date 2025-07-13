import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Plus, User, MapPin, Phone } from 'lucide-react-native';

export default function QuickActions({
  onSinalizar,
  onProfile,
  onMap,
  onHelp
}) {
  const actions = [
    { label: 'Sinalizar', icon: <Plus color="#fff" size={24} />, onPress: onSinalizar },
    { label: 'Meu perfil', icon: <User color="#fff" size={24} />, onPress: onProfile },
    { label: 'Ver mapa', icon: <MapPin color="#fff" size={24} />, onPress: onMap },
    { label: 'Chamar ajuda', icon: <Phone color="#fff" size={24} />, onPress: onHelp },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={{ marginVertical: 12 }}
    >
      {actions.map((action, i) => (
        <TouchableOpacity
          key={i}
          style={styles.actionBtn}
          onPress={action.onPress}
          activeOpacity={0.88}
        >
          {action.icon}
          <Text style={styles.actionText}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 14,
    paddingHorizontal: 10,
  },
  actionBtn: {
    width: 110,
    height: 92,
    backgroundColor: '#007AFF',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
  },
  actionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
    marginTop: 7,
    textAlign: 'center',
  },
});
