import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

function HelpRequestCard({ help, onContact }) {
  return (
    <View style={styles.card}>
      <Text style={styles.apelido}>{help.apelido}</Text>
      <Text style={styles.message}>{help.message}</Text>
      <TouchableOpacity style={styles.contactBtn} onPress={() => onContact(help)}>
        <Text style={styles.contactBtnText}>Contatar</Text>
      </TouchableOpacity>
    </View>
  );
}

export default HelpRequestCard; // <-- AJOUTE CECI

const styles = StyleSheet.create({
  card: { backgroundColor:'#23262F', borderRadius:10, padding:16, marginBottom:12 },
  apelido: { color:'#36C5FF', fontWeight:'bold', marginBottom:5 },
  message: { color:'#fff', fontSize:15, marginBottom:10 },
  contactBtn: { backgroundColor:'#22C55E', padding:8, borderRadius:7, alignSelf:'flex-end' },
  contactBtnText: { color:'#fff', fontWeight:'bold' }
});
