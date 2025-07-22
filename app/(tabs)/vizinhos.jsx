import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Vibration,
  Platform,
  KeyboardAvoidingView,
  SafeAreaView,
  ScrollView,
  Dimensions,
} from "react-native";
import { MaterialIcons, Feather } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useUserStore } from "../../store/users";
import { useGrupoDetails } from "../../hooks/useGrupoDetails";
import { leaveGroup } from "../../services/groupService";
import QuitGroupModal from "../components/QuitGroupModal";
import { useRouter } from "expo-router";
import dayjs from "dayjs";
import { useAuthGuard } from "../../hooks/useAuthGuard";

// ----- ADMIN REASSIGNMENT -----
async function startAdminReassignment(grupo, user, groupId) {
  try {
    const apelidosSorted = [...(grupo.apelidos || [])].filter(a => a !== user.apelido).sort();
    const membres = grupo.membrosDetalhados || [];
    const candidates = apelidosSorted
      .map(apelido => membres.find(m => m.apelido === apelido))
      .filter(Boolean);
    for (let i = 0; i < candidates.length; i++) {
      const membro = candidates[i];
      await updateDoc(doc(db, "groups", groupId), {
        propostaAdmin: {
          apelido: membro.apelido,
          userId: membro.id,
          status: "pending",
        },
      });
    }
    const deleteAt = dayjs().add(7, "day").toISOString();
    await updateDoc(doc(db, "groups", groupId), {
      adminApelido: null,
      deleteAt,
      propostaAdmin: null,
      deleteWarningSent: false,
    });
  } catch (err) {
    console.log("[ADMIN ERROR]", err);
  }
}

