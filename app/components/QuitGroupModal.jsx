import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Modal from 'react-native-modal';

export default function QuitGroupModal({ visible, groupName, onConfirm, onCancel, loading }) {
  return (
    <Modal isVisible={visible} onBackdropPress={onCancel} useNativeDriver>
      <View
        style={{
          backgroundColor: '#23262F',
          borderRadius: 14,
          padding: 28,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontWeight: 'bold',
            color: '#fff',
            fontSize: 21,
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          Sair do grupo?
        </Text>
        <Text
          style={{
            color: '#bbb',
            fontSize: 16,
            textAlign: 'center',
            marginTop: 12,
          }}
        >
          Tem certeza que deseja sair do grupo{' '}
          <Text style={{ color: '#22C55E', fontWeight: 'bold' }}>{groupName}</Text>?
        </Text>
        <View
          style={{
            flexDirection: 'row',
            marginTop: 28,
            justifyContent: 'center',
          }}
        >
          <TouchableOpacity
            onPress={onCancel}
            style={{
              backgroundColor: '#555',
              paddingVertical: 12,
              paddingHorizontal: 22,
              borderRadius: 10,
              marginRight: 16,
              opacity: loading ? 0.6 : 1,
            }}
            disabled={loading}
          >
            <Text
              style={{
                color: '#fff',
                fontWeight: 'bold',
              }}
            >
              Cancelar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirm}
            style={{
              backgroundColor: '#FF4D4F',
              paddingVertical: 12,
              paddingHorizontal: 22,
              borderRadius: 10,
              opacity: loading ? 0.6 : 1,
            }}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                style={{
                  color: '#fff',
                  fontWeight: 'bold',
                }}
              >
                Sair
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
