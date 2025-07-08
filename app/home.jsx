import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db } from '../firebase'; // Fix the import file name casing
import { doc, getDoc } from "firebase/firestore";
import { useUserStore } from '../store/users';

export default function HomeScreen() {
  const router = useRouter();
  const { user, setUser, logout } = useUserStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Récupère les infos du user à la première ouverture de la Home
    const fetchProfile = async () => {
      try {
        const userAuth = auth.currentUser;
        if (!userAuth) {
          router.replace('/'); // Non connecté
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
  }, []);

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
      {/* Header : nom + bouton logout */}
      <View style={styles.header}>
        <Text style={styles.welcome}>Bem-vindo(a), <Text style={styles.name}>{user?.nome || 'cidadão'}</Text>!</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logout}>Sair</Text>
        </TouchableOpacity>
      </View>

      {/* Bloc : Infos utilisateur (city, state...) */}
      <View style={styles.userBlock}>
        <Text style={styles.infoLabel}>Cidade:</Text>
        <Text style={styles.infoValue}>{user?.cidade} / {user?.estado}</Text>
        <Text style={styles.infoLabel}>Celular:</Text>
        <Text style={styles.infoValue}>{user?.celular}</Text>
        <Text style={styles.infoLabel}>E-mail:</Text>
        <Text style={styles.infoValue}>{user?.email}</Text>
      </View>

      {/* Bloc : Action principale */}
      <TouchableOpacity style={styles.signalBtn} onPress={() => router.push('/report')}>
        <Text style={styles.signalBtnText}>➕ Sinalizar um problema</Text>
      </TouchableOpacity>

      {/* Bloc (placeholder) : Liste des signalements récents */}
      <View style={styles.incidentsBlock}>
        <Text style={styles.incidentsTitle}>Últimos incidentes (em breve)</Text>
        <Text style={styles.incidentsPlaceholder}>Nenhum incidente registrado ainda.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex:1, backgroundColor:'#f9fafd', padding:24, paddingTop:40 },
  center:        { flex:1, justifyContent:'center', alignItems:'center' },
  header:        { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:20 },
  welcome:       { fontSize:20, fontWeight:'500', color:'#333' },
  name:          { fontWeight:'bold', color:'#007AFF' },
  logout:        { color:'#FF4444', fontWeight:'bold', fontSize:16 },
  userBlock:     { backgroundColor:'#fff', borderRadius:12, padding:16, marginBottom:28, elevation:2, shadowColor:'#000', shadowOpacity:0.04, shadowRadius:8 },
  infoLabel:     { color:'#555', fontWeight:'600', marginTop:4 },
  infoValue:     { color:'#111', fontWeight:'bold', marginBottom:8, fontSize:16 },
  signalBtn:     { backgroundColor:'#007AFF', borderRadius:10, padding:20, alignItems:'center', marginBottom:32, elevation:1 },
  signalBtnText: { color:'#fff', fontWeight:'bold', fontSize:18, letterSpacing:0.5 },
  incidentsBlock:{ backgroundColor:'#fff', borderRadius:10, padding:16, marginBottom:8 },
  incidentsTitle:{ fontSize:17, fontWeight:'bold', color:'#222', marginBottom:6 },
  incidentsPlaceholder: { color:'#888', fontSize:15, fontStyle:'italic' }
});
// This code defines the HomeScreen component for a React Native application using Expo.
// It fetches user profile data from Firebase Firestore and displays it, along with a logout button.       