// src/screens/ChatScreen.jsx

import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, SafeAreaView } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native"; // ou useLocalSearchParams si expo-router
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useUserStore } from "../../store/users";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";

const BG_MY_MSG = "#232b37";
const BG_OTHER_MSG = "#13181F";
const COLOR_MY = "#B2EC6B";
const COLOR_OTHER = "#FFD600";
const COLOR_META = "#666";

function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return dayjs(date).format("HH:mm");
}

export default function ChatScreen() {
  // -- ID du chat Firestore passé via navigation params (expo-router: useLocalSearchParams) --
  const route = useRoute();
  const { chatId } = route.params ?? {}; // ou const { chatId } = useLocalSearchParams();

  const user = useUserStore(state => state.user);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);

  // -- Charger les messages en temps réel --
  useEffect(() => {
    if (!chatId) return;
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 120);
    });
    return () => unsub();
  }, [chatId]);

  // -- Envoyer un message --
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !user) return;
    setSending(true);
    try {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        text: input.trim(),
        senderId: user.uid,
        senderApelido: user.apelido || user.displayName || "Você",
        createdAt: serverTimestamp(),
        system: false,
      });
      setInput("");
    } catch (_) {
      // Toast ou Alerte ici si besoin
    }
    setSending(false);
  }, [input, user, chatId]);

  // -- Message render (bubble UX) --
  const renderMessage = ({ item }) => {
    const isMine = item.senderId === user?.uid;
    if (item.system) {
      // Message système
      return (
        <View style={styles.sysMsgRow}>
          <Text style={styles.sysMsgText}>{item.text}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.msgRow, isMine ? styles.right : styles.left]}>
        <View style={[styles.msgBubble, { backgroundColor: isMine ? BG_MY_MSG : BG_OTHER_MSG, borderColor: isMine ? COLOR_MY : COLOR_OTHER }]}>
          <Text style={[styles.sender, { color: isMine ? COLOR_MY : COLOR_OTHER }]}>
            {isMine ? "Você" : item.senderApelido}
          </Text>
          <Text style={styles.msgText}>{item.text}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{formatTime(item.createdAt)}</Text>
            {isMine && <MaterialCommunityIcons name="check-all" size={13} color={COLOR_MY} style={{ marginLeft: 5 }} />}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBack} onPress={() => route.params?.goBack ? route.params.goBack() : null}>
            <Feather name="arrow-left" size={22} color="#FFD600" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>VigiApp Chat</Text>
          <View style={{ width: 40 }} />
        </View>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        />
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            style={styles.input}
            placeholder="Escreva uma mensagem…"
            placeholderTextColor="#888"
            editable={!sending}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={!input.trim() || sending}>
            <Feather name="send" size={22} color="#FFD600" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- Styles : UI dark, woke, moderne, VigiApp branding ---
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#101218" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 17, paddingTop: 12, paddingBottom: 7, backgroundColor: "#181A20",
    borderBottomWidth: 0.5, borderColor: "#333", elevation: 3,
  },
  headerBack: { padding: 5, width: 40, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: {
    color: "#FFD600", fontSize: 19, fontWeight: "bold", letterSpacing: 1.1, flex: 1, textAlign: "center"
  },
  list: { padding: 14, paddingTop: 0, paddingBottom: 10 },
  msgRow: { flexDirection: "row", marginBottom: 14 },
  left: { justifyContent: "flex-start" },
  right: { justifyContent: "flex-end" },
  msgBubble: {
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 15, maxWidth: "79%",
    borderWidth: 1.4, shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 2 },
  },
  sender: { fontWeight: "bold", fontSize: 13.4, marginBottom: 2, letterSpacing: 0.07 },
  msgText: { fontSize: 16.1, color: "#fff", marginBottom: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  metaText: { color: COLOR_META, fontSize: 12, fontStyle: "italic" },
  sysMsgRow: { alignItems: "center", marginBottom: 11 },
  sysMsgText: { color: "#FFD600", backgroundColor: "#232b37", borderRadius: 9, paddingHorizontal: 11, paddingVertical: 4, fontStyle: "italic", fontSize: 13.5 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    borderTopWidth: 1, borderColor: "#232b37", backgroundColor: "#181A20",
    paddingHorizontal: 10, paddingVertical: 6, gap: 7
  },
  input: {
    flex: 1, height: 44, backgroundColor: "#232b37", color: "#FFD600",
    borderRadius: 10, paddingHorizontal: 14, fontSize: 15.8, marginRight: 3,
  },
  sendBtn: { padding: 8, borderRadius: 100, backgroundColor: "#232b37" },
});

