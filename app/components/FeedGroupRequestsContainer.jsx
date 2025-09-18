import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useUserStore } from '../../store/users';
import CardHelpRequest from './CardHelpRequest';
import Toast from 'react-native-toast-message';
import CreateHelpModal from './modals/CreateHelpModal';
import ConfirmModal from './modals/ConfirmModal';
import { useRealtimeGroupHelps } from '../../hooks/useRealtimeGroupHelps';
import { createGroupHelp, proposeHelp, acceptHelp } from '../../services/groupHelpService';

// Générateur d'ID badge unique
function generateRandomId(length = 4) {
  return Math.random().toString(36).substr(2, length).toUpperCase();
}

export default function FeedGroupRequests({ groupId }) {
  const { user } = useUserStore();

  // Toutes les demandes du groupe
  const [groupHelps, loadingGroupHelps] = useRealtimeGroupHelps(groupId, user?.id);

  // Etats modales et loading
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [pendingVolunteer, setPendingVolunteer] = useState(null);
  const [loadingConfirm, setLoadingConfirm] = useState(false);

  // Refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  // Création de demande d'aide
  const handleCreateHelp = async (payload) => {
    setLoadingCreate(true);
    try {
      const badgeId = generateRandomId(4);
      const finalPayload = {
        ...payload,
        groupId,
        userId: user.id,
        apelido: user.apelido,
        badgeId,
      };
      console.log('[handleCreateHelp] PAYLOAD:', finalPayload);
      await createGroupHelp(finalPayload);
      setShowCreateModal(false);
      Toast.show({ type: 'success', text1: 'Pedido criado com sucesso!' });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erro ao criar pedido', text2: e.message });
      console.error('[handleCreateHelp] ERREUR', e);
    }
    setLoadingCreate(false);
  };

  // Quand un volontaire propose son aide
  const handleOfferHelp = async (demanda) => {
    try {
      await proposeHelp({
        demandaId: demanda.id,
        volunteerId: user.id,
        volunteerApelido: user.apelido,
      });
      Toast.show({ type: 'success', text1: 'Você se propôs para ajudar!' });
      console.log('[handleOfferHelp] Proposta enviada:', {
        demandaId: demanda.id,
        volunteerId: user.id,
        volunteerApelido: user.apelido,
      });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erro ao propor ajuda', text2: e.message });
      console.error('[handleOfferHelp] ERREUR', e);
    }
  };

  // Effet: ouvre la modale QUE chez le créateur si une demande a volunteerId
  useEffect(() => {
    if (!pendingVolunteer) {
      console.log('[MODALE] Rendu pour user.id:', user.id, '| apelido:', user.apelido);
      const mine = groupHelps.find((h) => h.userId === user.id && h.volunteerId);
      if (mine) {
        setPendingVolunteer(mine);
        console.log(
          '[useEffect] Modale ouverte chez le créateur, volunteer:',
          mine.volunteerApelido
        );
      }
    }
  }, [groupHelps, user.id, user.apelido, pendingVolunteer]);

  // Confirmation de l'aide par le créateur
  const handleConfirmHelp = async () => {
    if (!pendingVolunteer) {return;}
    setLoadingConfirm(true);
    try {
      await acceptHelp({
        demandaId: pendingVolunteer.id,
        volunteerId: pendingVolunteer.volunteerId,
      });
      Toast.show({ type: 'success', text1: 'Ajuda aceita!' });
      console.log(
        '[handleConfirmHelp] Ajuda aceita pour volunteer:',
        pendingVolunteer.volunteerApelido
      );
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Erro ao aceitar ajuda', text2: e.message });
      console.error('[handleConfirmHelp] ERREUR', e);
    }
    setLoadingConfirm(false);
    setPendingVolunteer(null);
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Bouton création */}
        <TouchableOpacity
          style={styles.btnCreate}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.88}
        >
          <Feather name="plus-circle" size={22} color="#FFD600" style={{ marginRight: 9 }} />
          <Text style={styles.btnCreateText}>Nova demanda</Text>
        </TouchableOpacity>

        {/* Liste demandes */}
        <Text style={styles.sectionTitle}>Demandas do grupo</Text>
        <View style={styles.sectionBox}>
          {loadingGroupHelps ? (
            <ActivityIndicator color="#FFD600" style={{ marginTop: 12 }} />
          ) : groupHelps.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma demanda disponível.</Text>
          ) : (
            groupHelps.map((demanda, idx) => {
              console.log('[AFFICHAGE DEMANDA]', demanda);
              return (
                <CardHelpRequest
                  key={demanda.id}
                  demanda={demanda}
                  badgeId={demanda.badgeId}
                  numPedido={idx + 1}
                  isMine={demanda.userId === user.id}
                  showAccept={demanda.userId !== user.id}
                  showHide={demanda.userId !== user.id}
                  onAccept={handleOfferHelp}
                  onHide={(d) => console.log('[Ocultar]', d.id)}
                />
              );
            })
          )}
        </View>

        {/* Modale création */}
        <CreateHelpModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateHelp}
          loading={loadingCreate}
        />
      </ScrollView>

      {/* Modale d'acceptation d'aide : ouverte UNIQUEMENT chez le créateur */}
      {pendingVolunteer && (
        <ConfirmModal
          title="Proposta de ajuda"
          visible={!!pendingVolunteer}
          description={`O vizinho ${pendingVolunteer.volunteerApelido} deseja ajudar você. Aceita a ajuda?`}
          loading={loadingConfirm}
          onConfirm={handleConfirmHelp}
          onCancel={() => setPendingVolunteer(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#181A20', flex: 1 },
  btnCreate: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#22242D',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 19,
    marginBottom: 8,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#FFD600',
    shadowColor: '#FFD600',
    shadowOpacity: 0.06,
    shadowRadius: 9,
  },
  btnCreateText: {
    color: '#FFD600',
    fontWeight: 'bold',
    fontSize: 16.3,
    marginLeft: 9,
    letterSpacing: 0.13,
  },
  sectionTitle: {
    color: '#FFD600',
    fontWeight: 'bold',
    fontSize: 21,
    textAlign: 'center',
    marginTop: 18,
    marginBottom: 9,
    letterSpacing: 0.4,
  },
  sectionBox: {
    backgroundColor: '#13151A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    marginVertical: 14,
    fontSize: 16,
    fontStyle: 'italic',
  },
});
