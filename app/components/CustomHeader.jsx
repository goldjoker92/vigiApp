import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Menu } from 'lucide-react-native';

export default function CustomHeader({ user, onMenuPress }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>
        Bem-vindo(a), <Text style={styles.name}>{user?.apelido || user?.nome || 'cidadão'}</Text>!
      </Text>
      <TouchableOpacity style={styles.burger} onPress={onMenuPress}>
        <Menu size={28} color="#007AFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 18,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'rgba(24,26,32,0.88)',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 12,
    paddingHorizontal: 20,
    // Effet flottant
  },
  title: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  name: {
    color: '#00C859',
    fontWeight: 'bold',
    fontSize: 19,
  },
  burger: {
    position: 'absolute',
    right: 24,
    top: 18,
    backgroundColor: 'rgba(35,38,47,0.95)',
    borderRadius: 16,
    padding: 6,
    zIndex: 20,
  }
});
