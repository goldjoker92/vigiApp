// screens/Report.jsx
// -------------------------------------------------------------
// Rôle : création d’un signalement PUBLIC dans /publicAlerts
// - Localisation (GPS) -> adresse + CEP (Google-first via utils/cep)
// - Sauvegarde Firestore avec createdAt + expiresAt = now + 90j (TTL)
// - Logs [REPORT] pour tout suivre (diagnostic production-friendly)
// - Déclenchement non-bloquant de la Cloud Function d’alerte publique
// - Toast UX friendly (pt-BR) : "Pronto para enviar" + champs manquants (😢)
// - ⚠️ Hooks : aucun return avant les hooks → évite "Rendered more hooks…"
// -------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  View,
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
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
const categories = [
  { label: 'Roubo/Furto', icon: ShieldAlert, severity: 'medium', color: '#FFA500' },
  { label: 'Agressão', icon: UserX, severity: 'medium', color: '#FFA500' },
  { label: 'Incidente de trânsito', icon: Car, severity: 'minor', color: '#FFE600' },
  { label: 'Incêndio', icon: Flame, severity: 'grave', color: '#FF3B30' },
  { label: 'Falta de luz', icon: Bolt, severity: 'minor', color: '#FFE600' },
  { label: 'Mal súbito (problema de saúde)', icon: HandHeart, severity: 'grave', color: '#FF3B30' },
  { label: 'Outros', icon: FileQuestion, severity: 'minor', color: '#007AFF' },
];

// Normalisation CEP
const onlyDigits = (v = '') => String(v).replace(/\D/g, '');
const formatCepDisplay = (digits) => (digits ? digits.replace(/(\d{5})(\d{3})/, '$1-$2') : '');

// Gravité -> couleur & rayon
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

// Adresse lisible pour notif
const buildEnderecoLabel = (ruaNumero, cidade, estado) =>
  [ruaNumero, cidade && `${cidade}/${estado}`].filter(Boolean).join(' — ');

// -------------------------------------------------------------
// Mini Toast interne (Animated, sans dépendance)
// -------------------------------------------------------------
function useToast(autoHideMs = 3800) {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const [variant, setVariant] = useState('info'); // 'info' | 'success' | 'error'
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-10)).current; // sort du haut

  const runAnim = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -10, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]).start(() => setVisible(false));
      }, autoHideMs);
    });
  };

  const showBase = (msg, v) => {
    setMessage(msg);
    setVariant(v);
    setVisible(true);
    runAnim();
  };

  const show = (msg) => showBase(msg, 'info');
  const showSuccess = (msg) => showBase(msg, 'success');
  const showError = (msg) => showBase(msg, 'error');

  const Toast = () =>
    visible ? (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          variant === 'success' && styles.toastSuccess,
          variant === 'error' && styles.toastError,
          { opacity, transform: [{ translateY }] },
        ]}
      >
        <Text style={styles.toastText}>{message}</Text>
      </Animated.View>
    ) : null;

  return { show, showSuccess, showError, Toast };
}

