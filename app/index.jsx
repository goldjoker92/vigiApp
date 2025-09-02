import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  Image, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "expo-router";
import { auth } from "../firebase";
import { loadUserProfile } from "../utils/loadUserProfile";
import { DEV_ACCOUNTS, DEV_PASSWORD } from "../src/dev/accounts";

// ✅ Force l'init native RNFirebase
import "@react-native-firebase/app";
import messaging from "@react-native-firebase/messaging";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [devIndex, setDevIndex] = useState(0);

  const getAndShowFcmToken = useCallback(async () => {
    try {
      // Android 13+ : permission
      try { await messaging().requestPermission(); } catch {}
      // Certains appareils exigent cet appel préalable
      try { await messaging().registerDeviceForRemoteMessages(); } catch {}

      const token = await messaging().getToken();
      console.log("FCM TOKEN:", token);
      if (!token) {
        Alert.alert("FCM", "Token introuvable pour l’instant. Réessaie après 5–10 s.");
        return null;
      }
      Alert.alert("FCM token", token);
      return token;
    } catch (e) {
      console.log("FCM token error:", e?.message || e);
      Alert.alert("FCM", String(e?.message || e));
      return null;
    }
  }, []);

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

      await getAndShowFcmToken();

      router.replace("/(tabs)/home");
      console.log("Instance Firebase Auth ID no componente:", auth?.app?.name);
    } catch (error) {
      Alert.alert("Erro", String(error?.message || error));
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <Image source={require("../assets/images/logoNameVigiApp.png")} style={styles.logo} resizeMode="contain" />
          <TextInput style={styles.input} placeholder="E-mail" placeholderTextColor="#7E8A9A"
            value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" textContentType="username" />
          <TextInput style={styles.input} placeholder="Senha" placeholderTextColor="#7E8A9A"
            value={senha} onChangeText={setSenha} secureTextEntry textContentType="password" />
          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Entrar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/auth/signup")}>
            <Text style={styles.link}>Não tem conta? <Text style={styles.linkHighlight}>Cadastre-se</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {__DEV__ && (
        <>
          <TouchableOpacity
            onPress={() => {
              const next = (devIndex + 1) % DEV_ACCOUNTS.length;
              setDevIndex(next); setEmail(DEV_ACCOUNTS[next]); setSenha(DEV_PASSWORD);
            }}
            onLongPress={() => { setDevIndex(0); setEmail(DEV_ACCOUNTS[0]); setSenha(DEV_PASSWORD); }}
            style={styles.devBtn}
          >
            <Text style={styles.devBtnText}>DEV • {devIndex + 1}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={getAndShowFcmToken}
            style={[styles.devBtn, { right: 16, bottom: 72, backgroundColor: "#60A5FA" }]}>
            <Text style={styles.devBtnText}>TOKEN</Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#181A20" },
  logo: { width: 400, height: 400, alignSelf: "center", marginBottom: 5 },
  input: { backgroundColor: "#23262F", color: "#fff", padding: 14, borderRadius: 8, marginBottom: 10, fontSize: 16 },
  button: { backgroundColor: "#007AFF", padding: 16, borderRadius: 8, alignItems: "center", marginBottom: 16 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 18 },
  link: { color: "#aaa", textAlign: "center", fontSize: 15 },
  linkHighlight: { color: "#00C859", fontWeight: "bold" },
  devBtn: { position: "absolute", right: 16, bottom: 16, backgroundColor: "#22C55E",
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, elevation: 3 },
  devBtnText: { color: "#0b111a", fontWeight: "800" },
});
