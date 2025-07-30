// src/components/FeedGroupRequestsContainer.jsx

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useUserStore } from "../../store/users";
import CardHelpRequest from "./CardHelpRequest";
import Toast from "react-native-toast-message";
import CreateHelpModal from "./modals/CreateHelpModal";
import EditHelpModal from "./EditHelpModal";
import { useRouter } from "expo-router";

// -- Import Firestore helpers/services --
import {
  getUserRequests,
  getGroupRequests,
  hideGroupHelpForUser,
  hideAllGroupHelpsForUser,
  cancelGroupHelp,
  updateGroupHelpMessage,
  createGroupHelp
} from "../../services/groupHelpService";

// -- Chat helper (Firestore) --
import { createChatOnAccept } from "../../utils/chatHelpers";

// -- Utilitaire pour badgeId random (4 lettres/chiffres) --
function generateRandomId(length = 4) {
  return Math.random().toString(36).substr(2, length).toUpperCase();
}

/**
 * Composant principal qui affiche les demandes d'aide (perso + groupe),
 * propose l'action de création, d'acceptation (qui ouvre le chat), d'édition et d'annulation.
 */
export default function FeedGroupRequestsContainer({ groupId }) {
  const { user } = useUserStore();
  const router = useRouter();

  // States pour les demandes
  const [myRequests, setMyRequests] = useState([]);
  const [groupRequests, setGroupRequests] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);

  // --- Récupération des données ---
  const fetchMyRequests = useCallback(async () => {
    if (!user?.id || !groupId) return;
    try {
      const data = await getUserRequests({ userId: user.id, groupId });
      setMyRequests(data || []);
    } catch {
      setMyRequests([]);
    }
  }, [user, groupId]);

  const fetchGroupRequests = useCallback(async () => {
    if (!groupId || !user?.id) return;
    try {
      const data = await getGroupRequests({ groupId, userId: user.id });
      setGroupRequests(data || []);
    } catch {
      setGroupRequests([]);
    }
  }, [groupId, user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchMyRequests(), fetchGroupRequests()]).finally(() =>
      setTimeout(() => setRefreshing(false), 500)
    );
  }, [fetchMyRequests, fetchGroupRequests]);

  useEffect(() => {
    fetchMyRequests();
    fetchGroupRequests();
  }, [groupId, user, fetchGroupRequests, fetchMyRequests]);

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
      onRefresh();
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
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao editar", text2: e.message });
    }
  };

  // --- Annulation ---
  const handleCancel = async (id) => {
    try {
      await cancelGroupHelp(id, user.id);
      Toast.show({ type: "success", text1: "Demanda cancelada!" });
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao cancelar", text2: e.message });
    }
  };

  // --- Acceptation (création du chat et ouverture de la page chat) ---
  const handleAccept = async (demanda) => {
    try {
      if (!user) throw new Error("Vous devez être connecté.");
      // Crée le chat Firestore et retourne l'id du chat
      const chatId = await createChatOnAccept(demanda, user);
      Toast.show({ type: "success", text1: "Chat criado, redirecionando..." });
      // Redirige vers la page chat
      router.push({ pathname: "/chat", params: { chatId } });
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao abrir chat", text2: e.message });
    }
  };

  // --- Cacher une demande ---
  const handleHide = async (id) => {
    try {
      await hideGroupHelpForUser(id, user.id);
      Toast.show({ type: "info", text1: "Demanda ocultada do seu feed!" });
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao ocultar", text2: e.message });
    }
  };

  // --- Cacher toutes les demandes ---
  const handleHideAll = async () => {
    try {
      await hideAllGroupHelpsForUser(groupId, user.id);
      Toast.show({ type: "info", text1: "Todas as demandas ocultadas!" });
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao ocultar todas", text2: e.message });
    }
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
