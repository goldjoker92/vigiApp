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
import { useUserStore } from "../../store/users";
import { useGrupoDetails } from "../../hooks/useGrupoDetails";
import { leaveGroup } from "../../services/groupService";
import QuitGroupModal from "../components/QuitGroupModal";
import CardHelpRequest from "../components/CardHelpRequest";
import { useRouter } from "expo-router";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { useRealtimeGroupHelps } from "../../hooks/useRealtimeGroupHelps";
import { useRealtimeMyGroupHelps } from "../../hooks/useRealtimeMyGroupHelps";
import CreateHelpModal from "../components/modals/CreateHelpModal";
import {
  acceptGroupHelp,
  hideGroupHelpForUser,
} from "../../services/groupHelpService";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export default function VizinhosScreen() {
  const { groupId, setGroupId } = useUserStore();
  const user = useAuthGuard();
  const { grupo, loading } = useGrupoDetails(groupId);
  const router = useRouter();

  const [quitModalVisible, setQuitModalVisible] = useState(false);
  const [isQuitting, setIsQuitting] = useState(false);

  // --- Hooks temps réel
  const [groupHelps, loadingGroupHelps] = useRealtimeGroupHelps(groupId, user?.id);
  const [myRequests, loadingMyRequests] = useRealtimeMyGroupHelps(groupId, user?.id);

  // --- Modale création demande
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);

  // Création d'une demande d'aide
  const handleCreateHelp = async (payload) => {
    setLoadingCreate(true);
    try {
      // await createGroupHelp({ ...payload, groupId, userId: user.id, apelido: user.apelido });
      setShowCreateModal(false);
      Toast.show({ type: "success", text1: "Pedido criado com sucesso!" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao criar pedido", text2: e.message });
    }
    setLoadingCreate(false);
  };

  // Handler QUITTER
  const handleQuit = async () => {
    try {
      setIsQuitting(true);
      await leaveGroup({ groupId, userId: user.id, apelido: user.apelido });
      setGroupId(null);
      setQuitModalVisible(false);
      Vibration.vibrate([0, 60, 60, 60]);
      setTimeout(() => {
        router.replace({ pathname: "/(tabs)/home", params: { quitGroup: grupo?.name || "" } });
      }, 200);
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao sair", text2: e.message });
      Vibration.vibrate([0, 100, 50, 100]);
    } finally {
      setIsQuitting(false);
    }
  };

  if (user === undefined)
    return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;
  if (!user)
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  if (loading || !grupo) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }
  if (!loading && !grupo) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#181A20" }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.noGroupContainer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Feather name="alert-triangle" size={42} color="#FFD600" style={{ marginBottom: 14 }} />
            <Text style={styles.noGroupTitle}>Você não está em nenhum grupo</Text>
            <Text style={styles.noGroupText}>
              Você ainda não está vinculado a um grupo de vizinhos do seu CEP.{"\n\n"}
              Para criar um novo grupo, volte à página inicial et clique no botão{" "}
              <Text style={{ color: "#4F8DFF", fontWeight: "bold" }}>Criar novo grupo com seu CEP</Text>.
            </Text>
            <TouchableOpacity style={styles.goHomeBtn} onPress={() => router.replace("/(tabs)/home")} activeOpacity={0.87}>
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

  // Calcul du nom créateur
  let criador = "Desconhecido";
  if (grupo && user) {
    criador =
      grupo.creatorUserId === user.uid
        ? user.apelido || user.username || "Você"
        : grupo.creatorNome || grupo.creatorApelido || "Desconhecido";
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#181A20" }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* --- INFOS GROUPE --- */}
          <View style={styles.header}>
            <Text style={styles.groupName}>{grupo?.name || ""}</Text>
          </View>
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Feather name="users" size={20} color="#00C859" />
              <Text style={styles.infoText}>
                <Text style={{ color: "#00C859", fontWeight: "bold", fontSize: 19 }}>
                  {grupo?.members?.length || 1} / {grupo?.maxMembers || 30}
                </Text>{" "}
                vizinhos
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Feather name="user-check" size={20} color="#00C859" />
              <Text style={[styles.infoText, { color: "#00C859", fontWeight: "bold" }]}>
                Criador: <Text style={{ color: "#fff", fontWeight: "bold" }}>{criador}</Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Feather name="map-pin" size={19} color="#00C859" />
              <Text style={[styles.infoText, { color: "#00C859", fontWeight: "bold" }]}>
                CEP: <Text style={{ color: "#fff", fontWeight: "bold" }}>{grupo?.cep || ""}</Text>
              </Text>
            </View>
          </View>

          {/* --- BOUTON SAIR DO GRUPO juste SOUS la card groupe --- */}
          <View style={styles.quitBtnWrapper}>
            <TouchableOpacity
              style={styles.quitBtn}
              onPress={() => setQuitModalVisible(true)}
              activeOpacity={0.87}
              disabled={isQuitting}
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
                {isQuitting ? "Saindo..." : "Sair do grupo"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* --- BOUTON PEDIR AJUDA --- */}
          <TouchableOpacity
            style={styles.btnCreate}
            onPress={() => setShowCreateModal(true)}
            activeOpacity={0.88}
          >
            <Feather name="plus-circle" size={22} color="#FFD600" style={{ marginRight: 9 }} />
            <Text style={styles.btnCreateText}>Nova demanda</Text>
          </TouchableOpacity>

          {/* --- TES DEMANDES (“Minhas demandas”) --- */}
          <Text style={styles.sectionTitle}>Minhas demandas</Text>
          <View style={styles.sectionBox}>
            {loadingMyRequests ? (
              <ActivityIndicator color="#FFD600" style={{ marginTop: 12 }} />
            ) : myRequests.length === 0 ? (
              <Text style={styles.emptyText}>Você não fez nenhum pedido ainda.</Text>
            ) : (
              myRequests.map((demanda, idx) => (
                <CardHelpRequest
                  key={demanda.id}
                  demanda={demanda}
                  badgeId={demanda.badgeId}
                  numPedido={idx + 1}
                  isMine={true}
                  showAccept={false}
                  showHide={true}
                  onAccept={() => acceptGroupHelp({ demandaId: demanda.id, acceptedById: user.id, acceptedByApelido: user.apelido })}
                  onHide={() => hideGroupHelpForUser(demanda.id, user.id)}
                />
              ))
            )}
          </View>

          {/* --- DEMANDES DU GROUPE (“Demandas do grupo”) --- */}
          <Text style={styles.sectionTitle}>Demandas do grupo</Text>
          <View style={styles.sectionBox}>
            {loadingGroupHelps ? (
              <ActivityIndicator color="#FFD600" style={{ marginTop: 12 }} />
            ) : groupHelps.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma demanda disponível.</Text>
            ) : (
              groupHelps.map((demanda, idx) => (
                <CardHelpRequest
                  key={demanda.id}
                  demanda={demanda}
                  badgeId={demanda.badgeId}
                  numPedido={idx + 1}
                  isMine={demanda.userId === user.id}
                  showAccept={demanda.userId !== user.id}
                  showHide={demanda.userId !== user.id}
                  onAccept={() => acceptGroupHelp({ demandaId: demanda.id, acceptedById: user.id, acceptedByApelido: user.apelido })}
                  onHide={() => hideGroupHelpForUser(demanda.id, user.id)}
                />
              ))
            )}
          </View>

          {/* --- MODALE CRÉER DEMANDE --- */}
          <CreateHelpModal
            visible={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateHelp}
            loading={loadingCreate}
          />

          {/* --- MODALE QUITTER GROUPE --- */}
          <QuitGroupModal
            visible={quitModalVisible}
            groupName={grupo?.name || ""}
            onConfirm={handleQuit}
            onCancel={() => setQuitModalVisible(false)}
            loading={isQuitting}
          />
        </ScrollView>
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
    marginTop: 2,
    marginBottom: 16,
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
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#181A20"
  },
  btnCreate: {
    flexDirection: "row", alignItems: "center", alignSelf: "center", backgroundColor: "#22242D",
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 19, marginBottom: 8, marginTop: 4,
    borderWidth: 2, borderColor: "#FFD600", shadowColor: "#FFD600", shadowOpacity: 0.06, shadowRadius: 9,
  },
  btnCreateText: {
    color: "#FFD600", fontWeight: "bold", fontSize: 16.3, marginLeft: 9, letterSpacing: 0.13,
  },
  sectionTitle: {
    color: "#FFD600", fontWeight: "bold", fontSize: 21, textAlign: "center",
    marginTop: 23, marginBottom: 9, letterSpacing: 0.4,
  },
  sectionBox: {
    backgroundColor: "#13151A", borderRadius: 14, padding: 12, marginBottom: 10,
  },
  emptyText: {
    color: "#888", textAlign: "center", marginVertical: 14, fontSize: 16, fontStyle: "italic",
  },
});
