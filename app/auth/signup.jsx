import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebase';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    const mail = email.trim();
    const pass = password;

    if (!mail || !pass) {
      Alert.alert('Preencha todos os campos!');
      return;
    }

    console.log('[SIGNUP] start for:', mail);
    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, mail, pass);
      console.log('[SIGNUP] OK uid:', cred.user?.uid, ' email:', cred.user?.email);

      // Mini-délai pour laisser l’état Auth s’hydrater côté RN/Router
      await new Promise((r) => setTimeout(r, 50));

      // Nav robuste: push puis fallback replace
      try {
        console.log('[NAV] push → /auth/profile-onboarding');
        router.push({ pathname: '/auth/profile-onboarding', params: { email: mail } });
      } catch (e1) {
        console.log('[NAV] push fail, try replace:', e1);
        router.replace({ pathname: '/auth/profile-onboarding', params: { email: mail } });
      }
    } catch (error) {
      console.log('[SIGNUP][ERR]', error?.code || '', error?.message || error);
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use') {
        Alert.alert('E-mail já utilizado', 'Tente entrar ou use outro e-mail.');
      } else if (code === 'auth/invalid-email') {
        Alert.alert('E-mail inválido', 'Verifique o formato do e-mail.');
      } else if (code === 'auth/weak-password') {
        Alert.alert('Senha fraca', 'Use ao menos 6 caracteres.');
      } else {
        Alert.alert('Erro no cadastro', String(error?.message || error));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
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
        <Text style={styles.buttonText}>{loading ? 'Cadastrando...' : 'Cadastrar'}</Text>
      </TouchableOpacity>

      <Text style={styles.link}>
        Já possui uma conta?{' '}
        <Text style={styles.linkAction} onPress={() => router.back()}>
          Entrar
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#181A20' },
  title: {
    fontSize: 30,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 1,
  },
  input: {
    borderWidth: 0,
    backgroundColor: '#23262F',
    color: '#fff',
    padding: 16,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 17,
  },
  button: {
    backgroundColor: '#22C55E',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#22C55E',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 19, letterSpacing: 0.5 },
  link: { textAlign: 'center', color: '#bbb', fontSize: 16, marginTop: 10 },
  linkAction: { color: '#22C55E', fontWeight: 'bold' },
});
