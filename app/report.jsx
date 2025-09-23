// screens/Report.jsx
// -------------------------------------------------------------
// Rôle : création d’un signalement PUBLIC dans /publicAlerts
// - Localisation (GPS) -> adresse + CEP (Google-first via utils/cep)
// - Autocomplétion d’adresse Google Places **sous le champ** (pas de modal)
// - Sauvegarde Firestore avec createdAt + expiresAt = now + 90j (TTL)
// - Logs [REPORT] pour diagnostic
// - Déclenchement non-bloquant de la Cloud Function d’alerte publique
// - ✅ Toasters UX (queue) : positifs/info/erreur, 4s
// - ✅ Flux MANUEL **ou** AUTO : bouton actif sans GPS si champs requis OK
// -------------------------------------------------------------

import React, { useMemo, useRef, useState, useEffect } from 'react';
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
  Platform,
  Pressable,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
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
import { resolveExactCepFromCoords, GOOGLE_MAPS_KEY } from '@/utils/cep';

// -------------------------------------------------------------
// Constantes & utilitaires
// -------------------------------------------------------------

const DB_RETENTION_DAYS = 90; // TTL base (analytics)
const ALERT_RADIUS_M = 1000; // V1 publicIncident = 1km

const categories = [
  { label: 'Roubo/Furto', icon: ShieldAlert, severity: 'medium', color: '#FFA500' },
  { label: 'Agressão', icon: UserX, severity: 'medium', color: '#FFA500' },
  { label: 'Incidente de trânsito', icon: Car, severity: 'minor', color: '#FFE600' },
  { label: 'Incêndio', icon: Flame, severity: 'grave', color: '#FF3B30' },
  { label: 'Falta de luz', icon: Bolt, severity: 'minor', color: '#FFE600' },
  { label: 'Mal súbito (problema de saúde)', icon: HandHeart, severity: 'grave', color: '#FF3B30' },
  { label: 'Outros', icon: FileQuestion, severity: 'minor', color: '#007AFF' },
];

const onlyDigits = (v = '') => String(v).replace(/\D/g, '');
const formatCepDisplay = (digits) => (digits ? digits.replace(/(\d{5})(\d{3})/, '$1-$2') : '');

const severityToColor = (sev) => {
  switch (sev) {
    case 'minor':
      return '#FFE600';
    case 'grave':
      return '#FF3B30';
    case 'medium':
    default:
      return '#FFA500';
  }
};

const buildEnderecoLabel = (ruaNumero, cidade, estado) =>
  [ruaNumero, cidade && `${cidade}/${estado}`].filter(Boolean).join(' — ');

