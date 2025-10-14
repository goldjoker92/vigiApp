// app/Report.jsx
// -------------------------------------------------------------
// VigiApp — Report d'incident PUBLIC (+ entrée spéciale « Criança desaparecida »)
// Objectif : version paste-and-play, sans régression, logs/traces partout,
// et route branchée vers /missCh/missing-child-start.jsx
//
// Points clés:
// - Création d’un signalement PUBLIC dans /publicAlerts via pipeline handleReportEvent
// - Entrée spéciale CHILD: "Criança desaparecida" -> DRAFT dans /missingCases puis
//   navigation vers /missCh/missing-child-start?caseId=...
// - Localisation: GPS -> adresse + CEP (Google-first via utils/cep)
// - Sauvegarde via pipeline centralisé handleReportEvent (upsert + projections + métriques)
// - Déclenchement non-bloquant de la CF d’alerte publique (après persistance)
// - Logs [REPORT] détaillés + Tracing client (traceId, pushTraces/<traceId>)
// - Toasters UX (queue) : success/info/erreur, 4s, barre de temps
// - Flux MANUEL ou AUTO : bouton actif sans GPS si champs requis OK
// - Autocomplétion Nominatim (BR) sur "Rua e número" (retries + fallback Google/Nominatim)
// - En MANUEL : on persiste la position **déclarée** (incident), pas celle du user
// - En base/back : reported_location + reporter_location_at_send + reporter_distance_m
// - Statuts MANUEL: entryMode='manual' + isManual=true, CF notifiée avec mode
// - Pop-up rectangulaire “Seu alerta está sem número da rua” (non bloquante)
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
  KeyboardAvoidingView,
  Keyboard,
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
  addDoc, // snapshot /missingCases (enfant perdu)
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
  TriangleAlert, // icône "Criança desaparecida" + pop-up
} from 'lucide-react-native';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { resolveExactCepFromCoords, GOOGLE_MAPS_KEY } from '../utils/cep';
// 🔗 pipeline alertes centralisé (pour incident public)
import { handleReportEvent } from '../platform_services/alertPipeline';
// Observability / modération
import { reportNewLexemesRaw } from '../platform_services/observability/mod_signals';
import { checkReportAcceptable } from '../platform_services/abuse_monitor';
import { abuseState } from '../platform_services/observability/abuse_strikes';

// -------------------------------------------------------------
// Constantes & utilitaires
// -------------------------------------------------------------

const DB_RETENTION_DAYS = 90; // TTL base (analytics/back) — incident public
const ALERT_RADIUS_M = 1000; // Rayon fixe V1 pour "incident" (danger public)

// [MISSING_CHILD] TTL côté front — le back fera l’auto-GC hard (Scheduled CF)
const MISSING_DRAFT_TTL_HOURS = 12; // purge si non complété sous 12h
const MISSING_DEFAULT_RADIUS_M = 3000; // rayon diffusion enfant perdu

const UF_MAP = {
  acre: 'AC',
  alagoas: 'AL',
  amapá: 'AP',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceará: 'CE',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espírito santo': 'ES',
  'espirito santo': 'ES',
  goiás: 'GO',
  goias: 'GO',
  maranhão: 'MA',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  pará: 'PA',
  para: 'PA',
  paraíba: 'PB',
  paraiba: 'PB',
  paraná: 'PR',
  parana: 'PR',
  pernambuco: 'PE',
  piauí: 'PI',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondônia: 'RO',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'são paulo': 'SP',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
};

const categories = [
  { label: 'Roubo/Furto', icon: ShieldAlert, severity: 'medium', color: '#FFA500' },
  { label: 'Agressão', icon: UserX, severity: 'medium', color: '#FFA500' },
  { label: 'Incidente de trânsito', icon: Car, severity: 'minor', color: '#FFE600' },
  { label: 'Incêndio', icon: Flame, severity: 'grave', color: '#FF3B30' },
  { label: 'Falta de luz', icon: Bolt, severity: 'minor', color: '#FFE600' },
  { label: 'Mal súbito (saúde)', icon: HandHeart, severity: 'grave', color: '#FF3B30' },
  { label: 'Outros', icon: FileQuestion, severity: 'minor', color: '#007AFF' },
];

const normalize = (s = '') =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const onlyDigits = (v = '') => String(v).replace(/\D/g, '');
const formatCepDisplay = (digits) => (digits ? digits.replace(/(\d{5})(\d{3})/, '$1-$2') : '');

const severityToColor = (sev) =>
  sev === 'minor' ? '#FFE600' : sev === 'grave' ? '#FF3B30' : '#FFA500';

const buildEnderecoLabel = (ruaNumero, cidade, estado) =>
  [ruaNumero, cidade && `${cidade}/${estado}`].filter(Boolean).join(' · ');

// Détection présence de numéro
const hasHouseNumber = (ruaNumero) => /\d+/.test(String(ruaNumero || ''));

