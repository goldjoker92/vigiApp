import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, View, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from '../../firebase';
import { loadUserProfile } from '../../utils/loadUserProfile';
import { useAuthGuard } from '../../hooks/useAuthGuard';

export default function ProfileOnboardingScreen() {
  const user = useAuthGuard();
  const router = useRouter();
  const { email: routeEmail } = useLocalSearchParams();
  const [email] = useState(routeEmail || '');
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [apelido, setApelido] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState('');
  const [estado, setEstado] = useState('');
  const [cidade, setCidade] = useState('');
  const [cep, setCep] = useState('');
  const [profissao, setProfissao] = useState('');
  const [sexo, setSexo] = useState('');
  const [loading, setLoading] = useState(false);
  if (!user) return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;

  const handleSave = async () => {
    if (!nome || !cpf || !dataNascimento || !apelido || !telefone || !estado || !cidade || !cep) {
      Alert.alert("Preencha todos os campos obrigatórios (*)");
      return;
    }
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuário não autenticado.");
      await setDoc(doc(db, "users", currentUser.uid), {
        nome, apelido, cpf, dataNascimento, endereco, telefone,
        estado, cidade, cep, profissao, sexo, email,
        criadoEm: new Date().toISOString()
      });
      await loadUserProfile(currentUser.uid);
      Alert.alert("Perfil salvo com sucesso!");
      router.replace('/(tabs)/home');
    } catch (error) {
      Alert.alert("Erro ao salvar perfil", error.message);
    } finally {
      setLoading(false);
    }
  };

  const Label = ({ text, obrigatorio }) => (
    <Text style={styles.label}>
      {text}{obrigatorio && <Text style={styles.required}> *</Text>}
    </Text>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 30 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Complete seu perfil</Text>

        <Label text="E-mail" obrigatorio />
        <TextInput
          style={[styles.input, { backgroundColor: '#23262F80' }]}
          placeholder="E-mail"
          value={email}
          editable={false}
          selectTextOnFocus={false}
          placeholderTextColor="#7E8A9A"
        />

        <Label text="Nome completo" obrigatorio />
        <TextInput style={styles.input} placeholder="Nome completo" value={nome} onChangeText={setNome}/>

        <Label text="Apelido (exibe no app)" obrigatorio />
        <TextInput style={styles.input} placeholder="Apelido" value={apelido} onChangeText={setApelido}/>

        <Label text="CPF" obrigatorio />
        <TextInput style={styles.input} placeholder="CPF" value={cpf} onChangeText={setCpf} keyboardType="numeric" />

        <Label text="Data de nascimento" obrigatorio />
        <TextInput style={styles.input} placeholder="Data de nascimento (DD/MM/AAAA)" value={dataNascimento} onChangeText={setDataNascimento} />

        <Label text="Endereço" obrigatorio={false} />
        <TextInput style={styles.input} placeholder="Endereço (opcional)" value={endereco} onChangeText={setEndereco} />

        <Label text="Telefone WhatsApp" obrigatorio />
        <TextInput style={styles.input} placeholder="Telefone (WhatsApp)" value={telefone} onChangeText={setTelefone} keyboardType="phone-pad"/>

        <Label text="Estado" obrigatorio />
        <TextInput style={styles.input} placeholder="Estado" value={estado} onChangeText={setEstado} />

        <Label text="Cidade" obrigatorio />
        <TextInput style={styles.input} placeholder="Cidade" value={cidade} onChangeText={setCidade} />

        <Label text="CEP" obrigatorio />
        <TextInput style={styles.input} placeholder="CEP" value={cep} onChangeText={setCep} keyboardType="numeric"/>

        <Label text="Profissão" obrigatorio={false} />
        <TextInput style={styles.input} placeholder="Profissão (opcional)" value={profissao} onChangeText={setProfissao} />

        <Label text="Sexo" obrigatorio={false} />
        <TextInput style={styles.input} placeholder="Sexo (opcional)" value={sexo} onChangeText={setSexo} />

        <View style={{ height: 12 }} />
        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Salvando..." : "Salvar"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: '#181A20',
    paddingBottom: 40,
  },
  title: { fontSize:30, fontWeight:'bold', marginBottom:30, color:'#fff', textAlign:'center', letterSpacing:1 },
  input: { borderWidth:0, backgroundColor:'#23262F', color:'#fff', padding:16, borderRadius:10, marginBottom:16, fontSize:17 },
  button: { backgroundColor:'#22C55E', padding:16, borderRadius:10, alignItems:'center', marginBottom:16, shadowColor:'#22C55E', shadowOpacity:0.3, shadowRadius:8, elevation:2 },
  buttonText:{ color:'#fff', fontWeight:'bold', fontSize:19, letterSpacing:0.5 },
  label:     { color:'#fff', fontWeight:'500', marginBottom:2, marginLeft:2 },
  required:  { color:'#FF4C4C', fontWeight:'bold', fontSize:16 },
});
