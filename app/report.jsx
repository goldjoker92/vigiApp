// screens/Report.jsx
// -------------------------------------------------------------
// Rôle : création d’un signalement PUBLIC
// Mini-map : cachée par défaut, s’affiche après GPS.
// Localisation :
//   - Bouton GPS -> reverseGeocode (Expo) pour préremplir immédiatement,
//                  puis resolveExactCepFromCoords (Google-first) pour CEP/adresse précis.
//   - Saisie manuelle : plus de géocodage ni d’affichage map.
// Sauvegarde : Firestore (collection "publicAlerts").
// Logs : [REPORT] [UI] [GEO] [MAP] [CEP] [KEY]
// Notes UI :
//   - Responsive all screen (safe area + KeyboardAvoiding + map height dynamique).
//   - provider Google seulement sur Android, et PAS dans Expo Go.
//   - La mini-map recentre sur la dernière coord connue.
// -------------------------------------------------------------

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, View, ActivityIndicator, useWindowDimensions,
  KeyboardAvoidingView, Platform, SafeAreaView, StatusBar
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import {
  MapPin, Bell, AlertTriangle, HandHeart, Flame, ShieldAlert,
  Bolt, Car, FileQuestion, Send, UserX
} from "lucide-react-native";
import { useAuthGuard } from '../hooks/useAuthGuard';
import { resolveExactCepFromCoords } from '@/utils/cep';
import { GOOGLE_MAPS_KEY } from '@/utils/env';


// Helper log (horodaté + tag)
const log = (tag, ...args) => console.log(`[REPORT][${tag}]`, ...args);

// Catégories
const categories = [
  { label: "Roubo/Furto", icon: ShieldAlert, severity: "medium", color: "#FFA500" },
  { label: "Agressão", icon: UserX, severity: "medium", color: "#FFA500" },
  { label: "Incidente de trânsito", icon: Car, severity: "minor", color: "#FFE600" },
  { label: "Incêndio", icon: Flame, severity: "grave", color: "#FF3B30" },
  { label: "Falta de luz", icon: Bolt, severity: "minor", color: "#FFE600" },
  { label: "Mal súbito (problema de saúde)", icon: HandHeart, severity: "grave", color: "#FF3B30" },
  { label: "Outros", icon: FileQuestion, severity: "minor", color: "#007AFF" }
];

// Région par défaut (si aucune coord)
const DEFAULT_REGION = {
  latitude: -3.7327, longitude: -38.5267, latitudeDelta: 0.02, longitudeDelta: 0.02
};

// —— Reverse-geocode (Expo) → remplit vite les champs
const applyReverseGeo = (placemark) => {
  if (!placemark) return null;
  const street = placemark.street || placemark.name || '';
  const cidade =
    placemark.city || placemark.subregion || placemark.district || placemark.region || '';
  const estado =
    placemark.region || placemark.administrativeArea || placemark.subregion || placemark.city || '';
  const cepDigits = String(placemark.postalCode || '').replace(/\D/g, '');
  const cepPretty = cepDigits ? cepDigits.replace(/(\d{5})(\d{3})/, '$1-$2') : '';
  log('GEO', 'reverseGeo ->', { street, cidade, estado, postalCode: placemark.postalCode });
  return { ruaNumero: street, cidade, estado, cep: cepPretty };
};