// Similarité Jaccard simple (tokens)
function jaccardSimilarity(a = '', b = '') {
  const A = new Set(normalize(a).split(/\s+/).filter(Boolean));
  const B = new Set(normalize(b).split(/\s+/).filter(Boolean));
  if (!A.size && !B.size) {return 1;}
  const inter = new Set([...A].filter((x) => B.has(x))).size;
  const uni = new Set([...A, ...B]).size;
  return inter / uni;
}

function extractUF2FromNominatim(address = {}) {
  const iso =
    address['ISO3166-2-lvl4'] ||
    address['ISO3166-2-lvl6'] ||
    address.state_code ||
    address['iso3166-2'];
  if (iso && typeof iso === 'string' && iso.includes('-')) {
    const code = iso.split('-').pop().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) {return code;}
  }
  if (address.state) {
    const m = UF_MAP[normalize(address.state)];
    if (m) {return m;}
  }
  if (address.region) {
    const m = UF_MAP[normalize(address.region)];
    if (m) {return m;}
  }
  return '';
}

// --- Trace helpers (client)
function newTraceId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `trace_${t}_${r}`;
}

// Abonnement pushTraces SAFE (ne crash jamais si index manquant)
function attachPushTracesLive(traceId) {
  try {
    if (!db || !traceId) {return () => {};}
    const q = query(
      collection(db, 'pushTraces'),
      where('traceId', '==', traceId),
      orderBy('ts', 'asc'),
      limit(300),
    );
    console.log('[TRACE][CLIENT] subscribe start', traceId);
    const unsub = onSnapshot(q, {
      next: (snap) => {
        snap.docChanges().forEach((ch) => {
          const d = ch.doc.data();
          console.log('[TRACE][CLIENT]', traceId, d.step, d);
        });
      },
      error: (err) => {
        console.log(
          '[TRACE][CLIENT] subscribe error',
          err?.code || '',
          err?.message || String(err),
        );
        if (String(err?.code).includes('failed-precondition')) {
          console.log(
            '[TRACE][CLIENT] index missing for pushTraces query → disabling trace live for this session',
          );
        }
      },
    });
    return () => {
      console.log('[TRACE][CLIENT] unsubscribe', traceId);
      try {
        unsub && unsub();
      } catch {}
    };
  } catch (e) {
    console.log('[TRACE][CLIENT] subscribe error (outer)', e?.message || String(e));
    return () => {};
  }
}

// -------------------------------------------------------------
// Validation "format brésilien" pour flux MANUEL (non bloquante sur numéro)
// -------------------------------------------------------------
const isValidUF = (uf) => /^[A-Z]{2}$/.test(String(uf || '').trim());
const isValidCidade = (cidade) => /^[\p{L}\s'.-]+$/u.test(String(cidade || '').trim());
const isValidCepIfPresent = (cep) => {
  const d = onlyDigits(cep || '');
  return !d || /^\d{8}$/.test(d);
};

function validateBrazilianManualAddress({ ruaNumero, cidade, estado, cep }) {
  // NOTE: on NE bloque PAS si pas de numéro. On informe via pop-up.
  if (!String(cidade || '').trim() || !isValidCidade(cidade)) {
    return { ok: false, msg: '⚠️ Cidade inválida.' };
  }
  if (!String(estado || '').trim() || !isValidUF(estado.toUpperCase())) {
    return { ok: false, msg: '⚠️ UF deve ter 2 letras (ex.: CE).' };
  }
  if (!String(ruaNumero || '').trim()) {
    return { ok: false, msg: '⚠️ Informe a rua (número opcional).' };
  }
  if (!isValidCepIfPresent(cep)) {
    return { ok: false, msg: '⚠️ CEP inválido (opcional, mas se informado deve ter 8 dígitos).' };
  }
  return { ok: true };
}

// -------------------------------------------------------------
// Nominatim (OSM) — intégré au champ "Rua e número"
// -------------------------------------------------------------
function pickCityLike(address = {}) {
  return (
    address.city || address.town || address.village || address.municipality || address.county || ''
  );
}

function resultLabelFromNominatim(item) {
  const a = item.address || {};
  const road = a.road || a.pedestrian || a.residential || a.neighbourhood || '';
  const hn = a.house_number || '';
  const city = pickCityLike(a);
  const uf2 = extractUF2FromNominatim(a);
  const line1 = [road, hn].filter(Boolean).join(', ') || item.display_name?.split(',')[0] || '';
  const line2 = [city, uf2].filter(Boolean).join(' · ');
  return { line1, line2, uf2 };
}

// Fetch JSON Nominatim **avec retries**
async function fetchNominatimJSON(url, { signal } = {}) {
  let attempt = 0;
  let delay = 200;
  while (attempt < 4) {
    attempt++;
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'pt-BR',
          'User-Agent': 'VigiApp/1.0 (contact: suporte@vigiapp.example)',
        },
        signal,
      });
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const text = await resp.text().catch(() => '');
        console.log('[REPORT][NOMI][CT_WARN]', ct.slice(0, 64), 'len=', text?.length || 0);
        throw new Error(`NON_JSON_CT(${resp.status})`);
      }
      const json = await resp.json();
      return json;
    } catch (e) {
      console.log('[REPORT][NOMI][RETRY]', { attempt, reason: e?.message || String(e) });
      if (attempt >= 4) {throw e;}
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  return [];
}

