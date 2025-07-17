import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useUserStore } from '../store/users';
import { useGrupoDetails } from '../hooks/useGrupoDetails';
import { useRouter } from 'expo-router';

export default function ReportHelpScreen() {
  const router = useRouter();
  const { user, groupId } = useUserStore();
  useGrupoDetails(groupId);

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return Alert.alert('Descreva seu pedido.');
    setLoading(true);
    try {
      await addDoc(collection(db, "groupHelps"), {
        groupId,
        userId: auth.currentUser?.uid,
        apelido: user?.apelido || '',
        message,
        createdAt: serverTimestamp(),
        status: "open"
      });
      Alert.alert("Pedido enviado!", "Seu pedido de ajuda foi enviado ao grupo.");
      router.replace('/(tabs)/vizinhos');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
    setLoading(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Text style={styles.title}>🤝 Demander de l’aide à vos voisins</Text>
        <Text style={styles.desc}>
          Précisez clairement ce dont vous avez besoin (ex : “J’ai besoin d’aide pour porter un meuble demain matin” ou “Quelqu’un a une perceuse à prêter ?”).
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Expliquez votre demande (obligatoire)"
          value={message}
          onChangeText={setMessage}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={loading}>
          <Text style={styles.sendBtnText}>Envoyer ma demande</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { paddingBottom: 36, backgroundColor: "#181A20" },
  container: { padding: 22, flex: 1, backgroundColor: "#181A20" },
  title: { fontSize: 21, fontWeight: "bold", marginBottom: 15, color: '#fff', marginTop: 9 },
  desc: { color: "#eee", fontSize: 14, marginBottom: 18 },
  input: { borderWidth: 1, borderColor: "#353840", backgroundColor: "#222", color: "#fff", padding: 13, borderRadius: 8, marginBottom: 15 },
  sendBtn: { backgroundColor: "#36C5FF", borderRadius: 10, padding: 15, alignItems: "center", marginTop: 5 },
  sendBtnText: { color: "#fff", fontWeight: "bold", fontSize: 17 }
});
