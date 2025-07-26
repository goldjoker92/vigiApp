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
import GroupHelpSection from "../components/GroupHelpSection";
import { useRouter } from "expo-router";
import dayjs from "dayjs";
import { useAuthGuard } from "../../hooks/useAuthGuard";

const SCREEN_HEIGHT = Dimensions.get("window").height;

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

  if (user === undefined)
    return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;
  if (!user) return null;

  // --- CAS USER NON RATTACHÉ À AUCUN GROUPE ---
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
            <Feather
              name="alert-triangle"
              size={42}
              color="#FFD600"
              style={{ marginBottom: 14 }}
            />
            <Text style={styles.noGroupTitle}>
              Você não está em nenhum grupo
            </Text>
            <Text style={styles.noGroupText}>
              Você ainda não está vinculado a um grupo de vizinhos do seu CEP.{"\n\n"}
              Para criar um novo grupo, volte à página inicial e clique no botão{" "}
              <Text style={{ color: "#4F8DFF", fontWeight: "bold" }}>
                Criar novo grupo com seu CEP
              </Text>.
            </Text>
            <TouchableOpacity
              style={styles.goHomeBtn}
              onPress={() => router.replace("/(tabs)/home")}
              activeOpacity={0.87}
            >
              <Feather
                name="arrow-left-circle"
                size={18}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text
                style={styles.goHomeBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
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
        router.replace({
          pathname: "/(tabs)/home",
          params: { quitGroup: grupo.name },
        });
      }, 900);
    } catch (e) {
      Toast.show({
        type: "error",
        text1: "Erro ao sair",
        text2: e.message,
      });
      Vibration.vibrate([0, 100, 50, 100]);
    }
  };

  if (loading || !grupo)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#181A20",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );

  let criador =
    grupo.creatorUserId === user.uid
      ? user.apelido || user.username || "Você"
      : grupo.creatorNome ||
        grupo.creatorApelido ||
        (Array.isArray(grupo.members) && grupo.members[0]?.apelido) ||
        "Desconhecido";

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
          {/* --- INFOS GROUPE --- */}
          <View style={styles.header}>
            <Text style={styles.groupName}>{grupo.name}</Text>
          </View>
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Feather name="users" size={20} color="#00C859" />
              <Text style={styles.infoText}>
                <Text
                  style={{
                    color: "#00C859",
                    fontWeight: "bold",
                    fontSize: 19,
                  }}
                >
                  {grupo.members?.length || 1} / {grupo.maxMembers || 30}
                </Text>{" "}
                vizinhos
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Feather name="user-check" size={20} color="#00C859" />
              <Text
                style={[
                  styles.infoText,
                  { color: "#00C859", fontWeight: "bold" },
                ]}
              >
                Criador:{" "}
                <Text style={{ color: "#fff", fontWeight: "bold" }}>
                  {criador}
                </Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Feather name="map-pin" size={19} color="#00C859" />
              <Text
                style={[
                  styles.infoText,
                  { color: "#00C859", fontWeight: "bold" },
                ]}
              >
                CEP:{" "}
                <Text style={{ color: "#fff", fontWeight: "bold" }}>
                  {grupo.cep}
                </Text>
              </Text>
            </View>
          </View>

          {/* --- BOUTON QUITTER --- */}
          <View style={styles.quitBtnWrapper}>
            <TouchableOpacity
              style={styles.quitBtn}
              onPress={() => setQuitModalVisible(true)}
              activeOpacity={0.87}
            >
              <MaterialIcons
                name="logout"
                size={21}
                color="#FFD600"
                style={{ marginRight: 11 }}
              />
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

          {/* --- SECTION ENTRAIDE / AJUDA --- */}
          <GroupHelpSection groupId={groupId} />
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
  content: {
    paddingHorizontal: 18,
    paddingTop: 35,
    paddingBottom: 35,
    backgroundColor: "#181A20",
    minHeight: SCREEN_HEIGHT * 0.93,
  },
  header: {
    alignItems: "center",
    marginBottom: 12,
    marginTop: 0,
  },
  groupName: {
    color: "#00C859",
    fontWeight: "bold",
    fontSize: 30,
    marginTop: 0,
    textAlign: "center",
    letterSpacing: 1.1,
  },
  infoBox: {
    marginTop: 12,
    borderRadius: 15,
    backgroundColor: "#23262F",
    paddingVertical: 19,
    paddingHorizontal: 16,
    marginBottom: 15,
    alignItems: "flex-start",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
  },
  infoText: {
    color: "#eee",
    fontSize: 16.5,
    marginLeft: 10,
    fontWeight: "700",
  },
  quitBtnWrapper: {
    width: "100%",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 18,
  },
  quitBtn: {
    backgroundColor: "#FF4D4F",
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    paddingHorizontal: 18,
    minWidth: 160,
    maxWidth: 280,
    width: "67%",
    alignSelf: "center",
    shadowColor: "#FF4D4F",
    shadowOpacity: 0.10,
    shadowRadius: 7,
  },
  quitBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
    letterSpacing: 0.25,
    flexShrink: 1,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  noGroupContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#181A20",
    paddingHorizontal: 24,
    paddingBottom: 24,
    minHeight: SCREEN_HEIGHT * 0.95,
  },
  noGroupTitle: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 17,
    marginBottom: 9,
    textAlign: "center",
    letterSpacing: 0.13,
  },
  noGroupText: {
    color: "#eee",
    fontSize: 13.5,
    textAlign: "center",
    marginBottom: 17,
    lineHeight: 17,
  },
  goHomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4F8DFF",
    borderRadius: 11,
    paddingVertical: 7,
    paddingHorizontal: 13,
    alignSelf: "center",
    minWidth: 140,
    maxWidth: 220,
    elevation: 2,
  },
  goHomeBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12.5,
    letterSpacing: 0.09,
  },
});
