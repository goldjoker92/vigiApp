import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Vibration, Platform, KeyboardAvoidingView } from "react-native";
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase'; 
import { useUserStore } from '../../store/users'; // À adapter selon ta gestion user
import { useGrupoDetails } from '../../hooks/useGrupoDetails';
import { leaveGroup } from '../../services/groupService';
import QuitGroupModal from '../components/QuitGroupModal'; // Assure-toi que ce composant existe
import { useRouter } from "expo-router";
import dayjs from 'dayjs';

// ---------- PASSATION ADMIN (en tâche de fond) ----------
async function startAdminReassignment(grupo, user, groupId) {
  try {
    const apelidosSorted = [...(grupo.apelidos || [])].filter(a => a !== user.apelido).sort();
    const membres = grupo.membrosDetalhados || [];
    const candidates = apelidosSorted
      .map(apelido => membres.find(m => m.apelido === apelido))
      .filter(Boolean);

    for (let i = 0; i < candidates.length; i++) {
      const membro = candidates[i];
      await updateDoc(doc(db, 'groups', groupId), {
        propostaAdmin: {
          apelido: membro.apelido,
          userId: membro.id,
          status: 'pending'
        }
      });
      // ici: la logique d'attente/réponse Firestore, ou laisse la tâche tourner...
    }

    // Si personne
    const deleteAt = dayjs().add(7, 'day').toISOString();
    await updateDoc(doc(db, 'groups', groupId), {
      adminApelido: null,
      deleteAt,
      propostaAdmin: null,
      deleteWarningSent: false
    });
  } catch (err) {
    console.log("[ADMIN ERROR]", err);
  }
}

export default function VizinhosScreen() {
  const { groupId, user, setGroupId } = useUserStore();
  const { grupo, loading } = useGrupoDetails(groupId);
  const router = useRouter();

  const [quitModalVisible, setQuitModalVisible] = useState(false);

  const handleQuit = async () => {
    try {
      const isCreator = user.apelido === grupo.adminApelido;
      if (isCreator) {
        startAdminReassignment(grupo, user, groupId); // en tâche de fond
      }
      await leaveGroup({ groupId, userId: user.id, apelido: user.apelido });
      setGroupId(null);
      setQuitModalVisible(false);
      Toast.show({
        type: 'success',
        text1: `Você saiu do grupo ${grupo.name}`,
        position: 'bottom',
        visibilityTime: 2600,
        text1Style: { color: "#fff", fontWeight: "bold" },
        style: { backgroundColor: '#00C859' }
      });
      Vibration.vibrate([0, 60, 60, 60]);
      setTimeout(() => router.replace("/group-select"), 900);
    } catch (e) {
      Toast.show({ type: 'error', text1: "Erro ao sair", text2: e.message });
      Vibration.vibrate([0, 100, 50, 100]);
      console.log("[ERRO] handleQuit:", e);
    }
  };

  if (loading || !grupo)
    return (
      <View style={{ flex: 1, backgroundColor: "#1B2232", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.name}>
          <MaterialCommunityIcons name="home-group" size={22} color="#22C55E" /> {grupo.name}
        </Text>
        <Text style={styles.desc}>{grupo.description}</Text>
        <Text style={styles.info}>
          <Feather name="users" size={18} color="#00C859" />{' '}
          <Text style={{ color: "#22C55E", fontWeight: "bold" }}>{(grupo.members?.length || 0)} / {(grupo.maxMembers || 30)}</Text> vizinhos
        </Text>
        <Text style={styles.members}>
          <Feather name="user" size={16} color="#FFD700" />{' '}
          Membros: {(grupo.apelidos || []).join(", ")}
        </Text>
        <Text style={styles.info}>
          <Feather name="user-check" size={16} color="#FFD700" />{' '}
          Admin: {grupo.adminApelido || "?"} | CEP: {grupo.cep}
        </Text>
        <TouchableOpacity
          style={styles.quitBtn}
          onPress={() => setQuitModalVisible(true)}
        >
          <MaterialCommunityIcons name="logout" size={18} color="#fff" />
          <Text style={styles.quitBtnText}>Sair do grupo</Text>
        </TouchableOpacity>
        {/* MODALE QUITTER */}
        <QuitGroupModal
          visible={quitModalVisible}
          groupName={grupo.name}
          onConfirm={handleQuit}
          onCancel={() => setQuitModalVisible(false)}
        />
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
  quitBtn: { backgroundColor: "#FF4D4F", borderRadius: 12, padding: 14, marginTop: 25, alignItems: "center", flexDirection: 'row', justifyContent: 'center' },
  quitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16, marginLeft: 9 }
});
