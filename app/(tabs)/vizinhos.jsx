import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, Vibration, View } from "react-native";
import Toast from 'react-native-toast-message';
import { useGroupHelps } from '../../hooks/useGroupHelps';
import { useGrupoDetails } from '../../hooks/useGrupoDetails';
import { leaveGroup } from '../../services/groupService';
import { useUserStore } from '../../store/users';
import { HelpRequestCard } from '../components/HelpRequestCard';
import InviteQRCode from '../components/InviteQRCode';
import NotificationBell from '../components/NotificationBell';

export default function VizinhosScreen() {
  const { groupId, user, setGroupId } = useUserStore();
  const { grupo } = useGrupoDetails(groupId);
  const { helps, loading: loadingHelps } = useGroupHelps(groupId);
  const router = useRouter();

  const handleQuit = async () => {
    try {
      await leaveGroup({ groupId, userId: user.uid, apelido: user.apelido });
      setGroupId(null);
      Toast.show({ type: 'success', text1: "Você saiu do grupo." });
      Vibration.vibrate([0, 60, 60, 60]);
      setTimeout(() => router.replace("/group-select"), 900);
    } catch (e) {
      Toast.show({ type: 'error', text1: "Erro", text2: e.message });
      Vibration.vibrate([0, 100, 50, 100]);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={{ alignItems: "flex-end" }}>
          <NotificationBell groupId={groupId} onPress={() => router.push("/(tabs)/notifications")} />
        </View>
        <Text style={styles.name}>{grupo?.name}</Text>
        <Text style={styles.desc}>{grupo?.description}</Text>
        <Text style={styles.info}>
          <Text style={{ color: "#22C55E", fontWeight: "bold" }}>{(grupo?.members?.length || 0)} / {(grupo?.maxMembers || 30)}</Text> vizinhos
        </Text>
        <Text style={styles.members}>
          Membros: {(grupo?.apelidos || []).join(", ")}
        </Text>
        <Text style={styles.info}>Admin: {grupo?.adminApelido || "?"} | CEP: {grupo?.cep}</Text>
        <InviteQRCode groupId={groupId} />

        <Text style={{ color: "#36C5FF", fontWeight: "bold", fontSize: 17, marginVertical: 12 }}>
          Pedidos de ajuda do grupo
        </Text>
        <TouchableOpacity
          style={{ backgroundColor:'#36C5FF', padding:12, borderRadius:7, alignSelf:'flex-end', marginBottom:10 }}
          onPress={() => router.push('/help-request')}
        >
          <Text style={{color:'#fff', fontWeight:'bold'}}>+ Novo pedido de ajuda</Text>
        </TouchableOpacity>
        {loadingHelps ? (
          <Text style={{ color: '#bbb', fontSize: 15 }}>Carregando…</Text>
        ) : helps.length === 0 ? (
          <Text style={{ color: "#aaa", marginBottom: 15 }}>Nenhum pedido por enquanto.</Text>
        ) : (
          helps.map(help => (
            <HelpRequestCard
              key={help.id}
              help={help}
              onContact={(help) => router.push({ pathname: '/group-chat/[helpId]', params: { helpId: help.id } })}
            />
          ))
        )}

        <TouchableOpacity style={styles.quitBtn} onPress={handleQuit}>
          <Text style={styles.quitBtnText}>Sair do grupo</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#1B2232", padding: 20, minHeight: 400 },
  name: { color: "#fff", fontWeight: "bold", fontSize: 22, marginBottom: 8, textAlign: "left" },
  desc: { color: "#aaa", marginBottom: 8, fontSize: 15 },
  info: { color: "#eee", marginBottom: 10, fontSize: 15 },
  members: { color: "#aaa", marginBottom: 10, fontSize: 14 },
  quitBtn: { backgroundColor: "#FF4D4F", borderRadius: 12, padding: 14, marginTop: 25, alignItems: "center" },
  quitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 }
});
