// screens/Report.jsx
// -------------------------------------------------------------
// Rôle : création d’un signalement PUBLIC dans /publicAlerts
// - Localisation (GPS) -> adresse + CEP (Google-first via utils/cep)
// - Sauvegarde Firestore avec createdAt + expiresAt = now + 90j (TTL)
// - Logs [REPORT] pour tout suivre (diagnostic production-friendly)
// - Déclenchement non-bloquant de la Cloud Function d’alerte publique
// -------------------------------------------------------------

import React, { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  View,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useRouter } from 'expo-router';
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
import { resolveExactCepFromCoords } from '@/utils/cep';
import { GOOGLE_MAPS_KEY } from '@/utils/env';

// -------------------------------------------------------------
// Constantes & utilitaires
// -------------------------------------------------------------

const DB_RETENTION_DAYS = 90; // TTL base (analytics), indépendant de la carte

// Catégories affichées (UI)
// NOTE: on garde la couleur UI pour cohérence visuelle du bouton,
// mais la couleur "formulaire" envoyée et le rayon sont re-mappés
// proprement via la "gravidade" (minor/medium/grave) plus bas.
const categories = [
  { label: 'Roubo/Furto', icon: ShieldAlert, severity: 'medium', color: '#FFA500' },
  { label: 'Agressão', icon: UserX, severity: 'medium', color: '#FFA500' },
  { label: 'Incidente de trânsito', icon: Car, severity: 'minor', color: '#FFE600' },
  { label: 'Incêndio', icon: Flame, severity: 'grave', color: '#FF3B30' },
  { label: 'Falta de luz', icon: Bolt, severity: 'minor', color: '#FFE600' },
  { label: 'Mal súbito (problema de saúde)', icon: HandHeart, severity: 'grave', color: '#FF3B30' },
  { label: 'Outros', icon: FileQuestion, severity: 'minor', color: '#007AFF' },
];

// Normalisation CEP -> "99999-999" (affichage) / digits only (backend)
const onlyDigits = (v = '') => String(v).replace(/\D/g, '');
const formatCepDisplay = (digits) => (digits ? digits.replace(/(\d{5})(\d{3})/, '$1-$2') : '');

// Mapping gravité -> (couleur, portée en mètres)
// - on utilise CE MAPPING pour:
//   1) payload.color (couleur formulaire)
//   2) payload.radius_m (clé standard pour le backend / FCM)
const severityToColorAndRadius = (sev) => {
  switch (sev) {
    case 'minor':
      return { color: '#FFE600', radius_m: 500 }; // jaune
    case 'grave':
      return { color: '#FF3B30', radius_m: 2000 }; // rouge
    case 'medium':
    default:
      return { color: '#FFA500', radius_m: 1000 }; // orange
  }
};

// Adresse lisible pour la notif (ex: "Rua X, 123 — Fortaleza/CE")
const buildEnderecoLabel = (ruaNumero, cidade, estado) =>
  [ruaNumero, cidade && `${cidade}/${estado}`].filter(Boolean).join(' — ');

// -------------------------------------------------------------
// Composant
// -------------------------------------------------------------

