// components/SideDrawer.jsx
import { View, Text, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useUserStore } from '../../store/users';

export default function SideDrawer({ visible, onClose }) {
  const { user, logout } = useUserStore();

  // Demande confirmation
  const confirmLogout = () => {
    Alert.alert(
      "Confirmação",
      "Você tem certeza que deseja sair?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sim, sair", onPress: handleLogout, style: "destructive" }
      ]
    );
  };

  const handleLogout = () => {
    logout();
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      visible={visible}
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.drawer}>
          <Text style={styles.welcome}>Olá, {user?.apelido || user?.nome || "usuário"} 👋</Text>
          {/* Ajoute d’autres liens ici si besoin */}
          <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
            <LogOut color="#FF4444" size={22} style={{ marginRight: 10 }} />
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex:1,
    backgroundColor: 'rgba(0,0,0,0.19)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  drawer: {
    width: 270,
    height: '100%',
    backgroundColor: '#23262FEE',
    padding: 28,
    paddingTop: 60,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    alignItems: 'flex-start',
    elevation: 10,
  },
  welcome: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 34,
  },
  logoutBtn: {
    marginTop: 40,
    backgroundColor: '#FFEAEA',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF4444',
    width: '100%',
    justifyContent: 'center'
  },
  logoutText: {
    color: '#FF4444',
    fontWeight: 'bold',
    fontSize: 16,
  }
});
