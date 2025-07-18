import { TouchableOpacity, Text, Alert, StyleSheet } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useUserStore } from '../../store/users';

export default function LogoutButton() {
  const { logout } = useUserStore();

  const confirmLogout = () => {
    Alert.alert(
      "Confirmação",
      "Você tem certeza que deseja sair?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sim, sair", onPress: logout, style: "destructive" }
      ]
    );
  };

  return (
    <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
      <LogOut color="#FF4444" size={18} style={{ marginRight: 7 }} />
      <Text style={styles.logoutText}>Sair</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
    justifyContent: 'center',
  },
  logoutText: {
    color: '#FF4444',
    fontWeight: 'bold',
    fontSize: 16,
  }
});
