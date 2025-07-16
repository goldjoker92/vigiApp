import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from '../firebase';
import { useRouter } from 'expo-router';
import { loadUserProfile } from '../utils/loadUserProfile';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, senha);
      await loadUserProfile(cred.user.uid);
      router.replace('/(tabs)/home');
    } catch (error) {
      Alert.alert("Erro", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <Image
            source={require('../assets/images/logoNameVigiApp.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <TextInput
            style={styles.input}
            placeholder="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Senha"
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
          />
          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>{loading ? "Entrando..." : "Entrar"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/auth/signup')}>
            <Text style={styles.link}>
              Não tem conta? <Text style={styles.linkHighlight}>Cadastre-se</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, justifyContent:'center', padding:24, backgroundColor:'#181A20' },
  logo: { width: 400, height: 400, alignSelf: 'center', marginBottom: 5 },
  title: { fontSize:28, fontWeight:'bold', marginBottom:32, color:'#fff', textAlign:'center' },
  input: { borderWidth:0, backgroundColor:'#23262F', color:'#fff', padding:14, borderRadius:8, marginBottom:10, fontSize:16 },
  button: { backgroundColor:'#007AFF', padding:16, borderRadius:8, alignItems:'center', marginBottom:16 },
  buttonText: { color:'#fff', fontWeight:'bold', fontSize:18 },
    link: { color:'#aaa', textAlign:'center', fontSize:15 },
    linkHighlight: { color:'#00C859', fontWeight:'bold' }
  });