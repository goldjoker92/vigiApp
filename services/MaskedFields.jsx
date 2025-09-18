import React from 'react';
import { View, Text, TextInput } from 'react-native';
import MaskInput, { Masks } from 'react-native-mask-input';

const row = { flexDirection: 'row', alignItems: 'center' };
const inputStyle = {
  flex: 1,
  borderWidth: 0,
  backgroundColor: '#23262F',
  color: '#fff',
  padding: 16,
  borderRadius: 10,
  fontSize: 17,
};
const icon = (ok) => <Text style={{ marginLeft: 8 }}>{ok ? '🟢' : '🔴'}</Text>;

export function CpfField({ value, onChange, valid }) {
  return (
    <View style={row}>
      <MaskInput
        value={value}
        onChangeText={(_, unmasked) => onChange(unmasked)}
        keyboardType="number-pad"
        mask={Masks.BRL_CPF}
        placeholder="000.000.000-00"
        style={inputStyle}
      />
      {!!value && icon(valid)}
    </View>
  );
}

export function CepField({ value, onChange, loading, valid }) {
  return (
    <View style={row}>
      <MaskInput
        value={value}
        onChangeText={(_, unmasked) => onChange(unmasked)}
        keyboardType="number-pad"
        mask={Masks.ZIP_CODE}
        placeholder="00000-000"
        style={inputStyle}
      />
      {!!value && (loading ? <Text style={{ marginLeft: 8 }}>⏳</Text> : icon(valid))}
    </View>
  );
}

export function PhoneField({ value, onChange, valid }) {
  return (
    <View style={row}>
      <MaskInput
        value={value}
        onChangeText={(_, unmasked) => onChange(unmasked)}
        keyboardType="phone-pad"
        mask={Masks.BRL_PHONE}
        placeholder="(DD) 9XXXX-XXXX"
        style={inputStyle}
      />
      {!!value && icon(valid)}
    </View>
  );
}

export function DateField({ value, onChange, valid }) {
  return (
    <View style={row}>
      <MaskInput
        value={value}
        onChangeText={(_, unmasked) => onChange(unmasked)}
        keyboardType="number-pad"
        mask={Masks.DATE_DDMMYYYY}
        placeholder="DD/MM/AAAA"
        style={inputStyle}
      />
      {!!value && icon(valid)}
    </View>
  );
}

export function UFField({ value, onChange }) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) =>
        onChange(
          t
            .toUpperCase()
            .replace(/[^A-Z]/g, '')
            .slice(0, 2)
        )
      }
      placeholder="UF (ex: CE)"
      style={inputStyle}
      maxLength={2}
      autoCapitalize="characters"
    />
  );
}
