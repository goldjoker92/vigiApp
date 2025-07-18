import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useUserStore } from '../../store/users';
import LogoutButton from './LogoutButton';

export default function SideDrawer({ visible, onClose }) {
  const { user } = useUserStore();

  return (
    <Modal
      animationType="slide"
      visible={visible}
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        onPress={onClose}
        activeOpacity={1}
      >
        <View style={styles.drawer}>
          <Text style={styles.welcome}>
            Olá, {user?.apelido || user?.nome || "usuário"} 👋
          </Text>
          <LogoutButton />
        </View>
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
});
