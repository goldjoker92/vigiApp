import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Vibration, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
// Update the import path if the correct location is different, for example:
import { useUserStore } from "../store/users";
// Or, if your store is in a different folder, adjust accordingly:
// import { useUserStore } from "../../stores/users";
// import { useUserStore } from "../../store/userStore";
// Update the import path to match the actual location of groupService.js
import { createGroup } from "../services/groupService";
import Toast from 'react-native-toast-message';
import { PlusCircle } from "lucide-react-native";
import { useRouter } from 'expo-router';
// Update the import path below to the correct location of useAuthGuard in your project
import { useAuthGuard } from '../hooks/useAuthGuard';

export default function GroupCreateScreen() {
  const user = useAuthGuard();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { setGroupId } = useUserStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!user) return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;

  const handleCreate = async () => {
    if (!name) {
      Toast.show({ type: 'error', text1: "Informe o nome do grupo!" });
      Vibration.vibrate([0, 100, 50, 100]);
      return;
    }
    if (!user || !user.id || !user.apelido || !user.nome || !user.cpf || !user.cep) {
      Toast.show({ type: 'error', text1: "Perfil usuário incompleto!" });
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
        nome: user.nome,
        cpf: user.cpf,
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
      }, 1000);
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#181A20" }}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Criar novo grupo</Text>
        <View style={styles.form}>
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
            <Text style={styles.buttonText}>{loading ? "Criando..." : "Criar novo grupo"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: "#181A20",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: "#00C859",
    fontSize: 27,
    marginBottom: 28,
    fontWeight: "bold",
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  form: {
    width: "100%",
    maxWidth: 410,
    alignSelf: "center",
    alignItems: "center",
  },
  input: {
    width: "100%",
    backgroundColor: "#23262F",
    color: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    fontSize: 16,
  },
  button: {
    flexDirection: "row",
    backgroundColor: "#22C55E",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 6,
    marginBottom: 14,
    shadowColor: '#22C55E',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 17,
    marginLeft: 8,
  },
});
