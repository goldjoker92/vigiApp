// app/(tabs)/home.jsx
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
export default function HomeScreen({ user }) {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.sinalizarBtn}
        onPress={() => router.push('/(tabs)/report')}
      >
        <AlertCircle color="#fff" size={22} style={{ marginRight: 7 }} />
        <Text style={styles.sinalizarText}>Sinalizar um problema</Text>
      </TouchableOpacity>
      
      {/* Ajoute dashboard, stats, ou widgets ici plus tard */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#181A20' },
  bigTitle: { color:'#00C859', fontSize:28, fontWeight:'bold', marginBottom:8 },
  userName: { color:'#fff', fontSize:22, fontWeight:'600', marginBottom:18 },
  sinalizarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 26,
    marginTop: 24,
    elevation: 3,
    shadowColor: '#FF3B30',
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  sinalizarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginLeft: 6,
    letterSpacing: 0.3,
  },
});
