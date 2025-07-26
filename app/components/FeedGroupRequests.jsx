import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Dimensions,
  TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator, Animated, PanResponder
} from "react-native";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useUserStore } from "../../store/users";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

const CARD_WIDTH = Dimensions.get("window").width * 0.82;

// ----------- Helper
function formatDateBr(date) {
  if (!date) return "...";
  const d = typeof date === "number"
    ? new Date(date * 1000)
    : date?.seconds
      ? new Date(date.seconds * 1000)
      : new Date(date);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ----------- Main
export default function FeedGroupRequestsHorizontal({ groupId }) {
  const { user } = useUserStore();
  const userId = user?.id || user?.uid;
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pour gérer les swipes (suppression locale)
  const [swipedIds, setSwipedIds] = useState([]);
  // Pour masquer (soft hide ré-affichable)
  const [hiddenIds, setHiddenIds] = useState([]);
  // Modal édition
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editDemanda, setEditDemanda] = useState(null);
  const [editText, setEditText] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // --- Firestore écoute
  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    const q = query(
      collection(db, "groupHelps"),
      where("groupId", "==", groupId),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(arr);
      setLoading(false);
    });
    return () => unsub();
  }, [groupId]);

  // --- Actions
  async function handleEditar(demanda) {
    setEditDemanda(demanda);
    setEditText(demanda.description || demanda.message || "");
    setEditModalVisible(true);
  }
  async function saveEdit() {
    if (!editDemanda || !editText.trim()) return;
    setEditLoading(true);
    try {
      await updateDoc(doc(db, "groupHelps", editDemanda.id), {
        description: editText.trim(),
        updatedAt: new Date(),
      });
      setEditModalVisible(false);
      Toast.show({ type: "success", text1: "Demanda modificada!" });
    } catch (err) {
      Toast.show({ type: "error", text1: "Erro ao editar", text2: err.message });
    }
    setEditLoading(false);
  }
  async function handleCancelar(demanda) {
    Alert.alert(
      "Cancelar demanda",
      "Você realmente deseja cancelar esta demanda?",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "groupHelps", demanda.id), {
                status: "fechada",
                canceledAt: new Date(),
              });
              Toast.show({ type: "success", text1: "Demanda cancelada!" });
            } catch (err) {
              Toast.show({ type: "error", text1: "Erro ao cancelar", text2: err.message });
            }
          }
        }
      ]
    );
  }
  async function handleAceitar(demanda) {
    Alert.alert(
      "Aceitar demanda",
      "Você quer aceitar e ajudar nesta demanda?",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "groupHelps", demanda.id), {
                status: "em andamento",
                ajudanteId: userId,
                ajudanteApelido: user?.apelido || "",
                acceptedAt: new Date(),
              });
              Toast.show({
                type: "success",
                text1: "Demanda aceita! Parabéns pela solidariedade.",
              });
            } catch (err) {
              Toast.show({ type: "error", text1: "Erro ao aceitar", text2: err.message });
            }
          }
        }
      ]
    );
  }

  // --- Séparation des demandes
  const myRequests = requests.filter(r => r.userId === userId);
  // “Demandas do grupo” = toutes sauf celles swipées ou masquées par bouton
  const demandasGrupo = requests.filter(
    r => !swipedIds.includes(r.id) && !hiddenIds.includes(r.id)
  );

  // --- Scroll horizontal avec gestion du swipe
  function CardHelpRequest({
    data, numero, isMine, onEdit, onCancel, onAccept, onSwipe, onHide, isHidden
  }) {
    // Swipe Tinder
    const pan = useRef(new Animated.ValueXY()).current;
    const [isSwiped, setIsSwiped] = useState(false);

    const panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 14,
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -CARD_WIDTH * 0.3) {
          // Swipe gauche => suppression locale
          Animated.timing(pan, {
            toValue: { x: -CARD_WIDTH * 1.5, y: 0 },
            duration: 180,
            useNativeDriver: false,
          }).start(() => {
            pan.setValue({ x: 0, y: 0 });
            setIsSwiped(true);
            onSwipe && onSwipe(data.id);
          });
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    });

    if (isHidden || isSwiped) return null;

    return (
      <Animated.View
        style={[styles.card, isMine && styles.mineCard, data.status === "fechada" && styles.closedCard, pan.getLayout()]}
        {...(!isMine ? panResponder.panHandlers : {})}
      >
        <View style={styles.cardNumero}>
          <Text style={styles.cardNumeroText}>#{numero}</Text>
        </View>
        <Text style={styles.cardDesc}>{data.message || data.description}</Text>
        <Text style={styles.cardUser}>
          por {data.apelido || (isMine ? "Você" : "Usuário")} — {formatDateBr(data.createdAt)}
        </Text>
        <Text style={[
          styles.status,
          data.status === "open"
            ? styles.statusAberta
            : data.status === "em andamento"
            ? styles.statusAndamento
            : styles.statusFechada
        ]}>
          {data.status === "open"
            ? "Aberta"
            : data.status === "em andamento"
            ? "Em andamento"
            : "Fechada"}
        </Text>
        <View style={styles.cardBtns}>
          {isMine ? (
            <>
              <TouchableOpacity onPress={() => onEdit(data)} style={styles.btnEditar}>
                <Feather name="edit-2" size={16} color="#FFD600" />
                <Text style={styles.btnEditarText}>Modificar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onCancel(data)} style={styles.btnCancelar}>
                <MaterialIcons name="cancel" size={18} color="#FF4D4F" />
                <Text style={styles.btnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {data.status === "open" && (
                <TouchableOpacity onPress={() => onAccept(data)} style={styles.btnAceitar}>
                  <Feather name="check-circle" size={16} color="#fff" />
                  <Text style={styles.btnAceitarText}>Aceitar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.btnMasquer}
                onPress={() => onHide(data.id)}
              >
                <Feather name="eye-off" size={16} color="#FFD600" />
                <Text style={styles.btnMasquerText}>Masquer</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Animated.View>
    );
  }

  if (loading) return <Text style={styles.empty}>Carregando...</Text>;
  if (!requests.length) return <Text style={styles.empty}>Nenhuma demanda disponível hoje.</Text>;

  return (
    <View style={{ marginBottom: 28 }}>
      {/* Minhas demandas */}
      {myRequests.length > 0 && (
        <View style={styles.mineBox}>
          <Text style={styles.sectionTitle}>Minhas demandas do grupo</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
            {myRequests.map((r, idx) => (
              <CardHelpRequest
                key={r.id}
                data={r}
                numero={idx + 1}
                isMine={true}
                onEdit={handleEditar}
                onCancel={handleCancelar}
              />
            ))}
          </ScrollView>
        </View>
      )}
      {/* Demandas do grupo */}
      <View style={styles.feedBox}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.sectionTitle}>Demandas do grupo</Text>
          <View style={{ flexDirection: "row", gap: 7 }}>
            {/* Bouton tout masquer */}
            {demandasGrupo.length > 0 && (
              <TouchableOpacity
                style={styles.hideAllBtn}
                onPress={() => setHiddenIds(demandasGrupo.map(d => d.id))}
              >
                <Feather name="eye-off" size={16} color="#FFD600" />
                <Text style={styles.hideAllBtnText}>Tout masquer</Text>
              </TouchableOpacity>
            )}
            {/* Afficher demandes masquées */}
            {hiddenIds.length > 0 && (
              <TouchableOpacity
                style={styles.showHiddenBtn}
                onPress={() => setHiddenIds([])}
              >
                <Feather name="eye" size={16} color="#00C859" />
                <Text style={styles.showHiddenBtnText}>Afficher masquées</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
          {demandasGrupo.map((r, idx) => (
            <CardHelpRequest
              key={r.id}
              data={r}
              numero={idx + 1}
              isMine={r.userId === userId}
              onEdit={handleEditar}
              onCancel={handleCancelar}
              onAccept={handleAceitar}
              onSwipe={id => setSwipedIds(ids => [...ids, id])}
              onHide={id => setHiddenIds(ids => [...ids, id])}
              isHidden={hiddenIds.includes(r.id)}
            />
          ))}
        </ScrollView>
      </View>

      {/* --- MODAL MODIFIER --- */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Modificar demanda</Text>
            <TextInput
              style={styles.modalInput}
              multiline
              minHeight={60}
              value={editText}
              onChangeText={setEditText}
              maxLength={200}
              placeholder="Descreva sua necessidade..."
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setEditModalVisible(false)}
                disabled={editLoading}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnSave}
                onPress={saveEdit}
                disabled={editLoading || !editText.trim()}
              >
                {editLoading
                  ? <ActivityIndicator color="#fff" size={18} />
                  : <Text style={styles.modalBtnSaveText}>Salvar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: "#FFD600",
    textAlign: "center",
    marginTop: 18,
    fontSize: 15,
    fontWeight: "bold",
    opacity: 0.75,
  },
  sectionTitle: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 19,
    textAlign: "center",
    marginVertical: 13,
    letterSpacing: 0.12,
  },
  mineBox: {
    marginBottom: 24,
    backgroundColor: "#1B3734",
    borderRadius: 14,
    padding: 7,
    shadowColor: "#FFD600",
    shadowOpacity: 0.06,
    shadowRadius: 7,
    elevation: 2,
  },
  feedBox: {
    backgroundColor: "#222A31",
    borderRadius: 14,
    padding: 7,
    shadowColor: "#00C859",
    shadowOpacity: 0.04,
    shadowRadius: 7,
    elevation: 2,
    marginBottom: 8,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: "#23262F",
    borderRadius: 16,
    padding: 15,
    marginVertical: 8,
    marginHorizontal: 7,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
    minHeight: 150,
  },
  mineCard: {
    borderWidth: 2,
    borderColor: "#FFD600",
  },
  closedCard: {
    opacity: 0.65,
    backgroundColor: "#2d2830",
  },
  cardDesc: { color: "#fff", fontSize: 15.5, fontWeight: "bold" },
  cardUser: { color: "#bbb", fontSize: 12.5, marginTop: 4 },
  cardNumero: {
    position: "absolute",
    left: 10,
    top: 9,
    backgroundColor: "#FFD600",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    zIndex: 10,
  },
  cardNumeroText: {
    color: "#181A20",
    fontWeight: "bold",
    fontSize: 12.5,
    letterSpacing: 0.1,
  },
  status: {
    marginTop: 5,
    marginBottom: 3,
    fontWeight: "bold",
    fontSize: 13,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 9,
    overflow: "hidden",
  },
  statusAberta: {
    color: "#1d7102",
    backgroundColor: "#d2ffda",
  },
  statusFechada: {
    color: "#969696",
    backgroundColor: "#eeeeee",
  },
  statusAndamento: {
    color: "#228abb",
    backgroundColor: "#e0f0fc",
  },
  cardBtns: {
    flexDirection: "row",
    marginTop: 10,
    gap: 12,
    flexWrap: "wrap",
  },
  btnEditar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: "#292A1F",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#FFD600",
    marginRight: 7,
  },
  btnEditarText: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 14,
    marginLeft: 6,
  },
  btnCancelar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: "#2A181B",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#FF4D4F",
  },
  btnCancelarText: {
    color: "#FF4D4F",
    fontWeight: "bold",
    fontSize: 14,
    marginLeft: 6,
  },
  btnAceitar: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "#00C859",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 9,
    shadowColor: "#00C859",
    shadowOpacity: 0.07,
    elevation: 2,
    marginRight: 6,
  },
  btnAceitarText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
    marginLeft: 5,
  },
  btnMasquer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#23262F",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#FFD600",
  },
  btnMasquerText: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 13,
    marginLeft: 6,
  },
  hideAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#181A20",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#FFD600",
    marginRight: 3,
  },
  hideAllBtnText: {
    color: "#FFD600",
    fontWeight: "600",
    fontSize: 13,
    marginLeft: 6,
  },
  showHiddenBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#181A20",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#00C859",
  },
  showHiddenBtnText: {
    color: "#00C859",
    fontWeight: "600",
    fontSize: 13,
    marginLeft: 6,
  },
  // ---- Modal Edition ----
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "87%",
    backgroundColor: "#222A31",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 18,
    marginBottom: 14,
    textAlign: "center",
  },
  modalInput: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 9,
    padding: 12,
    fontSize: 15.5,
    color: "#181A20",
    marginBottom: 17,
    minHeight: 58,
    textAlignVertical: "top",
  },
  modalBtns: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  modalBtnCancel: {
    backgroundColor: "#222A31",
    borderWidth: 1,
    borderColor: "#FFD600",
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 25,
    marginRight: 8,
  },
  modalBtnCancelText: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 15,
  },
  modalBtnSave: {
    backgroundColor: "#FFD600",
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 29,
  },
  modalBtnSaveText: {
    color: "#222A31",
    fontWeight: "bold",
    fontSize: 15,
  },
});
