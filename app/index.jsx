﻿import 'react-native-gesture-handler';

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "expo-router";
import { auth } from "../firebase";
import { loadUserProfile } from "../utils/loadUserProfile";
import { DEV_ACCOUNTS, DEV_PASSWORD } from "../src/dev/accounts";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [devIndex, setDevIndex] = useState(0);

  const handleLogin = async () => {
    try {
      const mail = email.trim();
      const pass = senha;
      if (!mail || !pass) {
        Alert.alert("Erro", "Preencha e-mail e senha.");
        return;
      }
      const cred = await signInWithEmailAndPassword(auth, mail, pass);
      await loadUserProfile(cred.user.uid);
      router.replace("/(tabs)/home");
      console.log("Instance Firebase Auth ID no componente:", auth?.app?.name);
    } catch (error) {
      Alert.alert("Erro", String(error?.message || error));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Image
            source={require("../assets/images/logoNameVigiApp.png")}
            style={styles.logo}
            resizeMode="contain"
          />

          <TextInput
            style={styles.input}
            placeholder="E-mail"
            placeholderTextColor="#7E8A9A"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="username"
          />

          <TextInput
            style={styles.input}
            placeholder="Senha"
            placeholderTextColor="#7E8A9A"
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            textContentType="password"
          />

          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Entrar</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/auth/signup")}>
            <Text style={styles.link}>
              NÃ£o tem conta? <Text style={styles.linkHighlight}>Cadastre-se</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {__DEV__ && (
        <TouchableOpacity
          onPress={() => {
            const next = (devIndex + 1) % DEV_ACCOUNTS.length;
            setDevIndex(next);
            setEmail(DEV_ACCOUNTS[next]);
            setSenha(DEV_PASSWORD);
          }}
          onLongPress={() => {
            setDevIndex(0);
            setEmail(DEV_ACCOUNTS[0]);
            setSenha(DEV_PASSWORD);
          }}
          style={styles.devBtn}
        >
          <Text style={styles.devBtnText}>DEV â€¢ {devIndex + 1}</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#181A20",
  },
  logo: {
    width: 400,
    height: 400,
    alignSelf: "center",
    marginBottom: 5,
  },
  input: {
    borderWidth: 0,
    backgroundColor: "#23262F",
    color: "#fff",
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 18 },
  link: { color: "#aaa", textAlign: "center", fontSize: 15 },
  linkHighlight: { color: "#00C859", fontWeight: "bold" },

  // Bouton DEV (overlay, seulement en __DEV__)
  devBtn: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: "#22C55E",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    elevation: 3,
  },
  devBtnText: { color: "#0b111a", fontWeight: "800" },
});
