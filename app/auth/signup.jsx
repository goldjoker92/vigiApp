import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from '../../firebase';
import { useRouter } from 'expo-router';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert("Preencha todos os campos!");
      return;
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.replace({ pathname: '/auth/profile-onboarding', params: { email } });
    } catch (error) {
      Alert.alert("Erro no cadastro", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.container}>
          <Text style={styles.title}>Criar uma conta</Text>
          <TextInput
            style={styles.input}
            placeholder="E-mail"
            placeholderTextColor="#7E8A9A"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Senha"
            placeholderTextColor="#7E8A9A"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.button, loading && { opacity: 0.6 }]}
            onPress={handleSignup}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Cadastrando..." : "Cadastrar"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.link}>
            Já possui uma conta?{' '}
            <Text style={styles.linkAction} onPress={() => router.back()}>Entrar</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, justifyContent:'center', padding:24, backgroundColor:'#181A20' },
  title: { fontSize:30, fontWeight:'bold', marginBottom:30, color:'#fff', textAlign:'center', letterSpacing:1 },
  input: { borderWidth:0, backgroundColor:'#23262F', color:'#fff', padding:16, borderRadius:10, marginBottom:16, fontSize:17 },
  button: { backgroundColor:'#22C55E', padding:16, borderRadius:10, alignItems:'center', marginBottom:16, shadowColor:'#22C55E', shadowOpacity:0.3, shadowRadius:8, elevation:2 },
  buttonText:{ color:'#fff', fontWeight:'bold', fontSize:19, letterSpacing:0.5 },
  link: { textAlign:'center', color:'#bbb', fontSize:16, marginTop:10 },
  linkAction:{ color:'#22C55E', fontWeight:'bold' }
});
