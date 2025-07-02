// app/signup.jsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert
} from 'react-native';
import { useRouter } from 'expo-router';

export default function SignUpScreen() {
  const router = useRouter();
  const [email,    setEmail   ] = useState('');
  const [password, setPassword] = useState('');

  const handleSignUp = () => {
    Alert.alert(
      'Inscription',
      `Email : ${email}\nMot de passe : ${password}`
    );
    // TODO → ici tu créeras l’utilisateur dans Firebase
    router.replace('/'); // retourne à la page de connexion
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Créer un compte</Text>

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
        placeholder="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleSignUp}>
        <Text style={styles.buttonText}>S’inscrire</Text>
      </TouchableOpacity>

      <Text style={styles.link}>
        Déjà un compte ?{' '}
        <Text
          style={styles.linkAction}
          onPress={() => router.back()}
        >
          Se connecter
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
// Compare this snippet from app/signup.jsx: