import React from 'react';
import Modal from 'react-native-modal';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function AdminProposalModal({ visible, onAccept, onRefuse, apelido }) {
  return (
    <Modal isVisible={visible}>
      <View
        style={{
          backgroundColor: '#23262F',
          borderRadius: 14,
          padding: 24,
          alignItems: 'center',
        }}
      >
        <MaterialCommunityIcons name="account-star" size={44} color="#FACC15" />
        <Text style={{ fontWeight: 'bold', color: '#fff', fontSize: 21, marginTop: 15 }}>
          Você foi escolhido(a)!
        </Text>
        <Text style={{ color: '#bbb', fontSize: 16, textAlign: 'center', marginTop: 10 }}>
          O criador saiu do grupo. Por ordem alfabética, você ({apelido}) foi escolhido para ser o
          novo administrador.
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 28 }}>
          <TouchableOpacity
            onPress={onRefuse}
            style={{ backgroundColor: '#555', padding: 12, borderRadius: 10, marginRight: 16 }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Recusar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onAccept}
            style={{ backgroundColor: '#22C55E', padding: 12, borderRadius: 10 }}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Aceitar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
