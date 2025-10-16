import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  MapPin,
  Bell,
  AlertTriangle,
  HandHeart,
  Flame,
  ShieldAlert,
  Bolt,
  Car,
  FileQuestion,
  Send,
  UserX,
} from 'lucide-react-native';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { useUserStore } from '../store/users'; // adapte selon ton projet

const categories = [
  { label: 'Roubo/Furto', icon: ShieldAlert, severity: 'medium', color: '#FFA500' },
  { label: 'Agressão', icon: UserX, severity: 'medium', color: '#FFA500' },
  { label: 'Incidente de trânsito', icon: Car, severity: 'minor', color: '#FFE600' },
  { label: 'Incêndio', icon: Flame, severity: 'grave', color: '#FF3B30' },
  { label: 'Falta de luz', icon: Bolt, severity: 'minor', color: '#FFE600' },
  { label: 'Mal súbito (problema de saúde)', icon: HandHeart, severity: 'grave', color: '#FF3B30' },
  { label: 'Outros', icon: FileQuestion, severity: 'minor', color: '#007AFF' },
];

const MAX_GEO_ATTEMPTS = 3;

export default function GrupoReportScreen() {
  const router = useRouter();
  const user = useAuthGuard();
  const params = useLocalSearchParams();
  const groupIdStore = useUserStore((state) => state.groupId);

  const [categoria, setCategoria] = useState(null);
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [showManualLoc, setShowManualLoc] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [address, setAddress] = useState(null);

  const groupCep = params.cep || user?.cepRef || '';
  const groupCidade = params.cidade || user?.cidade || '';
  const groupEstado = params.estado || user?.estado || '';
  const groupId =
    params.groupId ||
    groupIdStore ||
    user?.groupId ||
    (Array.isArray(user?.groups) && user.groups.length > 0 ? user.groups[0] : null);

  const now = new Date();
  const dateBR = now.toLocaleDateString('pt-BR');
  const timeBR = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const selectedCategory = categories.find((c) => c.label === categoria);
  const severityColor = selectedCategory?.color || '#FF3B30';

  // GÉOLOCALISATION LOGIC identique au flow public, mais sans champ adresse éditable à l’UI
  const tryGetLocationAndAddress = async (tryCount = 1) => {
    setLoadingLoc(true);
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const ask = await Location.requestForegroundPermissionsAsync();
        status = ask.status;
      }
      if (status !== 'granted') {
        throw new Error('Permission refusée');
      }

      // Précision haute
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
        timeout: 4000,
      });

      setLocal({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

      // Reverse geocode, avec robustesse sur les valeurs
      try {
        const addr = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });

        if (addr && addr.length > 0) {
          let rua = addr[0].street || 'Não recuperado';
          let numero = addr[0].streetNumber || addr[0].name || '';
          if (numero && rua.includes(numero)) {
            numero = '';
          }
          setAddress({
            rua,
            numero,
            cidade: addr[0].city || groupCidade || 'Não recuperado',
            estado: addr[0].region || groupEstado || 'Não recuperado',
            cep: addr[0].postalCode || groupCep || 'Não recuperado',
          });
        } else if (tryCount < MAX_GEO_ATTEMPTS) {
          setTimeout(() => tryGetLocationAndAddress(tryCount + 1), 400);
          return;
        } else {
          setAddress({
            rua: 'Não recuperado',
            numero: '',
            cidade: groupCidade || 'Não recuperado',
            estado: groupEstado || 'Não recuperado',
            cep: groupCep || 'Não recuperado',
          });
        }
        setLoadingLoc(false);
        setShowManualLoc(false);
        setModalVisible(false);
      } catch {
        setAddress({
          rua: 'Não recuperado',
          numero: '',
          cidade: groupCidade || 'Não recuperado',
          estado: groupEstado || 'Não recuperado',
          cep: groupCep || 'Não recuperado',
        });
        setLoadingLoc(false);
        setShowManualLoc(false);
        setModalVisible(false);
      }
    } catch {
      setLoadingLoc(false);
      setLocal(null);
      setShowManualLoc(false);
      setModalVisible(true);
    }
  };

  useEffect(() => {
    tryGetLocationAndAddress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModalOk = () => {
    setModalVisible(false);
    setShowManualLoc(true);
  };

  const handleManualLoc = () => {
    tryGetLocationAndAddress();
  };

  const handleSend = async () => {
    if (!categoria) {
      return Alert.alert('Selecione uma categoria.');
    }
    if (!descricao.trim()) {
      return Alert.alert('Descreva o ocorrido.');
    }
    if (!local) {
      return Alert.alert('Localização ausente.');
    }
    if (!groupId) {
      return Alert.alert('Você não está em nenhum grupo.');
    }
    try {
      await addDoc(collection(db, 'groupAlerts'), {
        userId: auth.currentUser?.uid,
        apelido: user?.apelido || '',
        categoria,
        descricao,
        gravidade: selectedCategory?.severity || '',
        color: severityColor,
        groupId,
        rua: address?.rua || 'Não recuperado',
        numero: address?.numero || '',
        cidade: address?.cidade || groupCidade || 'Não recuperado',
        estado: address?.estado || groupEstado || 'Não recuperado',
        cep: address?.cep || groupCep || 'Não recuperado',
        location: local,
        date: dateBR,
        time: timeBR,
        createdAt: serverTimestamp(),
      });
      Alert.alert('Alerta enviado!', 'Seu alerta foi registrado.');
      router.replace('/(tabs)/home');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  if (user === undefined) {
    return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;
  }
  if (!user) {
    return null;
  }

  const isBtnActive = !!(
    categoria &&
    descricao.trim().length > 0 &&
    local &&
    typeof local.latitude === 'number' &&
    typeof local.longitude === 'number' &&
    groupCep &&
    groupId
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <View style={styles.alertCard}>
            <AlertTriangle color="#fff" size={26} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>⚠️ Atenção!</Text>
              <Text style={styles.alertMsg}>
                Toda declaração feita no aplicativo envolve sua{' '}
                <Text style={{ fontWeight: 'bold' }}>boa fé</Text> e{' '}
                <Text style={{ fontWeight: 'bold' }}>responsabilidade</Text>.{'\n'}Nunca substitua
                os serviços de emergência!
                {'\n'}
                <Text style={{ fontWeight: 'bold' }}>
                  ☎️ Ligue 190 (Polícia) ou 192 (Samu) em caso de risco ou emergência.
                </Text>
              </Text>
            </View>
          </View>

          <Text style={styles.title}>
            <Bell color="#22C55E" size={22} style={{ marginRight: 5 }} />
            Sinalizar um evento para o grupo de vizinhos
          </Text>

          <Text style={styles.label}>Categoria</Text>
          <View style={styles.categoriaGroup}>
            {categories.map(({ label, icon: Icon, color }) => (
              <TouchableOpacity
                key={label}
                style={[
                  styles.categoriaBtn,
                  categoria === label && { backgroundColor: color, borderColor: color },
                ]}
                onPress={() => setCategoria(label)}
              >
                <Icon
                  size={18}
                  color={categoria === label ? '#fff' : color}
                  style={{ marginRight: 7 }}
                />
                <Text
                  style={[
                    styles.categoriaText,
                    categoria === label && { color: '#fff', fontWeight: 'bold' },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Descreva o ocorrido</Text>
          <TextInput
            style={styles.input}
            placeholder="Descrição (obrigatório)"
            value={descricao}
            onChangeText={setDescricao}
            multiline
          />

          {/* CEP affiché en vert, readonly */}
          <Text style={styles.label}>CEP do grupo</Text>
          <View style={styles.cepBox}>
            <Text style={styles.cepText}>{groupCep}</Text>
          </View>

          {/* MAP */}
          {local && (
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: local.latitude,
                longitude: local.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker coordinate={{ latitude: local.latitude, longitude: local.longitude }} />
            </MapView>
          )}

          {loadingLoc && <ActivityIndicator style={{ marginVertical: 8 }} color="#22C55E" />}

          {/* MODALE d’échec */}
          <Modal visible={modalVisible} animationType="fade" transparent>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalText}>
                  Localização não capturada. Você vai usar a localização manual com o botão da
                  localização abaixo do <Text style={{ fontWeight: 'bold' }}>CEP</Text>. Clique em
                  OK para continuer.
                </Text>
                <TouchableOpacity style={styles.modalBtn} onPress={handleModalOk}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* BOUTON USAR MINHA LOCALIZAÇÃO après la modale */}
          {showManualLoc && (
            <TouchableOpacity style={styles.locBtn} onPress={handleManualLoc}>
              <MapPin color="#22C55E" size={18} style={{ marginRight: 8 }} />
              <Text style={styles.locBtnText}>Usar minha localização atual</Text>
            </TouchableOpacity>
          )}

          {/* Bouton Enviar */}
          <TouchableOpacity
            style={[
              styles.sendBtn,
              {
                backgroundColor: isBtnActive ? severityColor : '#FF3B30',
                opacity: isBtnActive ? 1 : 0.65,
              },
            ]}
            onPress={handleSend}
            disabled={!isBtnActive}
          >
            <Send size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.sendBtnText}>Enviar alerta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { paddingBottom: 36, backgroundColor: '#181A20' },
  container: { padding: 22, flex: 1, backgroundColor: '#181A20' },
  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#FF3B30',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 19,
    marginTop: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 3,
  },
  alertTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
  alertMsg: { color: '#fff', fontSize: 15 },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoriaGroup: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16, gap: 6 },
  categoriaBtn: {
    backgroundColor: '#23262F',
    padding: 10,
    borderRadius: 9,
    margin: 3,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#23262F',
    minWidth: 110,
    justifyContent: 'center',
  },
  categoriaText: { color: '#22C55E', fontWeight: '500', fontSize: 15 },
  label: { color: '#fff', marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#353840',
    backgroundColor: '#222',
    color: '#fff',
    padding: 12,
    borderRadius: 7,
    marginBottom: 10,
  },
  cepBox: {
    backgroundColor: '#181A20',
    borderRadius: 9,
    padding: 14,
    alignItems: 'center',
    marginVertical: 9,
    borderWidth: 1,
    borderColor: '#333',
  },
  cepText: { fontSize: 20, color: '#22C55E', fontWeight: 'bold', letterSpacing: 1 },
  map: {
    width: '100%',
    height: 130,
    borderRadius: 10,
    marginBottom: 12,
    marginTop: 2,
  },
  sendBtn: {
    borderRadius: 10,
    padding: 17,
    alignItems: 'center',
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.46)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#23262F',
    borderRadius: 15,
    padding: 28,
    alignItems: 'center',
    width: '85%',
  },
  modalText: { color: '#fff', fontSize: 17, marginBottom: 18, textAlign: 'center' },
  modalBtn: {
    backgroundColor: '#22C55E',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  locBtn: {
    backgroundColor: '#e6f2ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 20,
  },
  locBtnText: { color: '#22C55E', fontWeight: 'bold' },
});