export default function VizinhosScreen() {
  const { groupId, setGroupId } = useUserStore();
  const user = useAuthGuard();
  const { grupo, loading } = useGrupoDetails(groupId);
  const router = useRouter();
  const [quitModalVisible, setQuitModalVisible] = useState(false);

  if (user === undefined) return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;
  if (!user) return null;

  // ----- CAS USER NON RATTACHÉ À AUCUN GROUPE -----
  if (!loading && !grupo) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#181A20" }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.noGroupContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Feather name="alert-triangle" size={42} color="#FFD600" style={{ marginBottom: 14 }} />
            <Text style={styles.noGroupTitle}>Você não está em nenhum grupo</Text>
            <Text style={styles.noGroupText}>
              Você ainda não está vinculado a um grupo de vizinhos do seu CEP.{"\n\n"}
              Para criar um novo grupo, volte à página inicial e clique no botão{" "}
              <Text style={{ color: "#4F8DFF", fontWeight: "bold" }}>Criar novo grupo com seu CEP</Text>.
            </Text>
            <TouchableOpacity
              style={styles.goHomeBtn}
              onPress={() => router.replace("/(tabs)/home")}
              activeOpacity={0.87}
            >
              <Feather name="arrow-left-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.goHomeBtnText} numberOfLines={1} adjustsFontSizeToFit>
                Voltar para a página inicial
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ---- AFFICHAGE DU GROUPE ----
  const handleQuit = async () => {
    try {
      const isCreator = user.uid === grupo.creatorUserId;
      if (isCreator) await startAdminReassignment(grupo, user, groupId);
      await leaveGroup({ groupId, userId: user.id, apelido: user.apelido });
      setGroupId(null);
      setQuitModalVisible(false);
      Vibration.vibrate([0, 60, 60, 60]);
      setTimeout(() => {
        router.replace({ pathname: "/(tabs)/home", params: { quitGroup: grupo.name } });
      }, 900);
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao sair", text2: e.message });
      Vibration.vibrate([0, 100, 50, 100]);
    }
  };

  if (loading || !grupo)
    return (
      <View style={{ flex: 1, backgroundColor: "#181A20", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );

  let criador =
    grupo.creatorUserId === user.uid
      ? user.apelido || user.username || "Você"
      : grupo.creatorNome
        || grupo.creatorApelido
        || (Array.isArray(grupo.members) && grupo.members[0]?.apelido)
        || "Desconhecido";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#181A20" }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* NOM DU GROUPE CENTRÉ */}
          <View style={styles.header}>
            <Text style={styles.groupName}>{grupo.name}</Text>
          </View>

          {/* INFOS GROUP */}
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Feather name="users" size={20} color="#00C859" />
              <Text style={styles.infoText}>
                <Text style={{ color: "#00C859", fontWeight: "bold", fontSize: 19 }}>
                  {grupo.members?.length || 1} / {grupo.maxMembers || 30}
                </Text>{" "}
                vizinhos
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Feather name="user-check" size={20} color="#00C859" />
              <Text style={[styles.infoText, { color: "#00C859", fontWeight: "bold" }]}>
                Criador:{" "}
                <Text style={{ color: "#fff", fontWeight: "bold" }}>
                  {criador}
                </Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Feather name="map-pin" size={19} color="#00C859" />
              <Text style={[styles.infoText, { color: "#00C859", fontWeight: "bold" }]}>
                CEP: <Text style={{ color: "#fff", fontWeight: "bold" }}>{grupo.cep}</Text>
              </Text>
            </View>
          </View>

          {/* BOUTON QUITTER */}
          <View style={styles.quitBtnWrapper}>
            <TouchableOpacity
              style={styles.quitBtn}
              onPress={() => setQuitModalVisible(true)}
              activeOpacity={0.87}
            >
              <MaterialIcons name="logout" size={21} color="#FFD600" style={{ marginRight: 11 }} />
              <Text
                style={styles.quitBtnText}
                numberOfLines={1}
                ellipsizeMode="clip"
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                allowFontScaling
              >
                Sair do grupo
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* MODALE QUITTER */}
        <QuitGroupModal
          visible={quitModalVisible}
          groupName={grupo.name}
          onConfirm={handleQuit}
          onCancel={() => setQuitModalVisible(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // --- PAGE AVEC GROUPE ---
  content: {
    paddingHorizontal: 24,
    paddingTop: 44,
    paddingBottom: 44,
    backgroundColor: "#181A20",
    minHeight: Dimensions.get("window").height * 0.9,
  },
  header: {
    alignItems: "center",
    marginBottom: 15,
    marginTop: 8,
  },
  groupName: {
    color: "#00C859",
    fontWeight: "bold",
    fontSize: 38,
    marginTop: 0,
    textAlign: "center",
    letterSpacing: 1.2,
  },
  infoBox: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: "#23262F",
    paddingVertical: 22,
    paddingHorizontal: 19,
    marginBottom: 18,
    alignItems: "flex-start",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  infoText: {
    color: "#eee",
    fontSize: 18,
    marginLeft: 12,
    fontWeight: "700",
  },
  quitBtnWrapper: {
    width: "100%",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 32,
  },
  quitBtn: {
    backgroundColor: "#FF4D4F",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 22,
    minWidth: 170,
    maxWidth: 320,
    width: "72%",
    alignSelf: "center",
    shadowColor: "#FF4D4F",
    shadowOpacity: 0.10,
    shadowRadius: 7,
  },
  quitBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
    letterSpacing: 0.25,
    flexShrink: 1,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  // --- PAGE SANS GROUPE ---
  noGroupContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#181A20",
    paddingHorizontal: 24,
    paddingBottom: 24,
    minHeight: Dimensions.get("window").height * 0.95,
  },
  noGroupTitle: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 18.5,
    marginBottom: 11,
    textAlign: "center",
    letterSpacing: 0.15,
  },
  noGroupText: {
    color: "#eee",
    fontSize: 14.3,
    textAlign: "center",
    marginBottom: 22,
    lineHeight: 19,
  },
  goHomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4F8DFF",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "center",
    minWidth: 160,
    maxWidth: 290,
    elevation: 2,
  },
  goHomeBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13.5,
    letterSpacing: 0.11,
  },
});
