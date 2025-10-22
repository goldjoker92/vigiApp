// src/miss/age/AgePolicyNotice.jsx
// ----------------------------------------------------------------------------
// VigiApp — Bandeau règles d'âge (child) + statut live
// Props:
//   - dobBR?: string "DD/MM/AAAA"
//   - compact?: boolean
// Tracing: [AGE/NOTICE]
// ----------------------------------------------------------------------------

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TriangleAlert, CheckCircle2, XCircle } from 'lucide-react-native';
import { computeAgeEligibility } from './agePolicy';

const NS = '[AGE/NOTICE]';

export default function AgePolicyNotice({ dobBR, compact }) {
  const today = useMemo(() => new Date(), []);
  const evalRes = useMemo(() => computeAgeEligibility(dobBR || '', today), [dobBR, today]);

  console.log(NS, 'render', { dobBR, evalStatus: evalRes.status, ok: evalRes.ok });

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.header}>
        <TriangleAlert size={18} color="#f59e0b" style={{ marginRight: 8 }} />
        <Text style={styles.title}>Regras de elegibilidade (menor)</Text>
      </View>

      <View style={styles.rules}>
        <RuleItem text="Menor que 12 anos → OK" />
        <RuleItem text="12 anos hoje → OK" />
        <RuleItem text="13 anos neste ano → OK até 31/12 do ano corrente" />
        <Text style={styles.note}>
          Concretamente: se o ano de nascimento = anoCorrente − 13 ⇒ autorizado até 31/12 deste ano.
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.statusRow}>
        {evalRes.ok ? (
          <CheckCircle2 size={18} color="#22c55e" style={{ marginRight: 6 }} />
        ) : (
          <XCircle size={18} color="#ef4444" style={{ marginRight: 6 }} />
        )}
        <Text style={[styles.statusText, evalRes.ok ? styles.ok : styles.ko]}>{evalRes.msg}</Text>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          Corte: até{' '}
          <Text style={styles.metaBold}>{String(evalRes.cutoffDateISO || '').slice(0, 10)}</Text>
          {typeof evalRes.years === 'number' && (
            <>
              {'  '}• Idade calculada:{' '}
              <Text style={styles.metaBold}>
                {evalRes.years} {evalRes.years === 1 ? 'ano' : 'anos'}
              </Text>
            </>
          )}
        </Text>
      </View>
    </View>
  );
}

function RuleItem({ text }) {
  return (
    <View style={styles.ruleRow}>
      <View style={styles.bullet} />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0e141b',
    borderColor: '#17202a',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  cardCompact: { padding: 10, marginTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  title: { color: '#f3f4f6', fontWeight: '800', fontSize: 14 },
  rules: { marginTop: 4 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
    marginTop: 6,
    marginRight: 8,
  },
  ruleText: { color: '#cfd3db', fontSize: 13, lineHeight: 18, flex: 1 },
  note: { color: '#9aa0a6', fontSize: 12, marginTop: 8 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 10,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 13, lineHeight: 18, flex: 1 },
  ok: { color: '#86efac', fontWeight: '700' },
  ko: { color: '#fca5a5', fontWeight: '700' },
  metaRow: { marginTop: 6 },
  meta: { color: '#a5b4bf', fontSize: 12 },
  metaBold: { color: '#e5e7eb', fontWeight: '800' },
});
