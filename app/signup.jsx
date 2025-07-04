import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase"; // adapte le chemin si besoin

export default function SignUpScreen() {
  const router = useRouter();
  const [email,    setEmail   ] = useState('');
  const [password, setPassword] = useState('');

  const handleSignUp = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.replace('/profile'); // Redirection vers la page de profil
    } catch (error) {
      Alert.alert("Erro no cadastro", error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Criar uma conta</Text>

      <TextInput
        style={styles.input}
        placeholder="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleSignUp}>
        <Text style={styles.buttonText}>Cadastrar</Text>
      </TouchableOpacity>

      <Text style={styles.link}>
        Já tem conta?{' '}
        <Text
          style={styles.linkAction}
          onPress={() => router.back()}
        >
          Entrar
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, justifyContent:'center', padding:24, backgroundColor:'#fff' },
  title:     { fontSize:24, fontWeight:'bold', marginBottom:24 },
  input:     {
    borderWidth:1, borderColor:'#ccc', padding:12,
    borderRadius:6, marginBottom:16
  },
  button:    {
    backgroundColor:'#28A745', padding:14,
    borderRadius:6, alignItems:'center', marginBottom:16
  },
  buttonText:{ color:'#fff', fontWeight:'bold' },
  link:      { textAlign:'center', color:'#444' },
  linkAction:{ color:'#28A745', fontWeight:'bold' }
});
