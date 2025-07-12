// app/(tabs)/profile.jsx
import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from '../../firebase';
import { loadUserProfile } from '../../utils/loadUserProfile';

export default function ProfileScreen() {
  const router = useRouter();
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
  

  const handleSave = async () => {
    // Ici tu peux valider les champs obligatoires
    if (!nome || !cpf || !dataNascimento || !apelido || !telefone || !estado || !cidade || !cep) {
      Alert.alert("Preencha todos os campos obrigatórios (*)");
      return;
    }
    try {
    const user = auth.currentUser;
    if (!user) throw new Error("Usuário não autenticado.");
    await setDoc(doc(db, "usuarios", user.uid), {
      nome, apelido, cpf, dataNascimento, endereco, telefone,
      estado, cidade, cep, profissao, sexo, email: user.email,
      criadoEm: new Date().toISOString()
    });
    await loadUserProfile(user.uid); // Charge Firestore → Zustand
    Alert.alert("Perfil salvo com sucesso!");
    router.replace('/(tabs)/home');
  } catch (error) {
    Alert.alert("Erro ao salvar perfil", error.message);
  }
  };

  const Label = ({ text, obrigatorio }) => (
    <Text style={styles.label}>
      {text}{obrigatorio && <Text style={styles.required}> *</Text>}
    </Text>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Complete seu perfil</Text>
      
      <Label text="Nome completo" obrigatorio />
      <TextInput style={styles.input} placeholder="Nome completo" value={nome} onChangeText={setNome}/>

      <Label text="Apelido (exibe no app)" obrigatorio />
      <TextInput style={styles.input} placeholder="Apelido" value={apelido} onChangeText={setApelido}/>

      <Label text="CPF" obrigatorio />
      <TextInput style={styles.input} placeholder="CPF" value={cpf} onChangeText={setCpf} keyboardType="numeric" />

      <Label text="Data de nascimento" obrigatorio={false} />
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


      <TouchableOpacity style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Salvar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding:24, backgroundColor:'#fff', flexGrow:1, justifyContent:'center' },
  title:     { fontSize:22, fontWeight:'bold', marginBottom:24, textAlign:'center' },
  input:     { borderWidth:1, borderColor:'#ccc', padding:12, borderRadius:6, marginBottom:16, backgroundColor:'#FAFAFA' },
  button:    { backgroundColor:'#007AFF', padding:16, borderRadius:6, alignItems:'center', marginTop:20 },
  buttonText:{ color:'#fff', fontWeight:'bold', fontSize:18 },
  label:     { color:'#111', fontWeight:'500', marginBottom:2, marginLeft:2 },
  required:  { color:'#FF4C4C', fontWeight:'bold', fontSize:16 },
});
