import { useState, useEffect } from 'react';
import { Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, View, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from '../../firebase';
import { loadUserProfile } from '../../utils/loadUserProfile';
import { useAuthGuard } from '../../hooks/useAuthGuard';

import { CpfField, CepField, PhoneField, DateField, UFField, lookupCep } from '../../services/MaskedFields';
import { onlyDigits, isValidCEP, isValidCPF, isValidPhoneBR, parseBRDateToISO, isAdultFromISO, phoneToE164BR } from '../../utils/br';

export default function ProfileOnboardingScreen() {
  const router = useRouter();
  const { email: routeEmail } = useLocalSearchParams();
  const user = useAuthGuard();

  const [email] = useState(routeEmail || '');
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');                // unmasked digits
  const [dataNascimento, setDataNascimento] = useState(''); // unmasked digits "ddMMyyyy" (MaskInput gère l'affichage)
  const [apelido, setApelido] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState('');      // unmasked digits
  const [estado, setEstado] = useState('');
  const [cidade, setCidade] = useState('');
  const [cep, setCep] = useState('');                // unmasked digits
  const [profissao, setProfissao] = useState('');
  const [sexo, setSexo] = useState('');
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  // dérivés de validation
  const cpfOk = isValidCPF(cpf);
  const cepOk = isValidCEP(cep);
  const phoneOk = isValidPhoneBR(telefone);
  const isoDOB = (() => {
    // reconstruire dd/mm/yyyy à partir des digits pour le parseur
    if (dataNascimento.length === 8) {
      const dd = dataNascimento.slice(0,2);
      const mm = dataNascimento.slice(2,4);
      const yyyy = dataNascimento.slice(4);
      return parseBRDateToISO(`${dd}/${mm}/${yyyy}`);
    }
    return null;
  })();
  const dobOk = !!isoDOB;
  const maiorIdade = isAdultFromISO(isoDOB);

  // Auto-complétion CEP -> UF/Cidade/Endereco
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cepOk) return;
      setCepLoading(true);
      try {
        const data = await lookupCep(cep); // cep digits
        if (cancelled) return;
        if (data.uf) setEstado(data.uf);
        if (data.cidade) setCidade(data.cidade);
        // pré-remplit l'endereço s'il est vide
        if (!endereco && (data.logradouro || data.bairro)) {
          setEndereco(`${data.logradouro || ""}${data.bairro ? `, ${data.bairro}` : ""}`.trim());
        }
      } catch (_e) {
        // silencieux: l'utilisateur peut remplir à la main
      } finally {
        if (!cancelled) setCepLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [cep, cepOk, endereco]);

  if (user === undefined) return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;
  if (!user) return null;

  const handleSave = async () => {
    // validations obligatoires
    if (!email || !nome || !apelido || !cpf || !dataNascimento || !telefone || !estado || !cidade || !cep) {
      Alert.alert("Preencha todos os campos obrigatórios (*)");
      return;
    }
    if (!cpfOk) return Alert.alert("CPF inválido");
    if (!cepOk) return Alert.alert("CEP inválido");
    if (!phoneOk) return Alert.alert("Telefone inválido");
    if (!dobOk) return Alert.alert("Data de nascimento inválida");
    // (optionnel) exiger maior de idade :
    // if (!maiorIdade) return Alert.alert("Usuário menor de idade");

    const telefoneE164 = phoneToE164BR(telefone);
    if (!telefoneE164) return Alert.alert("Telefone inválido");

    const payload = {
      nome: nome.trim(),
      apelido: apelido.trim(),
      cpf: onlyDigits(cpf),
      dataNascimento: isoDOB, // ISO yyyy-mm-dd
      endereco: endereco.trim(),
      telefone: telefoneE164,
      estado: String(estado).trim().toUpperCase(),
      cidade: cidade.trim(),
      cep: onlyDigits(cep),
      profissao: profissao.trim(),
      sexo: sexo.trim(),
      email: String(email).trim().toLowerCase(),
      criadoEm: new Date().toISOString(),
    };

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Usuário não autenticado.");
      await setDoc(doc(db, "users", currentUser.uid), payload, { merge: true });
      await loadUserProfile(currentUser.uid);
      Alert.alert("Perfil salvo com sucesso!");
      router.replace('/(tabs)/home');
    } catch (error) {
      Alert.alert("Erro ao salvar perfil", error?.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  const Label = ({ text, obrigatorio }) => (
    <Text style={styles.label}>
      {text}{obrigatorio && <Text style={styles.required}> *</Text>}
      {text === "Data de nascimento" && (isoDOB ? (maiorIdade ? "  🟢 Maior" : "  🔴 Menor") : "")}
    </Text>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 30 : 0}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
        <TextInput style={styles.input} placeholder="Nome completo" value={nome} onChangeText={setNome} />

        <Label text="Apelido (exibe no app)" obrigatorio />
        <TextInput style={styles.input} placeholder="Apelido" value={apelido} onChangeText={setApelido} />

        <Label text="CPF" obrigatorio />
        <CpfField value={cpf} onChange={setCpf} valid={cpfOk} />

        <Label text="Data de nascimento" obrigatorio />
        <DateField value={dataNascimento} onChange={setDataNascimento} valid={dobOk} />

        <Label text="Endereço" obrigatorio={false} />
        <TextInput
          style={styles.input}
          placeholder="Rua, número, bairro (opcional)"
          value={endereco}
          onChangeText={setEndereco}
        />

        <Label text="Telefone WhatsApp" obrigatorio />
        <PhoneField value={telefone} onChange={setTelefone} valid={phoneOk} />

        <Label text="Estado (UF)" obrigatorio />
        <UFField value={estado} onChange={setEstado} />

        <Label text="Cidade" obrigatorio />
        <TextInput style={styles.input} placeholder="Cidade" value={cidade} onChangeText={setCidade} />

        <Label text="CEP" obrigatorio />
        <CepField value={cep} onChange={setCep} loading={cepLoading} valid={cepOk} />

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
  container: { flexGrow: 1, padding: 24, backgroundColor: '#181A20', paddingBottom: 40 },
  title: { fontSize: 30, fontWeight: 'bold', marginBottom: 30, color: '#fff', textAlign: 'center', letterSpacing: 1 },
  input: { borderWidth: 0, backgroundColor: '#23262F', color: '#fff', padding: 16, borderRadius: 10, marginBottom: 16, fontSize: 17 },
  button: { backgroundColor: '#22C55E', padding: 16, borderRadius: 10, alignItems: 'center', marginBottom: 16, shadowColor: '#22C55E', shadowOpacity: 0.3, shadowRadius: 8, elevation: 2 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 19, letterSpacing: 0.5 },
  label: { color: '#fff', fontWeight: '500', marginBottom: 6, marginLeft: 2 },
  required: { color: '#FF4C4C', fontWeight: 'bold', fontSize: 16 },
});