export default function ReportScreen() {
  const router = useRouter();
  const user = useAuthGuard();

  const [categoria, setCategoria] = useState(null);
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState(null);
  const [ruaNumero, setRuaNumero] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [cepPrecision, setCepPrecision] = useState('none');

  if (user === undefined) {
    return <ActivityIndicator style={{ flex: 1 }} color="#22C55E" />;
  }
  if (!user) {
    return null;
  }

  const now = new Date();
  const dateBR = now.toLocaleDateString('pt-BR');
  const timeBR = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const selectedCategory = categories.find((c) => c.label === categoria);
  // Couleur UI du bouton = couleur de la catégorie (pas la mapping gravité, pour ne pas casser l’habitude visuelle)
  const severityColorUI = selectedCategory?.color || '#007AFF';

  // -----------------------------------------------------------
  // Localisation -> CEP via Google + fallback UI
  // -----------------------------------------------------------
  const handleLocation = async () => {
    console.log('[REPORT] handleLocation START');
    setLoadingLoc(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[REPORT] Location perm =', status);
      if (status !== 'granted') {
        Alert.alert('Permissão negada para acessar a localização.');
        return;
      }

      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      console.log('[REPORT] coords =', coords);
      setLocal(coords);

      // Reverse geocoding -> CEP (Google-first)
      console.log('[REPORT] resolveExactCepFromCoords…');
      const res = await resolveExactCepFromCoords(coords.latitude, coords.longitude, {
        googleApiKey: GOOGLE_MAPS_KEY,
      });
      console.log('[REPORT] resolve result =', {
        cep: res.cep,
        addr: res.address,
        candidates: (res.candidates || []).length,
      });

      const rua = res.address?.logradouro || '';
      const numero = res.address?.numero || '';
      let ruaNumeroVal = '';
      if (rua && numero) ruaNumeroVal = `${rua}, ${numero}`;
      else ruaNumeroVal = rua || numero || '';
      setRuaNumero(ruaNumeroVal.trim());
      setCidade(res.address?.cidade || '');
      setEstado(res.address?.uf || '');

      if (res.cep) {
        setCep(res.cep);
        setCepPrecision('exact');
      } else if (Array.isArray(res.candidates) && res.candidates.length > 0) {
        setCep('');
        setCepPrecision('needs-confirmation');
        Alert.alert(
          'Confirme o CEP',
          'Não foi possível determinar um único CEP. Verifique o endereço ou insira o CEP se souber.'
        );
      } else {
        setCep('');
        setCepPrecision('general');
        Alert.alert(
          'Localização imprecisa',
          'Não encontramos o CEP exato para esta rua. Você pode inserir manualmente o CEP (opcional).'
        );
      }
    } catch (e) {
      console.log('[REPORT] ERREUR =', e?.message || e);
      Alert.alert('Erro', 'Não foi possível obter sua localização.');
    } finally {
      setLoadingLoc(false);
      console.log('[REPORT] handleLocation END');
    }
  };

  // -----------------------------------------------------------
  // Envoi du report
  // -----------------------------------------------------------
  const handleSend = async () => {
    console.log('[REPORT] handleSend START');

    // Validations strictes (pas de régression)
    if (!categoria) return Alert.alert('Selecione uma categoria.');
    if (!ruaNumero.trim()) return Alert.alert('Preencha o campo Rua e número.');
    if (!cidade.trim() || !estado.trim()) {
      return Alert.alert('Preencha cidade e estado.');
    }
    if (!descricao.trim()) {
      return Alert.alert('Descreva o ocorrido.');
    }
    if (!local?.latitude || !local?.longitude) {
      return Alert.alert('Use sua localização para posicionar o alerta.');
    }

    try {
      // TTL Firestore
      const expires = new Date(Date.now() + DB_RETENTION_DAYS * 24 * 3600 * 1000);

      // 1) Mapping gravité -> (couleur + portée)
      const sev = selectedCategory?.severity; // 'minor' | 'medium' | 'grave'
      const { color: mappedColor, radius_m } = severityToColorAndRadius(sev);
      // On garde la couleur UI pour le bouton, mais on envoie "mappedColor" côté back
      // pour assurer la cohérence des niveaux de gravité dans la notif.

      // 2) Adresse lisible pour la notif
      const enderecoLabel = buildEnderecoLabel(ruaNumero, cidade, estado);

      // 3) Payload Firestore (AUCUNE régression)
      const payload = {
        userId: auth.currentUser?.uid,
        apelido: user?.apelido || '',
        username: user?.username || '',
        categoria,
        descricao,
        gravidade: sev || 'medium', // cohérence back
        color: mappedColor, // couleur formulaire normalisée (pas forcément la couleur UI)
        ruaNumero,
        cidade,
        estado,
        cep,
        cepPrecision,
        pais: 'BR',
        location: {
          latitude: local.latitude,
          longitude: local.longitude,
          accuracy: local.accuracy ?? null,
          heading: local.heading ?? null,
          altitudeAccuracy: local.altitudeAccuracy ?? null,
          speed: local.speed ?? null,
        },
        date: dateBR,
        time: timeBR,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expires),
        // Compat + standard
        radius: radius_m, // compat ancien champ
        radius_m, // clé standard
      };

      console.log('[REPORT] Firestore payload =', payload);

      // 4) Sauvegarde Firestore
      const docRef = await addDoc(collection(db, 'publicAlerts'), payload);
      console.log('[REPORT] addDoc OK => id:', docRef.id);

      // 5) Appel Cloud Function (non-bloquant) — on trace mais on ne bloque pas l’UX
      (async () => {
        try {
          const body = {
            alertId: docRef.id,
            endereco: enderecoLabel,
            bairro: '', // si tu ajoutes un champ quartier plus tard
            cidade,
            uf: estado,
            cep: onlyDigits(cep), // backend préfère digits only
            lat: local.latitude,
            lng: local.longitude,
            radius_m,
            severidade: sev || 'medium',
            color: mappedColor,
            // image: 'https://firebasestorage.googleapis.com/v0/b/<bucket>/o/banner_alerta.jpg?alt=media' // optionnel
          };
          console.log('[REPORT] Calling sendPublicAlertByAddress with:', body);

          const resp = await fetch(
            'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/sendPublicAlertByAddress',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          );

          const json = await resp.json().catch(() => null);
          console.log('[REPORT] sendPublicAlertByAddress response:', {
            status: resp.status,
            ok: resp.ok,
            json,
          });
        } catch (err) {
          console.log('[REPORT] sendPublicAlertByAddress ERROR:', err?.message || String(err));
        }
      })();

      // 6) UX : confirmation immédiate + retour Home
      Alert.alert('Alerta enviado!', 'Seu alerta foi registrado.');
      router.replace('/(tabs)/home');
    } catch (e) {
      console.log('[REPORT] Firestore ERREUR =', e?.message || e);
      Alert.alert('Erro', e.message);
    } finally {
      console.log('[REPORT] handleSend END');
    }
  };

  // -----------------------------------------------------------
  // State d’activation du bouton
  // -----------------------------------------------------------
  const isBtnActive = !!(
    categoria &&
    descricao.trim().length > 0 &&
    ruaNumero.trim().length > 0 &&
    cidade.trim().length > 0 &&
    estado.trim().length > 0 &&
    local?.latitude &&
    local?.longitude
  );

  // -----------------------------------------------------------
  // Render
  // -----------------------------------------------------------
  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
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
          <Bell color="#007AFF" size={22} style={{ marginRight: 5 }} />
          Sinalizar um evento público
        </Text>

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
              <Icon size={18} color={categoria === label ? '#fff' : color} style={{ marginRight: 7 }} />
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
        <TextInput
          style={styles.input}
          placeholder="Rua e número (obrigatório)"
          value={ruaNumero}
          onChangeText={setRuaNumero}
        />
        <TextInput
          style={styles.input}
          placeholder="Cidade (obrigatório)"
          value={cidade}
          onChangeText={setCidade}
        />
        <TextInput
          style={styles.input}
          placeholder="Estado (obrigatório)"
          value={estado}
          onChangeText={setEstado}
        />
        <TextInput
          style={styles.input}
          placeholder="CEP (opcional)"
          value={cep}
          onChangeText={setCep}
          onBlur={() =>
            setCep((v) => {
              const digits = onlyDigits(v);
              return formatCepDisplay(digits);
            })
          }
          keyboardType="numeric"
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

        <TouchableOpacity style={styles.locBtn} onPress={handleLocation} disabled={loadingLoc}>
          <MapPin color="#007AFF" size={18} style={{ marginRight: 8 }} />
          <Text style={styles.locBtnText}>
            {loadingLoc ? 'Buscando localização...' : 'Usar minha localização atual'}
          </Text>
        </TouchableOpacity>

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

        <TouchableOpacity
          style={[
            styles.sendBtn,
            {
              backgroundColor: isBtnActive ? severityColorUI : '#aaa',
              opacity: isBtnActive ? 1 : 0.6,
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
  );
}

// -------------------------------------------------------------
// Styles
// -------------------------------------------------------------
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
  categoriaText: { color: '#007AFF', fontWeight: '500', fontSize: 15 },
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
  row: { flexDirection: 'row', gap: 10, marginBottom: 7 },
  readonlyField: {
    flex: 1,
    backgroundColor: '#22252b',
    borderRadius: 7,
    padding: 10,
    alignItems: 'center',
  },
  readonlyLabel: { color: '#bbb', fontSize: 13 },
  readonlyValue: { color: '#fff', fontWeight: 'bold', fontSize: 15, marginTop: 2 },
  locBtn: {
    backgroundColor: '#e6f2ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locBtnText: { color: '#007AFF', fontWeight: 'bold' },
  map: { width: '100%', height: 130, borderRadius: 10, marginBottom: 12, marginTop: 2 },
  sendBtn: {
    borderRadius: 10,
    padding: 17,
    alignItems: 'center',
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
});
