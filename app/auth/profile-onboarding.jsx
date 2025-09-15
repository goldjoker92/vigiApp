import { useState, useEffect, useMemo } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { loadUserProfile } from '../../utils/loadUserProfile';

// ✅ MaskedFields réactivés (en dehors de `app/`)
import {
  CpfField,
  CepField,
  PhoneField,
  DateField,
  UFField,
  lookupCep,
} from '../../services/MaskedFields';

import {
  onlyDigits,
  isValidCEP,
  isValidCPF,
  isValidPhoneBR,
  parseBRDateToISO,
  isAdultFromISO,
  phoneToE164BR,
} from '../../utils/br';

// ───────────────────────── helpers ─────────────────────────

// logger silencieux en prod
const log = (...args) => {
  if (__DEV__) console.log(...args);
};

// Attend un user Auth (max 3s) si `auth.currentUser` est encore vide
const waitForAuthUser = () =>
  new Promise((resolve, reject) => {
    let unsub;
    const timeout = setTimeout(() => {
      try {
        unsub && unsub();
      } catch {}
      reject(new Error('timeout-wait-auth'));
    }, 3000);
    unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        clearTimeout(timeout);
        try {
          unsub && unsub();
        } catch {}
        resolve(u);
      }
    });
  });

// ───────────────────────── component ─────────────────────────

