import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useUserStore } from '../store/users';
import { useGrupoDetails } from '../hooks/useGrupoDetails';
import { useRouter } from 'expo-router';
import {
  Bell, HeartPulse, Flame, HelpCircle, Droplets, WifiOff, Send, MapPin
} from "lucide-react-native";
import Toast from 'react-native-toast-message';

const categories = [
  { label: "Falta de água", icon: Droplets, severity: "minor", color: "#0099FF" },
  { label: "Falta de internet", icon: WifiOff, severity: "minor", color: "#7B61FF" },
  { label: "Mal súbito (saúde)", icon: HeartPulse, severity: "grave", color: "#FF3B30" },
  { label: "Incêndio doméstico", icon: Flame, severity: "grave", color: "#FF3B30" },
  { label: "Outros", icon: HelpCircle, severity: "minor", color: "#007AFF" }
];

export default function ReportGroupScreen() {
  const router = useRouter();
  const { user, groupId } = useUserStore();
  const { grupo } = useGrupoDetails(groupId);

  const [categoria, setCategoria] = useState(null);
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState(null);
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');

  // Pré-remplir avec données user si dispo
  useEffect(() => {
    setRua(user?.endereco || '');
    setNumero(user?.numero || '');
    setCidade(user?.cidade || '');
    setEstado(user?.estado || '');
    setCep(user?.cep || '');
  }, [user]);

  // Géolocalisation avancée (optionnelle)
  const handleLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permissão negada para acessar a localização.');
      let loc = await Location.getCurrentPositionAsync({});
      setLocal(loc.coords);
      let [addr] = await Location.reverseGeocodeAsync(loc.coords);
      setRua(addr.street || '');
      setNumero(addr.name || '');
      setCidade(addr.city || addr.subregion || '');
      setEstado(addr.region || '');
      setCep(addr.postalCode || '');
    } catch (_) {
      Alert.alert('Erro', 'Não foi possível obter sua localização.');
    }
  };

  // ENVOI FIRESTORE
  const handleSend = async () => {
    if (!categoria) return Alert.alert('Selecione uma categoria.');
    if (!rua || !cidade || !estado || !cep) return Alert.alert('Preencha todos os campos de localização.');
    if (!descricao.trim()) return Alert.alert('Descreva o ocorrido.');
    try {
      await addDoc(collection(db, "groupAlerts"), {
        groupId,
        userId: auth.currentUser?.uid,
        apelido: user?.apelido || '',
        categoria,
        descricao,
        rua, numero, cidade, estado, cep,
        location: local,
        createdAt: serverTimestamp()
      });
      Toast.show({
        type: 'success',
        text1: "Alerta enviado ao grupo!",
        text2: grupo?.name || '',
      });
      router.replace('/(tabs)/vizinhos');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        {/* Carte d'avertissement */}
        <View style={styles.alertCard}>
          <Bell color="#fff" size={24} style={{ marginRight: 10 }} />
          <View>
            <Text style={styles.alertTitle}>Atenção</Text>
            <Text style={styles.alertMsg}>
              Seu alerta será enviado para o grupo <Text style={{ fontWeight: "bold", color:'#22C55E' }}>{grupo?.name || ""}</Text>.
            </Text>
          </View>
        </View>
        <Text style={styles.title}>Sinalizar para o grupo</Text>
        {/* Catégories */}
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
        {/* Description */}
        <TextInput
          style={styles.input}
          placeholder="Descrição do incidente"
          value={descricao}
          onChangeText={setDescricao}
          multiline
        />
        {/* Localisation auto/pré-remplie */}
        <Text style={styles.label}>Localização</Text>
        <View style={styles.geoFields}>
          <TextInput style={styles.input} placeholder="Rua" value={rua} onChangeText={setRua} />
          <TextInput style={styles.input} placeholder="Número" value={numero} onChangeText={setNumero} />
          <TextInput style={styles.input} placeholder="Cidade" value={cidade} onChangeText={setCidade} />
          <TextInput style={styles.input} placeholder="Estado" value={estado} onChangeText={setEstado} />
          <TextInput style={styles.input} placeholder="CEP" value={cep} onChangeText={setCep} keyboardType="numeric" />
          <TouchableOpacity style={styles.locBtn} onPress={handleLocation}>
            <MapPin color="#007AFF" size={18} style={{ marginRight: 8 }} />
            <Text style={styles.locBtnText}>Usar minha localização atual</Text>
          </TouchableOpacity>
        </View>
        {/* Carte */}
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
        {/* Bouton envoyer */}
        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: '#22C55E' }]} onPress={handleSend}>
          <Send size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.sendBtnText}>Enviar alerta ao grupo</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { paddingBottom: 36, backgroundColor: "#181A20" },
  container: { padding: 22, flex: 1, backgroundColor: "#181A20" },
  alertCard: {
    flexDirection: 'row', backgroundColor: '#007AFF', padding: 14, borderRadius: 14,
    alignItems: 'center', marginBottom: 16,
  },
  alertTitle: { color: "#fff", fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  alertMsg: { color: "#fff", fontSize: 14 },
  title: { fontSize: 21, fontWeight: "bold", marginBottom: 15, color: '#fff', marginTop:6 },
  categoriaGroup: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16, gap: 7 },
  categoriaBtn: {
    backgroundColor: "#23262F", padding: 10, borderRadius: 9, margin: 3, flexDirection: "row",
    alignItems: "center", borderWidth: 2, borderColor: "#23262F", minWidth: 120, justifyContent: 'center'
  },
  categoriaText: { color: "#007AFF", fontWeight: "500", fontSize: 15 },
  input: { borderWidth: 1, borderColor: "#353840", backgroundColor: "#222", color: "#fff", padding: 12, borderRadius: 7, marginBottom: 10 },
  label: { color: '#fff', marginBottom: 4, marginTop: 8 },
  geoFields: { width: '100%' },
  locBtn: { backgroundColor: "#e6f2ff", borderRadius: 8, padding: 12, marginBottom: 9, flexDirection: "row", alignItems: "center" },
  locBtnText: { color: "#007AFF", fontWeight: "bold" },
  map: { width: '100%', height: 130, borderRadius: 10, marginBottom: 12, marginTop: 2 },
  sendBtn: {
    borderRadius: 10, padding: 17, alignItems: "center", marginTop: 14,
    flexDirection: "row", justifyContent: "center"
  },
    sendBtnText: { color: "#fff", fontWeight: "bold", fontSize: 17 }
  });