import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Vibration, Modal, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { logoutUser } from '../../services/authService';
import { useUserStore } from '../../store/users';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';

export default function LogoutButton({ style, disabled }) {
  const [modalVisible, setModalVisible] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logoutUser();
      useUserStore.getState().reset && useUserStore.getState().reset();
      Vibration.vibrate([0, 80]);
      setModalVisible(false);
      router.replace('/'); // Redirige vers index.jsx (login)
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro ao desconectar', text2: err.message });
      setModalVisible(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.logoutBtn, style, disabled ? { opacity: 0.6 } : null]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.88}
        disabled={disabled}
      >
        <Feather name="log-out" size={20} color="#fff" style={{ marginRight: 9 }} />
        <Text style={styles.logoutBtnText}>Desconectar</Text>
      </TouchableOpacity>
      {/* Confirmation modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Feather name="alert-triangle" size={42} color="#FFD600" style={{ marginBottom: 9 }} />
            <Text style={styles.modalTitle}>Tem certeza que deseja se desconectar?</Text>
            <Text style={styles.modalMsg}>
              Você será desconectado desta conta, mas todos seus dados e grupos serão preservados.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleLogout}>
                <Text style={styles.confirmBtnText}>Desconectar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  logoutBtn: {
    backgroundColor: '#23262F',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 13,
    paddingHorizontal: 21,
    minWidth: 140,
    maxWidth: 330,
    marginVertical: 10,
    borderWidth: 1.3,
    borderColor: '#252A34',
    alignSelf: 'center',
  },
  logoutBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16.2,
    letterSpacing: 0.18,
  },
  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(8,8,14,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#23262F',
    borderRadius: 22,
    padding: 30,
    alignItems: 'center',
    width: 320,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 12,
  },
  modalTitle: {
    color: '#FFD600',
    fontWeight: 'bold',
    fontSize: 19.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMsg: {
    color: '#eee',
    fontSize: 15.2,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#181A20',
    borderRadius: 12,
    paddingVertical: 10,
    marginRight: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252A34',
  },
  cancelBtnText: {
    color: '#FFD600',
    fontWeight: 'bold',
    fontSize: 15,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#FF4D4F',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