// -------------------------------------------------------------
// Geocoding helpers — MANUEL "musclé" (multi-essais + fallback)
// -------------------------------------------------------------
async function geocodeAddressToCoords({ ruaNumero, cidade, estado, cep, googleKey }) {
  try {
    const addr = [ruaNumero, cidade, estado, cep].filter(Boolean).join(', ');
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&region=br&key=${googleKey}`;
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

async function geocodeAddressWithNominatim({ ruaNumero, cidade, estado, cep }) {
  try {
    const addr = [ruaNumero, cidade, estado, cep].filter(Boolean).join(', ');
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=br&limit=1&accept-language=pt-BR&q=${encodeURIComponent(addr)}`;
    console.log('[REPORT][MANUAL][NOMI_FWD][SEARCH]', url);
    const json = await fetchNominatimJSON(url);
    if (Array.isArray(json) && json.length > 0) {
      const it = json[0];
      const lat = Number(it.lat);
      const lon = Number(it.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const postal = it.address?.postcode || '';
        console.log('[REPORT][MANUAL][NOMI_FWD][OK]', { lat, lon, postal });
        return { ok: true, latitude: lat, longitude: lon, cep: postal || cep || '' };
      }
    }
    console.log('[REPORT][MANUAL][NOMI_FWD][KO]');
    return { ok: false, error: 'NOMINATIM_FWD_FAILED' };
  } catch (e) {
    console.log('[REPORT][MANUAL][NOMI_FWD][ERROR]', e?.message || String(e));
    return { ok: false, error: e?.message || 'NOMINATIM_FWD_ERROR' };
  }
}

function haversineMeters(a, b) {
  if (!a || !b) {return null;}
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDlat = Math.sin(dLat / 2);
  const h =
    sinDlat * sinDlat +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// -------------------------------------------------------------
// Toast léger avec QUEUE
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
    if (activeRef.current) {return;}
    const next = queueRef.current.shift();
    if (!next) {return;}

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
    if (!current) {return null;}
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
  if (!categoria) {missing.push('• categoria');}
  if (!String(descricao || '').trim()) {missing.push('• descrição');}
  if (!String(ruaNumero || '').trim()) {missing.push('• rua');}
  if (!String(cidade || '').trim()) {missing.push('• cidade');}
  if (!String(estado || '').trim()) {missing.push('• estado/UF');}
  return missing;
}

