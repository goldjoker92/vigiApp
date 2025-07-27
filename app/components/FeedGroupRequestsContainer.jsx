import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useUserStore } from "../../store/users";
import { getUserRequests, getGroupRequests, hideGroupHelpForUser, hideAllGroupHelpsForUser, acceptGroupHelp, cancelGroupHelp, updateGroupHelp, createGroupHelp } from "../../services/groupHelpService";
import CardHelpRequest from "./CardHelpRequest";
import EditHelpModal from "../components/EditHelpModal";
import CreateHelpModal from "../components/modals/CreateHelpModal";
import ConfirmModal from "../components/modals/ConfirmModal";
import Coachmark from "../components/Coachmark";
import Toast from "react-native-toast-message";
import { Feather } from "@expo/vector-icons";

export default function FeedGroupRequestsContainer({ groupId }) {
  const { user } = useUserStore();
  const [myRequests, setMyRequests] = useState([]);
  const [groupRequests, setGroupRequests] = useState([]);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Nouveaux états modale création/confirmation
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [confirmCancelVisible, setConfirmCancelVisible] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);

  // --- Fetch mes demandes
  const fetchMyRequests = useCallback(async () => {
    if (!user?.id || !groupId) return;
    try {
      const data = await getUserRequests({ userId: user.id, groupId });
      setMyRequests(data || []);
      console.log("[MY REQUESTS]", data);
    } catch (e) {
      setMyRequests([]);
      console.log("[MY REQUESTS ERROR]", e);
    }
  }, [user, groupId]);

  // --- Fetch demandes groupe
  const fetchGroupRequests = useCallback(async () => {
    if (!groupId || !user?.id) return;
    try {
      const data = await getGroupRequests({ groupId, userId: user.id });
      setGroupRequests(data || []);
      console.log("[GROUP REQUESTS]", data);
    } catch (e) {
      setGroupRequests([]);
      console.log("[GROUP REQUESTS ERROR]", e);
    }
  }, [groupId, user]);

  // --- Refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchMyRequests(), fetchGroupRequests()]).finally(() =>
      setTimeout(() => setRefreshing(false), 500)
    );
  }, [fetchMyRequests, fetchGroupRequests]);

  // --- Initial fetch
  useEffect(() => {
    fetchMyRequests();
    fetchGroupRequests();
  }, [groupId, user, fetchGroupRequests, fetchMyRequests]);

  // --- Handlers ---
  const handleEdit = (demanda) => {
    setEditingRequest(demanda);
    setEditModalVisible(true);
  };

  const handleEditSave = async (newMsg) => {
    if (!editingRequest) return;
    try {
      await updateGroupHelp(editingRequest.id, { message: newMsg });
      Toast.show({ type: "success", text1: "Demanda atualizada!" });
      setEditModalVisible(false);
      setEditingRequest(null);
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao editar", text2: e.message });
    }
  };

  const handleCancel = (id) => {
    setCancelTarget(id);
    setConfirmCancelVisible(true);
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    try {
      await cancelGroupHelp(cancelTarget);
      Toast.show({ type: "success", text1: "Demanda cancelada!" });
      setConfirmCancelVisible(false);
      setCancelTarget(null);
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao cancelar", text2: e.message });
    }
  };

  const handleAccept = async (id) => {
    try {
      await acceptGroupHelp(id, user);
      Toast.show({ type: "success", text1: "Você aceitou ajudar!" });
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao aceitar", text2: e.message });
    }
  };

  const handleHide = async (id) => {
    try {
      await hideGroupHelpForUser(id, user.id);
      Toast.show({ type: "info", text1: "Demanda ocultada do seu feed!" });
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao ocultar", text2: e.message });
    }
  };

  const handleHideAll = async () => {
    try {
      await hideAllGroupHelpsForUser(groupId, user.id);
      Toast.show({ type: "info", text1: "Todas as demandas ocultadas!" });
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao ocultar todas", text2: e.message });
    }
  };

  // --- Création d'une nouvelle demande d'aide ---
  const handleCreateHelp = async (desc) => {
    try {
      await createGroupHelp({
        groupId,
        userId: user.id,
        apelido: user.apelido,
        message: desc,
        isScheduled: false, // ou ajoute le scheduling si tu veux
        dateHelp: null,
      });
      Toast.show({ type: "success", text1: "Demanda criada!" });
      setCreateModalVisible(false);
      onRefresh();
    } catch (e) {
      Toast.show({ type: "error", text1: "Erro ao criar demanda", text2: e.message });
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <Coachmark />

      {/* 1️⃣ — Bouton “Nova Demanda” */}
      <TouchableOpacity style={styles.novaBtn} onPress={() => setCreateModalVisible(true)} activeOpacity={0.86}>
        <Feather name="plus-circle" size={22} color="#FFD600" />
        <Text style={styles.novaBtnText}>Nova demanda</Text>
      </TouchableOpacity>

      {/* --- Minhas demandas --- */}
      <Text style={styles.sectionTitle}>Minhas demandas</Text>
      <View style={styles.sectionBox}>
        {myRequests.length === 0 ? (
          <Text style={styles.emptyText}>Você não fez nenhum pedido ainda.</Text>
        ) : (
          myRequests.map((demanda, idx) => (
            <CardHelpRequest
              key={demanda.id}
              demanda={demanda}
              numPedido={idx + 1}
              isMine
              onEdit={() => handleEdit(demanda)}
              onCancel={() => handleCancel(demanda.id)}
            />
          ))
        )}
      </View>

      {/* --- Demandas do grupo --- */}
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
              numPedido={idx + 1}
              onAccept={() => handleAccept(demanda.id)}
              onHide={() => handleHide(demanda.id)}
              showAccept
              showHide
            />
          ))
        )}
      </View>

      {/* --- MODALES --- */}
      <EditHelpModal
        visible={editModalVisible}
        demanda={editingRequest}
        onClose={() => setEditModalVisible(false)}
        onSave={handleEditSave}
      />
      <CreateHelpModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onCreate={handleCreateHelp}
      />
      <ConfirmModal
        visible={confirmCancelVisible}
        title="Cancelar pedido?"
        description="Tem certeza que deseja cancelar esta demanda de ajuda?"
        onCancel={() => setConfirmCancelVisible(false)}
        onConfirm={handleCancelConfirm}
        confirmLabel="Sim, cancelar"
        cancelLabel="Voltar"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#181A20",
    flex: 1,
  },
  novaBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#22242D",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 19,
    marginBottom: 8,
    marginTop: 10,
    borderWidth: 2,
    borderColor: "#FFD600",
    shadowColor: "#FFD600",
    shadowOpacity: 0.06,
    shadowRadius: 9,
  },
  novaBtnText: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 16.3,
    marginLeft: 9,
    letterSpacing: 0.13,
  },
  sectionTitle: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 21,
    textAlign: "center",
    marginTop: 18,
    marginBottom: 12,
    letterSpacing: 0.4,
  },
  sectionBox: {
    backgroundColor: "#13151A",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  emptyText: {
    color: "#888",
    textAlign: "center",
    marginVertical: 14,
    fontSize: 16,
    fontStyle: "italic",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 0,
    paddingRight: 16,
  },
  hideAllBtn: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 15,
    textDecorationLine: "underline",
    padding: 6,
    borderRadius: 9,
    overflow: "hidden",
  },
});