// -------------------------------------------------------------
// Validation "format brésilien" pour flux MANUEL
// (CEP optionnel ; si fourni, doit matcher le format)
// -------------------------------------------------------------
const isValidUF = (uf) => /^[A-Z]{2}$/.test(String(uf || '').trim());
const hasStreetNumber = (ruaNumero) => /\d+/.test(String(ruaNumero || ''));
const isValidCidade = (cidade) => /^[\p{L}\s'.-]+$/u.test(String(cidade || '').trim());
const isValidCepIfPresent = (cep) => {
  const d = onlyDigits(cep || '');
  return !d || /^\d{8}$/.test(d);
};

function validateBrazilianManualAddress({ ruaNumero, cidade, estado, cep }) {
  if (!ruaNumero?.trim() || !hasStreetNumber(ruaNumero)) {
    return { ok: false, msg: '🥲 Informe rua com número.' };
  }
  if (!cidade?.trim() || !isValidCidade(cidade)) {
    return { ok: false, msg: '🥲 Cidade inválida.' };
  }
  if (!estado?.trim() || !isValidUF(estado.toUpperCase())) {
    return { ok: false, msg: '🥲 UF deve ter 2 letras (ex.: CE).' };
  }
  if (!isValidCepIfPresent(cep)) {
    return { ok: false, msg: '🥲 CEP inválido (opcional, mas se informado deve ter 8 dígitos).' };
  }
  return { ok: true };
}

// -------------------------------------------------------------
// Geocoding (address -> coords) — utilisé pour le flux MANUEL
// -------------------------------------------------------------
async function geocodeAddressToCoords({ ruaNumero, cidade, estado, cep, googleKey }) {
  try {
    const addr = [ruaNumero, cidade, estado, cep].filter(Boolean).join(', ');
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      addr
    )}&region=br&key=${googleKey}`;
    console.log('[REPORT][MANUAL][GEO] forward geocode →', addr);
    const resp = await fetch(url);
    const json = await resp.json();
    if (json.status === 'OK' && json.results?.length) {
      const first = json.results[0];
      const loc = first.geometry?.location;
      if (loc?.lat && loc?.lng) {
        console.log('[REPORT][MANUAL][GEO] OK lat/lng =', loc);
        let cepOut = cep || '';
        const postal = first.address_components?.find((c) => c.types?.includes('postal_code'));
        if (!cepOut && postal?.long_name) {
          cepOut = postal.long_name;
        }
        return {
          ok: true,
          latitude: loc.lat,
          longitude: loc.lng,
          cep: cepOut,
        };
      }
    }
    console.log('[REPORT][MANUAL][GEO] KO :', json.status, json.error_message);
    return { ok: false, error: json.error_message || json.status || 'GEOCODE_FAILED' };
  } catch (e) {
    console.log('[REPORT][MANUAL][GEO] ERROR :', e?.message || String(e));
    return { ok: false, error: e?.message || 'GEOCODE_ERROR' };
  }
}

// -------------------------------------------------------------
// Toast léger avec **QUEUE** (pas de chevauchement)
// -------------------------------------------------------------
const TOAST_DURATION_MS = 4000;

function useToastQueue() {
  const [current, setCurrent] = useState(null);
  const queueRef = useRef([]);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const timerRef = useRef(null);
  const activeRef = useRef(false);

  const play = () => {
    if (activeRef.current) { return; }
    const next = queueRef.current.shift();
    if (!next) { return; }
    activeRef.current = true;
    setCurrent(next);
    progress.setValue(1);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(translateY, { toValue: 0, duration: 140, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
    ]).start();

    Animated.timing(progress, {
      toValue: 0,
      duration: TOAST_DURATION_MS,
      useNativeDriver: false,
      easing: Easing.linear,
    }).start();

    timerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -10, duration: 150, useNativeDriver: true }),
      ]).start(() => {
        setCurrent(null);
        activeRef.current = false;
        play();
      });
    }, TOAST_DURATION_MS);
  };

  const show = (toast) => {
    queueRef.current.push(toast);
    play();
  };

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

  const ToastOverlay = useMemo(() => {
    if (!current) {
      return null;
    }
    const bg = current.type === 'success' ? '#0ea15f' : current.type === 'error' ? '#b91c1c' : '#2b2e36';
    const border = current.type === 'success' ? '#22c55e' : current.type === 'error' ? '#ef4444' : '#3a3f4b';
    return (
      <Animated.View pointerEvents="none" style={[styles.toast, { opacity, transform: [{ translateY }], backgroundColor: bg, borderColor: border }]}>
        <Text style={styles.toastText}>{current.text}</Text>
        <View style={styles.toastProgressTrack}>
          <Animated.View
            style={{
              height: '100%',
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: 'rgba(255,255,255,0.9)',
              borderRadius: 999,
            }}
          />
        </View>
      </Animated.View>
    );
  }, [current, opacity, translateY, progress]);

  return { show, ToastOverlay };
}

// -------------------------------------------------------------
// Google Places Autocomplete (sous le champ)
// -------------------------------------------------------------
const PLACES_ENDPOINT = 'https://maps.googleapis.com/maps/api/place';

async function fetchPlacePredictions({ input, session, key, cidade, uf }) {
  try {
    if (!key || !input?.trim()) { return []; }
    // On biaise vers le Brésil + ville/uf si présents
    const locationBias = [cidade, uf, 'Brasil'].filter(Boolean).join(', ');
    const url = `${PLACES_ENDPOINT}/autocomplete/json?input=${encodeURIComponent(
      input + (locationBias ? `, ${locationBias}` : '')
    )}&language=pt-BR&components=country:br&sessiontoken=${encodeURIComponent(session)}&key=${key}`;

    const r = await fetch(url);
    const j = await r.json();
    if (j.status !== 'OK' || !Array.isArray(j.predictions)) {
      console.log('[REPORT][PLACES] autocomplete status=', j.status, j.error_message);
      return [];
    }
    return j.predictions.slice(0, 5).map((p) => ({
      id: p.place_id,
      main: p.structured_formatting?.main_text || p.description,
      secondary: p.structured_formatting?.secondary_text || '',
      description: p.description,
    }));
  } catch (e) {
    console.log('[REPORT][PLACES] autocomplete ERROR:', e?.message || String(e));
    return [];
  }
}

async function fetchPlaceDetails({ placeId, session, key }) {
  try {
    if (!key || !placeId) { return null; }
    const fields = ['geometry/location', 'address_components', 'formatted_address'].join(',');
    const url = `${PLACES_ENDPOINT}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&language=pt-BR&sessiontoken=${encodeURIComponent(session)}&key=${key}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.status !== 'OK' || !j.result) {
      console.log('[REPORT][PLACES] details status=', j.status, j.error_message);
      return null;
    }
    const comp = j.result.address_components || [];
    const find = (t) => comp.find((c) => (c.types || []).includes(t));
    const street = find('route')?.long_name || '';
    const number = find('street_number')?.long_name || '';
    const city = find('administrative_area_level_2')?.long_name || find('locality')?.long_name || '';
    const state = find('administrative_area_level_1')?.short_name || '';
    const cep = find('postal_code')?.long_name || '';

    const ruaNumero = [street, number].filter(Boolean).join(', ');
    const lat = j.result.geometry?.location?.lat;
    const lng = j.result.geometry?.location?.lng;

    return {
      ruaNumero,
      cidade: city,
      estado: state,
      cep,
      coords: Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null,
      formatted: j.result.formatted_address || '',
    };
  } catch (e) {
    console.log('[REPORT][PLACES] details ERROR:', e?.message || String(e));
    return null;
  }
}

