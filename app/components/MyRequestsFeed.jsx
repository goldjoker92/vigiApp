import React, { useEffect, useState } from "react";
import { View, ScrollView, Text, StyleSheet } from "react-native";
import CardHelpRequest from "./CardHelpRequest";
import { getUserRequests } from "../../services/groupHelpService";
import { useUserStore } from "../../store/users";

export default function MyRequestsFeed({ groupId }) {
  const { user } = useUserStore();
  const [myRequests, setMyRequests] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function fetch() {
      try {
        const data = await getUserRequests({ userId: user.id, groupId });
        if (mounted) setMyRequests(data);
      } catch (_) {
        setMyRequests([]);
      }
    }
    if (user?.id && groupId) fetch();
    return () => { mounted = false; };
  }, [user, groupId]);

  const handleEdit = (id) => alert("Modifier cette demande");
  const handleCancel = (id) => alert("Annuler cette demande");

  if (!myRequests.length)
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>Você não fez nenhum pedido ainda.</Text>
      </View>
    );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingBottom: 3 }}>
      {myRequests.map((req, idx) => (
        <CardHelpRequest
          key={req.id}
          apelido={req.apelido}
          motivo={req.message}
          tipoAjuda={req.isScheduled ? "agendada" : "rapido"}
          dataAgendada={req.isScheduled ? (req.dateHelp?.toDate ? req.dateHelp.toDate() : req.dateHelp) : null}
          status={req.status}
          createdAt={req.createdAt?.toDate ? req.createdAt.toDate() : req.createdAt}
          expiresAt={req.createdAt?.toDate ? req.createdAt.toDate() : req.createdAt}
          numPedido={idx + 1}
          isMine={true}
          onEdit={() => handleEdit(req.id)}
          onCancel={() => handleCancel(req.id)}
          showHideBtn={false} // Ne pas afficher masquer ici
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30 },
  emptyText: { color: "#FFD600", fontWeight: "600", fontSize: 16 },
});
