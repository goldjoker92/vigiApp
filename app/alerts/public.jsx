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
import * as Location from 'expo-location';
import { db, auth } from '../../firebase'; // <-- attention au chemin relatif !
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import {
  MapPin,
  Bell,
  AlertTriangle,
  HandHeart,
  Flame,
  ShieldAlert,
  Bolt,
  Droplet,
  Car,
  FileQuestion,
  Send,
  UserX,
  ShieldCheck,
  ChevronLeft,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function PublicAlertScreen() {
  const router = useRouter();
  const [categorias, setCategorias] = useState([]);
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState(null);
  const [address, setAddress] = useState('');

  const categories = [
    { label: 'Roubo/Furto', icon: ShieldAlert },
    { label: 'Agressão', icon: UserX },
    { label: 'Incidente de trânsito', icon: Car },
    { label: 'Incêndio', icon: Flame },
    { label: 'Falta de luz', icon: Bolt },
    { label: 'Falta d’água', icon: Droplet },
    { label: 'Mal súbito (problema de saúde)', icon: HandHeart },
    { label: 'Outros', icon: FileQuestion },
  ];

  // Géolocalisation
  const handleLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {return Alert.alert('Permissão negada para acessar a localização.');}
    let loc = await Location.getCurrentPositionAsync({});
    setLocal(loc.coords);
    let [addr] = await Location.reverseGeocodeAsync(loc.coords);
    setAddress(addr ? `${addr.street}, ${addr.subregion}` : '');
  };

  // Gestion cases à cocher
  const toggleCategoria = (cat) => {
    setCategorias((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  // Envoi Firestore + notif friendly
  const handleSend = async () => {
    if (categorias.length === 0) {return Alert.alert('Selecione pelo menos uma categoria.');}
    if (!local) {return Alert.alert('Por favor, informe sua localização.');}
    if (!descricao.trim()) {return Alert.alert('Descreva o ocorrido (obrigatório).');}
    try {
      await addDoc(collection(db, 'publicAlerts'), {
        userId: auth.currentUser.uid,
        categorias,
        descricao,
        location: local,
        address,
        radius: 500,
        createdAt: serverTimestamp(),
      });
      Alert.alert(
        'Alerta enviado!',
        'Seu alerta foi registrado com sucessoooooooooooooooo! Lembre-se: sua declaração envolve sua responsabilidade e não substitui os serviços de emergência. ☎️ Ligue 190 (Polícia) ou 192 (Samu) em caso de urgência.'
      );
      router.replace('/home');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  return (
    <View style={styles.flexContainer}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Carte d'avertissement - bonne foi / urgence */}
        <View style={styles.alertCard}>
          <AlertTriangle color="#fff" size={26} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>⚠️ Atenção!</Text>
            <Text style={styles.alertMsg}>
              Toda declaração feita no aplicativo envolve sua{' '}
              <Text style={{ fontWeight: 'bold' }}>boa fé</Text> e{' '}
              <Text style={{ fontWeight: 'bold' }}>responsabilidade</Text>.{'\n'}Nunca substitua os
              serviços de emergência!
              {'\n'}
              <Text style={{ fontWeight: 'bold' }}>
                ☎️ Ligue 190 (Polícia) ou 192 (Samu) em caso de risco ou emergência.
              </Text>
            </Text>
          </View>
        </View>

        <Text style={styles.title}>
          <Bell color="#007AFF" size={22} style={{ marginRight: 5, marginBottom: -4 }} />
          Sinalizar um problema público
        </Text>
        <Text style={styles.subtitle}>Selecione o tipo de incidente:</Text>

        <View style={styles.categoriaGroup}>
          {categories.map(({ label, icon: Icon }) => (
            <TouchableOpacity
              key={label}
              style={[styles.categoriaBtn, categorias.includes(label) && styles.categoriaBtnActive]}
              onPress={() => toggleCategoria(label)}
            >
              <Icon
                size={18}
                color={categorias.includes(label) ? '#fff' : '#007AFF'}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.categoriaText,
                  categorias.includes(label) && styles.categoriaTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.locBtn} onPress={handleLocation}>
          <MapPin color="#007AFF" size={18} style={{ marginRight: 8 }} />
          <Text style={styles.locBtnText}>Usar minha localização atual</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Digite o endereço (opcional)"
          value={address}
          onChangeText={setAddress}
        />

        <Text style={styles.infoRayon}>
          <ShieldCheck size={16} color="#007AFF" style={{ marginRight: 5 }} />
          Seu alerta será enviado a todos em um raio de 500 metros.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Descreva o ocorrido (obrigatório)"
          value={descricao}
          onChangeText={setDescricao}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Send size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.sendBtnText}>Enviar alerta</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bouton retour (footer, en bas de page) */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/home')}>
          <ChevronLeft size={20} color="#FF4444" style={{ marginRight: 6 }} />
          <Text style={styles.backText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flexContainer: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 24, paddingBottom: 100, backgroundColor: '#fff' },
  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#f44336',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 6,
  },
  alertTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  alertMsg: { color: '#fff', fontSize: 14 },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitle: { fontSize: 16, marginBottom: 10 },
  categoriaGroup: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  categoriaBtn: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 8,
    margin: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoriaBtnActive: { backgroundColor: '#007AFF' },
  categoriaText: { color: '#333', fontWeight: '500' },
  categoriaTextActive: { color: '#fff' },
  locBtn: {
    backgroundColor: '#e6f2ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locBtnText: { color: '#007AFF', fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 6, marginBottom: 12 },
  infoRayon: {
    fontSize: 14,
    color: '#555',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sendBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  footer: {
    padding: 18,
    backgroundColor: '#fff',
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
  },
  backBtn: {
    backgroundColor: '#ffecec',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#FF4444',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  backText: { color: '#FF4444', fontWeight: 'bold', fontSize: 17 },
});
