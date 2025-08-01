import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useUserStore } from "../../store/users";
import CardHelpRequest from "./CardHelpRequest";
import Toast from "react-native-toast-message";
import CreateHelpModal from "./modals/CreateHelpModal";
import EditHelpModal from "./EditHelpModal";
import { useRouter } from "expo-router";

// --- Firestore natif ---
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../../firebase";

// -- Import Firestore helpers/services --
import {
  hideGroupHelpForUser,
  hideAllGroupHelpsForUser,
  cancelGroupHelp,
  updateGroupHelpMessage,
  createGroupHelp
} from "../../services/groupHelpService";
import { createChatOnAccept } from "../../utils/chatHelpers";

// Générateur d'ID badge unique
function generateRandomId(length = 4) {
  return Math.random().toString(36).substr(2, length).toUpperCase();
}

export default function FeedGroupRequestsContainer({ groupId }) {
  const { user } = useUserStore();
  const router = useRouter();

  // States
  const [myRequests, setMyRequests] = useState([]);
  const [groupRequests, setGroupRequests] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);

  // --- Récupération des demandes EN TEMPS REEL pour moi
  useEffect(() => {
    if (!user?.id || !groupId) return;
    const q = query(
      collection(db, "groupHelps"),
      where("groupId", "==", groupId),
      where("userId", "==", user.id),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyRequests(data);
      console.log("[MY REQUESTS]", data);
    });
    return () => unsub();
  }, [groupId, user?.id]);

  // --- Récupération demandes DU GROUPE EN TEMPS REEL (hors cachées/hors demandes de l'user)
  useEffect(() => {
    if (!user?.id || !groupId) return;
    const q = query(
      collection(db, "groupHelps"),
      where("groupId", "==", groupId),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      // N'affiche pas les demandes de l'user ni celles cachées par lui
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(demanda =>
          demanda.userId !== user.id &&
          !(demanda.hiddenFor && demanda.hiddenFor.includes(user.id))
        );
      setGroupRequests(data);
      console.log("[GROUP REQUESTS]", data);
    });
    return () => unsub();
  }, [groupId, user?.id]);

  // --- Création d'une demande d'aide ---
  const handleCreateHelp = async (payload) => {
    setLoadingCreate(true);
    try {
      const badgeId = generateRandomId(4);
      await createGroupHelp({
        groupId,
        userId: user.id,
        apelido: user.apelido,
        message: payload.message,
        isScheduled: !!payload.isScheduled,
        dateHelp: payload.dateHelp || null,
        badgeId,
      });
      setShowCreateModal(false);
      Toast.show({ type: "success", text1: "Pedido criado com sucesso!" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao criar pedido", text2: e.message });
    }
    setLoadingCreate(false);
  };

  // --- Edition ---
  const handleEditSave = async (newMsg) => {
    if (!editingRequest) return;
    try {
      await updateGroupHelpMessage(editingRequest.id, newMsg);
      Toast.show({ type: "success", text1: "Demanda atualizada!" });
      setEditModalVisible(false);
      setEditingRequest(null);
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao editar", text2: e.message });
    }
  };

  // --- Annulation ---
  const handleCancel = async (id) => {
    try {
      await cancelGroupHelp(id, user.id);
      Toast.show({ type: "success", text1: "Demanda cancelada!" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao cancelar", text2: e.message });
    }
  };

  // --- Acceptation (création du chat et ouverture de la page chat) ---
  const handleAccept = async (demanda) => {
    try {
      if (!user) throw new Error("Vous devez être connecté.");
      const chatId = await createChatOnAccept(demanda, user);
      Toast.show({ type: "success", text1: "Chat criado, redirecionando..." });
      router.push({ pathname: "/chat", params: { chatId } });
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao abrir chat", text2: e.message });
    }
  };

  // --- Cacher une demande ---
  const handleHide = async (id) => {
    try {
      await hideGroupHelpForUser(id, user.id);
      Toast.show({ type: "info", text1: "Demanda ocultada do seu feed!" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao ocultar", text2: e.message });
    }
  };

  // --- Cacher toutes les demandes du groupe ---
  const handleHideAll = async () => {
    try {
      await hideAllGroupHelpsForUser(groupId, user.id);
      Toast.show({ type: "info", text1: "Todas as demandas ocultadas!" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao ocultar todas", text2: e.message });
    }
  };

  // --- Refresh visuel (inutile, les listeners sont temps réel, mais pour pull-to-refresh UX) ---
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* --- Section création d'une nouvelle demande --- */}
      <Text style={styles.titleAjudar}>Ajudar</Text>
      <TouchableOpacity
        style={styles.btnCreate}
        onPress={() => setShowCreateModal(true)}
        activeOpacity={0.88}
      >
        <Feather name="plus-circle" size={22} color="#FFD600" style={{ marginRight: 9 }} />
        <Text style={styles.btnCreateText}>Nova demanda</Text>
      </TouchableOpacity>

      {/* --- Mes demandes (moi) --- */}
      <Text style={styles.sectionTitle}>Minhas demandas</Text>
      <View style={styles.sectionBox}>
        {myRequests.length === 0 ? (
          <Text style={styles.emptyText}>Você não fez nenhum pedido ainda.</Text>
        ) : (
          myRequests.map((demanda, idx) => (
            <CardHelpRequest
              key={demanda.id}
              demanda={demanda}
              badgeId={demanda.badgeId}
              numPedido={idx + 1}
              isMine
              onCancel={() => handleCancel(demanda.id)}
              onEdit={() => { setEditModalVisible(true); setEditingRequest(demanda); }}
            />
          ))
        )}
      </View>

      {/* --- Demandas du groupe --- */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Demandas do grupo</Text>
        {groupRequests.length > 0 && (
          <Text style={styles.hideAllBtn} onPress={handleHideAll}>
            Ocultar todas
          </Text>
        )}
      </View>
      <View style={styles.sectionBox}>
        {groupRequests.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma demanda disponível.</Text>
        ) : (
          groupRequests.map((demanda, idx) => (
            <CardHelpRequest
              key={demanda.id}
              demanda={demanda}
              badgeId={demanda.badgeId}
              numPedido={idx + 1}
              onAccept={() => handleAccept(demanda)}
              onHide={() => handleHide(demanda.id)}
              showAccept
              showHide
            />
          ))
        )}
      </View>

      {/* --- Modales --- */}
      <CreateHelpModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateHelp}
        loading={loadingCreate}
      />

      <EditHelpModal
        visible={editModalVisible}
        demanda={editingRequest}
        onClose={() => setEditModalVisible(false)}
        onSave={handleEditSave}
      />
    </ScrollView>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: { backgroundColor: "#181A20", flex: 1 },
  titleAjudar: {
    color: "#FFD600", fontWeight: "bold", fontSize: 25, textAlign: "center",
    marginTop: 17, marginBottom: 6, letterSpacing: 0.8,
  },
  btnCreate: {
    flexDirection: "row", alignItems: "center", alignSelf: "center", backgroundColor: "#22242D",
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 19, marginBottom: 8, marginTop: 10,
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
  sectionHeaderRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 12, marginBottom: 0, paddingRight: 16,
  },
  hideAllBtn: {
    color: "#FFD600", fontWeight: "bold", fontSize: 15, textDecorationLine: "underline",
    padding: 6, borderRadius: 9, overflow: "hidden",
  },
});
