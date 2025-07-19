// app/(tabs)/home.jsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bienvenue 👋</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          console.log("[Home] Bouton 'Créer un nouveau groupe' pressé");
          router.push('/group-create');
        }}
      >
        <Text style={styles.buttonText}>Criar um novo grupo</Text>
      </TouchableOpacity>
      {/* Ici, tu peux lister les groupes, etc. */}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: "#181A20" },
  title: { fontSize: 30, color: '#fff', fontWeight: 'bold', marginBottom: 44 },
  button: { backgroundColor: '#22C55E', padding: 20, borderRadius: 14 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
});
// Ce fichier représente l'écran d'accueil de l'application
// Il contient un bouton pour créer un nouveau groupe 