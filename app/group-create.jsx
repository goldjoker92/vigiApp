import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Vibration, KeyboardAvoidingView, Platform } from "react-native";
import { useUserStore } from "../store/users";
import { createGroup } from "../services/groupService";
import Toast from 'react-native-toast-message';
import { PlusCircle } from "lucide-react-native";
import { useRouter } from 'expo-router';

export default function GroupCreateScreen() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { user, setGroupId } = useUserStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name) {
      Toast.show({ type: 'error', text1: "Informe o nome do grupo!" });
      Vibration.vibrate([0, 100, 50, 100]);
      return;
    }
    setLoading(true);
    try {
      const groupId = await createGroup({
        cep: user.cep,
        name,
        description,
        userId: user.id,
        apelido: user.apelido,
      });
      setGroupId(groupId);
      Toast.show({
        type: 'success',
        text1: "Grupo criado com sucesso!",
        text2: name,
      });
      Vibration.vibrate(60);
      setTimeout(() => {
        router.replace("/(tabs)/vizinhos");
      }, 1000); // Laisse le toast s'afficher avant redirect
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: "Erro ao criar grupo",
        text2: e.message,
      });
      Vibration.vibrate([0, 100, 50, 100]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={styles.container}>
        <Text style={styles.title}>Criar novo grupo</Text>
        <TextInput
          placeholder="Nome do grupo"
          placeholderTextColor="#aaa"
          value={name}
          onChangeText={setName}
          style={styles.input}
          editable={!loading}
        />
        <TextInput
          placeholder="Descrição (opcional)"
          placeholderTextColor="#aaa"
          value={description}
          onChangeText={setDescription}
          style={styles.input}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.5 }]}
          onPress={handleCreate}
          disabled={loading}
        >
          <PlusCircle color="#fff" size={22} style={{ marginRight: 6 }} />
          <Text style={styles.buttonText}>{loading ? "Criando..." : "Criar grupo"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#181A20", padding: 24, justifyContent: "center" },
  title: { color: "#00C859", fontSize: 27, marginBottom: 28, fontWeight: "bold", textAlign: 'center' },
  input: { backgroundColor: "#23262F", color: "#fff", borderRadius: 12, padding: 16, marginBottom: 18, fontSize: 16 },
  button: { flexDirection: "row", backgroundColor: "#22C55E", borderRadius: 12, padding: 16, alignItems: "center", justifyContent: "center", marginTop: 18, shadowColor: '#22C55E', shadowOpacity: 0.15, shadowRadius: 6, elevation: 2 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 17, marginLeft: 8 },
});
