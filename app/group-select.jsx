import { useUserStore } from "../store/users";
import { useGruposPorCep } from "../hooks/useGruposPorCep";
import { joinGroup } from "../services/groupService";
import Toast from 'react-native-toast-message';
import { Handshake, PlusCircle } from "lucide-react-native";
import { useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";

export default function GroupSelectScreen() {
  const { user, setGroupId } = useUserStore();
  const { grupos, loading } = useGruposPorCep(user?.cep);
  const router = useRouter();

  const handleJoin = async (grupo) => {
    try {
      await joinGroup({ groupId: grupo.id, userId: user.id, apelido: user.apelido });
      setGroupId(grupo.id);
      Toast.show({
        type: 'success',
        text1: 'Você entrou no grupo com sucesso!',
        text2: grupo.name,
      });
      setTimeout(() => {
        router.replace("/(tabs)/vizinhos");
      }, 1200);
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: 'Erro ao entrar no grupo',
        text2: e.message,
      });
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Grupos da sua vizinhança</Text>
        <Text style={styles.subtitle}>CEP: {user.cep}</Text>
        {loading ? (
          <ActivityIndicator color="#22C55E" size="large" style={{ marginTop: 30 }} />
        ) : (
          <>
            {grupos.length === 0 && (
              <View style={styles.infoBox}>
                <Text style={{ color: '#bbb', fontSize: 15, textAlign: 'center' }}>
                  Nenhum grupo disponível para seu CEP.
                </Text>
                <TouchableOpacity
                  style={styles.createBtn}
                  onPress={() => router.push("/group-create")}
                >
                  <PlusCircle color="#fff" size={22} />
                  <Text style={styles.createBtnText}>Criar novo grupo</Text>
                </TouchableOpacity>
              </View>
            )}
            {grupos.map((g) => (
              <View key={g.id} style={styles.otherGroupCard}>
                <Text style={styles.otherGroupName}>{g.name}</Text>
                <Text style={styles.otherGroupInfo}>
                  Admin: <Text style={{ color: '#F7B801' }}>{g.adminApelido || "?"}</Text> — {g.members.length} / {g.maxMembers || 30} vizinhos
                </Text>
                <TouchableOpacity
                  style={styles.joinBtn}
                  onPress={() => handleJoin(g)}
                >
                  <Handshake color="#fff" size={20} />
                  <Text style={styles.joinBtnText}>Juntar-se</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
        <TouchableOpacity
          style={[styles.createBtn, { marginTop: 22 }]}
          onPress={() => router.push("/group-create")}
        >
          <PlusCircle color="#fff" size={22} />
          <Text style={styles.createBtnText}>Criar novo grupo</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#181A20', padding: 18, paddingBottom: 90 },
  title: { color: "#00C859", fontSize: 22, marginBottom: 8, fontWeight: "bold", textAlign: 'left' },
  subtitle: { color: '#aaa', marginBottom: 18, fontSize: 15 },
  otherGroupCard: { backgroundColor: '#23262F', borderRadius: 13, padding: 14, marginBottom: 10 },
  otherGroupName: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  otherGroupInfo: { color: '#bbb', fontSize: 14, marginBottom: 4 },
  joinBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00C859', padding: 9, borderRadius: 10, marginTop: 6, alignSelf: 'flex-start' },
  joinBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  createBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4F8DFF', padding: 11, borderRadius: 12, marginTop: 18, alignSelf: 'center' },
  createBtnText: { color: "#fff", fontWeight: "bold", marginLeft: 10, fontSize: 16 },
  infoBox: { marginTop: 30, alignItems: 'center', padding: 18, backgroundColor: '#23262F', borderRadius: 14 }
});
