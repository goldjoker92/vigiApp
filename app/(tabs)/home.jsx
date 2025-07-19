// app/(tabs)/home.jsx
import { useUserStore } from '../../store/users';
import { useGrupoDetails } from '../../hooks/useGrupoDetails';
import { useGruposPorCep } from '../../hooks/useGruposPorCep';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { Handshake, PlusCircle, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import WeatherCard from '../components/WeatherCard';

export default function HomeScreen() {
  const { groupId, user } = useUserStore();
  const { grupo, loading: loadingGrupo } = useGrupoDetails(groupId);
  const { grupos, loading: loadingGrupos } = useGruposPorCep(user?.cep);
  const router = useRouter();

  // Autres groupes du CEP accessibles
  const autresGroupes = (grupos || []).filter(
    g => g.id !== groupId && (g.members?.length || 0) < (g.maxMembers || 30)
  );

  // Greeting dynamique selon l’heure brésilienne
  const horaBrasil = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Fortaleza' });
  const hora = parseInt(horaBrasil, 10);
  let greeting = 'Bom dia';
  if (hora >= 12 && hora < 18) greeting = 'Boa tarde';
  else if (hora >= 18 || hora < 6) greeting = 'Boa noite';

  const nome = user?.apelido || user?.username || 'Cidadão';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>

        <Text style={styles.greeting}>
          {greeting}, <Text style={styles.username}>{nome}</Text> 👋
        </Text>
        <WeatherCard cep={user?.cep} />

        {/* Ton groupe */}
        {groupId && grupo && !loadingGrupo && (
          <TouchableOpacity style={styles.groupCard} onPress={() => router.push('/(tabs)/vizinhos')}>
            <Text style={styles.groupTitle}>Seu grupo de vizinhança</Text>
            <Text style={styles.groupName}>{grupo.name}</Text>
            <Text style={styles.groupInfo}>
              Admin: <Text style={{ color: '#F7B801' }}>{grupo.adminApelido || "Desconhecido"}</Text>
            </Text>
            <Text style={styles.groupInfo}>
              CEP: {grupo.cep} | {grupo.members.length} / {grupo.maxMembers || 30} vizinhos
            </Text>
          </TouchableOpacity>
        )}

        {/* Section autres groupes */}
        <Text style={styles.sectionTitle}>Outros grupos disponíveis</Text>
        {loadingGrupos ? (
          <Text style={{ color: '#bbb', fontSize: 16, textAlign: 'center' }}>Carregando...</Text>
        ) : autresGroupes.length === 0 ? (
          <View style={styles.infoBox}>
            <Text style={{ color: '#bbb', fontSize: 15, textAlign: 'center' }}>
              Não há outros grupos do seu CEP ainda.
            </Text>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => router.push("/group-create")}
            >
              <PlusCircle color="#fff" size={22} />
              <Text style={styles.createBtnText}>Criar novo grupo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          autresGroupes.map(g => (
            <View key={g.id} style={styles.otherGroupCard}>
              <Text style={styles.otherGroupName}>{g.name}</Text>
              <Text style={styles.otherGroupInfo}>
                Admin: <Text style={{ color: '#F7B801' }}>{g.adminApelido || "?"}</Text> — {g.members.length} / {g.maxMembers || 30} vizinhos
              </Text>
              <TouchableOpacity
                style={styles.joinBtn}
                onPress={() => router.push({ pathname: '/group-join', params: { groupId: g.id } })}
              >
                <Handshake color="#fff" size={20} />
                <Text style={styles.joinBtnText}>Juntar-se</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Créer un groupe (toujours visible si aucun) */}
        {!groupId && (
          <TouchableOpacity
            style={[styles.createBtn, { marginTop: 26 }]}
            onPress={() => router.push("/group-create")}
          >
            <Users color="#fff" size={20} />
            <Text style={styles.createBtnText}>Criar grupo com vizinhos do seu CEP</Text>
          </TouchableOpacity>
        )}

        {/* TU PEUX RAJOUTER EN BAS : Actions rapides, météo, stats, etc. */}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#181A20', padding: 18, paddingBottom: 120 },
  greeting: { color: '#fff', fontSize: 27, fontWeight: '700', marginBottom: 18, marginTop: 5, alignSelf: 'flex-start' },
  username: { color: '#00C859', fontWeight: '900' },
  groupCard: { backgroundColor: '#202228', borderRadius: 15, padding: 18, marginBottom: 20, alignItems: 'flex-start', shadowColor: '#00C859', shadowOpacity: 0.09, shadowRadius: 5 },
  groupTitle: { color: '#6cffe5', fontWeight: 'bold', fontSize: 17, marginBottom: 4 },
  groupName: { color: '#00C859', fontWeight: '900', fontSize: 21, marginBottom: 3 },
  groupInfo: { color: '#eee', fontSize: 15, marginBottom: 2 },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 12, marginTop: 12 },
  otherGroupCard: { backgroundColor: '#23262F', borderRadius: 13, padding: 14, marginBottom: 10 },
  otherGroupName: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  otherGroupInfo: { color: '#bbb', fontSize: 14, marginBottom: 4 },
  joinBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00C859', padding: 9, borderRadius: 10, marginTop: 6, alignSelf: 'flex-start' },
  joinBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  createBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4F8DFF', padding: 11, borderRadius: 12, marginTop: 18, alignSelf: 'center' },
  createBtnText: { color: "#fff", fontWeight: "bold", marginLeft: 10, fontSize: 16 },
  infoBox: { marginTop: 30, alignItems: 'center', padding: 18, backgroundColor: '#23262F', borderRadius: 14 }
});