// -------------------------------------------------------------
// Composant principal
// -------------------------------------------------------------
export default function ReportScreen() {
  const router = useRouter();
  const user = useAuthGuard();
  const userStatus = user === undefined ? 'loading' : user ? 'ready' : 'guest';

  const { show, ToastOverlay } = useToastQueue();

  // État formulaire
  const [categoria, setCategoria] = useState(null);
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState(null); // { latitude, longitude, ... }
  const [ruaNumero, setRuaNumero] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [cepPrecision, setCepPrecision] = useState('none');

  // Autocomplete
  const [placePredictions, setPlacePredictions] = useState([]);
  const [placesSession, setPlacesSession] = useState(String(Date.now()));
  const API_AUTOCOMP_KEY =
    process.env?.api_auto_completion ||
    Constants?.expoConfig?.extra?.api_auto_completion;

  // Garde-fou pour le séquencement AUTO
  const autoFlowActiveRef = useRef(false);

  const now = new Date();
  const dateBR = now.toLocaleDateString('pt-BR');
  const timeBR = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const selectedCategory = categories.find((c) => c.label === categoria);
  const severityColorUI = selectedCategory?.color || '#007AFF';

  // Champs requis (sans GPS)
  const isBtnActive = !!(
    categoria &&
    descricao.trim().length > 0 &&
    ruaNumero.trim().length > 0 &&
    cidade.trim().length > 0 &&
    estado.trim().length > 0
  );

  // Toast "prêt" auto sur MANUEL
  const readyToastShownRef = useRef(false);
  useEffect(() => {
    if (isBtnActive && !readyToastShownRef.current && !autoFlowActiveRef.current) {
      show({ type: 'success', text: '🛩️ Pronto pra enviar!' });
      readyToastShownRef.current = true;
    } else if (!isBtnActive) {
      readyToastShownRef.current = false;
    }
  }, [isBtnActive, show]);

  // AUTO: Localisation -> reverse + CEP
  const handleLocationAutoFlow = async () => {
    console.log('[REPORT][AUTO] handleLocation START');
    setLoadingLoc(true);
    autoFlowActiveRef.current = true;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[REPORT][AUTO] Location perm =', status);
      if (status !== 'granted') {
        show({ type: 'error', text: '😕 Permissão de localização negada.' });
        return;
      }

      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      console.log('[REPORT][AUTO] coords =', coords);
      setLocal(coords);

      // Reverse CEP via util Google-first
      console.log('[REPORT][AUTO] resolveExactCepFromCoords…');
      const res = await resolveExactCepFromCoords(coords.latitude, coords.longitude, {
        googleApiKey: GOOGLE_MAPS_KEY,
      });
      console.log('[REPORT][AUTO] resolve result =', {
        cep: res.cep,
        addr: res.address,
        candidates: (res.candidates || []).length,
      });

      const rua = res.address?.logradouro || '';
      const numero = res.address?.numero || '';
      const ruaNumeroVal = (rua && numero ? `${rua}, ${numero}` : rua || numero || '').trim();
      setRuaNumero(ruaNumeroVal);
      setCidade(res.address?.cidade || '');
      const uf = (res.address?.uf || '').toUpperCase();
      setEstado(uf);

      if (res.cep) {
        setCep(res.cep);
        setCepPrecision('exact');
        show({ type: 'info', text: '📍 Localização atualizada. CEP detectado.' });
      } else if (Array.isArray(res.candidates) && res.candidates.length > 0) {
        setCep('');
        setCepPrecision('needs-confirmation');
        show({ type: 'info', text: 'ℹ️ Vários CEPs possíveis — confirme o endereço/CEP.' });
      } else {
        setCep('');
        setCepPrecision('general');
        show({ type: 'info', text: '🔎 CEP exato não encontrado — pode inserir manualmente.' });
      }

      const formNowComplete =
        categoria && descricao.trim() && ruaNumeroVal && (res.address?.cidade || cidade).trim() && (uf || estado).trim();
      if (formNowComplete) {
        show({ type: 'success', text: '🛩️ Pronto pra enviar!' });
        readyToastShownRef.current = true;
      }
    } catch (e) {
      console.log('[REPORT][AUTO] ERREUR =', e?.message || e);
      show({ type: 'error', text: '🚫 Não foi possível obter sua localização.' });
    } finally {
      setLoadingLoc(false);
      autoFlowActiveRef.current = false;
      console.log('[REPORT][AUTO] handleLocation END');
    }
  };

  // Validation légère (toasts rouges si incomplet)
  const validateForSendCommon = () => {
    const missing = [];
    if (!categoria) { missing.push('• categoria'); }
    if (!descricao.trim()) { missing.push('• descrição'); }
    if (!ruaNumero.trim()) { missing.push('• rua e número'); }
    if (!cidade.trim()) { missing.push('• cidade'); }
    if (!estado.trim()) { missing.push('• estado/UF'); }
    if (missing.length) {
      const text = `⚠️ Campos obrigatórios faltando:\n${missing.join('\n')}`;
      show({ type: 'error', text });
      console.log('[REPORT][TOAST][GUIDE] missing =', missing);
      return false;
    }
    return true;
  };

  // MANUEL: envoi -> géocode si pas de coords ; vérif format BR
  const handleSendManualFlow = async () => {
    console.log('[REPORT][MANUAL] handleSendManualFlow');
    const fmt = validateBrazilianManualAddress({
      ruaNumero,
      cidade,
      estado: estado.toUpperCase(),
      cep,
    });
    if (!fmt.ok) {
      show({ type: 'error', text: fmt.msg });
      console.log('[REPORT][MANUAL] format invalid →', fmt.msg);
      return null;
    }

    let coords = local;
    if (!coords?.latitude || !coords?.longitude) {
      console.log('[REPORT][MANUAL] no coords — forward geocoding from address…');
      const g = await geocodeAddressToCoords({
        ruaNumero,
        cidade,
        estado: estado.toUpperCase(),
        cep: onlyDigits(cep),
        googleKey: GOOGLE_MAPS_KEY,
      });
      if (!g.ok) {
        show({ type: 'error', text: '📭 Endereço não encontrado. Verifique os campos.' });
        console.log('[REPORT][MANUAL] forward geocoding FAILED:', g.error);
        return null;
      }
      coords = { latitude: g.latitude, longitude: g.longitude };
      if (!cep && g.cep) { setCep(g.cep); }
      if (cepPrecision === 'none') { setCepPrecision('general'); }
    }

    return coords;
  };

  // AUTO: envoi
  const handleSendAutoFlow = async () => {
    console.log('[REPORT][AUTO] handleSendAutoFlow');
    if (local?.latitude && local?.longitude) {
      return local;
    }
    console.log('[REPORT][AUTO] Missing coords unexpectedly — fallback MANUAL geocode');
    return await handleSendManualFlow();
    };

  // Envoi du report (orchestrateur)
  const handleSend = async () => {
    console.log('[REPORT] handleSend START');

    if (!validateForSendCommon()) {
      console.log('[REPORT] handleSend ABORT: missing required fields');
      return;
    }

    const isAuto = !!(local?.latitude && local?.longitude);
    console.log('[REPORT] flow =', isAuto ? 'AUTO' : 'MANUAL');

    let coords = isAuto ? await handleSendAutoFlow() : await handleSendManualFlow();
    if (!coords) {
      console.log('[REPORT] handleSend ABORT: coords unavailable');
      return;
    }

    try {
      const expires = new Date(Date.now() + DB_RETENTION_DAYS * 24 * 3600 * 1000);
      const sev = selectedCategory?.severity;
      const mappedColor = severityToColor(sev);
      const enderecoLabel = buildEnderecoLabel(ruaNumero, cidade, estado.toUpperCase());

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
        estado: estado.toUpperCase(),
        cep,
        cepPrecision,
        pais: 'BR',
        location: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: local?.accuracy ?? null,
          heading: local?.heading ?? null,
          altitudeAccuracy: local?.altitudeAccuracy ?? null,
          speed: local?.speed ?? null,
        },
        date: dateBR,
        time: timeBR,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expires),
        radius: ALERT_RADIUS_M,
        radius_m: ALERT_RADIUS_M,
      };

      console.log('[REPORT] Firestore payload =', payload);
      const docRef = await addDoc(collection(db, 'publicAlerts'), payload);
      console.log('[REPORT] addDoc OK => id:', docRef.id);

      // Cloud Function (non-bloquant) — NOUVEL ENDPOINT
      (async () => {
        try {
          const body = {
            alertId: docRef.id,
            // on garde la compat de body comme convenu
            endereco: enderecoLabel,      // lisible
            address: enderecoLabel,       // pour la résolution côté back si besoin
            cidade,
            uf: estado.toUpperCase(),
            cep: onlyDigits(cep),
            // **centre** = coords du report (AUTO ou MANUEL) → DECISIF
            center: { lat: coords.latitude, lng: coords.longitude },

            // rayon = V1 1000 m ; futures features 3000 m pour "missing*"
            radius_m: ALERT_RADIUS_M,

            severidade: sev || 'medium',
            color: mappedColor,
            kind: 'publicIncident',
          };

          console.log('[REPORT] Calling sendPublicAlertByCenterUser with:', body);
          const resp = await fetch(
            'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/sendPublicAlertByCenterUser',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          );
          const json = await resp.json().catch(() => null);
          console.log('[REPORT] sendPublicAlertByCenterUser response:', {
            status: resp.status,
            ok: resp.ok,
            json,
          });
        } catch (err) {
          console.log('[REPORT] sendPublicAlertByCenterUser ERROR:', err?.message || String(err));
        }
      })();

      Alert.alert('Alerta enviado!', 'Seu alerta foi registrado.');
      console.log('[REPORT] handleSend SUCCESS → navigate home');
      router.replace('/(tabs)/home');
    } catch (e) {
      console.log('[REPORT] Firestore ERROR =', e?.message || e);
      Alert.alert('Erro', e.message);
    } finally {
      console.log('[REPORT] handleSend END');
    }
  };

  // -----------------------------------------------------------
  // Handlers Autocomplete sous le champ (pas de modal)
  // -----------------------------------------------------------
  const onRuaNumeroChange = async (text) => {
    setRuaNumero(text);
    // throttle léger: on laisse Google gérer la session
    if (!text || text.length < 3) {
      setPlacePredictions([]);
      return;
    }
    const preds = await fetchPlacePredictions({
      input: text,
      session: placesSession,
      key: API_AUTOCOMP_KEY,
      cidade,
      uf: estado,
    });
    setPlacePredictions(preds);
  };

  const onPickPrediction = async (pred) => {
    console.log('[REPORT][PLACES] pick', pred);
    const details = await fetchPlaceDetails({
      placeId: pred.id,
      session: placesSession,
      key: API_AUTOCOMP_KEY,
    });
    if (details) {
      if (details.ruaNumero) { setRuaNumero(details.ruaNumero); }
      if (details.cidade) { setCidade(details.cidade); }
      if (details.estado) { setEstado(details.estado.toUpperCase()); }
      if (details.cep) { setCep(details.cep); }
      if (details.coords) { setLocal(details.coords); }
      setCepPrecision(details.cep ? 'exact' : 'general');
      // reset session pour Google
      setPlacesSession(String(Date.now()));
      setPlacePredictions([]);
      show({ type: 'info', text: '📍 Endereço sugerido aplicado. Valide antes de enviar.' });
    }
  };

  // -----------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------
  return (
    <View style={{ flex: 1, backgroundColor: '#181A20' }}>
      {ToastOverlay}

      {userStatus !== 'ready' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {userStatus === 'loading' ? (
            <ActivityIndicator color="#22C55E" />
          ) : (
            <Text style={{ color: '#fff', opacity: 0.8 }}>Conecte-se para reportar um alerta.</Text>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.container}>
            <View style={styles.alertCard}>
              <AlertTriangle color="#fff" size={26} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>⚠️ Atenção!</Text>
                <Text style={styles.alertMsg}>
                  Toda declaração feita no aplicativo envolve sua{' '}
                  <Text style={{ fontWeight: 'bold' }}>boa fé</Text> e{' '}
                  <Text style={{ fontWeight: 'bold' }}>responsabilidade</Text>
                  {'\n'}
                  Nunca substitua os serviços de emergência!
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
              onChangeText={onRuaNumeroChange}
            />

            {/* Liste d’autocomplétion SOUS le champ (propositions cliquables) */}
            {placePredictions.length > 0 && (
              <View style={styles.predictionsBox}>
                {placePredictions.map((p) => (
                  <Pressable key={p.id} onPress={() => onPickPrediction(p)} style={styles.predItem}>
                    <Text style={styles.predMain}>{p.main}</Text>
                    {!!p.secondary && <Text style={styles.predSecondary}>{p.secondary}</Text>}
                  </Pressable>
                ))}
              </View>
            )}

            <TextInput
              style={styles.input}
              placeholder="Cidade (obrigatório)"
              value={cidade}
              onChangeText={setCidade}
            />
            <TextInput
              style={styles.input}
              placeholder="Estado/UF (ex.: CE) (obrigatório)"
              value={estado}
              onChangeText={(v) => setEstado(String(v).toUpperCase())}
              autoCapitalize="characters"
              maxLength={2}
            />
            <TextInput
              style={styles.input}
              placeholder="CEP (opcional)"
              value={cep}
              onChangeText={setCep}
              onBlur={() => setCep((v) => formatCepDisplay(onlyDigits(v)))}
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

            <TouchableOpacity
              style={styles.locBtn}
              onPress={handleLocationAutoFlow}
              disabled={loadingLoc}
            >
              <MapPin color="#007AFF" size={18} style={{ marginRight: 8 }} />
              <Text style={styles.locBtnText}>
                {loadingLoc ? 'Buscando localização...' : 'Usar minha localização atual'}
              </Text>
            </TouchableOpacity>

            {local?.latitude && local?.longitude && (
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

            <Pressable
              accessibilityRole="button"
              android_ripple={isBtnActive ? { color: 'rgba(255,255,255,0.2)', borderless: false } : null}
              onPress={() => {
                if (!isBtnActive) {
                  const missing = [];
                  if (!categoria) { missing.push('• categoria'); }
                  if (!descricao.trim()) { missing.push('• descrição'); }
                  if (!ruaNumero.trim()) { missing.push('• rua e número'); }
                  if (!cidade.trim()) { missing.push('• cidade'); }
                  if (!estado.trim()) { missing.push('• estado/UF'); }
                  const text = `⚠️ Campos obrigatórios faltando:\n${missing.join('\n')}`;
                  show({ type: 'error', text });
                  return;
                }
                handleSend();
              }}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: isBtnActive ? severityColorUI : '#aaa',
                  opacity: isBtnActive ? (pressed ? 0.9 : 1) : 1,
                },
              ]}
            >
              <Send size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.sendBtnText}>Enviar alerta</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
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
  // Autocomplete list
  predictionsBox: {
    backgroundColor: '#1f232b',
    borderColor: '#2a2f39',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: -6,
    marginBottom: 10,
    overflow: 'hidden',
  },
  predItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#2a2f39' },
  predMain: { color: '#fff', fontWeight: '600' },
  predSecondary: { color: '#a9b0bf', fontSize: 12, marginTop: 2 },

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

  // Toast styles
  toast: {
    position: 'absolute',
    top: Platform.select({ ios: 84, android: 56, default: 64 }),
    left: 8,
    right: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    zIndex: 999,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  toastText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  toastProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    overflow: 'hidden',
  },
});
