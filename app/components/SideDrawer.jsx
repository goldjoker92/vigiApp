import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Vibration,
  SafeAreaView,
} from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useUserStore } from '../../store/users';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';

export default function SideDrawer({ visible, onClose }) {
  const { user, reset } = useUserStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Anti crash : pas d’user → Drawer ne s’affiche pas
  if (!user) {return null;}

  const confirmLogout = () => {
    Alert.alert(
      'Confirmação',
      'Tem certeza que deseja se desconectar?\n\nSeus dados e grupos serão preservados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: handleLogout,
        },
      ]
    );
  };

  const handleLogout = async () => {
    if (loading) {return;}
    setLoading(true);
    try {
      const { logoutUser } = await import('../../services/authService');
      await logoutUser();
      Vibration.vibrate([0, 70]);
      Toast.show({ type: 'success', text1: 'Você foi desconectado com sucesso' });
      onClose && onClose();
      setTimeout(() => {
        reset && reset();
        setTimeout(() => {
          router.replace('/');
        }, 100);
      }, 320);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro ao desconectar', text2: err.message });
    }
    setLoading(false);
  };

  return (
    <Modal animationType="slide" visible={visible} transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.drawer}>
            <View>
              <Text style={styles.welcome}>Olá, {user?.apelido || user?.nome || 'usuário'} 👋</Text>
              {/* Ajoute d’autres liens ici si besoin */}
            </View>
            {/* Spacer prend tout l’espace restant pour pousser le bouton en bas */}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={[styles.logoutBtn, loading ? { opacity: 0.6 } : null]}
              onPress={confirmLogout}
              disabled={loading}
              activeOpacity={0.86}
            >
              <LogOut color="#FF4444" size={22} style={{ marginRight: 10 }} />
              <Text style={styles.logoutText}>Desconectar</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.19)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  safeArea: {
    width: '100%',
    height: '100%',
  },
  drawer: {
    width: 270,
    height: '100%',
    backgroundColor: '#23262FEE',
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 38, // padding bas confortable
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    alignItems: 'flex-start',
    elevation: 10,
    flex: 1,
    justifyContent: 'flex-start',
  },
  welcome: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 34,
  },
  logoutBtn: {
    backgroundColor: '#FFEAEA',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#FF4444',
    width: '100%',
    justifyContent: 'center',
    marginBottom: 2,
    // ombre légère
    shadowColor: '#FF4444',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  logoutText: {
    color: '#FF4444',
    fontWeight: 'bold',
    fontSize: 16.2,
    letterSpacing: 0.1,
  },
});
