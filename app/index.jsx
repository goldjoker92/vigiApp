// app/index.jsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert
} from 'react-native';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const router = useRouter();
  const [email,    setEmail   ] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    Alert.alert(
      'Connexion',
      `Email : ${email}\nMot de passe : ${password}`
    );
    // TODO → ici tu brancheras Firebase
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connexion</Text>

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

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Se connecter</Text>
      </TouchableOpacity>

      <Text style={styles.link}>
        Pas encore de compte ?{' '}
        <Text
          style={styles.linkAction}
          onPress={() => router.push('/signup')}
        >
          Créer un compte
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
    backgroundColor:'#007AFF', padding:14,
    borderRadius:6, alignItems:'center', marginBottom:16
  },
  buttonText:{ color:'#fff', fontWeight:'bold' },
  link:      { textAlign:'center', color:'#444' },
  linkAction:{ color:'#007AFF', fontWeight:'bold' }
});
