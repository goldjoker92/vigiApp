import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Modal from 'react-native-modal';

export default function QuitGroupModal({ visible, groupName, onConfirm, onCancel }) {
  return (
    <Modal isVisible={visible}>
      <View style={{
        backgroundColor: '#23262F', borderRadius: 14, padding: 28, alignItems: 'center'
      }}>
        <Text style={{ fontWeight: 'bold', color: '#fff', fontSize: 21, marginTop: 8 }}>
          Sair do grupo?
        </Text>
        <Text style={{ color: "#bbb", fontSize: 16, textAlign: 'center', marginTop: 12 }}>
          Tem certeza que deseja sair do grupo <Text style={{color:'#22C55E', fontWeight:'bold'}}>{groupName}</Text>?
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 28 }}>
          <TouchableOpacity onPress={onCancel} style={{ backgroundColor: '#555', padding: 12, borderRadius: 10, marginRight: 16 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onConfirm} style={{ backgroundColor: '#FF4D4F', padding: 12, borderRadius: 10 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