export default function ReportScreen() {
  const router = useRouter();
  const user = useAuthGuard();

  // ---------- Responsive metrics ----------
  const { height, width } = useWindowDimensions();

  // Hauteur dynamique de la mini-map (responsive, bornée)
  const mapHeight = useMemo(() => {
    const h = Math.round(height * 0.28);
    return Math.max(180, Math.min(360, h));
  }, [height]);

  // Largeur max du contenu (tablettes)
  const contentMaxWidth = Math.min(width, 720);

  // ---------- State principal ----------
  const [categoria, setCategoria]     = useState(null);
  const [descricao, setDescricao]     = useState('');
  const [ruaNumero, setRuaNumero]     = useState('');
  const [cidade, setCidade]           = useState('');
  const [estado, setEstado]           = useState('');
  const [cep, setCep]                 = useState('');
  const [cepPrecision, setCepPrecision] = useState('none');

  // Local (coordonnées) -> mini-map + Firestore
  const [local, setLocal]             = useState(null);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [loadingLoc, setLoadingLoc]   = useState(false);

  // Map ref pour recentrer
  const mapRef = useRef(null);

  // Log environnement (Expo Go vs Dev Client)
  useEffect(() => {
    log('KEY', 'appOwnership =', Constants.appOwnership);
  }, []);

  // Recentrer la mini-map quand local change
  useEffect(() => {
    if (local && mapRef.current) {
      const region = { latitude: local.latitude, longitude: local.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
      log('MAP', 'animateToRegion =>', region);
      mapRef.current.animateToRegion(region, 350);
    }
  }, [local]);

  if (user === undefined) return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;
  if (!user) return null;

  const now = new Date();
  const dateBR = now.toLocaleDateString('pt-BR');
  const timeBR = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const selectedCategory = categories.find(c => c.label === categoria);
  const severityColor    = selectedCategory?.color || '#007AFF';

  const formatCep = (val) => String(val || '').replace(/[^0-9]/g, '').trim();

  // Provider : Google seulement sur Android ET pas dans Expo Go
  const isExpoGo = Constants.appOwnership === 'expo';
  const mapProvider = Platform.OS === 'android' && !isExpoGo ? PROVIDER_GOOGLE : undefined;

  // ---------- 1) Bouton "Usar minha localização atual" (GPS) ----------
  const handleLocation = async () => {
    log('UI', 'handleLocation CLICK');
    setLoadingLoc(true);

    // Affiche immédiatement la mini-map (anti-écran blanc) + fallback défaut
    if (!showMiniMap) setShowMiniMap(true);
    if (!local) {
      setLocal({ latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude });
      log('MAP', 'preset DEFAULT_REGION while waiting GPS');
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      log('GEO', 'permission =', status);
      if (status !== 'granted') {
        Alert.alert('Permissão negada para acessar a localização.');
        return; // minimap reste visible, centrée défaut
      }

      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      log('GEO', 'coords =', coords);
      setLocal({ latitude: coords.latitude, longitude: coords.longitude });

      // 1) Pré-remplissage immédiat (reverse-geocode Expo)
      try {
        const placemarks = await Location.reverseGeocodeAsync({
          latitude: coords.latitude, longitude: coords.longitude,
        });
        log('GEO', 'reverseGeocode hits =', placemarks?.length);
        if (Array.isArray(placemarks) && placemarks.length > 0) {
          const quick = applyReverseGeo(placemarks[0]);
          if (quick) {
            if (quick.ruaNumero) setRuaNumero(quick.ruaNumero);
            if (quick.cidade) setCidade(quick.cidade);
            if (quick.estado) setEstado(quick.estado);
            if (quick.cep) { setCep(quick.cep); setCepPrecision('general'); }
            log('UI', 'form prefilled (reverse-geocode)');
          }
        }
      } catch (e) {
        log('GEO', 'reverseGeocode ERROR', e?.message || e);
      }

      // 2) Raffinement Google (CEP/logradouro/numero)
      try {
        log('CEP', 'resolveExactCepFromCoords START');
        const res = await resolveExactCepFromCoords(coords.latitude, coords.longitude, { googleApiKey: GOOGLE_MAPS_KEY });
        log('CEP', 'resolve result', { cep: res.cep, candidates: (res.candidates || []).length, address: res.address });

        const rua    = res.address?.logradouro || '';
        const numero = res.address?.numero || '';
        const ruaNum = [rua, numero].filter(Boolean).join(', ');
        const cidade = res.address?.cidade || '';
        const estado = res.address?.uf || '';

        if (ruaNum) setRuaNumero(ruaNum);
        if (cidade) setCidade(cidade);
        if (estado) setEstado(estado);

        if (res.cep) {
          setCep(res.cep);
          setCepPrecision('exact');
        } else if (Array.isArray(res.candidates) && res.candidates.length > 0) {
          setCep('');
          setCepPrecision('needs-confirmation');
          Alert.alert('Confirme o CEP', 'Não foi possível determinar um único CEP. Verifique o endereço ou insira o CEP se souber.');
        } else {
          if (!cep) setCepPrecision('general');
        }
        log('UI', 'form refined (google)');
      } catch (e) {
        log('CEP', 'resolveExactCepFromCoords ERROR', e?.message || e);
      }
    } catch (e) {
      log('GEO', 'ERROR', e?.message || e);
      Alert.alert('Erro', 'Não foi possível obter sua localização.');
    } finally {
      setLoadingLoc(false);
      log('UI', 'handleLocation END');
    }
  };

  // ---------- 2) (SUPPRIMÉ) Saisie manuelle : plus de géocodage ----------
  // -> on garde les champs éditables, mais aucun onBlur ni fetch déclenché.

  // ---------- 3) Envoi Firestore ----------
  const handleSend = async () => {
    log('UI', 'handleSend START');
    if (!categoria)               return Alert.alert('Selecione uma categoria.');
    if (!ruaNumero.trim())        return Alert.alert('Preencha o campo Rua e número.');
    if (!cidade.trim() || !estado.trim()) return Alert.alert('Preencha cidade e estado.');
    if (!descricao.trim())        return Alert.alert('Descreva o ocorrido.');

    try {
      const payload = {
        userId: auth.currentUser?.uid,
        apelido:  user?.apelido || '',
        username: user?.username || '',
        categoria,
        descricao,
        gravidade: selectedCategory?.severity || '',
        color: severityColor,
        ruaNumero, cidade, estado,
        cep, cepPrecision,
        location: local,               // coords (GPS)
        date: dateBR, time: timeBR,
        createdAt: serverTimestamp()
      };
      log('REPORT', 'payload =', payload);
      await addDoc(collection(db, 'publicAlerts'), payload);
      Alert.alert('Alerta enviado!', 'Seu alerta foi registrado.');
      router.replace('/(tabs)/home');
    } catch (e) {
      log('REPORT', 'Firestore ERROR', e?.message || e);
      Alert.alert('Erro', e.message);
    } finally {
      log('UI', 'handleSend END');
    }
  };

  // Activation bouton envoyer
  const isBtnActive = !!(
    categoria && descricao.trim() && ruaNumero.trim() && cidade.trim() && estado.trim()
  );

  // Région initiale pour la mini-map
  const initialRegion = local
    ? { latitude: local.latitude, longitude: local.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : DEFAULT_REGION;

  const kbOffset = (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0) + 8;

  // ---------- UI ----------
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={kbOffset}
      >
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={[styles.scrollContent, { minHeight: height }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.container, { maxWidth: contentMaxWidth, alignSelf: 'center' }]}>
            {/* Bandeau alerte */}
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

            {/* Titre */}
            <View style={styles.titleRow}>
              <Bell color="#007AFF" size={22} style={{ marginRight: 8 }} />
              <Text style={styles.title}>Sinalizar um evento público</Text>
            </View>

            {/* Catégories */}
            <View style={styles.categoriaGroup}>
              {categories.map(({ label, icon: Icon, color }) => (
                <TouchableOpacity
                  key={label}
                  style={[styles.categoriaBtn, categoria === label && { backgroundColor: color, borderColor: color }]}
                  onPress={() => { setCategoria(label); log('UI', 'category =', label); }}
                  activeOpacity={0.8}
                >
                  <Icon size={18} color={categoria === label ? "#fff" : color} style={{ marginRight: 7 }} />
                  <Text style={[styles.categoriaText, categoria === label && { color: '#fff', fontWeight: 'bold' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description */}
            <Text style={styles.label}>Descreva o ocorrido</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              placeholder="Descrição (obrigatório)"
              placeholderTextColor="#9aa0a6"
              value={descricao}
              onChangeText={(t) => { setDescricao(t); }}
              multiline
            />

            {/* Date / Heure */}
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

            {/* Localização */}
            <Text style={styles.label}>Localização</Text>
            <TextInput
              style={styles.input}
              placeholder="Rua e número (obrigatório)"
              placeholderTextColor="#9aa0a6"
              value={ruaNumero}
              onChangeText={setRuaNumero}
              returnKeyType="next"
            />
            <TextInput
              style={styles.input}
              placeholder="Cidade (obrigatório)"
              placeholderTextColor="#9aa0a6"
              value={cidade}
              onChangeText={setCidade}
              returnKeyType="next"
            />
            <TextInput
              style={styles.input}
              placeholder="Estado (obrigatório)"
              placeholderTextColor="#9aa0a6"
              value={estado}
              onChangeText={setEstado}
              returnKeyType="next"
            />
            <TextInput
              style={styles.input}
              placeholder="CEP (opcional)"
              placeholderTextColor="#9aa0a6"
              value={cep}
              onChangeText={(v) => {
                const digits = formatCep(v);
                const pretty = digits ? digits.replace(/(\d{5})(\d{3})/, '$1-$2') : '';
                setCep(pretty);
                log('CEP', 'manual edit =>', { input: v, digits, pretty });
              }}
              keyboardType="numeric"
              returnKeyType="done"
            />
            {cepPrecision !== 'none' && (
              <Text style={{ color: '#aaa', marginBottom: 6, marginLeft: 2, fontSize: 13 }}>
                {cepPrecision === 'exact'
                  ? 'CEP exato detectado.'
                  : cepPrecision === 'needs-confirmation'
                  ? 'Vários CEPs possíveis — confirme o endereço/CEP.'
                  : 'CEP não foi identificado — você pode inserir manualmente.'}
              </Text>
            )}

            {/* Bouton localisation */}
            <TouchableOpacity style={styles.locBtn} onPress={handleLocation} disabled={loadingLoc} activeOpacity={0.85}>
              <MapPin color="#007AFF" size={18} style={{ marginRight: 8 }} />
              <Text style={styles.locBtnText}>
                {loadingLoc ? "Buscando localização..." : "Usar minha localização atual"}
              </Text>
            </TouchableOpacity>

            {/* Mini-map */}
            {showMiniMap && (
              <View style={[styles.mapWrapper, { height: mapHeight }]}>
                <MapView
                  ref={mapRef}
                  provider={mapProvider}
                  style={styles.map}
                  initialRegion={initialRegion}
                  onMapReady={() => log('MAP', 'MiniMap ready | region =', initialRegion)}
                  onMapLoaded={() => log('MAP', 'tiles LOADED')}
                  onError={(e) => log('MAP', 'ERROR', e?.nativeEvent || e)}
                  toolbarEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  liteMode={false}
                  showsUserLocation={true}
                  showsMyLocationButton={true}
                  mapType="standard"
                >
                  {local && <Marker coordinate={local} title="Local selecionado" />}
                </MapView>
              </View>
            )}

            {/* Envoi */}
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: isBtnActive ? severityColor : '#aaa', opacity: isBtnActive ? 1 : 0.7 }]}
              onPress={handleSend}
              disabled={!isBtnActive}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Enviar alerta"
            >
              <Send size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.sendBtnText}>Enviar alerta</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  flex1: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: "#181A20" },

  scrollContent: {
    paddingBottom: 36,
    paddingHorizontal: 0,
    backgroundColor: "#181A20",
    justifyContent: 'flex-start'
  },

  container: { padding: 22, flexGrow: 1, width: '100%' },

  alertCard: {
    flexDirection: 'row', backgroundColor: '#FF3B30', padding: 18, borderRadius: 16,
    alignItems: 'center', marginBottom: 19, marginTop: 8,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 7, elevation: 3,
  },
  alertTitle: { color: "#fff", fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
  alertMsg: { color: "#fff", fontSize: 15 },

  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 22, fontWeight: "bold", color: '#fff' },

  categoriaGroup: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16, gap: 6 },
  categoriaBtn: {
    backgroundColor: "#23262F", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 9, margin: 3,
    flexDirection: "row", alignItems: "center", borderWidth: 2, borderColor: "#23262F",
    minWidth: 110, justifyContent: 'center'
  },
  categoriaText: { color: "#007AFF", fontWeight: "500", fontSize: 15 },

  label: { color: '#fff', marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: "#353840", backgroundColor: "#222", color: "#fff",
    padding: 12, borderRadius: 7, marginBottom: 10
  },

  row: { flexDirection: 'row', gap: 10, marginBottom: 7 },
  readonlyField: { flex: 1, backgroundColor: '#22252b', borderRadius: 7, padding: 10, alignItems: 'center' },
  readonlyLabel: { color: '#bbb', fontSize: 13 },
  readonlyValue: { color: '#fff', fontWeight: 'bold', fontSize: 15, marginTop: 2 },

  locBtn: {
    backgroundColor: "#e6f2ff", borderRadius: 8, padding: 12, marginBottom: 10,
    flexDirection: "row", alignItems: "center", justifyContent: 'center'
  },
  locBtnText: { color: "#007AFF", fontWeight: "bold" },

  mapWrapper: { width: '100%', marginTop: 8, borderRadius: 12, overflow: 'hidden' },
  map: { width: '100%', height: '100%' },

  sendBtn: {
    borderRadius: 10, padding: 17, alignItems: "center", marginTop: 14,
    flexDirection: "row", justifyContent: "center"
  },
  sendBtnText: { color: "#fff", fontWeight: "bold", fontSize: 18 },
});
