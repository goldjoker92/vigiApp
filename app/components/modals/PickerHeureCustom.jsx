// components/modals/PickerHeureCustom.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8h à 22h
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 00, 05, ..., 55

export default function PickerHeureCustom({
  initialHour = 8,
  initialMinute = 0,
  onConfirm,
  onCancel,
}) {
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);

  return (
    <View style={styles.box}>
      <Text style={styles.label}>Heure choisie :</Text>
      <View style={styles.row}>
        {/* Picker Heures */}
        <FlatList
          data={HOURS}
          horizontal
          keyExtractor={(item) => item.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.cell, hour === item && styles.selected]}
              onPress={() => setHour(item)}
            >
              <Text style={[styles.text, hour === item && styles.selectedText]}>
                {item.toString().padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          )}
          showsHorizontalScrollIndicator={false}
        />
        <Text style={styles.colon}>:</Text>
        {/* Picker Minutes */}
        <FlatList
          data={MINUTES}
          horizontal
          keyExtractor={(item) => item.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.cell, minute === item && styles.selected]}
              onPress={() => setMinute(item)}
            >
              <Text style={[styles.text, minute === item && styles.selectedText]}>
                {item.toString().padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          )}
          showsHorizontalScrollIndicator={false}
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.confirmBtn} onPress={() => onConfirm({ hour, minute })}>
          <Text style={styles.confirmText}>Valider</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#21242c',
    padding: 16,
    borderRadius: 13,
    alignItems: 'center',
    marginTop: 13,
    marginBottom: 6,
    width: '100%',
  },
  label: {
    color: '#FFD600',
    fontWeight: 'bold',
    fontSize: 17,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 5,
  },
  cell: {
    padding: 8,
    borderRadius: 8,
    marginHorizontal: 3,
    backgroundColor: '#27292f',
  },
  selected: {
    backgroundColor: '#13d872',
  },
  text: {
    color: '#e3e3e3',
    fontSize: 22,
    fontWeight: '600',
  },
  selectedText: {
    color: '#111',
    fontWeight: 'bold',
  },
  colon: {
    color: '#FFD600',
    fontSize: 23,
    marginHorizontal: 7,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  confirmBtn: {
    backgroundColor: '#13d872',
    borderRadius: 9,
    paddingHorizontal: 19,
    paddingVertical: 9,
  },
  confirmText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelBtn: {
    backgroundColor: '#23272E',
    borderRadius: 9,
    paddingHorizontal: 19,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: '#FFD600',
    marginLeft: 8,
  },
  cancelText: { color: '#FFD600', fontWeight: 'bold', fontSize: 16 },
});
