import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { db, auth } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import {
  MapPin, Bell, AlertTriangle, HandHeart, Flame, ShieldAlert,
  Bolt, Car, FileQuestion, Send, UserX
} from "lucide-react-native";
import { useAuthGuard } from '../../hooks/useAuthGuard';

const categories = [
  { label: "Roubo/Furto", icon: ShieldAlert, severity: "medium", color: "#FFA500" },
  { label: "Agressão", icon: UserX, severity: "medium", color: "#FFA500" },
  { label: "Incidente de trânsito", icon: Car, severity: "minor", color: "#FFE600" },
  { label: "Incêndio", icon: Flame, severity: "grave", color: "#FF3B30" },
  { label: "Falta de luz", icon: Bolt, severity: "minor", color: "#FFE600" },
  { label: "Mal súbito (problema de saúde)", icon: HandHeart, severity: "grave", color: "#FF3B30" },
  { label: "Outros", icon: FileQuestion, severity: "minor", color: "#007AFF" }
];

export default function ReportScreen() {
  const user = useAuthGuard();
  const router = useRouter();
  const [categoria, setCategoria] = useState(null);
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState(null);
  const [address, setAddress] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');
  const [loadingLoc, setLoadingLoc] = useState(false);
  if (!user) return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;

  const now = new Date();
  const dateBR = now.toLocaleDateString('pt-BR');
  const timeBR = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const selectedCategory = categories.find(c => c.label === categoria);
  const severityColor = selectedCategory?.color || '#007AFF';

  const handleLocation = async () => {
    setLoadingLoc(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingLoc(false);
        return Alert.alert('Permissão negada para acessar a localização.');
      }
      let loc = await Location.getCurrentPositionAsync({});
      setLocal(loc.coords);
      let [addr] = await Location.reverseGeocodeAsync(loc.coords);

      setRua(addr.street || '');
      setNumero(addr.name || '');
      setCidade(addr.city || addr.subregion || '');
      setEstado(addr.region || '');
      setCep(addr.postalCode || '');
      setAddress(`${addr.street || ''}, ${addr.name || ''} - ${addr.city || addr.subregion || ''}/${addr.region || ''} - ${addr.postalCode || ''}`);
    } catch (_) {
      Alert.alert('Erro', 'Não foi possível obter sua localização.');
    }
    setLoadingLoc(false);
  };

  const handleSend = async () => {
    if (!categoria) return Alert.alert('Selecione uma categoria.');
    if (!rua || !numero || !cidade || !estado || !cep) return Alert.alert('Preencha todos os campos de localização.');
    if (!descricao.trim()) return Alert.alert('Descreva o ocorrido.');
    try {
      await addDoc(collection(db, "publicAlerts"), {
        userId: auth.currentUser?.uid,
        apelido: user?.apelido || '',
        username: user?.username || '',
        categoria,
        descricao,
        gravidade: selectedCategory?.severity || '',
        color: severityColor,
        rua, numero, cidade, estado, cep, address,
        location: local,
        date: dateBR,
        time: timeBR,
        createdAt: serverTimestamp()
      });
      Alert.alert("Alerta enviado!", "Seu alerta foi registrado.");
      router.replace('/(tabs)/home');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <View style={styles.alertCard}>
          <AlertTriangle color="#fff" size={26} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>⚠️ Atenção!</Text>
            <Text style={styles.alertMsg}>
              Toda declaração feita no aplicativo envolve sua <Text style={{ fontWeight: "bold" }}>boa fé</Text> e <Text style={{ fontWeight: "bold" }}>responsabilidade</Text>.
              {"\n"}Nunca substitua os serviços de emergência!
              {"\n"}<Text style={{ fontWeight: "bold" }}>☎️ Ligue 190 (Polícia) ou 192 (Samu) em caso de risco ou emergência.</Text>
            </Text>
          </View>
        </View>

        <Text style={styles.title}>
          <Bell color="#007AFF" size={22} style={{ marginRight: 5 }} />
          Sinalizar um evento público
        </Text>

        <View style={styles.categoriaGroup}>
          {categories.map(({ label, icon: Icon, color }) => (
            <TouchableOpacity
              key={label}
              style={[
                styles.categoriaBtn,
                categoria === label && { backgroundColor: color, borderColor: color }
              ]}
              onPress={() => setCategoria(label)}
            >
              <Icon size={18} color={categoria === label ? "#fff" : color} style={{ marginRight: 7 }} />
              <Text style={[styles.categoriaText, categoria === label && { color: '#fff', fontWeight: 'bold' }]}>{label}</Text>
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

        <View style={styles.row}>
          <View style={styles.readonlyField}>
            <Text style={styles.readonlyLabel}>Data</Text>
            <Text style={styles.readonlyValue}>{dateBR}</Text>
          </View>
          <View style={styles.readonlyField}>
            <Text style={styles.readonlyLabel}>Horário</Text>
            <Text style={styles.readonlyValue}>{timeBR}</Text>
          </View>
        </View>

        <Text style={styles.label}>Localização</Text>
        <View style={styles.geoFields}>
          <TextInput
            style={styles.input}
            placeholder="Rua"
            value={rua}
            onChangeText={setRua}
          />
          <TextInput
            style={styles.input}
            placeholder="Número"
            value={numero}
            onChangeText={setNumero}
          />
          <TextInput
            style={styles.input}
            placeholder="Cidade"
            value={cidade}
            onChangeText={setCidade}
          />
          <TextInput
            style={styles.input}
            placeholder="Estado"
            value={estado}
            onChangeText={setEstado}
          />
          <TextInput
            style={styles.input}
            placeholder="CEP"
            value={cep}
            onChangeText={setCep}
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.locBtn} onPress={handleLocation} disabled={loadingLoc}>
            <MapPin color="#007AFF" size={18} style={{ marginRight: 8 }} />
            <Text style={styles.locBtnText}>
              {loadingLoc ? "Buscando localização..." : "Usar minha localização atual"}
            </Text>
          </TouchableOpacity>
        </View>

        {local && (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: local.latitude,
              longitude: local.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01
            }}
          >
            <Marker coordinate={{ latitude: local.latitude, longitude: local.longitude }} />
          </MapView>
        )}

        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: severityColor }]} onPress={handleSend}>
          <Send size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.sendBtnText}>Enviar alerta</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { paddingBottom: 36, backgroundColor: "#181A20" },
  container: { padding: 22, flex: 1, backgroundColor: "#181A20" },
  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#FF3B30',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 19,
    marginTop: 18,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 7,
    elevation: 3,
  },
  alertTitle: { color: "#fff", fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
  alertMsg: { color: "#fff", fontSize: 15 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15, color: '#fff', flexDirection: "row", alignItems: "center" },
  categoriaGroup: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16, gap: 6 },
  categoriaBtn: {
    backgroundColor: "#23262F",
    padding: 10,
    borderRadius: 9,
    margin: 3,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#23262F",
    minWidth: 110,
    justifyContent: 'center'
  },
  categoriaText: { color: "#007AFF", fontWeight: "500", fontSize: 15 },
  label: { color: '#fff', marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#353840", backgroundColor: "#222", color: "#fff", padding: 12, borderRadius: 7, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 7 },
  readonlyField: { flex: 1, backgroundColor: '#22252b', borderRadius: 7, padding: 10, alignItems: 'center' },
  readonlyLabel: { color: '#bbb', fontSize: 13 },
  readonlyValue: { color: '#fff', fontWeight: 'bold', fontSize: 15, marginTop: 2 },
  geoFields: { width: '100%' },
  locBtn: {
    backgroundColor: "#e6f2ff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center"
  },
  locBtnText: { color: "#007AFF", fontWeight: "bold" },
  map: { width: '100%', height: 130, borderRadius: 10, marginBottom: 12, marginTop: 2 },
  sendBtn: {
    borderRadius: 10,
    padding: 17,
    alignItems: "center",
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "center"
  },
  sendBtnText: { color: "#fff", fontWeight: "bold", fontSize: 18 },
});
