import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function ProfileScreen() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [dataNasc, setDataNasc] = useState('');
  const [cpf, setCpf] = useState('');
  const [celular, setCelular] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [profissao, setProfissao] = useState('');
  const [sexo, setSexo] = useState('');

  const validateCPF = (cpf) => {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11) return false;
    if (/^(\d)\1+$/.test(cpf)) return false;
    let sum = 0,
      rest;
    for (let i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(cpf.substring(9, 10))) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(cpf.substring(10, 11))) return false;
    return true;
  };

  const handleSave = async () => {
    if (!nome || !dataNasc || !cpf || !celular || !cep || !endereco || !cidade || !estado) {
      Alert.alert('Preencha todos os campos obrigatórios.');
      return;
    }
    if (!validateCPF(cpf)) {
      Alert.alert('CPF inválido. Digite um CPF válido.');
      return;
    }
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Usuário não autenticado.');
      await setDoc(doc(db, 'usuarios', user.uid), {
        nome,
        dataNascimento: dataNasc,
        cpf,
        celular,
        cep,
        endereco,
        cidade,
        estado,
        profissao: profissao || null,
        sexo: sexo || null,
        email: user.email,
        criadoEm: new Date().toISOString(),
      });
      Alert.alert('Perfil salvo com sucesso!');
      router.replace('/home');
    } catch (error) {
      Alert.alert('Erro ao salvar perfil', error.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Complete seu perfil</Text>

      {/* Champs OBLIGATOIRES */}
      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Nome completo</Text>
          <Text style={styles.required}>(obrigatório)</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Nome completo"
          value={nome}
          onChangeText={setNome}
        />
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Data de nascimento</Text>
          <Text style={styles.required}>(obrigatório)</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="dd/mm/aaaa"
          value={dataNasc}
          onChangeText={setDataNasc}
        />
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>CPF</Text>
          <Text style={styles.required}>(obrigatório)</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="CPF"
          value={cpf}
          onChangeText={setCpf}
          keyboardType="number-pad"
          maxLength={14}
        />
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Celular/WhatsApp</Text>
          <Text style={styles.required}>(obrigatório)</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Celular"
          value={celular}
          onChangeText={setCelular}
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>CEP</Text>
          <Text style={styles.required}>(obrigatório)</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="CEP"
          value={cep}
          onChangeText={setCep}
          keyboardType="numeric"
          maxLength={9}
        />
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Endereço</Text>
          <Text style={styles.required}>(obrigatório)</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Endereço"
          value={endereco}
          onChangeText={setEndereco}
        />
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Cidade</Text>
          <Text style={styles.required}>(obrigatório)</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Cidade"
          value={cidade}
          onChangeText={setCidade}
        />
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Estado (UF)</Text>
          <Text style={styles.required}>(obrigatório)</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="UF"
          value={estado}
          onChangeText={setEstado}
          maxLength={2}
          autoCapitalize="characters"
        />
      </View>

      {/* Champs OPTIONNELS */}
      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Profissão</Text>
          <Text style={styles.optional}>(opcional)</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Profissão"
          value={profissao}
          onChangeText={setProfissao}
        />
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Sexo</Text>
          <Text style={styles.optional}>(opcional)</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Sexo (M/F/O)"
          value={sexo}
          onChangeText={setSexo}
          maxLength={1}
          autoCapitalize="characters"
        />
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Salvar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#fff', flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  inputGroup: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  label: { fontWeight: 'bold', color: '#333', fontSize: 16 },
  required: { color: '#D20000', fontSize: 12, marginLeft: 6 },
  optional: { color: '#3399FF', fontSize: 12, marginLeft: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 6,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
});
// Note: This code is a React Native screen for user profile management.
// It includes input fields for personal information, validation for required fields, and saving the profile to Firebase Firestore.
// The code uses hooks for state management and Firebase for backend operations.
