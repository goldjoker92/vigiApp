// screens/Report.jsx
// -------------------------------------------------------------
// Rôle : création d’un signalement PUBLIC dans /publicAlerts
// - Localisation (GPS) -> adresse + CEP (Google-first via utils/cep)
// - Sauvegarde via pipeline centralisé handleReportEvent (upsert + projections + métriques)
// - Déclenchement non-bloquant de la Cloud Function d’alerte publique (notif FG/BG)
// - Logs [REPORT] partout (diagnostic production-friendly)
// - Toasters UX (queue) : success/info/erreur, 4s, barre de temps
// - Flux MANUEL **ou** AUTO : bouton actif sans GPS si champs requis OK
// - Tracing client : traceId + logs début/fin appui bouton + affichage modale
// - Abonnement live (optionnel) à pushTraces/<traceId> si le back envoie des traces
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
import { auth, db } from '../firebase';
import {
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
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
import { resolveExactCepFromCoords, GOOGLE_MAPS_KEY } from '../utils/cep';
// 🔗 Nouveau pipeline (centralise upsert + projections + private + métriques)
import { handleReportEvent } from '../platform_services/alertPipeline';
// Observability / modération (dé-dupliqués côté back, on laisse la télémétrie front)
import { reportNewLexemesRaw } from '../platform_services/observability/mod_signals';
import { checkReportAcceptable } from '../platform_services/abuse_monitor';
import { abuseState } from '../platform_services/observability/abuse_strikes';

// -------------------------------------------------------------
// Constantes & utilitaires
// -------------------------------------------------------------

const DB_RETENTION_DAYS = 90; // TTL base (analytics/back)
const ALERT_RADIUS_M = 1000; // Rayon fixe V1 pour "incident" (danger public)

const categories = [
  { label: 'Roubo/Furto', icon: ShieldAlert, severity: 'medium', color: '#FFA500' },
  { label: 'Agressão', icon: UserX, severity: 'medium', color: '#FFA500' },
  { label: 'Incidente de trânsito', icon: Car, severity: 'minor', color: '#FFE600' },
  { label: 'Incêndio', icon: Flame, severity: 'grave', color: '#FF3B30' },
  { label: 'Falta de luz', icon: Bolt, severity: 'minor', color: '#FFE600' },
  { label: 'Mal súbito (saúde)', icon: HandHeart, severity: 'grave', color: '#FF3B30' },
  { label: 'Outros', icon: FileQuestion, severity: 'minor', color: '#007AFF' },
];

const onlyDigits = (v = '') => String(v).replace(/\D/g, '');
const formatCepDisplay = (digits) => (digits ? digits.replace(/(\d{5})(\d{3})/, '$1-$2') : '');

const severityToColor = (sev) => {
  switch (sev) {
    case 'minor':
      return '#FFE600'; // jaune
    case 'grave':
      return '#FF3B30'; // rouge
    case 'medium':
    default:
      return '#FFA500'; // orange
  }
};

const buildEnderecoLabel = (ruaNumero, cidade, estado) =>
  [ruaNumero, cidade && `${cidade}/${estado}`].filter(Boolean).join(' · ');

// --- Trace helpers (client)
function newTraceId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `trace_${t}_${r}`;
}

function attachPushTracesLive(traceId) {
  try {
    if (!db || !traceId) {
      return () => {};
    }
    const q = query(
      collection(db, 'pushTraces'),
      where('traceId', '==', traceId),
      orderBy('ts', 'asc'),
      limit(300),
    );
    console.log('[TRACE][CLIENT] subscribe start', traceId);
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((ch) => {
        const d = ch.doc.data();
        console.log('[TRACE][CLIENT]', traceId, d.step, d);
      });
    });
    return () => {
      console.log('[TRACE][CLIENT] unsubscribe', traceId);
      try {
        unsub && unsub();
      } catch {}
    };
  } catch (e) {
    console.log('[TRACE][CLIENT] subscribe error', e?.message || String(e));
    return () => {};
  }
}