function showDisabledGuideToast(show, fields) {
  if (!fields.length) {return;}
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

  // État formulaire (incident public)
  const [categoria, setCategoria] = useState(null);
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState(null); // coords de l'incident (OSM sélection ou GPS AUTO)
  const [ruaNumero, setRuaNumero] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');
  const [cepPrecision, setCepPrecision] = useState('none');

  // Mode d'entrée (manual/auto)
  const [entryMode, setEntryMode] = useState('manual');

  // Nominatim (lié au champ "Rua e número")
  const [nomiBusy, setNomiBusy] = useState(false);
  const [nomiItems, setNomiItems] = useState([]);
  const nomiTimerRef = useRef(null);
  const nomiAbortRef = useRef(null);
  const nomiReopenThresholdRef = useRef(0);

  // Pop-up "sem número"
  const [noNumberVisible, setNoNumberVisible] = useState(false);
  const warnedAddressRef = useRef(null);
  const warnedOnceRef = useRef(false);
  const NO_NUM_SIM_THRESHOLD = 0.2;

  // Tracing
  const currentTraceIdRef = useRef(null);
  const currentTraceUnsubRef = useRef(null);
  const autoFlowActiveRef = useRef(false);

  const now = new Date();
  const dateBR = now.toLocaleDateString('pt-BR');
  const timeBR = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const selectedCategory = categories.find((c) => c.label === categoria);
  const severityColorUI = selectedCategory?.color || '#007AFF';

  const isBtnActive = !!(
    categoria &&
    descricao.trim().length > 0 &&
    String(ruaNumero || '').trim().length > 0 &&
    cidade.trim().length > 0 &&
    estado.trim().length > 0
  );

  // Ready toast (incident public)
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

  // ---------------------------------------------------------------------------
  // [MISSING_CHILD] — entrée spéciale
  // - Crée un DRAFT dans /missingCases avec expiresAt = now + 12h
  // - Route BRANCHÉE vers /missCh/missing-child-start?caseId=...
  // - Ne touche pas à `categoria`.
  // ---------------------------------------------------------------------------
  const startMissingChildFlow = async () => {
    try {
      const uid = auth.currentUser?.uid || 'anon';
      const traceId = newTraceId?.() || `trace_${Date.now().toString(36)}`;
      const expires = new Date(Date.now() + MISSING_DRAFT_TTL_HOURS * 3600 * 1000);

      console.log('[MISSING_CHILD][ENTRY][CLICK]', { uid, traceId });

      const payload = {
        createdBy: uid,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expires), // back purge >12h si status=DRAFT
        status: 'DRAFT',
        flowOrigin: 'report_screen',
        entryTraceId: traceId,

        // UI de diffusion (quand le case sera vérifié)
        color: '#FF3B30',
        radius_m: MISSING_DEFAULT_RADIUS_M,

        // Snapshot user **non sensible**
        userSnap: {
          apelido: user?.apelido || '',
          username: user?.username || '',
        },

        // Flags analytics/GC
        gc_hint: 'auto_12h_if_incomplete',
        version: 1,
      };

      console.log('[MISSING_CHILD][ENTRY][ADD_DOC] /missingCases', payload);
      const ref = await addDoc(collection(db, 'missingCases'), payload);
      const caseId = ref.id;
      console.log('[MISSING_CHILD][ENTRY][OK]', { caseId });

      // 🔗 ROUTE AJUSTÉE : /missCh/missing-child-start
      console.log('[MISSING_CHILD][NAVIGATE] -> /missCh/missing-child-start', { caseId });
      router.push({ pathname: '/missCh/missing-child-start', params: { caseId } });
    } catch (e) {
      console.log('[MISSING_CHILD][ENTRY][ERR]', e?.message || String(e));
      show?.({ type: 'error', text: 'Não foi possível iniciar o fluxo agora.' });
    }
  };

  // -----------------------------------------------------------
  // Nominatim : recherche "Rua e número" (MANUEL uniquement)
  // -----------------------------------------------------------
  useEffect(() => {
    console.log('[REPORT][NOMI][TYPE]', ruaNumero);

    if (entryMode === 'auto') {
      if (nomiItems.length) {setNomiItems([]);}
      return;
    }

    if (nomiTimerRef.current) {clearTimeout(nomiTimerRef.current);}
    if (nomiAbortRef.current) {
      try {
        nomiAbortRef.current.abort();
      } catch {}
      nomiAbortRef.current = null;
    }

    const q = (ruaNumero || '').trim();

    if (nomiReopenThresholdRef.current > 0) {
      if (q.length < nomiReopenThresholdRef.current) {
        if (nomiItems.length) {setNomiItems([]);}
        return;
      } else {
        nomiReopenThresholdRef.current = 0;
      }
    }

    const isGeneric = ['rua', 'avenida', 'av', 'estrada', 'rodovia'].includes(q.toLowerCase());
    if (!q || q.length < 3 || isGeneric) {
      if (nomiItems.length) {console.log('[REPORT][NOMI][CLEAR_RESULTS]');}
      setNomiItems([]);
      return;
    }

    nomiTimerRef.current = setTimeout(async () => {
      try {
        setNomiBusy(true);
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=br&limit=8&accept-language=pt-BR&q=${encodeURIComponent(
          q,
        )}`;
        console.log('[REPORT][NOMI][SEARCH]', url);
        const controller = new AbortController();
        nomiAbortRef.current = controller;
        const json = await fetchNominatimJSON(url, { signal: controller.signal });

        console.log(
          '[REPORT][NOMI][RESULTS_COUNT]',
          Array.isArray(json) ? json.length : 0,
        );
        if (Array.isArray(json)) {
          json.slice(0, 8).forEach((it) => {
            const { line1, line2 } = resultLabelFromNominatim(it);
            console.log('[REPORT][NOMI][PROPOSE]', {
              place_id: it.place_id,
              line1,
              line2,
              lat: it.lat,
              lon: it.lon,
            });
          });
        }
        setNomiItems(Array.isArray(json) ? json : []);
      } catch (e) {
        console.log('[REPORT][NOMI][ERROR]', e?.message || String(e));
      } finally {
        setNomiBusy(false);
        nomiAbortRef.current = null;
      }
    }, 500);

    return () => {
      nomiTimerRef.current && clearTimeout(nomiTimerRef.current);
    };
  }, [ruaNumero, entryMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------
  // AUTO: Localisation -> reverse + CEP (inchangé)
  // -----------------------------------------------------------
  const handleLocationAutoFlow = async () => {
    console.log('[REPORT][AUTO] handleLocation START');
    Keyboard.dismiss();
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

      setNomiItems([]);
      nomiReopenThresholdRef.current = 0;

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

      setEntryMode('auto');
    } catch (e) {
      console.log('[REPORT][AUTO] ERREUR =', e?.message || e);
      show({ type: 'error', text: '⚠️ Não foi possível obtener sua localização.' });
    } finally {
      autoFlowActiveRef.current = false;
      console.log('[REPORT][AUTO] handleLocation END');
    }
  };

  // -----------------------------------------------------------
  // Validations — SEND (incident public)
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
  // MANUEL: envoi -> géocode si pas de coords (incident public)
  // -----------------------------------------------------------
  const handleSendManualFlow = async () => {
    console.log('[REPORT][MANUAL][FLOW] handleSendManualFlow START');

    const ruaVal = String(ruaNumero || '').trim();
    const ruaHasNum = hasHouseNumber(ruaVal);

    const fmt = validateBrazilianManualAddress({
      ruaNumero: ruaVal,
      cidade,
      estado: estado.toUpperCase(),
      cep,
    });
    if (!fmt.ok) {
      show({ type: 'error', text: fmt.msg });
      console.log('[REPORT][MANUAL] format invalid =>', fmt.msg);
      return null;
    }

    if (!ruaHasNum) {
      const prev = warnedAddressRef.current?.value || '';
      const sim = jaccardSimilarity(prev, ruaVal);
      const shouldWarn =
        !warnedOnceRef.current ||
        (warnedAddressRef.current && sim <= NO_NUM_SIM_THRESHOLD && !hasHouseNumber(ruaVal));

      if (shouldWarn) {
        warnedAddressRef.current = { value: ruaVal, hash: normalize(ruaVal) };
        warnedOnceRef.current = true;
        console.log('[REPORT][NO-NUM][WARNED]', { rua: ruaVal, sim });
        setNoNumberVisible(true);
        return null; // on attend le 2e clic pour envoyer
      } else {
        console.log('[REPORT][NO-NUM][SKIP_RESHOW]', { rua: ruaVal, sim });
      }
    } else {
      if (warnedOnceRef.current) {
        console.log('[REPORT][NO-NUM][NUMBER_DETECTED]');
      }
    }

    if (local?.latitude && local?.longitude) {
      console.log('[REPORT][MANUAL] coords already present from OSM selection');
      setEntryMode('manual');
      return { latitude: local.latitude, longitude: local.longitude };
    }

    const base = {
      ruaNumero: ruaVal,
      cidade,
      estado: estado.toUpperCase(),
      cep: onlyDigits(cep),
      googleKey: GOOGLE_MAPS_KEY,
    };

    console.log('[REPORT][MANUAL][GEO_ATTEMPT] Google A', base);
    let g = await geocodeAddressToCoords(base);
    if (g.ok) {
      if (!cep && g.cep) {setCep(g.cep);}
      if (cepPrecision === 'none') {setCepPrecision('general');}
      setEntryMode('manual');
      console.log('[REPORT][MANUAL][GEO_OK] Google A');
      return { latitude: g.latitude, longitude: g.longitude };
    }

    const variants = [{ ...base, cep: '' }, { ...base, cep: onlyDigits(cep) }];
    for (let i = 0; i < variants.length; i++) {
      console.log('[REPORT][MANUAL][GEO_ATTEMPT] Google B', variants[i]);
      g = await geocodeAddressToCoords(variants[i]);
      if (g.ok) {
        if (!cep && g.cep) {setCep(g.cep);}
        if (cepPrecision === 'none') {setCepPrecision('general');}
        setEntryMode('manual');
        console.log('[REPORT][MANUAL][GEO_OK] Google B');
        return { latitude: g.latitude, longitude: g.longitude };
      }
    }

    console.log('[REPORT][MANUAL][GEO_ATTEMPT] NOMINATIM C');
    const n1 = await geocodeAddressWithNominatim(base);
    if (n1.ok) {
      if (!cep && n1.cep) {setCep(formatCepDisplay(onlyDigits(n1.cep)));}
      if (cepPrecision === 'none') {setCepPrecision('general');}
      setEntryMode('manual');
      console.log('[REPORT][MANUAL][GEO_OK] NOMINATIM C');
      return { latitude: n1.latitude, longitude: n1.longitude };
    }

    const ruaNoNum = String(ruaVal).replace(/\s*,?\s*\d+.*/, '').trim();
    if (ruaNoNum && ruaNoNum !== ruaVal) {
      console.log('[REPORT][MANUAL][GEO_ATTEMPT] NOMINATIM D (rua sans numéro)', ruaNoNum);
      const n2 = await geocodeAddressWithNominatim({ ...base, ruaNumero: ruaNoNum });
      if (n2.ok) {
        if (!cep && n2.cep) {setCep(formatCepDisplay(onlyDigits(n2.cep)));}
        if (cepPrecision === 'none') {setCepPrecision('general');}
        setEntryMode('manual');
        console.log('[REPORT][MANUAL][GEO_OK] NOMINATIM D');
        return { latitude: n2.latitude, longitude: n2.longitude };
      }
    }

    console.log('[REPORT][MANUAL][ABORT_NO_COORDS]');
    show({
      type: 'error',
      text: 'ℹ️ Endereço não encontrado. Verifique os campos ou selecione uma sugestão.',
    });
    return null;
  };

  // AUTO: envoi — coords déjà présentes
  const handleSendAutoFlow = async () => {
    console.log('[REPORT][AUTO] handleSendAutoFlow');
    if (local?.latitude && local?.longitude) {return local;}
    console.log('[REPORT][AUTO] Missing coords unexpectedly — fallback MANUAL geocode');
    return await handleSendManualFlow();
  };

  // -----------------------------------------------------------
  // Envoi du report (incident public) + TRACING
  // -----------------------------------------------------------
  const handleSend = async () => {
    const traceId = newTraceId();
    currentTraceIdRef.current = traceId;
    currentTraceUnsubRef.current && currentTraceUnsubRef.current();
    currentTraceUnsubRef.current = attachPushTracesLive(traceId);

    console.log('🟢 [TRACE][CLIENT] START_PRESS', { traceId, at: new Date().toISOString() });
    console.log('[REPORT] handleSend START');

    if (!validateForSendCommon()) {
      console.log('🟡 [TRACE][CLIENT] ABORT_MISSING_FIELDS', { traceId });
      console.log('[REPORT] handleSend ABORT: missing required fields');
      return;
    }

    const isAuto = !!(local?.latitude && local?.longitude && entryMode === 'auto');
    console.log('[REPORT] flow =', isAuto ? 'AUTO' : 'MANUAL');

    let coords = isAuto ? await handleSendAutoFlow() : await handleSendManualFlow();
    if (!coords) {
      console.log('🟡 [TRACE][CLIENT] ABORT_NO_COORDS', { traceId });
      console.log('[REPORT] handleSend ABORT: coords unavailable (ou popup affichée)');
      return;
    }

    // Modération
    const uid = auth.currentUser?.uid || 'anon';
    const verdict = checkReportAcceptable(descricao, uid);
    if (!verdict.ok) {
      console.log('🟡 [TRACE][CLIENT] ABORT_ABUSE', { traceId, verdict });
      console.log('[REPORT][CONTENT] blocked_or_invalid ?', verdict, abuseState?.current);
      show({ type: 'error', text: verdict.msg });
      return;
    }

    // Persist & Propagate (incident public)
    try {
      // Position device à l’envoi (best effort, non bloquant)
      let deviceAtSend = null;
      try {
        const last = await Location.getLastKnownPositionAsync({ maxAge: 300000 });
        if (last?.coords) {
          deviceAtSend = {
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
            accuracy: last.coords.accuracy ?? null,
          };
          console.log('[REPORT][DEVICE_AT_SEND][LAST_OK]', deviceAtSend);
        } else {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Low,
          });
          deviceAtSend = {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
            accuracy: current.coords.accuracy ?? null,
          };
          console.log('[REPORT][DEVICE_AT_SEND][CURR_OK]', deviceAtSend);
        }
      } catch (e) {
        console.log('[REPORT][DEVICE_AT_SEND][SKIP]', e?.message || String(e));
      }

      const reporterDistanceM = deviceAtSend
        ? Math.round(
            haversineMeters(
              { latitude: coords.latitude, longitude: coords.longitude },
              { latitude: deviceAtSend.latitude, longitude: deviceAtSend.longitude },
            ) || 0,
          )
        : null;

      const expires = new Date(Date.now() + DB_RETENTION_DAYS * 24 * 3600 * 1000);
      const sev = selectedCategory?.severity || 'medium';
      const mappedColor = severityToColor(sev);
      const enderecoLabel = buildEnderecoLabel(ruaNumero, cidade, estado.toUpperCase());

      const ruaHasNum = hasHouseNumber(ruaNumero);

      const payload = {
        userId: auth.currentUser?.uid,
        apelido: user?.apelido || '',
        username: user?.username || '',
        entryMode,
        isManual: entryMode === 'manual',

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

        houseNumberUsed: ruaHasNum ? (ruaNumero.match(/\d+/)?.[0] ?? null) : null,
        houseNumberApprox: !ruaHasNum,

        reported_location: { latitude: coords.latitude, longitude: coords.longitude },

        reporter_location_at_send: deviceAtSend,

        reporter_distance_m: reporterDistanceM,

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

      console.log('[REPORT][DIST]', {
        entryMode,
        reporterDistanceM,
        reported: { lat: coords.latitude, lon: coords.longitude },
        deviceAtSend,
      });

      await reportNewLexemesRaw(descricao, {
        feature: 'desc',
        catHint: 'slang',
        city: cidade,
        uf: estado.toUpperCase(),
      });
      console.log('[REPORT] Payload =>', payload);

      // 1) Persist
      const { alertId } = await handleReportEvent({
        user: { uid: auth.currentUser?.uid, apelido: user?.apelido, username: user?.username },
        coords,
        payload,
      });
      console.log('[REPORT] pipeline OK => id:', alertId);

      // 2) Notif CF — APRES persistance
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
          mode: entryMode,
          traceId,
          debug: '1',
        };

        console.log('[REPORT][NOTIF][CALL] sendPublicAlertByAddress', body);
        const resp = await fetch(
          'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/sendPublicAlertByAddress',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        const json = await resp.json().catch(() => null);
        console.log('[REPORT][NOTIF][OK]', { status: resp.status, ok: resp.ok, json });
      } catch (err) {
        console.log('[REPORT][NOTIF][ERR]', err?.message || String(err));
      }

      console.log('✅ [TRACE][CLIENT] SHOW_MODAL_REGISTERED', {
        traceId,
        at: new Date().toISOString(),
      });
      Alert.alert('Alerta enviado!', 'Seu alerta foi registrado.');

      console.log('🟣 [TRACE][CLIENT] END_PRESS_SUCCESS', { traceId, navigate: 'home' });
      console.log('[REPORT] handleSend SUCCESS => navigate home');

      setTimeout(() => {
        currentTraceUnsubRef.current && currentTraceUnsubRef.current();
        currentTraceUnsubRef.current = null;
      }, 10_000);

      router.replace('/(tabs)/home');
    } catch (e) {
      console.log('🔴 [TRACE][CLIENT] END_PRESS_ERROR', {
        traceId: currentTraceIdRef.current,
        error: e?.message || String(e),
      });
      console.log('[REPORT] handleSend ERROR =', e?.message || e);
      Alert.alert('Erro', e.message);
    } finally {
      console.log('[REPORT] handleSend END');
    }
  };

  // -----------------------------------------------------------
  // Pop-up “Sem número” — rectangle type CodePen (RN)
  // -----------------------------------------------------------
  const NoNumberPopup = () =>
    !noNumberVisible ? null : (
      <View style={styles.noticeWrap} pointerEvents="box-none">
        <View style={styles.noticeBox}>
          <View style={styles.noticeContent}>
            <View style={styles.noticeIcon}>
              <TriangleAlert size={28} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>Seu alerta está sem número da rua</Text>
              <Text style={styles.noticeSub}>
                Você pode enviar assim. Toque <Text style={{ fontWeight: '700' }}>OK</Text> para
                fechar esta mensagem (o envio ocorre quando você tocar novamente em{' '}
                <Text style={{ fontWeight: '700' }}>Enviar alerta</Text>). Se preferir informar o
                número agora, toque <Text style={{ fontWeight: '700' }}>Cancelar</Text>.
              </Text>
            </View>
          </View>

          <View style={styles.noticeBtns}>
            <TouchableOpacity
              onPress={() => {
                console.log('[REPORT][NO-NUM][OK]');
                setNoNumberVisible(false);
              }}
              style={[styles.noticeBtn, styles.noticeBtnPrimary]}
            >
              <Text style={styles.noticeBtnPrimaryText}>OK</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                console.log('[REPORT][NO-NUM][CANCEL]');
                setNoNumberVisible(false);
              }}
              style={[styles.noticeBtn, styles.noticeBtnSecondary]}
            >
              <Text style={styles.noticeBtnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );

  // -----------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------
  return (
    <View style={{ flex: 1, backgroundColor: '#181A20' }}>
      {ToastOverlay}
      <NoNumberPopup />

      {userStatus !== 'ready' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {userStatus === 'loading' ? (
            <ActivityIndicator color="#22C55E" />
          ) : (
            <Text style={{ color: '#fff', opacity: 0.8 }}>Conecte-se para reportar um alerta.</Text>
          )}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
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

              {/* -----------------------------------------------------------
                 Grille des catégories "incident public"
                 + Insertion visuelle de "Criança desaparecida" juste AU-DESSUS de "Outros"
                 (même rendu visuel, MAIS flux back séparé, sans toucher à `categoria`)
                 ----------------------------------------------------------- */}
              <View style={styles.categoriaGroup}>
                {/* 1) Toutes les catégories sauf "Outros" */}
                {categories
                  .filter((c) => c.label !== 'Outros')
                  .map(({ label, icon: Icon, color }) => (
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

                {/* 2) [MISSING_CHILD] Tuile spéciale — comportement 100% séparé */}
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={startMissingChildFlow}
                  style={[
                    styles.categoriaBtn,
                    {
                      borderColor: '#FF3B30',
                      backgroundColor: '#2a1010', // fond rouge sombre pour se démarquer
                    },
                  ]}
                >
                  <TriangleAlert size={18} color={'#FF3B30'} style={{ marginRight: 7 }} />
                  <Text style={[styles.categoriaText, { color: '#FF3B30', fontWeight: '700' }]}>
                    Criança desaparecida
                  </Text>
                </TouchableOpacity>

                {/* 3) La tuile "Outros" en dernier (après notre insertion) */}
                {categories
                  .filter((c) => c.label === 'Outros')
                  .map(({ label, icon: Icon, color }) => (
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
                onFocus={() => setNomiItems([])}
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

              {/* Champ 1 — Rua e número (autocomplete OSM) */}
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={styles.input}
                  placeholder="Rua e número (número opcional)"
                  placeholderTextColor="#9aa0a6"
                  value={ruaNumero}
                  onChangeText={(t) => setRuaNumero(t)}
                  autoCorrect={false}
                />
                {nomiBusy ? (
                  <View style={styles.autoLoading}>
                    <ActivityIndicator color="#22C55E" />
                  </View>
                ) : null}
                {!!nomiItems.length && entryMode === 'manual' && (
                  <View style={styles.autoContainer}>
                    {nomiItems.map((item) => {
                      const { line1, line2, uf2 } = resultLabelFromNominatim(item);
                      return (
                        <Pressable
                          key={`${item.place_id}`}
                          android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
                          onPress={() => {
                            console.log('[REPORT][NOMI][SELECT]', {
                              place_id: item.place_id,
                              lat: item.lat,
                              lon: item.lon,
                              line1,
                              line2,
                              uf2,
                            });
                            const a = item.address || {};
                            const rua = a.road || a.pedestrian || a.residential || '';
                            const num = a.house_number || '';
                            const city = pickCityLike(a);
                            const cepOSM = a.postcode || '';

                            const ruaNumeroVal = [rua, num].filter(Boolean).join(', ');
                            setRuaNumero(ruaNumeroVal);
                            if (city) {setCidade(city);}
                            if (uf2) {setEstado(uf2);}
                            if (cepOSM) {
                              setCep(formatCepDisplay(onlyDigits(cepOSM)));
                              setCepPrecision('general');
                            } else if (cepPrecision === 'none') {
                              setCepPrecision('general');
                            }

                            const lat = Number(item.lat);
                            const lon = Number(item.lon);
                            if (Number.isFinite(lat) && Number.isFinite(lon)) {
                              setLocal({ latitude: lat, longitude: lon });
                            }

                            setEntryMode('manual');
                            setNomiItems([]);
                            nomiReopenThresholdRef.current = (ruaNumeroVal || '').length + 3;

                            show({ type: 'info', text: 'ℹ️ Endereço preenchido via OSM.' });
                          }}
                          style={styles.autoItem}
                        >
                          <Text style={styles.autoPrimary} numberOfLines={1}>
                            {line1 || 'Endereço'}
                          </Text>
                          {!!line2 && (
                            <Text style={styles.autoSecondary} numberOfLines={1}>
                              {line2}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Champ 2 — Cidade */}
              <TextInput
                style={styles.input}
                placeholder="Cidade (obrigatório)"
                placeholderTextColor="#9aa0a6"
                value={cidade}
                onChangeText={setCidade}
              />

              {/* Champ 3 — UF (2 lettres) */}
              <TextInput
                style={styles.input}
                placeholder="Estado/UF (ex.: CE) (obrigatório)"
                placeholderTextColor="#9aa0a6"
                value={estado}
                onChangeText={(v) => setEstado(String(v).toUpperCase())}
                autoCapitalize="characters"
                maxLength={2}
              />

              {/* Champ 4 — CEP (optionnel) */}
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

              <TouchableOpacity style={styles.locBtn} onPress={handleLocationAutoFlow}>
                <MapPin color="#007AFF" size={18} style={{ marginRight: 8 }} />
                <Text style={styles.locBtnText}>Usar minha localização atual</Text>
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
        </KeyboardAvoidingView>
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

  // Autocomplete
  autoLoading: { position: 'absolute', right: 12, top: 12 },
  autoContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 48,
    backgroundColor: '#21242c',
    borderWidth: 1,
    borderColor: '#353840',
    borderRadius: 10,
    paddingVertical: 6,
    zIndex: 9999,
    elevation: 12,
    maxHeight: 240,
  },
  autoItem: { paddingHorizontal: 12, paddingVertical: 10 },
  autoPrimary: { color: '#fff', fontWeight: '600' },
  autoSecondary: { color: '#c6c9d1', marginTop: 2, fontSize: 12 },

  // Toast
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

  // Pop-up rectangulaire type CodePen (centrée)
  noticeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 18,
    zIndex: 10000,
  },
  noticeBox: {
    width: 300,
    maxWidth: '95%',
    backgroundColor: '#2A2D36',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 12,
  },
  noticeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  noticeIcon: { marginRight: 10, width: 28, alignItems: 'center' },
  noticeTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  noticeSub: { color: '#cfd3db', fontSize: 12, marginTop: 2 },

  noticeBtns: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  noticeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeBtnPrimary: { backgroundColor: '#F59E0B' },
  noticeBtnPrimaryText: { color: '#000', fontWeight: '700' },
  noticeBtnSecondary: {},
  noticeBtnSecondaryText: { color: '#fff', fontWeight: '600' },
});