// -------------------------------------------------------------
// Composant
// -------------------------------------------------------------
export default function ReportScreen() {
  // ⚠️ Tous les hooks en haut, aucun return avant → évite "Rendered more hooks…"
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

  const { show, showSuccess, showError, Toast } = useToast(3800);

  // 👉 Flags de rendu (on NE return PAS avant d'avoir défini les hooks)
  const isUserLoading = user === undefined;
  const isUserLoggedOut = !isUserLoading && !user;

  const now = new Date();
  const dateBR = now.toLocaleDateString('pt-BR');
  const timeBR = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const selectedCategory = categories.find((c) => c.label === categoria);
  const severityColorUI = selectedCategory?.color || '#007AFF';

  // Champs requis (CEP optionnel)
  const isBtnActive = !!(
    categoria &&
    descricao.trim().length > 0 &&
    ruaNumero.trim().length > 0 &&
    cidade.trim().length > 0 &&
    estado.trim().length > 0
  );

  // Liste des champs manquants (pt-BR)
  const missingFields = () => {
    const items = [];
    if (!categoria) items.push('tipo de evento');
    if (!descricao.trim()) items.push('descrição');
    if (!ruaNumero.trim()) items.push('rua e número');
    if (!cidade.trim()) items.push('cidade');
    if (!estado.trim()) items.push('estado');
    return items;
  };

  // Feedback positif quand on passe de incomplet -> complet
  const prevActiveRef = useRef(isBtnActive);
  useEffect(() => {
    if (!prevActiveRef.current && isBtnActive) {
      // ✈️/paper-plane style Telegram
      showSuccess('✈️  Pronto para enviar');
    }
    prevActiveRef.current = isBtnActive;
  }, [isBtnActive, showSuccess]);

  // -----------------------------------------------------------
  // Localisation -> CEP via Google + fallback UI
  // NOTE: Retourne les coords capturées (ou null) pour réutilisation.
  // -----------------------------------------------------------
  const handleLocation = async () => {
    console.log('[REPORT] handleLocation START');
    setLoadingLoc(true);
    let coordsCaptured = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[REPORT] Location perm =', status);
      if (status !== 'granted') {
        Alert.alert('Permissão negada para acessar a localização.');
        return null;
      }

      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      console.log('[REPORT] coords =', coords);
      setLocal(coords);
      coordsCaptured = coords;

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
        setCepPrecision('general'); // CEP opcional
      }
    } catch (e) {
      console.log('[REPORT] ERREUR =', e?.message || e);
      Alert.alert('Erro', 'Não foi possível obter sua localização.');
    } finally {
      setLoadingLoc(false);
      console.log('[REPORT] handleLocation END');
    }
    return coordsCaptured;
  };

  // -----------------------------------------------------------
  // Envoi du report
  // -----------------------------------------------------------
  const handleSend = async () => {
    console.log('[REPORT] handleSend START');

    if (!isBtnActive) {
      const faltantes = missingFields();
      if (faltantes.length) showError(`😢 Faltam: ${faltantes.join(', ')}.`);
      console.log('[REPORT] handleSend ABORT (missing fields):', faltantes);
      return;
    }

    // GPS non requis pour activer le bouton, mais requis pour l’envoi
    if (!local?.latitude || !local?.longitude) {
      console.log('[REPORT] No coords yet -> trying to fetch on send…');
      const coords = await handleLocation();
      if (!coords?.latitude || !coords?.longitude) {
        Alert.alert(
          'Posição necessária',
          'Precisamos da sua localização para enviar o alerta público. Ative a permissão ou toque em "Usar minha localização".'
        );
        console.log('[REPORT] handleSend ABORT (no coords after prompt)');
        return;
      }
    }

    try {
      // TTL Firestore
      const expires = new Date(Date.now() + DB_RETENTION_DAYS * 24 * 3600 * 1000);

      const sev = selectedCategory?.severity; // 'minor' | 'medium' | 'grave'
      const { color: mappedColor, radius_m } = severityToColorAndRadius(sev);
      const enderecoLabel = buildEnderecoLabel(ruaNumero, cidade, estado);

      // ⚠️ IMPORTANT : on duplique lat/lng AU NIVEAU RACINE + on sauve endereco
      const payload = {
        userId: auth.currentUser?.uid,
        apelido: user?.apelido || '',
        username: user?.username || '',
        categoria,
        descricao,
        gravidade: sev || 'medium',
        color: mappedColor,
        ruaNumero,
        cidade,
        estado,
        cep, // optionnel
        cepPrecision,
        pais: 'BR',
        endereco: enderecoLabel,      // <— lisible pour les écrans publics
        lat: local.latitude,          // <— racine (consommé par /public-alerts/[id])
        lng: local.longitude,         // <— racine
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
        radius: radius_m,             // compat
        radius_m,                     // champ standard
      };

      console.log('[REPORT] Firestore payload =', payload);

      // Sauvegarde Firestore
      const docRef = await addDoc(collection(db, 'publicAlerts'), payload);
      console.log('[REPORT] addDoc OK => id:', docRef.id);

      // Cloud Function (non-bloquant)
      (async () => {
        try {
          const body = {
            alertId: docRef.id,
            endereco: enderecoLabel,
            bairro: '',
            cidade,
            uf: estado,
            cep: onlyDigits(cep),
            lat: local.latitude,
            lng: local.longitude,
            radius_m,
            severidade: sev || 'medium',
            color: mappedColor,
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

      // UX : confirmation immédiate + retour Home
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
  // Bouton + overlay d'aide quand inactif (toast des manquants)
  // -----------------------------------------------------------
  const ButtonWithOverlay = (
    <View style={{ position: 'relative' }}>
      <TouchableOpacity
        style={[
          styles.sendBtn,
          { backgroundColor: isBtnActive ? severityColorUI : '#aaa', opacity: isBtnActive ? 1 : 0.6 },
        ]}
        onPress={handleSend}
        disabled={!isBtnActive}
        activeOpacity={0.9}
      >
        <Send size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.sendBtnText}>Enviar alerta</Text>
      </TouchableOpacity>

      {!isBtnActive && (
        <Pressable
          onPress={() => {
            const faltantes = missingFields();
            if (faltantes.length) showError(`😢 Faltam: ${faltantes.join(', ')}.`);
          }}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );

  // -----------------------------------------------------------
  // Render (pas de return précoces → on gère ici)
  // -----------------------------------------------------------
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {isUserLoading ? (
          <View style={{ flex: 1, paddingTop: 24 }}>
            <ActivityIndicator color="#22C55E" />
          </View>
        ) : null}

        {isUserLoggedOut ? <View style={{ padding: 22 }} /> : null}

        {!isUserLoading && !isUserLoggedOut && (
          <View style={styles.container}>
            <View style={styles.alertCard}>
              <AlertTriangle color="#fff" size={26} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>⚠️ Atenção!</Text>
                <Text style={styles.alertMsg}>
                  Toda declaração feita no aplicativo envolve sua <Text style={{ fontWeight: 'bold' }}>boa fé</Text> e{' '}
                  <Text style={{ fontWeight: 'bold' }}>responsabilidade</Text>.{'\n'}Nunca substitua os serviços de
                  emergência!{'\n'}
                  <Text style={{ fontWeight: 'bold' }}>☎️ Ligue 190 (Polícia) ou 192 (Samu) em caso de risco ou emergência.</Text>
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
                  style={[styles.categoriaBtn, categoria === label && { backgroundColor: color, borderColor: color }]}
                  onPress={() => setCategoria(label)}
                >
                  <Icon size={18} color={categoria === label ? '#fff' : color} style={{ marginRight: 7 }} />
                  <Text style={[styles.categoriaText, categoria === label && { color: '#fff', fontWeight: 'bold' }]}>
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
            <TextInput style={styles.input} placeholder="Cidade (obrigatório)" value={cidade} onChangeText={setCidade} />
            <TextInput style={styles.input} placeholder="Estado (obrigatório)" value={estado} onChangeText={setEstado} />
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
                  : 'CEP não foi identificado — você pode inserir manualmente (opcional).'}
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

            {ButtonWithOverlay}

            <Text style={styles.hint}>
              • O CEP é opcional.{'\n'}• Se você ainda não usou sua localização, vamos pedir permissão ao enviar.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Zone d’ancrage du toast (EN HAUT) */}
      <View pointerEvents="none" style={styles.toastContainer}>
        <Toast />
      </View>
    </View>
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
  hint: { color: '#8A96A3', marginTop: 10, fontSize: 13, lineHeight: 18 },

  // Toast (TOP)
  toastContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 18, // plus haut
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  toast: {
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.25)',
  },
  toastSuccess: {
    backgroundColor: 'rgba(22, 163, 74, 0.96)',
    borderColor: 'rgba(34,197,94,0.25)',
  },
  toastError: {
    backgroundColor: 'rgba(185, 28, 28, 0.96)',
    borderColor: 'rgba(248,113,113,0.25)',
  },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
  console.log('[REPORT] reverseGeocodeCityUf START with:', { latitude, longitude });