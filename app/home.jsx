import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../firebase';
import { doc, getDoc } from "firebase/firestore";
import { useUserStore } from '../store/users';
import { LogOut } from "lucide-react-native";

export default function HomeScreen() {
  const router = useRouter();
  const { user, setUser, logout } = useUserStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const userAuth = auth.currentUser;
        if (!userAuth) {
          router.replace('/');
          return;
        }
        const docRef = doc(db, "usuarios", userAuth.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUser({ ...docSnap.data(), uid: userAuth.uid });
        } else {
          Alert.alert("Perfil não encontrado");
        }
      } catch (e) {
        Alert.alert("Erro ao carregar perfil", e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [router, setUser]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      logout();
      router.replace('/');
    } catch (e) {
      Alert.alert("Erro ao sair", e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Le contenu principal est scrollable */}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.header}>
          <Text style={styles.welcome}>
            Bem-vindo(a), <Text style={styles.name}>{user?.apelido || user?.nome || 'cidadão'}</Text>!
          </Text>
        </View>

        <View style={styles.userBlock}>
          <Text style={styles.infoLabel}>Cidade:</Text>
          <Text style={styles.infoValue}>{user?.cidade} / {user?.estado}</Text>
          <Text style={styles.infoLabel}>Celular:</Text>
          <Text style={styles.infoValue}>{user?.celular}</Text>
          <Text style={styles.infoLabel}>E-mail:</Text>
          <Text style={styles.infoValue}>{user?.email}</Text>
        </View>

        <TouchableOpacity style={styles.signalBtn} onPress={() => router.push('/alerts/public')}>
          <Text style={styles.signalBtnText}>➕ Sinalizar</Text>
        </TouchableOpacity>

        <View style={styles.incidentsBlock}>
          <Text style={styles.incidentsTitle}>Últimos incidentes (em breve)</Text>
          <Text style={styles.incidentsPlaceholder}>Nenhum incidente registrado ainda.</Text>
        </View>
      </ScrollView>

      {/* Bouton Sair collé en bas de page */}
      <View style={styles.logoutContainer}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={22} color="#FF4444" style={{ marginRight: 8 }} />
            <Text style={styles.logoutText}>Sair</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f9fafd', paddingTop: 40 },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:        { marginBottom: 20, paddingHorizontal: 24 },
  welcome:       { fontSize: 20, fontWeight: '500', color: '#333' },
  name:          { fontWeight: 'bold', color: '#007AFF' },
  userBlock:     { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20, marginHorizontal: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 },
  infoLabel:     { color: '#555', fontWeight: '600', marginTop: 4 },
  infoValue:     { color: '#111', fontWeight: 'bold', marginBottom: 8, fontSize: 16 },
  signalBtn:     { backgroundColor: '#007AFF', borderRadius: 10, padding: 20, alignItems: 'center', marginBottom: 32, marginHorizontal: 24, elevation: 1 },
  signalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18, letterSpacing: 0.5 },
  incidentsBlock:{ backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 8, marginHorizontal: 24 },
  incidentsTitle:{ fontSize: 17, fontWeight: 'bold', color: '#222', marginBottom: 6 },
  incidentsPlaceholder: { color: '#888', fontSize: 15, fontStyle: 'italic' },
  logoutContainer: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    backgroundColor: '#f9fafd',
  },
  logoutBtn: {
    backgroundColor: '#ffecec',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#FF4444',
    width: '100%',
    elevation: 1,
  },
  logoutText: { color: '#FF4444', fontWeight: 'bold', fontSize: 17 },
});