export default function ProfileOnboardingScreen() {
  const router = useRouter();
  const { email: routeEmail } = useLocalSearchParams();

  log('[ONBOARD][MOUNT] routeEmail =', routeEmail);

  // Email affiché : routeEmail sinon auth.currentUser.email
  const effectiveEmail = useMemo(() => {
    const e = (routeEmail ? String(routeEmail) : auth.currentUser?.email) || '';
    const out = e.trim().toLowerCase();
    log('[ONBOARD][EMAIL] effectiveEmail =', out);
    return out;
  }, [routeEmail]);

  const [email] = useState(effectiveEmail);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState(''); // digits
  const [dataNascimento, setDataNascimento] = useState(''); // digits "ddMMyyyy"
  const [apelido, setApelido] = useState('');
  const [endereco, setEndereco] = useState('');
  const [telefone, setTelefone] = useState(''); // digits
  const [estado, setEstado] = useState('');
  const [cidade, setCidade] = useState('');
  const [cep, setCep] = useState(''); // digits
  const [profissao, setProfissao] = useState('');
  const [sexo, setSexo] = useState('');
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  // Validations dérivées
  const cpfOk = isValidCPF(cpf);
  const cepOk = isValidCEP(cep);
  const phoneOk = isValidPhoneBR(telefone);

  const isoDOB = useMemo(() => {
    if (dataNascimento.length === 8) {
      const dd = dataNascimento.slice(0, 2);
      const mm = dataNascimento.slice(2, 4);
      const yyyy = dataNascimento.slice(4);
      const iso = parseBRDateToISO(`${dd}/${mm}/${yyyy}`);
      log('[ONBOARD][DOB] digits=', dataNascimento, ' iso=', iso);
      return iso;
    }
    return null;
  }, [dataNascimento]);

  const dobOk = !!isoDOB;
  const maiorIdade = isAdultFromISO(isoDOB);

  // Auto-complétion CEP -> UF/Cidade/Endereco
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cepOk) {
        if (cep) log('[ONBOARD][CEP] inválido (skip lookup):', cep);
        return;
      }
      setCepLoading(true);
      log('[ONBOARD][CEP] lookup start:', cep);
      try {
        const data = await lookupCep(cep); // ton vrai lookup
        if (cancelled) return;
        log('[ONBOARD][CEP] lookup result:', data);
        if (data.uf) setEstado(data.uf);
        if (data.cidade) setCidade(data.cidade);
        if (!endereco && (data.logradouro || data.bairro)) {
          setEndereco(`${data.logradouro || ''}${data.bairro ? `, ${data.bairro}` : ''}`.trim());
        }
      } catch (e) {
        log('[ONBOARD][CEP][ERR]', e?.message || e);
      } finally {
        if (!cancelled) {
          setCepLoading(false);
          log('[ONBOARD][CEP] lookup end');
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [cep, cepOk, endereco]);

  const handleSave = async () => {
    log('[ONBOARD][SAVE] start');

    // validations obligatoires
    if (
      !email ||
      !nome ||
      !apelido ||
      !cpf ||
      !dataNascimento ||
      !telefone ||
      !estado ||
      !cidade ||
      !cep
    ) {
      log('[ONBOARD][SAVE][VALID] champs manquants');
      Alert.alert('Preencha todos os campos obrigatórios (*)');
      return;
    }
    if (!cpfOk) {
      log('[ONBOARD][SAVE][VALID] cpf invalido:', cpf);
      return Alert.alert('CPF inválido');
    }
    if (!cepOk) {
      log('[ONBOARD][SAVE][VALID] cep invalido:', cep);
      return Alert.alert('CEP inválido');
    }
    if (!phoneOk) {
      log('[ONBOARD][SAVE][VALID] telefone invalido:', telefone);
      return Alert.alert('Telefone inválido');
    }
    if (!dobOk) {
      log('[ONBOARD][SAVE][VALID] data nasc invalida:', dataNascimento);
      return Alert.alert('Data de nascimento inválida');
    }
    // if (!maiorIdade) return Alert.alert('Usuário menor de idade');

    const telefoneE164 = phoneToE164BR(telefone);
    if (!telefoneE164) {
      log('[ONBOARD][SAVE][VALID] telefone E164 invalido:', telefone);
      return Alert.alert('Telefone inválido');
    }

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
      email,
      criadoEm: new Date().toISOString(),
    };

    setLoading(true);
    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        log('[ONBOARD][SAVE] auth.currentUser vazio → espero...');
        try {
          currentUser = await waitForAuthUser();
          log('[ONBOARD][SAVE] user após espera:', currentUser?.uid);
        } catch (e) {
          log('[ONBOARD][SAVE][ERR] espera user falhou:', e?.message || e);
          Alert.alert('Autenticação', 'Não foi possível confirmar sua sessão. Tente novamente.');
          return;
        }
      }

      log('[ONBOARD][SAVE] writing user doc:', currentUser.uid);
      await setDoc(doc(db, 'users', currentUser.uid), payload, { merge: true });

      log('[ONBOARD][SAVE] loadUserProfile...');
      await loadUserProfile(currentUser.uid);

      log('[ONBOARD][SAVE] OK → /(tabs)/home');
      Alert.alert('Perfil salvo com sucesso!');
      router.replace('/(tabs)/home');
    } catch (error) {
      log('[ONBOARD][SAVE][ERR]', error?.message || error);
      Alert.alert('Erro ao salvar perfil', error?.message || String(error));
    } finally {
      setLoading(false);
      log('[ONBOARD][SAVE] end');
    }
  };

  const Label = ({ text, obrigatorio }) => (
    <Text style={styles.label}>
      {text}
      {obrigatorio && <Text style={styles.required}> *</Text>}
      {text === 'Data de nascimento' && (isoDOB ? (maiorIdade ? '  🟢 Maior' : '  🔴 Menor') : '')}
    </Text>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 30 : 0}
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
        <TextInput
          style={styles.input}
          placeholder="Nome completo"
          value={nome}
          onChangeText={setNome}
        />

        <Label text="Apelido (exibe no app)" obrigatorio />
        <TextInput
          style={styles.input}
          placeholder="Apelido"
          value={apelido}
          onChangeText={setApelido}
        />

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
        <TextInput
          style={styles.input}
          placeholder="Cidade"
          value={cidade}
          onChangeText={setCidade}
        />

        <Label text="CEP" obrigatorio />
        <CepField value={cep} onChange={setCep} loading={cepLoading} valid={cepOk} />

        <Label text="Profissão" obrigatorio={false} />
        <TextInput
          style={styles.input}
          placeholder="Profissão (opcional)"
          value={profissao}
          onChangeText={setProfissao}
        />

        <Label text="Sexo" obrigatorio={false} />
        <TextInput
          style={styles.input}
          placeholder="Sexo (opcional)"
          value={sexo}
          onChangeText={setSexo}
        />

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.6, pointerEvents: 'none' }]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Salvando...' : 'Salvar'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#181A20', paddingBottom: 40 },
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
    marginTop: 12,
    shadowColor: '#22C55E',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 19, letterSpacing: 0.5 },
  label: { color: '#fff', fontWeight: '500', marginBottom: 6, marginLeft: 2 },
  required: { color: '#FF4C4C', fontWeight: 'bold', fontSize: 16 },
});
