import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Handshake } from "lucide-react-native";
import Toast from "react-native-toast-message";
import { joinGroup } from "../../services/groupService";
import { useUserStore } from "../../store/users";

/**
 * Carousel horizontal des groupes disponibles à rejoindre
 * @param {object[]} groups - Liste des groupes à afficher
 * @param {boolean} loading - Indique si la liste est en chargement
 */
export function AvailableGroupsCarousel({ groups, loading }) {
  const user = useUserStore(s => s.user);
  const setGroupId = useUserStore(s => s.setGroupId);
  const [joiningId, setJoiningId] = useState(null);

  const handleJoin = async (group) => {
    setJoiningId(group.id);
    try {
      await joinGroup({ groupId: group.id, user });
      setGroupId(group.id);
      Toast.show({ type: "success", text1: `Entrou no grupo "${group.name}"!` });
    } catch (err) {
      Toast.show({ type: "error", text1: err.message });
    } finally {
      setJoiningId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.skeletonContainer}>
        <ActivityIndicator size="large" color="#00C859" />
      </View>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <View style={styles.infoBox}>
        <Text style={styles.noGroupText}>Ainda não há outros grupos no seu CEP.</Text>
      </View>
    );
  }

  return (
    <View style={styles.carouselWrapper}>
      <Text style={styles.title}>Grupos disponíveis</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
        {groups.map(group => (
          <View key={group.id} style={styles.card}>
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.creator}>
              Criador:{" "}
              <Text style={{ color: "#FFD600", fontWeight: "bold" }}>
                {group.creatorNome || group.creatorApelido || "Desconhecido"}
              </Text>
            </Text>
            <Text style={styles.membersCount}>{group.members?.length || 0} / {group.maxMembers || 30} vizinhos</Text>
            <TouchableOpacity
              style={styles.joinBtn}
              disabled={joiningId === group.id}
              onPress={() => handleJoin(group)}
            >
              <Handshake color="#fff" size={18} />
              <Text style={styles.joinBtnText}>
                {joiningId === group.id ? "Entrando..." : "Entrar no grupo"}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  carouselWrapper: { marginBottom: 30 },
  title: { color: "#fff", fontWeight: "bold", fontSize: 19, marginBottom: 10, marginLeft: 8 },
  horizontalList: { paddingLeft: 2, paddingRight: 10 },
  card: {
    backgroundColor: "#23262F",
    borderRadius: 14,
    padding: 16,
    width: 225,
    marginRight: 14,
    shadowColor: "#00C859",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  groupName: { color: "#fff", fontWeight: "bold", fontSize: 17, marginBottom: 7 },
  creator: { color: "#bbb", fontSize: 14, marginBottom: 5 },
  membersCount: { color: "#facc15", fontWeight: "bold", fontSize: 15, marginBottom: 9 },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#00C859",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignSelf: "flex-start",
    marginTop: 2,
    minWidth: 110,
    justifyContent: "center",
  },
  joinBtnText: { color: "#fff", fontWeight: "bold", marginLeft: 8, fontSize: 15 },
  infoBox: { backgroundColor: "#23262F", padding: 15, borderRadius: 11, alignItems: "center", marginTop: 10 },
  noGroupText: { color: "#bbb", fontSize: 15, textAlign: "center" },
  skeletonContainer: { height: 150, justifyContent: "center", alignItems: "center" },
});

export default AvailableGroupsCarousel;
