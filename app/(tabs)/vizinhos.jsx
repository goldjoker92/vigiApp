import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, SafeAreaView, ScrollView, Dimensions, Platform } from "react-native";
import { MaterialIcons, Feather } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useUserStore } from "../../store/users";
import { useGrupoDetails } from "../../hooks/useGrupoDetails";
import { useRealtimeGroupHelps } from "../../hooks/useRealtimeGroupHelps";
import { leaveGroup } from "../../services/groupService";
import QuitGroupModal from "../components/QuitGroupModal";
import CardHelpRequest from "../components/CardHelpRequest";
import CreateHelpModal from "../components/modals/CreateHelpModal";
import ConfirmModal from "../components/modals/ConfirmModal"; // >>> AJOUT import modal confirmation
import { createGroupHelp, acceptHelpDemand } from "../../services/groupHelpService"; // >>> AJOUT import acceptHelpDemand
import { useRouter } from "expo-router";

const SCREEN_HEIGHT = Dimensions.get("window").height;

function generateRandomId(length = 4) {
  return Math.random().toString(36).substr(2, length).toUpperCase();
}

export default function VizinhosScreen() {
  const { groupId, setGroupId } = useUserStore();
  const user = useUserStore(state => state.user);
  const { grupo, loading } = useGrupoDetails(groupId);
  const [quitModalVisible, setQuitModalVisible] = useState(false);
  const [isQuitting, setIsQuitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const router = useRouter();

  const [groupHelps, loadingGroupHelps] = useRealtimeGroupHelps(groupId);

  const minhasDemandas = groupHelps.filter(d => d.userId === user?.id);
  const demandasGrupo = groupHelps.filter(d => d.userId !== user?.id);

  // >>> AJOUT états modale confirmation acceptation
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [selectedDemanda, setSelectedDemanda] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Créer une nouvelle demande d'aide
  const handleCreateHelp = async (payload) => {
    setLoadingCreate(true);
    try {
      const badgeId = generateRandomId(4);
      await createGroupHelp({
        ...payload,
        groupId,
        userId: user.id,
        apelido: user.apelido,
        badgeId,
      });
      setShowCreateModal(false);
      Toast.show({ type: "success", text1: "Pedido criado com sucesso!" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao criar pedido", text2: e.message });
      console.error("[handleCreateHelp] ERREUR", e);
    }
    setLoadingCreate(false);
  };

  // Quitter le groupe
  const handleQuit = async () => {
    try {
      setIsQuitting(true);
      await leaveGroup({ groupId, userId: user.id, apelido: user.apelido });
      setGroupId(null);
      setQuitModalVisible(false);
      setTimeout(() => {
        router.replace({ pathname: "/(tabs)/home", params: { quitGroup: grupo?.name || "" } });
      }, 200);
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao sair", text2: e.message });
    } finally {
      setIsQuitting(false);
    }
  };

  // >>> AJOUT : ouverture modale confirmation
  function onAcceptPress(demanda) {
    setSelectedDemanda(demanda);
    setConfirmModalVisible(true);
  }

  // >>> AJOUT : confirmer acceptation
  async function handleConfirmAccept() {
    if (!selectedDemanda) return;
    setConfirmLoading(true);
    try {
      await acceptHelpDemand(selectedDemanda.id, user.id);
      Toast.show({ type: "success", text1: `Você aceitou ajudar ${selectedDemanda.apelido}` });
      setConfirmModalVisible(false);
      setSelectedDemanda(null);
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao aceitar", text2: e.message });
      console.error(e);
    }
    setConfirmLoading(false);
  }

  // >>> AJOUT : annuler la modale
  function handleCancelAccept() {
    setConfirmModalVisible(false);
    setSelectedDemanda(null);
  }

  if (user === undefined) return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;
  if (!user) return <View style={styles.centered}><ActivityIndicator color="#22C55E" size="large" /></View>;
  if (loading || !grupo) return <View style={styles.centered}><ActivityIndicator color="#22C55E" size="large" /></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#181A20" }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* --- Infos groupe --- */}
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
                Criador: <Text style={{ color: "#fff", fontWeight: "bold" }}>{grupo?.creatorApelido || "Desconhecido"}</Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Feather name="map-pin" size={19} color="#00C859" />
              <Text style={[styles.infoText, { color: "#00C859", fontWeight: "bold" }]}>
                CEP: <Text style={{ color: "#fff", fontWeight: "bold" }}>{grupo?.cep || ""}</Text>
              </Text>
            </View>
          </View>

          {/* --- Bouton quitter groupe --- */}
          <View style={styles.quitBtnWrapper}>
            <TouchableOpacity style={styles.quitBtn} onPress={() => setQuitModalVisible(true)} activeOpacity={0.87} disabled={isQuitting}>
              <MaterialIcons name="logout" size={21} color="#FFD600" style={{ marginRight: 11 }} />
              <Text style={styles.quitBtnText}>{isQuitting ? "Saindo..." : "Sair do grupo"}</Text>
            </TouchableOpacity>
          </View>

          {/* --- Bouton créer une demande --- */}
          <TouchableOpacity style={styles.btnCreate} onPress={() => setShowCreateModal(true)} activeOpacity={0.88}>
            <Feather name="plus-circle" size={22} color="#FFD600" style={{ marginRight: 9 }} />
            <Text style={styles.btnCreateText}>Nova demanda</Text>
          </TouchableOpacity>

          {/* --- Mes demandes --- */}
          <Text style={styles.sectionTitle}>Minhas demandas</Text>
          <View style={styles.sectionBox}>
            {loadingGroupHelps ? (
              <ActivityIndicator color="#FFD600" style={{ marginTop: 12 }} />
            ) : minhasDemandas.length === 0 ? (
              <Text style={styles.emptyText}>Você não fez nenhum pedido ainda.</Text>
            ) : (
              minhasDemandas.map((demanda, idx) => (
                <CardHelpRequest
                  key={demanda.id}
                  demanda={demanda}
                  badgeId={demanda.badgeId}
                  numPedido={idx + 1}
                  isMine={true}
                  showAccept={false}
                  showHide={true}
                />
              ))
            )}
          </View>

          {/* --- Demandas do grupo --- */}
          <Text style={styles.sectionTitle}>Demandas do grupo</Text>
          <View style={styles.sectionBox}>
            {loadingGroupHelps ? (
              <ActivityIndicator color="#FFD600" style={{ marginTop: 12 }} />
            ) : demandasGrupo.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma demanda disponível.</Text>
            ) : (
              demandasGrupo.map((demanda, idx) => (
                <CardHelpRequest
                  key={demanda.id}
                  demanda={demanda}
                  badgeId={demanda.badgeId}
                  numPedido={idx + 1}
                  isMine={false}
                  showAccept={true}
                  showHide={true}
                  onAcceptPress={() => onAcceptPress(demanda)} // >>> AJOUT : passer la fonction à la carte
                />
              ))
            )}
          </View>

          {/* --- Modal créer demande --- */}
          <CreateHelpModal
            visible={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateHelp}
            loading={loadingCreate}
          />

          {/* --- Modal quitter groupe --- */}
          <QuitGroupModal
            visible={quitModalVisible}
            groupName={grupo?.name || ""}
            onConfirm={handleQuit}
            onCancel={() => setQuitModalVisible(false)}
            loading={isQuitting}
          />

          {/* --- Modal confirmation acceptation --- */}
          <ConfirmModal
            visible={confirmModalVisible}
            title="Aceitar ajuda"
            description={`O vizinho ${selectedDemanda?.apelido || ""} deseja ajudar você. Aceita a ajuda?`}
            confirmLabel="Sim"
            cancelLabel="Não"
            loading={confirmLoading}
            onConfirm={handleConfirmAccept}
            onCancel={handleCancelAccept}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 35, paddingBottom: 35, backgroundColor: "#181A20", minHeight: SCREEN_HEIGHT * 0.93 },
  header: { alignItems: "center", marginBottom: 12, marginTop: 0 },
  groupName: { color: "#00C859", fontWeight: "bold", fontSize: 30, marginTop: 0, textAlign: "center", letterSpacing: 1.1 },
  infoBox: { marginTop: 12, borderRadius: 15, backgroundColor: "#23262F", paddingVertical: 19, paddingHorizontal: 16, marginBottom: 15, alignItems: "flex-start" },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 13 },
  infoText: { color: "#eee", fontSize: 16.5, marginLeft: 10, fontWeight: "700" },
  quitBtnWrapper: { width: "100%", alignItems: "center", marginTop: 2, marginBottom: 16 },
  quitBtn: { backgroundColor: "#FF4D4F", borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, paddingHorizontal: 18, minWidth: 160, maxWidth: 280, width: "67%", alignSelf: "center", shadowColor: "#FF4D4F", shadowOpacity: 0.10, shadowRadius: 7 },
  quitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14, letterSpacing: 0.25, flexShrink: 1, includeFontPadding: false, textAlignVertical: "center" },
  btnCreate: { flexDirection: "row", alignItems: "center", alignSelf: "center", backgroundColor: "#22242D", paddingHorizontal: 18, paddingVertical: 9, borderRadius: 19, marginBottom: 8, marginTop: 4, borderWidth: 2, borderColor: "#FFD600", shadowColor: "#FFD600", shadowOpacity: 0.06, shadowRadius: 9 },
  btnCreateText: { color: "#FFD600", fontWeight: "bold", fontSize: 16.3, marginLeft: 9, letterSpacing: 0.13 },
  sectionTitle: { color: "#FFD600", fontWeight: "bold", fontSize: 21, textAlign: "center", marginTop: 23, marginBottom: 9, letterSpacing: 0.4 },
  sectionBox: { backgroundColor: "#13151A", borderRadius: 14, padding: 12, marginBottom: 10 },
  emptyText: { color: "#888", textAlign: "center", marginVertical: 14, fontSize: 16, fontStyle: "italic" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#181A20" }
});