// -------------------------------------------------------------
// Validation "format brésilien" pour flux MANUEL
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
    return { ok: false, msg: '⚠️ Informe rua com número.' };
  }
  if (!cidade?.trim() || !isValidCidade(cidade)) {
    return { ok: false, msg: '⚠️ Cidade inválida.' };
  }
  if (!estado?.trim() || !isValidUF(estado.toUpperCase())) {
    return { ok: false, msg: '⚠️ UF deve ter 2 letras (ex.: CE).' };
  }
  if (!isValidCepIfPresent(cep)) {
    return { ok: false, msg: '⚠️ CEP inválido (opcional, mas se informado deve ter 8 dígitos).' };
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
      addr,
    )}&region=br&key=${googleKey}`;
    console.log('[REPORT][MANUAL][GEO] forward geocode =>', addr);
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
        return { ok: true, latitude: loc.lat, longitude: loc.lng, cep: cepOut };
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
// Toast léger avec QUEUE (pas de chevauchement)
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
    if (activeRef.current) {
      return;
    }
    const next = queueRef.current.shift();
    if (!next) {
      return;
    }

    activeRef.current = true;
    setCurrent(next);
    progress.setValue(1);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
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
    const bg =
      current.type === 'success' ? '#0ea15f' : current.type === 'error' ? '#b91c1c' : '#2b2e36';
    const border =
      current.type === 'success' ? '#22c55e' : current.type === 'error' ? '#ef4444' : '#3a3f4b';
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          { opacity, transform: [{ translateY }], backgroundColor: bg, borderColor: border },
        ]}
      >
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
// Helpers validations UI
// -------------------------------------------------------------
function getMissingFields({ categoria, descricao, ruaNumero, cidade, estado }) {
  const missing = [];
  if (!categoria) {
    missing.push('• categoria');
  }
  if (!String(descricao || '').trim()) {
    missing.push('• descrição');
  }
  if (!String(ruaNumero || '').trim()) {
    missing.push('• rua e número');
  }
  if (!String(cidade || '').trim()) {
    missing.push('• cidade');
  }
  if (!String(estado || '').trim()) {
    missing.push('• estado/UF');
  }
  return missing;
}

function showDisabledGuideToast(show, fields) {
  if (!fields.length) {
    return;
  }
  const text = `🚫 Campos obrigatórios faltando:\n${fields.join('\n')}`;
  console.log('[REPORT][TOAST][GUIDE] missing =', fields);
  show({ type: 'error', text });
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
  const [local, setLocal] = useState(null);
  const [ruaNumero, setRuaNumero] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [cepPrecision, setCepPrecision] = useState('none');

  // Tracing
  const currentTraceIdRef = useRef(null);
  const currentTraceUnsubRef = useRef(null);

  // Garde-fou pour le séquencement AUTO
  const autoFlowActiveRef = useRef(false);

  const now = new Date();
  const dateBR = now.toLocaleDateString('pt-BR');
  const timeBR = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const selectedCategory = categories.find((c) => c.label === categoria);
  const severityColorUI = selectedCategory?.color || '#007AFF';

  const isBtnActive = !!(
    categoria &&
    descricao.trim().length > 0 &&
    ruaNumero.trim().length > 0 &&
    cidade.trim().length > 0 &&
    estado.trim().length > 0
  );

  const readyToastShownRef = useRef(false);
  useEffect(() => {
    if (isBtnActive && !readyToastShownRef.current && !autoFlowActiveRef.current) {
      console.log('[REPORT][TOAST] ready-toast (form complet, MANUAL or POST-AUTO)');
      show({ type: 'success', text: '✅ Pronto pra enviar!' });
      readyToastShownRef.current = true;
    } else if (!isBtnActive) {
      readyToastShownRef.current = false;
    }
  }, [isBtnActive, show]);

  // -----------------------------------------------------------
  // AUTO: Localisation -> reverse + CEP
  // -----------------------------------------------------------
  const handleLocationAutoFlow = async () => {
    console.log('[REPORT][AUTO] handleLocation START');
    setLoadingLoc(true);
    autoFlowActiveRef.current = true;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[REPORT][AUTO] Location perm =', status);
      if (status !== 'granted') {
        show({ type: 'error', text: '⚠️ Permissão de localização negada.' });
        return;
      }

      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      console.log('[REPORT][AUTO] coords =', coords);
      setLocal(coords);

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
      const cidadeVal = res.address?.cidade || '';
      setCidade(cidadeVal);
      const uf = (res.address?.uf || '').toUpperCase();
      setEstado(uf);

      if (res.cep) {
        setCep(res.cep);
        setCepPrecision('exact');
        show({ type: 'info', text: 'ℹ️ Localização atualizada. CEP detectado.' });
      } else if (Array.isArray(res.candidates) && res.candidates.length > 0) {
        setCep('');
        setCepPrecision('needs-confirmation');
        show({ type: 'info', text: 'ℹ️ Vários CEPs possíveis — confirme o endereço/CEP.' });
      } else {
        setCep('');
        setCepPrecision('general');
        show({
          type: 'info',
          text: 'ℹ️ CEP exato não encontrado — você pode inserir manualmente.',
        });
      }

      const formNowComplete =
        categoria &&
        descricao.trim() &&
        ruaNumeroVal &&
        (cidadeVal || cidade).trim() &&
        (uf || estado).trim();
      if (formNowComplete) {
        console.log('[REPORT][AUTO] Form complete post-geo => enqueue ready toast');
        show({ type: 'success', text: '✅ Pronto pra enviar!' });
        readyToastShownRef.current = true;
      }
    } catch (e) {
      console.log('[REPORT][AUTO] ERREUR =', e?.message || e);
      show({ type: 'error', text: '⚠️ Não foi possível obter sua localização.' });
    } finally {
      setLoadingLoc(false);
      autoFlowActiveRef.current = false;
      console.log('[REPORT][AUTO] handleLocation END');
    }
  };

  // -----------------------------------------------------------
  // Validations — SEND
  // -----------------------------------------------------------
  const validateForSendCommon = () => {
    const missing = getMissingFields({ categoria, descricao, ruaNumero, cidade, estado });
    if (missing.length) {
      showDisabledGuideToast(show, missing);
      return false;
    }
    return true;
  };

  // -----------------------------------------------------------
  // MANUEL: envoi -> géocode si pas de coords
  // -----------------------------------------------------------
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
      console.log('[REPORT][MANUAL] format invalid =>', fmt.msg);
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
        show({ type: 'error', text: 'ℹ️ Endereço não encontrado. Verifique os campos.' });
        console.log('[REPORT][MANUAL] forward geocoding FAILED:', g.error);
        return null;
      }
      coords = { latitude: g.latitude, longitude: g.longitude };
      if (!cep && g.cep) {
        setCep(g.cep);
      }
      if (cepPrecision === 'none') {
        setCepPrecision('general');
      }
    }

    return coords;
  };

  // -----------------------------------------------------------
  // AUTO: envoi — coords déjà présents
  // -----------------------------------------------------------
  const handleSendAutoFlow = async () => {
    console.log('[REPORT][AUTO] handleSendAutoFlow');
    if (local?.latitude && local?.longitude) {
      return local;
    }
    console.log('[REPORT][AUTO] Missing coords unexpectedly — fallback MANUAL geocode');
    return await handleSendManualFlow();
  };

  // -----------------------------------------------------------
  // Envoi du report (orchestrateur) + TRACING
  // -----------------------------------------------------------
  const handleSend = async () => {
    // TRACE: début appui bouton
    const traceId = newTraceId();
    currentTraceIdRef.current = traceId;
    currentTraceUnsubRef.current && currentTraceUnsubRef.current();
    currentTraceUnsubRef.current = attachPushTracesLive(traceId);

    console.log('🟢 [TRACE][CLIENT] START_PRESS', { traceId, at: new Date().toISOString() });
    console.log('[REPORT] handleSend START');

    // 1) Champs requis ?
    if (!validateForSendCommon()) {
      console.log('🟡 [TRACE][CLIENT] ABORT_MISSING_FIELDS', { traceId });
      console.log('[REPORT] handleSend ABORT: missing required fields');
      return;
    }

    // 2) Flux MANUEL ou AUTO
    const isAuto = !!(local?.latitude && local?.longitude);
    console.log('[REPORT] flow =', isAuto ? 'AUTO' : 'MANUAL');

    let coords = isAuto ? await handleSendAutoFlow() : await handleSendManualFlow();
    if (!coords) {
      console.log('🟡 [TRACE][CLIENT] ABORT_NO_COORDS', { traceId });
      console.log('[REPORT] handleSend ABORT: coords unavailable');
      return;
    }

    // 2.5) Modération / anti-abus
    const uid = auth.currentUser?.uid || 'anon';
    const verdict = checkReportAcceptable(descricao, uid);
    if (!verdict.ok) {
      console.log('🟡 [TRACE][CLIENT] ABORT_ABUSE', { traceId, verdict });
      console.log('[REPORT][CONTENT] blocked_or_invalid ?', verdict, abuseState?.current);
      show({ type: 'error', text: verdict.msg });
      return;
    }

    // 3) Persist & Propagate
    try {
      const expires = new Date(Date.now() + DB_RETENTION_DAYS * 24 * 3600 * 1000);
      const sev = selectedCategory?.severity || 'medium';
      const mappedColor = severityToColor(sev);
      const enderecoLabel = buildEnderecoLabel(ruaNumero, cidade, estado.toUpperCase());

      const payload = {
        userId: auth.currentUser?.uid,
        apelido: user?.apelido || '',
        username: user?.username || '',
        categoria,
        descricao,
        gravidade: sev,
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

      await reportNewLexemesRaw(descricao, {
        feature: 'desc',
        catHint: 'slang',
        city: cidade,
        uf: estado.toUpperCase(),
      });

      console.log('[REPORT] Payload =>', payload);

      const { alertId } = await handleReportEvent({
        user: { uid: auth.currentUser?.uid, apelido: user?.apelido, username: user?.username },
        coords,
        payload,
      });
      console.log('[REPORT] pipeline OK => id:', alertId);

      // ✅ Appel Cloud Function (avec traceId pour corréler)
      try {
        const body = {
          alertId,
          endereco: enderecoLabel,
          bairro: '',
          cidade,
          uf: estado.toUpperCase(),
          cep: onlyDigits(cep),
          lat: coords.latitude,
          lng: coords.longitude,
          radius_m: ALERT_RADIUS_M,
          severidade: sev,
          color: mappedColor,
          traceId, // <== CORRÉLATION
          debug: '1', // <== pour forcer DIAG si 0
        };

        console.log('[REPORT] Calling sendPublicAlertByAddress with:', body);
        const resp = await fetch(
          'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/sendPublicAlertByAddress',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        const json = await resp.json().catch(() => null);
        console.log('[REPORT] sendPublicAlertByAddress response:', {
          status: resp.status,
          ok: resp.ok,
          json,
        });

        if (json?.traceId && json.traceId !== traceId) {
          console.log('ℹ️ [TRACE][CLIENT] serverTraceId differs → switching listener', {
            client: traceId,
            server: json.traceId,
          });
          currentTraceUnsubRef.current && currentTraceUnsubRef.current();
          currentTraceUnsubRef.current = attachPushTracesLive(json.traceId);
          currentTraceIdRef.current = json.traceId;
        }
      } catch (err) {
        console.log('[REPORT] sendPublicAlertByAddress ERROR:', err?.message || String(err));
      }

      // ✅ Modale de confirmation (on trace le moment exact d’affichage)
      console.log('✅ [TRACE][CLIENT] SHOW_MODAL_REGISTERED', {
        traceId,
        at: new Date().toISOString(),
      });
      Alert.alert('Alerta enviado!', 'Seu alerta foi registrado.');

      console.log('🟣 [TRACE][CLIENT] END_PRESS_SUCCESS', { traceId, navigate: 'home' });
      console.log('[REPORT] handleSend SUCCESS => navigate home');

      // Option : garder l’abonnement 10s pour capter SUMMARY côté serveur
      setTimeout(() => {
        currentTraceUnsubRef.current && currentTraceUnsubRef.current();
        currentTraceUnsubRef.current = null;
      }, 10_000);

      // Navigation
      router.replace('/(tabs)/home');
    } catch (e) {
      console.log('🔴 [TRACE][CLIENT] END_PRESS_ERROR', {
        traceId,
        error: e?.message || String(e),
      });
      console.log('[REPORT] handleSend ERROR =', e?.message || e);
      Alert.alert('Erro', e.message);
    } finally {
      console.log('[REPORT] handleSend END');
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
                  {'\n'}Nunca substitua os serviços de emergência!
                  {'\n'}
                  <Text style={{ fontWeight: 'bold' }}>
                    📞 Ligue 190 (Polícia) ou 192 (Samu) em caso de risco ou emergência.
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
              placeholderTextColor="#9aa0a6"
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
              placeholderTextColor="#9aa0a6"
              value={ruaNumero}
              onChangeText={setRuaNumero}
            />
            <TextInput
              style={styles.input}
              placeholder="Cidade (obrigatório)"
              placeholderTextColor="#9aa0a6"
              value={cidade}
              onChangeText={setCidade}
            />
            <TextInput
              style={styles.input}
              placeholder="Estado/UF (ex.: CE) (obrigatório)"
              placeholderTextColor="#9aa0a6"
              value={estado}
              onChangeText={(v) => setEstado(String(v).toUpperCase())}
              autoCapitalize="characters"
              maxLength={2}
            />
            <TextInput
              style={styles.input}
              placeholder="CEP (opcional)"
              placeholderTextColor="#9aa0a6"
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
              android_ripple={
                isBtnActive ? { color: 'rgba(255,255,255,0.2)', borderless: false } : null
              }
              onPress={() => {
                // on trace explicitement le "touch" avant toute logique
                console.log('👆 [TRACE][CLIENT] BUTTON_PRESS', { at: new Date().toISOString() });
                if (!isBtnActive) {
                  const missing = getMissingFields({
                    categoria,
                    descricao,
                    ruaNumero,
                    cidade,
                    estado,
                  });
                  showDisabledGuideToast(show, missing);
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
