// src/miss/dev/PlaygroundMini.jsx
// Mini playground pour tester validateClient() directement dans l'UI
// Compact, scrollable, non intrusif — safe à brancher sous ton formulaire.

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { validateClient } from '../../lib/validations';

export default function PlaygroundMini() {
  const [type, setType] = useState('child');
  const [result, setResult] = useState(null);

  const samples = useMemo(
    () => ({
      child_ok: {
        type: 'child',
        guardianName: 'Maria Ferreira',
        cpfRaw: '12345678909',
        childFirstName: 'Lucas',
        childDobBR: '15/03/2013',
        childSex: 'M',
        lastCidade: 'Fortaleza',
        lastUF: 'CE',
        contextDesc: 'Sumiu ontem à tarde no parque.',
        photoPath: 'ok.jpg',
        consent: true,
        hasIdDoc: true,
        hasLinkDoc: true,
      },
      child_over: {
        type: 'child',
        guardianName: 'Paulo Lima',
        cpfRaw: '98765432100',
        childFirstName: 'João',
        childDobBR: '10/01/2010', // 15 ans → doit bloquer
        childSex: 'M',
        lastCidade: 'Recife',
        lastUF: 'PE',
        contextDesc: 'Saiu de casa e não voltou.',
        photoPath: 'ok.jpg',
        consent: true,
        hasIdDoc: true,
        hasLinkDoc: true,
      },
      animal_ok: {
        type: 'animal',
        primaryName: 'Thor',
        lastCidade: 'Fortaleza',
        lastUF: 'CE',
        contextDesc: 'Desapareceu no bairro Aldeota.',
        photoPath: 'ok.jpg',
      },
      object_ko: {
        type: 'object',
        primaryName: 'Mochila preta',
        lastCidade: 'Natal',
        lastUF: 'RN',
        contextDesc: 'Esquecida no ônibus.',
        photoPath: '',
      },
    }),
    [],
  );

  const runTest = (key) => {
    const data = samples[key];
    const res = validateClient(data);
    console.log(`[VALIDATION][${key}]`, res); // ← trace console propre
    setType(key);
    setResult(res);
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Playground de validação</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        {Object.keys(samples).map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => runTest(k)}
            style={[styles.btn, type === k && styles.btnActive]}
          >
            <Text style={[styles.btnTxt, type === k && styles.btnTxtActive]}>{k}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {result && (
        <View style={[styles.result, result.ok ? styles.ok : styles.ko]}>
          <Text style={styles.resTxt}>
            {result.ok ? '✅ OK — ' : '❌ KO — '}
            {result.status || ''}
          </Text>
          {!!result.reasons?.length && (
            <View style={styles.block}>
              {result.reasons.map((r, i) => (
                <Text key={i} style={styles.reason}>
                  • {r}
                </Text>
              ))}
            </View>
          )}
          {!!result.warnings?.length && (
            <View style={styles.blockWarn}>
              {result.warnings.map((w, i) => (
                <Text key={i} style={styles.warning}>
                  • {w}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#0e141b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    marginTop: 16,
  },
  title: { color: '#e5e7eb', fontWeight: '800', marginBottom: 6, fontSize: 13 },
  row: { flexDirection: 'row', marginBottom: 8 },
  btn: {
    backgroundColor: '#111827',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  btnActive: { borderColor: '#22c55e' },
  btnTxt: { color: '#cbd5e1', fontSize: 12 },
  btnTxtActive: { color: '#22c55e' },
  result: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
  },
  ok: { backgroundColor: '#052e16' },
  ko: { backgroundColor: '#3f0e0e' },
  resTxt: { color: '#f9fafb', fontWeight: '700', marginBottom: 4 },
  block: { marginTop: 4 },
  reason: { color: '#fca5a5', fontSize: 12 },
  blockWarn: { marginTop: 4 },
  warning: { color: '#facc15', fontSize: 12 },
});
