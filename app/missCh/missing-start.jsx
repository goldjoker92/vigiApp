// ============================================================================
// VigiApp — Flux "Missing" (child/animal/object)
// UI: Dropdown doc (BG/overlay), Autocomplete OSM dans "Rua", dates dd-MM-yy
// Submit progress par étapes, builder anti-yoyo (une seule source de vérité)
// Full responsive, tracé/logué, zéro objet inline pour la validation
// ============================================================================

import React, { useEffect, useMemo, useRef, useReducer, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Share,
  Linking,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { auth } from '../../firebase';
import { Timestamp } from 'firebase/firestore';
import {
  TriangleAlert,
  User,
  FileCheck2,
  ImageIcon,
  ChevronLeft,
  Share2,
  Check,
  X,
  ChevronDown,
} from 'lucide-react-native';

// Règles de flux (inchangé)
import { FLOW_RULES, getFlow } from '../../src/miss/lib/flowRules';
// Helpers existants
import { todayISO, onlyDigits } from '../../src/miss/lib/helpers';

// Uploaders (progress + abort)
import {
  uploadIdFront,
  uploadIdBack,
  uploadLinkFront,
  uploadLinkBack,
  uploadChildPhoto as uploadMainPhoto,
} from '../../src/miss/lib/uploaders';

// Guard / Overlays / Toast prêt
import { useSubmitGuard } from '../../src/miss/lib/useSubmitGuard';
import AgePolicyNotice from '../../src/miss/age/AgePolicyNotice';
import SubmitDisabledOverlay from '../../src/miss/lib/SubmitDisabledOverlay';
import { useReadyToast } from '../../src/miss/lib/useReadyToast';

// Masks existants (CPF)
import { maskCPF } from '../../src/miss/lib/masks';

// Validation centralisée
import { validateClient } from '../../src/miss/lib/validations';

import PlaygroundMini from '../../src/miss/lib/dev/PlaygroundMini';
import { writeMissingCaseOnce } from '../../src/miss/lib/firestoreWrite';

// ---------------------------------------------------------------------------
// Logger / Tracer
// ---------------------------------------------------------------------------
const NS = '[MISSING/START]';
const nowTs = () => new Date().toISOString();
const newTraceId = (p = 'trace') =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const msSince = (t0) => `${Math.max(0, Date.now() - t0)}ms`;
const Log = {
  info: (...a) => console.log(NS, ...a),
  warn: (...a) => console.warn(NS, '⚠️', ...a),
  error: (...a) => console.error(NS, '❌', ...a),
  step: (traceId, step, extra = {}) =>
    console.log(NS, 'STEP', step, { traceId, at: nowTs(), ...extra }),
};

// ---------------------------------------------------------------------------
// Dates & masks
// ---------------------------------------------------------------------------
function pad2(n) {
  return String(n).padStart(2, '0');
}

// dd-MM-yy (ex: 22-10-25) — pour “Onde e quando”
function maskDateShort(input) {
  const d = String(input || '')
    .replace(/[^\d]/g, '')
    .slice(0, 6); // ddMMyy
  const a = d.slice(0, 2);
  const b = d.slice(2, 4);
  const c = d.slice(4, 6);
  if (d.length <= 2) {
    return a;
  }
  if (d.length <= 4) {
    return `${a}-${b}`;
  }
  return `${a}-${b}-${c}`;
}

// dd/MM/aaaa — pour DOB enfant (slashes auto)
function maskDateBR(input) {
  const digits = String(input || '')
    .replace(/[^\d]/g, '')
    .slice(0, 8); // ddMMyyyy
  const a = digits.slice(0, 2);
  const b = digits.slice(2, 4);
  const c = digits.slice(4, 8);
  if (digits.length <= 2) {
    return a;
  }
  if (digits.length <= 4) {
    return `${a}/${b}`;
  }
  return `${a}/${b}/${c}`;
}
function normalizeDateBR(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || '').trim());
  if (!m) {
    return s;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(+m[1])}/${pad(+m[2])}/${m[3]}`;
}

// Normalise: 1-1-25 -> 01-01-25
function normalizeDateShort(s) {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{2})$/.exec(s?.trim() || '');
  if (!m) {
    return s;
  }
  const d = pad2(+m[1]);
  const mo = pad2(+m[2]);
  const yy = m[3];
  return `${d}-${mo}-${yy}`;
}
// Convertit dd-MM-yy en ISO (assume 20yy pour 00..79, sinon 19yy)
function shortToISO(s, fallbackTime = '00:00') {
  const m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(s?.trim() || '');
  if (!m) {
    return null;
  }
  const [_, dd, MM, yy] = m;
  const yyyy = Number(yy) <= 79 ? `20${yy}` : `19${yy}`;
  return `${yyyy}-${MM}-${dd}T${fallbackTime}:00.00${fallbackTime.endsWith(':00') ? '' : '0'}Z`.replace(
    '::',
    ':',
  );
}

// ✅ Helper de conversion DOB BR → ISO (fix régression)
function brDateToISO(d) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((d || '').trim());
  if (!m) {
    return null;
  }
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
}

// ---------------------------------------------------------------------------
// Toast léger inline
// ---------------------------------------------------------------------------
function useLiteToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const show = (text) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    const s = String(text);
    Log.info('TOAST', s);
    setMsg(s);
    timer.current = setTimeout(() => setMsg(null), 9000);
  };
  useEffect(() => () => timer.current && clearTimeout(timer.current), []);
  const Toast = !msg ? null : (
    <View style={styles.toastWrap}>
      <Text style={styles.toastText}>{msg}</Text>
    </View>
  );
  return { show, Toast };
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------
function useHasWhatsApp() {
  const [hasWA, setHasWA] = useState(false);
  useEffect(() => {
    Linking.canOpenURL('whatsapp://send')
      .then((ok) => setHasWA(!!ok))
      .catch(() => setHasWA(false));
  }, []);
  return hasWA;
}

// ---------------------------------------------------------------------------
// Partage
// ---------------------------------------------------------------------------
function buildShareMessage({ type, caseId, name, cidade, uf, dateShort, time }) {
  const link = `https://vigi.app/case/${caseId || ''}`;
  const prefix =
    type === 'animal'
      ? '🐾 ALERTA - Animal perdido'
      : type === 'object'
        ? '🧳 ALERTA - Objeto perdido'
        : '🚨 ALERTA - Criança desaparecida';
  return (
    `${prefix}\n\n` +
    `Nome: ${name || 'N/I'}\n` +
    `Local: ${cidade || 'N/I'}${uf ? ` (${uf})` : ''}\n` +
    `Data: ${dateShort || 'N/I'}${time ? ` às ${time}` : ''}\n\n` +
    `Ajude agora:\n${link}`
  );
}
async function shareNative(msg) {
  await Share.share({ message: msg });
}
async function shareWhatsApp(msg) {
  const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
  try {
    const ok = await Linking.canOpenURL(url);
    if (ok) {
      await Linking.openURL(url);
    } else {
      await Share.share({ message: msg });
    }
  } catch {
    await Share.share({ message: msg });
  }
}

// ---------------------------------------------------------------------------
// Services — CF + backoff
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cfFetch(url, opts = {}, { attempts = 2, baseDelay = 400 } = {}) {
  let lastErr;
  for (let i = 0; i <= attempts; i++) {
    try {
      const resp = await fetch(url, opts);
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(`HTTP_${resp.status}`);
      }
      return { ok: true, json, status: resp.status };
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        await sleep(baseDelay * Math.pow(2, i));
      }
    }
  }
  return { ok: false, error: lastErr?.message || String(lastErr) };
}
async function cfVerifyGuardian({ caseId, body, idempotencyKey }) {
  return await cfFetch(
    'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/verifyGuardian',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey || '' },
      body: JSON.stringify({ caseId, payload: body }),
    },
    { attempts: 2, baseDelay: 600 },
  );
}
async function cfSendPublicAlert({
  alertId,
  endereco,
  cidade,
  uf,
  cep,
  lat,
  lng,
  radius_m,
  severity,
  color,
  traceId,
}) {
  const body = {
    alertId,
    endereco,
    cidade,
    uf,
    cep,
    lat,
    lng,
    radius_m,
    severidade: severity,
    color,
    traceId,
    debug: '1',
  };
  return await cfFetch(
    'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/sendPublicAlertByAddress',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { attempts: 2, baseDelay: 600 },
  );
}

// ---------------------------------------------------------------------------
// Form reducer / modèle
// ---------------------------------------------------------------------------
const isoToday = todayISO();
const [Y, M, D] = isoToday.split('-');
const initialDateShort = `${pad2(+D)}-${pad2(+M)}-${String(Y).slice(2)}`;

const ADULT_ID_TYPES = [
  { key: 'rg', label: 'RG (frente + verso)' },
  { key: 'passport', label: 'Passaporte' },
  { key: 'rne', label: 'RNE (frente + verso)' },
];
const CHILD_DOC_TYPES = [
  { key: 'certidao', label: 'Certidão de nascimento' },
  { key: 'rg_child', label: 'RG criança (frente + verso)' },
  { key: 'passport_child', label: 'Passaporte criança' },
  { key: 'rne_child', label: 'RNE criança (frente + verso)' },
];

const initialForm = {
  // meta
  caseId: '',
  type: 'child',

  // guardian / legal (child only)
  guardianName: '',
  cpfRaw: '',
  adultIdType: 'rg',
  childDocType: 'certidao',

  // flags
  hasIdDocFront: false,
  hasIdDocBack: false,
  hasLinkDocFront: false,
  hasLinkDocBack: false,

  // paths
  idDocFrontPath: '',
  idDocBackPath: '',
  linkDocFrontPath: '',
  linkDocBackPath: '',

  // entity
  primaryName: '',

  // child-only extras
  childDobBR: '', // dd/MM/aaaa
  childSex: '',

  // when/where
  lastSeenDateBR: initialDateShort, // dd-MM-yy
  lastSeenTime: '',
  lastRua: '',
  lastNumero: '',
  lastCidade: '',
  lastUF: '',
  lastCEP: '',

  // media
  photoPath: '',

  // texts
  description: '',
  extraInfo: '',

  // consent
  consent: false,
};

function formReducer(state, action) {
  switch (action.type) {
    case 'INIT':
      return { ...state, ...action.payload };
    case 'SET':
      return { ...state, [action.key]: action.value };
    case 'BULK_SET':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// ID Locaux
// ---------------------------------------------------------------------------
function makeCaseId() {
  return `mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function ensureCaseId(currentId, dispatchRef) {
  if (currentId && String(currentId).trim()) {
    return String(currentId);
  }
  const newId = makeCaseId();
  try {
    dispatchRef({ type: 'SET', key: 'caseId', value: newId });
  } catch {}
  return newId;
}

// ---------------------------------------------------------------------------
// GEO best-effort
// ---------------------------------------------------------------------------
let screenTraceIdRef; // défini dans le composant, accessible ici
async function captureGeolocationOnce({ timeoutMs = 6000 } = {}) {
  const traceId = screenTraceIdRef?.current;
  Log.step(traceId, 'GEO/BEGIN');
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }
    const withTimeout = (p, ms) =>
      Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error('GEO_TIMEOUT')), ms)),
      ]);
    try {
      const pos = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        timeoutMs,
      );
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() };
    } catch {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 300000 });
      if (last?.coords) {
        return {
          lat: last.coords.latitude,
          lng: last.coords.longitude,
          t: Date.now(),
          lastKnown: true,
        };
      }
      return null;
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
const Section = ({ title, subtitle, children, style }) => (
  <View style={[styles.card, style]}>
    <Text style={styles.cardTitle}>{title}</Text>
    {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
    <View style={{ marginTop: 8 }}>{children}</View>
  </View>
);

// ---------------------------------------------------------------------------
// Builder anti-yoyo : source de vérité unique (UI/validator)
// ---------------------------------------------------------------------------
const deriveDocs = (f) => ({
  hasIdDoc: !!(f.hasIdDocFront || f.hasIdDocBack || f.idDocFrontPath || f.idDocBackPath),
  hasLinkDoc: !!(f.hasLinkDocFront || f.hasLinkDocBack || f.linkDocFrontPath || f.linkDocBackPath),
});

const buildValidationPayload = (type, form) => {
  const docs = deriveDocs(form);
  return {
    type,
    guardianName: form.guardianName,
    cpfRaw: form.cpfRaw,
    childFirstName: form.primaryName,
    childDobBR: form.childDobBR, // dd/MM/aaaa
    childSex: form.childSex,
    lastCidade: form.lastCidade,
    lastUF: String(form.lastUF || '').toUpperCase(),
    contextDesc: form.description,
    extraInfo: form.extraInfo,
    hasIdDoc: docs.hasIdDoc,
    hasLinkDoc: docs.hasLinkDoc,
    photoPath: form.photoPath,
    consent: form.consent,
  };
};

// ---------------------------------------------------------------------------
// Dropdown docs avec BG et overlay actif
// ---------------------------------------------------------------------------
const DocDropdown = ({ label, valueKey, options, onSelect }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === valueKey);
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        style={[
          styles.dropdown,
          { backgroundColor: '#0b1117', borderColor: '#1f2a35' },
          open && {
            borderColor: '#22C55E',
            shadowColor: '#22C55E',
            shadowOpacity: 0.25,
            shadowRadius: 8,
          },
        ]}
      >
        <Text style={styles.dropdownTxt}>{current?.label || 'Selecione'}</Text>
        <ChevronDown size={16} color="#cfd3db" />
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdownMenu}>
          {options.map((opt) => {
            const active = opt.key === valueKey;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.dropdownItem,
                  { backgroundColor: '#0b1117' },
                  active && styles.dropdownItemActive,
                ]}
                onPress={() => {
                  onSelect(opt.key);
                  setOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemTxt,
                    active && { color: '#22C55E', fontWeight: '800' },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Autocomplétion OSM sur "Rua"
// ---------------------------------------------------------------------------
function useOSMStreetAutocomplete() {
  const [qRua, setQRua] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    const txt = (qRua || '').trim();
    const shouldQuery = (!locked && txt.length >= 4) || (locked && txt.length >= 7);
    if (!shouldQuery) {
      setItems([]);
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(
          txt,
        )}`;
        const resp = await fetch(url, {
          headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'VigiApp/1.0 (OSM autocomplete)' },
        });
        const json = await resp.json();
        const mapped = (json || []).map((r) => ({
          id: r.place_id,
          label: r.display_name,
          addr: r.address || {},
          lat: r.lat,
          lon: r.lon,
        }));
        setItems(mapped);
      } catch (e) {
        Log.warn('OSM/RUA_ERR', e?.message || String(e));
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [qRua, locked]);

  const onPick = (it, dispatch) => {
    const a = it.addr || {};
    dispatch({
      type: 'BULK_SET',
      payload: {
        lastRua: a.road || a.pedestrian || a.footway || a.cycleway || a.path || '',
        lastNumero: a.house_number || '',
        lastCidade: a.city || a.town || a.village || a.municipality || '',
        lastUF: (a.state_code || a.state || '').toString().slice(0, 2).toUpperCase(),
        lastCEP: a.postcode || '',
      },
    });
    setQRua(a.road || a.pedestrian || a.footway || a.cycleway || a.path || it.label || '');
    setLocked(true);
    setItems([]);
  };

  const onEditRua = (txt) => {
    setQRua(txt);
    if (locked && txt.length < 7) {
      return;
    }
    if (locked && txt.length >= 7) {
      setLocked(false);
    }
  };

  return { qRua, setQRua: onEditRua, items, loading, locked, setLocked, onPick };
}

// ============================================================================
// Composant principal
// ============================================================================
export default function MissingStart() {
  screenTraceIdRef = useRef(newTraceId('missing'));
  const screenMountTsRef = useRef(Date.now());
  const lastActionRef = useRef('mount');
  const { guard, running, withBackoff } = useSubmitGuard({ cooldownMs: 1200, maxParallel: 1 });

  const router = useRouter();
  const params = useLocalSearchParams();
  const routeType = String(params?.type || 'child').toLowerCase();
  const type = ['child', 'animal', 'object'].includes(routeType) ? routeType : 'child';
  const flow = getFlow(type);

  const initialParamCaseId = String(params?.caseId || '');
  const [{ caseId, ...form }, dispatch] = useReducer(formReducer, {
    ...initialForm,
    type,
    caseId: initialParamCaseId,
  });

  const { show, Toast } = useLiteToast();
  const hasWA = useHasWhatsApp();

  // Upload state
  const [uploadPct, setUploadPct] = useState({
    photo: 0,
    id_front: 0,
    id_back: 0,
    link_front: 0,
    link_back: 0,
  });
  const [uploading, setUploading] = useState({
    photo: false,
    id_front: false,
    id_back: false,
    link_front: false,
    link_back: false,
  });
  const abortersRef = useRef({
    photo: null,
    id_front: null,
    id_back: null,
    link_front: null,
    link_back: null,
  });
  const stableCaseIdRef = useRef(null);

  useEffect(() => {
    // 1 seul caseId dès le mount
    const fixed = ensureCaseId(initialParamCaseId || caseId, dispatch);
    stableCaseIdRef.current = fixed;
    // si tu veux : console.log('[CASEID] fixed', fixed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Submit progress global (0..1)
  const [submitProgress, setSubmitProgress] = useState(0);

  const setPct = (kind, pct) =>
    setUploadPct((s) => ({ ...s, [kind]: Math.max(0, Math.min(100, pct || 0)) }));
  const setIsUploading = (kind, val) => setUploading((s) => ({ ...s, [kind]: !!val }));

  const cancelUpload = (kind) => {
    try {
      abortersRef.current[kind]?.abort();
      abortersRef.current[kind] = null;
      setIsUploading(kind, false);
      setPct(kind, 0);
      show('Upload cancelado.');
    } catch {}
  };

  // Autorisation galerie
  useEffect(() => {
    (async () => {
      try {
        await ImagePicker.requestMediaLibraryPermissionsAsync?.();
      } catch {}
    })();
  }, []);

  // Trace mount/unmount
  useEffect(() => {
    const traceId = screenTraceIdRef.current;
    const mountTs = screenMountTsRef.current;
    Log.info('MOUNT', { traceId, at: nowTs(), type, caseId: initialParamCaseId || '(none)' });
    return () => {
      Log.warn('UNMOUNT', { reason: lastActionRef.current, traceId, alive: msSince(mountTs) });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // canSubmit via builder unique
  const payload = useMemo(() => buildValidationPayload(type, form), [type, form]);
  const diag = useMemo(() => validateClient(payload, { ns: 'btn_state' }), [payload]);
  const canSubmit = diag.ok;

  // Toast "prêt à envoyer"
  useReadyToast(canSubmit, show, {
    durationMs: 6000,
    text: '✅ Pronto para enviar — você já pode tocar em Enviar.',
    ns: '[MISSING/READY]',
  });

  // Sharing message
  const shareMsg = useMemo(
    () =>
      buildShareMessage({
        type,
        caseId,
        name: form.primaryName,
        cidade: form.lastCidade,
        uf: form.lastUF,
        dateShort: form.lastSeenDateBR,
        time: form.lastSeenTime,
      }),
    [
      type,
      caseId,
      form.primaryName,
      form.lastCidade,
      form.lastUF,
      form.lastSeenDateBR,
      form.lastSeenTime,
    ],
  );

  // Upload picking
  async function pickFileFromLibrary(kind) {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
      if (perm && !perm.granted) {
        show('Permissão recusada para galeria.');
        return null;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
        exif: false,
        selectionLimit: 1,
      });
      if (result?.canceled || !result?.assets?.length) {
        return null;
      }
      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = asset.fileName || asset.filename || `upload_${Date.now()}.jpg`;
      const lower = (uri || '').toLowerCase();
      let mime =
        asset.mimeType || (asset.type === 'image' ? 'image/jpeg' : 'application/octet-stream');
      if (lower.endsWith('.png')) {
        mime = 'image/png';
      } else if (lower.endsWith('.webp')) {
        mime = 'image/webp';
      }
      return { uri, fileName, mime, kind };
    } catch {
      show('Falha ao acessar a galeria.');
      return null;
    }
  }

  async function onUpload(kind) {
    if (uploading[kind]) {
      cancelUpload(kind);
      return;
    }
    const picked = await pickFileFromLibrary(kind);
    if (!picked) {
      return;
    }

    const { uri, fileName, mime } = picked;
    const ensuredId = ensureCaseId(caseId, dispatch);

    const controller = new AbortController();
    abortersRef.current[kind] = controller;
    setPct(kind, 0);
    setIsUploading(kind, true);

    try {
      const common = {
        uri,
        fileName,
        mime,
        caseId: String(ensuredId),
        onProgress: (p) => setPct(kind, p),
        signal: controller.signal,
      };
      let res;
      if (kind === 'photo') {
        res = await uploadMainPhoto(common);
      } else if (kind === 'id_front') {
        res = await uploadIdFront(common);
      } else if (kind === 'id_back') {
        res = await uploadIdBack(common);
      } else if (kind === 'link_front') {
        res = await uploadLinkFront(common);
      } else if (kind === 'link_back') {
        res = await uploadLinkBack(common);
      }

      if (!res?.url) {
        show('Falha no upload.');
        return;
      }

      if (kind === 'photo') {
        dispatch({
          type: 'BULK_SET',
          payload: {
            photoPath: res.url,
            photoStoragePath: res.path, // <— IMPORTANT pour la base
            caseId: ensuredId,
          },
        });
        show('Foto anexada.');
      }

      if (kind === 'id_front') {
        dispatch({
          type: 'BULK_SET',
          payload: { hasIdDocFront: true, idDocFrontPath: res.url, caseId: ensuredId },
        });
        show('Documento (frente) anexado.');
      }
      if (kind === 'id_back') {
        dispatch({
          type: 'BULK_SET',
          payload: { hasIdDocBack: true, idDocBackPath: res.url, caseId: ensuredId },
        });
        show('Documento (verso) anexado.');
      }
      if (kind === 'link_front') {
        dispatch({
          type: 'BULK_SET',
          payload: { hasLinkDocFront: true, linkDocFrontPath: res.url, caseId: ensuredId },
        });
        show('Vínculo (frente) anexado.');
      }
      if (kind === 'link_back') {
        dispatch({
          type: 'BULK_SET',
          payload: { hasLinkDocBack: true, linkDocBackPath: res.url, caseId: ensuredId },
        });
        show('Vínculo (verso) anexado.');
      }

      setPct(kind, 100);
    } catch (e) {
      if (e?.name !== 'AbortError') {
        show('Erro no upload.');
      }
    } finally {
      setIsUploading(kind, false);
      abortersRef.current[kind] = null;
      setTimeout(() => {
        if (uploadPct[kind] === 100) {
          setPct(kind, 0);
        }
      }, 900);
    }
  }

  // Submit — étapes + builder
  const onSubmit = useCallback(async () => {
    lastActionRef.current = 'submit_tapped';
    setSubmitProgress(0.1);

    const v = validateClient(payload, { ns: 'submit_click' });
    if (!v.ok) {
      Alert.alert('Rejeitado', v.msg || 'Dados insuficientes.');
      return;
    }
    setSubmitProgress(0.25);

    const anyUploading = Object.values(uploading).some(Boolean);
    if (anyUploading) {
      Alert.alert('Aguarde', 'Um upload ainda está em andamento. Tente novamente em instantes.');
      return;
    }

    try {
      const ensuredId = ensureCaseId(caseId, dispatch);
      setSubmitProgress(0.35);

      const geo = await captureGeolocationOnce();
      setSubmitProgress(0.45);

      // Dates ISO
      const lastSeenISO = form.lastSeenDateBR
        ? shortToISO(form.lastSeenDateBR, form.lastSeenTime || '00:00')
        : null;

      // ✅ Fix régression: DOB ISO stockée et réutilisée
      const childDobISO = form.childDobBR ? brDateToISO(form.childDobBR) : null;

      const payloadValidated = {
        kind: type,
        ownerId: auth.currentUser?.uid || 'anon',
        media: {
          photoRedacted: form.photoPath || '',
          photoStoragePath: form.photoStoragePath || '', // si présent
        },
        primary: { name: form.primaryName || '' },
        lastSeenAt: lastSeenISO,
        lastKnownAddress: {
          rua: form.lastRua || '',
          numero: form.lastNumero || '',
          cidade: form.lastCidade || '',
          uf: String(form.lastUF || '').toUpperCase(),
          cep: form.lastCEP || '',
        },
        context: { description: form.description || '', extraInfo: form.extraInfo || '' },
        guardian:
          type === 'child'
            ? {
                fullName: form.guardianName?.trim() || '',
                cpfRaw: onlyDigits(form.cpfRaw),
                idType: form.adultIdType,
                childDocType: form.childDocType,
                childDobISO, // ✅ maintenant rempli
                docs: {
                  idDocFrontRedacted: form.idDocFrontPath || '',
                  idDocBackRedacted: form.idDocBackPath || '',
                  linkDocFrontRedacted: form.linkDocFrontPath || '',
                  linkDocBackRedacted: form.linkDocBackPath || '',
                },
              }
            : undefined,
        consent: !!form.consent,
        status: 'validated',
        statusReasons: [],
        statusWarnings: v.warnings || [],
        submitMeta: { geo: geo || null, submittedAt: Timestamp.now() },
        updatedAt: Timestamp.now(),
      };

      await writeMissingCaseOnce(ensuredId, payloadValidated);
      setSubmitProgress(0.65);

      if (type === 'child') {
        const idem = newTraceId('idem');

        const body = {
          guardian: {
            fullName: form.guardianName?.trim() || '',
            cpfRaw: onlyDigits(form.cpfRaw),
            idType: form.adultIdType,
            childDocType: form.childDocType,
            docProofs: [
              form.idDocFrontPath && 'ID_FRONT',
              form.idDocBackPath && 'ID_BACK',
              form.linkDocFrontPath && 'LINK_CHILD_DOC_FRONT',
              form.linkDocBackPath && 'LINK_CHILD_DOC_BACK',
            ].filter(Boolean),
          },
          child: {
            firstName: form.primaryName?.trim() || '',
            dob: childDobISO, // ✅ cohérent avec Firestore
            sex: form.childSex || '',
            lastSeenAt: lastSeenISO,
            lastKnownAddress: {
              rua: form.lastRua || '',
              numero: form.lastNumero || '',
              cidade: form.lastCidade || '',
              uf: String(form.lastUF || '').toUpperCase(),
              cep: form.lastCEP || '',
            },
          },
          media: { photoRedacted: form.photoPath || '' },
          meta: { geo: geo || null },
        };
        // Non bloquant
        cfVerifyGuardian({ caseId: String(ensuredId), body, idempotencyKey: idem }).catch(() => {});
      }
      setSubmitProgress(0.75);

      const endereco = [
        [form.lastRua, form.lastNumero].filter(Boolean).join(', '),
        [form.lastCidade, String(form.lastUF || '').toUpperCase()].filter(Boolean).join(' / '),
        form.lastCEP && `CEP ${form.lastCEP}`,
      ]
        .filter(Boolean)
        .join(' · ');

      const radius_m = type === 'child' ? 5000 : 2000;
      const severity = 'medium';
      const color = type === 'child' ? '#FF3B30' : type === 'animal' ? '#F59E0B' : '#FFE600';

      const { ok } = await cfSendPublicAlert({
        alertId: ensuredId,
        endereco,
        cidade: form.lastCidade || '',
        uf: String(form.lastUF || '').toUpperCase(),
        cep: form.lastCEP || '',
        lat: geo?.lat || null,
        lng: geo?.lng || null,
        radius_m,
        severity,
        color,
        traceId: screenTraceIdRef.current,
      });
      if (!ok) {
        Log.warn('[PUBLIC_ALERT] KO');
      }

      setSubmitProgress(0.9);

      if (Array.isArray(v.warnings) && v.warnings.length) {
        show(`Validado com avisos (${v.warnings.length}). Você pode detalhar depois.`);
      } else {
        show('Validado ✅ — alerta enviado.');
      }

      setSubmitProgress(1);
      setTimeout(() => {
        lastActionRef.current = 'submit_success_navigate';
        router.replace({ pathname: '/(tabs)/home' });
      }, 650);
    } catch {
      Alert.alert('Erro', 'Falha ao enviar. Tente novamente.');
      setSubmitProgress(0);
    }
  }, [payload, type, form, router, caseId, show, uploading]);

  // Règles recto/verso
  const needsAdultBack = ['rg', 'rne'].includes(form.adultIdType);
  const needsChildBack = ['rg_child', 'rne_child'].includes(form.childDocType);
  const needsChildFront = ['certidao', 'rg_child', 'passport_child', 'rne_child'].includes(
    form.childDocType,
  );

  // Progress upload inline
  const ProgressInline = ({ kind }) => {
    const pct = uploadPct[kind] || 0;
    const isUp = uploading[kind];
    if (!isUp && pct === 0) {
      return null;
    }
    return (
      <View style={styles.progressWrap}>
        <View style={[styles.progressBar, { width: `${pct}%` }]} />
        <Text style={styles.progressTxt}>{pct}%</Text>
        {isUp ? (
          <TouchableOpacity onPress={() => cancelUpload(kind)} style={styles.progressCancel}>
            <X size={14} color="#e5e7eb" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  // OSM sur Rua
  const streetAuto = useOSMStreetAutocomplete();

  // Keep qRua et form.lastRua synchronisés
  useEffect(() => {
    if (!streetAuto.locked && form.lastRua && streetAuto.qRua !== form.lastRua) {
      streetAuto.setQRua(form.lastRua);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.lastRua]);

  // ========================================================================
  // RENDER
  // ========================================================================
  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: 60, android: 0 })}
      style={{ flex: 1 }}
    >
      <View style={styles.page}>
        {/* Toast overlay */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>{Toast}</View>

        {/* Top bar */}
        <View style={styles.topbar}>
          <TouchableOpacity
            onPress={() => {
              lastActionRef.current = 'back_tapped';
              router.back();
            }}
            style={styles.backBtn}
          >
            <ChevronLeft color="#fff" size={22} />
            <Text style={styles.backTxt}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>{FLOW_RULES[type]?.title || 'Missing'}</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Barre de progression globale Submit */}
        {running('submit') ? (
          <View style={styles.submitProgressWrap}>
            <View
              style={[styles.submitProgressBar, { width: `${Math.round(submitProgress * 100)}%` }]}
            />
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Alerte haut */}
          <View style={styles.alertCard}>
            <TriangleAlert color="#111827" size={18} style={{ marginRight: 8 }} />
            <Text style={styles.alertMsg}>
              Uso responsável. Boa fé. VigiApp não substitui autoridades.
            </Text>
          </View>

          {/* DOCS ADULTE */}
          {type === 'child' && (
            <Section
              title="Documentos do responsável"
              subtitle="Selecione o tipo e anexe. Para RG/RNE: frente e verso."
            >
              <DocDropdown
                label="Tipo de peça (adulto)"
                valueKey={form.adultIdType}
                options={ADULT_ID_TYPES}
                onSelect={(k) => dispatch({ type: 'SET', key: 'adultIdType', value: k })}
              />

              {/* Identité */}
              <View style={{ marginTop: 10 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Nome completo do responsável"
                  placeholderTextColor="#9aa0a6"
                  value={form.guardianName}
                  onChangeText={(v) => dispatch({ type: 'SET', key: 'guardianName', value: v })}
                  autoCapitalize="words"
                />
              </View>
              <View style={{ marginTop: 10 }}>
                <TextInput
                  style={styles.input}
                  placeholder="CPF (somente números)"
                  placeholderTextColor="#9aa0a6"
                  keyboardType="number-pad"
                  autoComplete="off"
                  value={form.cpfRaw}
                  maxLength={14}
                  onChangeText={(t) => dispatch({ type: 'SET', key: 'cpfRaw', value: maskCPF(t) })}
                  onBlur={() =>
                    dispatch({ type: 'SET', key: 'cpfRaw', value: maskCPF(form.cpfRaw) })
                  }
                />
              </View>

              <AgePolicyNotice dobBR={form.childDobBR} />

              {/* Uploaders adulte */}
              <View style={{ marginTop: 10 }}>
                <TouchableOpacity
                  style={[
                    styles.btnGhost,
                    form.hasIdDocFront && styles.btnGhostOk,
                    uploading.id_front && styles.btnGhostBusy,
                  ]}
                  onPress={() => onUpload('id_front')}
                >
                  <FileCheck2 color={form.hasIdDocFront ? '#22C55E' : '#7dd3fc'} size={16} />
                  <Text style={styles.btnGhostTxt}>
                    {form.adultIdType === 'passport'
                      ? form.hasIdDocFront
                        ? 'Passaporte ✅'
                        : uploading.id_front
                          ? 'Enviando…'
                          : 'Anexar passaporte'
                      : form.hasIdDocFront
                        ? `${form.adultIdType === 'rne' ? 'RNE' : 'RG'} (frente) ✅`
                        : uploading.id_front
                          ? 'Enviando…'
                          : `Anexar ${form.adultIdType === 'rne' ? 'RNE' : 'RG'} (frente)`}
                  </Text>
                </TouchableOpacity>
                <ProgressInline kind="id_front" />

                {needsAdultBack && (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.btnGhost,
                        form.hasIdDocBack && styles.btnGhostOk,
                        uploading.id_back && styles.btnGhostBusy,
                      ]}
                      onPress={() => onUpload('id_back')}
                    >
                      <FileCheck2 color={form.hasIdDocBack ? '#22C55E' : '#7dd3fc'} size={16} />
                      <Text style={styles.btnGhostTxt}>
                        {form.hasIdDocBack
                          ? `${form.adultIdType === 'rne' ? 'RNE' : 'RG'} (verso) ✅`
                          : uploading.id_back
                            ? 'Enviando…'
                            : `Anexar ${form.adultIdType === 'rne' ? 'RNE' : 'RG'} (verso)`}
                      </Text>
                    </TouchableOpacity>
                    <ProgressInline kind="id_back" />
                  </>
                )}
              </View>
            </Section>
          )}

          {/* DOCS ENFANT */}
          {type === 'child' && (
            <Section
              title="Documento da criança (vínculo)"
              subtitle="Certidão (1), RG/RNE (F+V) ou Passaporte (1)."
            >
              <DocDropdown
                label="Tipo de peça (criança)"
                valueKey={form.childDocType}
                options={CHILD_DOC_TYPES}
                onSelect={(k) => dispatch({ type: 'SET', key: 'childDocType', value: k })}
              />

              {needsChildFront && (
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity
                    style={[
                      styles.btnGhost,
                      form.hasLinkDocFront && styles.btnGhostOk,
                      uploading.link_front && styles.btnGhostBusy,
                    ]}
                    onPress={() => onUpload('link_front')}
                  >
                    <FileCheck2 color={form.hasLinkDocFront ? '#22C55E' : '#7dd3fc'} size={16} />
                    <Text style={styles.btnGhostTxt}>
                      {form.childDocType === 'certidao'
                        ? form.hasLinkDocFront
                          ? 'Certidão ✅'
                          : uploading.link_front
                            ? 'Enviando…'
                            : 'Anexar certidão'
                        : form.childDocType === 'passport_child'
                          ? form.hasLinkDocFront
                            ? 'Passaporte (criança) ✅'
                            : uploading.link_front
                              ? 'Enviando…'
                              : 'Anexar passaporte (criança)'
                          : form.hasLinkDocFront
                            ? `${form.childDocType === 'rne_child' ? 'RNE criança' : 'RG criança'} (frente) ✅`
                            : uploading.link_front
                              ? 'Enviando…'
                              : `Anexar ${form.childDocType === 'rne_child' ? 'RNE criança' : 'RG criança'} (frente)`}
                    </Text>
                  </TouchableOpacity>
                  <ProgressInline kind="link_front" />

                  {needsChildBack && (
                    <>
                      <TouchableOpacity
                        style={[
                          styles.btnGhost,
                          form.hasLinkDocBack && styles.btnGhostOk,
                          uploading.link_back && styles.btnGhostBusy,
                        ]}
                        onPress={() => onUpload('link_back')}
                      >
                        <FileCheck2 color={form.hasLinkDocBack ? '#22C55E' : '#7dd3fc'} size={16} />
                        <Text style={styles.btnGhostTxt}>
                          {form.hasLinkDocBack
                            ? `${form.childDocType === 'rne_child' ? 'RNE criança' : 'RG criança'} (verso) ✅`
                            : uploading.link_back
                              ? 'Enviando…'
                              : `Anexar ${form.childDocType === 'rne_child' ? 'RNE criança' : 'RG criança'} (verso)`}
                        </Text>
                      </TouchableOpacity>
                      <ProgressInline kind="link_back" />
                    </>
                  )}
                </View>
              )}
            </Section>
          )}

          {/* IDENTITÉ PRINCIPALE */}
          <Section
            title={type === 'animal' ? 'Animal' : type === 'object' ? 'Objeto' : 'Criança'}
            subtitle={
              type === 'animal'
                ? 'Nome e sinais ajudam na identificação.'
                : type === 'object'
                  ? 'Ex.: iPhone 13, mochila preta…'
                  : 'Primeiro nome ajuda a circulação do alerta.'
            }
          >
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={styles.input}
                placeholder={
                  type === 'animal'
                    ? 'Nome do animal'
                    : type === 'object'
                      ? 'Objeto'
                      : 'Primeiro nome da criança'
                }
                placeholderTextColor="#9aa0a6"
                value={form.primaryName}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'primaryName', value: v })}
                autoCapitalize="words"
              />
            </View>

            {type === 'child' && (
              <>
                <View style={{ marginTop: 10 }}>
                  <TextInput
                    style={styles.input}
                    placeholder="Data de nascimento (dd/MM/aaaa)"
                    placeholderTextColor="#9aa0a6"
                    keyboardType="number-pad"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.childDobBR}
                    maxLength={10}
                    onChangeText={(v) =>
                      dispatch({ type: 'SET', key: 'childDobBR', value: maskDateBR(v) })
                    }
                    onBlur={() =>
                      dispatch({
                        type: 'SET',
                        key: 'childDobBR',
                        value: normalizeDateBR(form.childDobBR || ''),
                      })
                    }
                  />
                </View>

                <AgePolicyNotice dobBR={form.childDobBR} />

                <View style={styles.sexoRow}>
                  {['F', 'M'].map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={sexoChipStyle(form.childSex, s)}
                      onPress={() => dispatch({ type: 'SET', key: 'childSex', value: s })}
                    >
                      <Text style={styles.chipTxtActive}>{s === 'M' ? 'Menino' : 'Menina'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </Section>

          {/* LIEU / TEMPS */}
          <Section title="Onde e quando" subtitle="Preencha o que souber.">
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Data (dd-MM-aa)"
                placeholderTextColor="#9aa0a6"
                value={form.lastSeenDateBR}
                onChangeText={(v) =>
                  dispatch({ type: 'SET', key: 'lastSeenDateBR', value: maskDateShort(v) })
                }
                onBlur={() =>
                  dispatch({
                    type: 'SET',
                    key: 'lastSeenDateBR',
                    value: normalizeDateShort(form.lastSeenDateBR || ''),
                  })
                }
                maxLength={8}
                keyboardType="number-pad"
              />
            </View>

            <View style={{ marginTop: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Hora (HH:mm)"
                placeholderTextColor="#9aa0a6"
                value={form.lastSeenTime}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'lastSeenTime', value: v })}
                maxLength={5}
                keyboardType="number-pad"
              />
            </View>

            {/* Rua + auto-complétion OSM inline */}
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Rua"
                placeholderTextColor="#9aa0a6"
                value={streetAuto.qRua}
                onChangeText={(txt) => {
                  streetAuto.setQRua(txt);
                  dispatch({ type: 'SET', key: 'lastRua', value: txt });
                }}
              />
              {streetAuto.loading ? (
                <View style={styles.osmRow}>
                  <ActivityIndicator />
                  <Text style={{ color: '#cfd3db' }}>Buscando…</Text>
                </View>
              ) : null}
              {streetAuto.items.length > 0 && (
                <View style={styles.dropdownMenu}>
                  {streetAuto.items.map((it) => (
                    <TouchableOpacity
                      key={it.id}
                      style={styles.dropdownItem}
                      onPress={() => streetAuto.onPick(it, dispatch)}
                    >
                      <Text style={styles.dropdownItemTxt}>{it.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={{ marginTop: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Número"
                placeholderTextColor="#9aa0a6"
                value={form.lastNumero}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'lastNumero', value: v })}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Cidade"
                placeholderTextColor="#9aa0a6"
                value={form.lastCidade}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'lastCidade', value: v })}
                autoCapitalize="words"
              />
            </View>
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="UF"
                placeholderTextColor="#9aa0a6"
                value={form.lastUF}
                onChangeText={(v) =>
                  dispatch({ type: 'SET', key: 'lastUF', value: String(v).toUpperCase() })
                }
                autoCapitalize="characters"
                maxLength={2}
              />
            </View>
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="CEP"
                placeholderTextColor="#9aa0a6"
                value={form.lastCEP}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'lastCEP', value: v })}
                keyboardType="number-pad"
              />
            </View>
          </Section>

          {/* PHOTO */}
          <Section title="Foto" subtitle="Melhor uma foto recente e nítida.">
            <View style={{ marginTop: 10 }}>
              <TouchableOpacity
                style={[
                  styles.btnGhost,
                  form.photoPath && styles.btnGhostOk,
                  uploading.photo && styles.btnGhostBusy,
                ]}
                onPress={() => onUpload('photo')}
              >
                <ImageIcon color={form.photoPath ? '#22C55E' : '#9aa0a6'} size={16} />
                <Text style={styles.btnGhostTxt}>
                  {form.photoPath
                    ? 'Foto anexada ✅'
                    : uploading.photo
                      ? 'Enviando…'
                      : 'Anexar foto'}
                </Text>
              </TouchableOpacity>
              <ProgressInline kind="photo" />
            </View>
          </Section>

          {/* DÉTAILS */}
          <Section title="Detalhes" subtitle="Ajude quem vê o alerta a reconhecer.">
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder={
                  type === 'animal'
                    ? 'Descrição (porte, raça, coleira, comportamento, onde foi visto)…'
                    : type === 'object'
                      ? 'Descrição (marca, modelo, cor, número de série)…'
                      : 'Descrição do caso (onde/como, último trajeto, companhia)…'
                }
                placeholderTextColor="#9aa0a6"
                value={form.description}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'description', value: v })}
                multiline
              />
            </View>
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder={
                  type === 'animal'
                    ? 'Informações complementares (sinais, microchip, necessidades)…'
                    : type === 'object'
                      ? 'Informações complementares (capa, adesivos, acessórios, IMEI)…'
                      : 'Informações complementares (roupa, apelidos, sinais visíveis)…'
                }
                placeholderTextColor="#9aa0a6"
                value={form.extraInfo}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'extraInfo', value: v })}
                multiline
              />
            </View>
          </Section>

          {/* CONSENTEMENT */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.consentBox, form.consent && styles.consentBoxOn]}
            onPress={() => dispatch({ type: 'SET', key: 'consent', value: !form.consent })}
          >
            <View style={[styles.checkbox, form.consent && styles.checkboxOn]}>
              {form.consent ? <Check size={16} color="#0f172a" /> : null}
            </View>
            <User color={form.consent ? '#16a34a' : '#9aa0a6'} size={16} />
            <Text style={styles.consentTxt}>{flow.consentLabel}</Text>
          </TouchableOpacity>

          {/* ACTIONS */}
          <View style={{ position: 'relative' }}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: canSubmit ? '#22C55E' : '#374151' }]}
              onPress={guard('submit', async () =>
                withBackoff(onSubmit, { attempts: 2, baseDelay: 600 }),
              )}
              disabled={!canSubmit || running('submit') || Object.values(uploading).some(Boolean)}
            >
              <Text style={styles.primaryTxt}>{running('submit') ? 'Enviando…' : 'Enviar'}</Text>
            </TouchableOpacity>

            <SubmitDisabledOverlay
              disabled={!canSubmit || running('submit') || Object.values(uploading).some(Boolean)}
              onExplain={() => {
                const v = validateClient(buildValidationPayload(type, form), { ns: 'explain' });
                if (v.reasons?.length) {
                  const txt = `🚫 Campos obrigatórios faltando:\n• ${v.reasons.join('\n• ')}`;
                  show(txt);
                  Log.info('[VALIDATE][KO][reasons]', v.reasons);
                }
              }}
            />
          </View>

          {/* Partage */}
          <View style={styles.shareRow}>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={async () => await shareNative(shareMsg)}
            >
              <Share2 color="#0ea5e9" size={16} />
              <Text style={styles.shareTxt}>Compartilhar</Text>
            </TouchableOpacity>
            {hasWA && (
              <TouchableOpacity
                style={[styles.shareBtn, { borderColor: '#22C55E' }]}
                onPress={async () => await shareWhatsApp(shareMsg)}
              >
                <Share2 color="#22C55E" size={16} />
                <Text style={[styles.shareTxt, { color: '#22C55E' }]}>WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 24 }} />
          {__DEV__ && <PlaygroundMini />}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// Styles + helpers
function sexoChipStyle(current, s) {
  const active = current === s;
  const base = [styles.chip];
  let colorStyles = {};
  if (s === 'F') {
    colorStyles = active ? styles.chipFActive : styles.chipF;
  } else if (s === 'M') {
    colorStyles = active ? styles.chipMActive : styles.chipM;
  }
  return [base, colorStyles];
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0b0f14' },

  topbar: {
    paddingTop: Platform.select({ ios: 14, android: 10, default: 12 }),
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#111827',
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#0b0f14',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingRight: 8 },
  backTxt: { color: '#e5e7eb', marginLeft: 4, fontSize: 15 },
  topTitle: { color: '#e5e7eb', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },

  // Barre submit globale
  submitProgressWrap: {
    height: 3,
    backgroundColor: '#0e141b',
    borderBottomWidth: 1,
    borderBottomColor: '#17202a',
  },
  submitProgressBar: { height: 3, backgroundColor: '#22C55E' },

  scroll: { padding: 16, paddingBottom: 40 },

  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  alertMsg: { color: '#111827', fontSize: 13 },

  card: {
    backgroundColor: '#0e141b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#17202a',
    marginBottom: 12,
  },
  cardTitle: { color: '#f3f4f6', fontSize: 15, fontWeight: '800' },
  cardSubtitle: { color: '#9aa0a6', fontSize: 12, marginTop: 2 },

  input: {
    borderWidth: 1,
    borderColor: '#1f2a35',
    backgroundColor: '#0b1117',
    color: '#e5e7eb',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  multiline: { height: 96, textAlignVertical: 'top' },

  label: { color: '#cfd3db', fontSize: 13, marginBottom: 6 },

  // Chips sexe
  sexoRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  chip: { borderRadius: 18, paddingVertical: 8, paddingHorizontal: 12 },
  chipF: { backgroundColor: '#241b24', borderWidth: 2, borderColor: '#f472b6' },
  chipFActive: { backgroundColor: '#f472b6', borderWidth: 2, borderColor: '#f472b6' },
  chipM: { backgroundColor: '#231a1a', borderWidth: 2, borderColor: '#ef4444' },
  chipMActive: { backgroundColor: '#ef4444', borderWidth: 2, borderColor: '#ef4444' },
  chipTxtActive: { color: '#fff', fontWeight: '700' },

  // Dropdown générique
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#1f2a35',
    backgroundColor: '#0b1117',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  dropdownTxt: { color: '#cfd3db', fontWeight: '600' },
  dropdownMenu: {
    marginTop: 6,
    backgroundColor: '#0b1117',
    borderWidth: 1,
    borderColor: '#1f2a35',
    borderRadius: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopColor: '#15202b',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dropdownItemActive: { backgroundColor: 'rgba(34,197,94,0.08)' },
  dropdownItemTxt: { color: '#cfd3db' },

  // Boutons fantômes
  btnGhost: {
    backgroundColor: '#0b1117',
    borderWidth: 1,
    borderColor: '#1f2a35',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  btnGhostOk: { borderColor: '#22C55E' },
  btnGhostBusy: { opacity: 0.9, borderColor: '#3b82f6' },
  btnGhostTxt: { color: '#cfd3db', fontWeight: '600' },

  // Progress upload inline
  progressWrap: {
    position: 'relative',
    marginTop: 6,
    height: 14,
    borderRadius: 10,
    backgroundColor: '#0b1117',
    borderWidth: 1,
    borderColor: '#1f2a35',
    overflow: 'hidden',
  },
  progressBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#22C55E' },
  progressTxt: {
    textAlign: 'center',
    color: '#e5e7eb',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  progressCancel: { position: 'absolute', right: 6, top: -12, padding: 6 },

  // Consent
  consentBox: {
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: '#0b1117',
    borderColor: '#233244',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  consentBoxOn: {
    borderColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#6b7280',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxOn: { borderColor: '#16a34a', backgroundColor: '#22C55E' },
  consentTxt: { color: '#cfd3db', flex: 1, fontSize: 13, lineHeight: 18 },

  // CTA
  primaryBtn: { marginTop: 10, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryTxt: { color: '#0b0f14', fontWeight: '800', fontSize: 16 },

  // Partage
  shareRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  shareBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0b1117',
    borderWidth: 1,
    borderColor: '#0ea5e9',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  shareTxt: { color: '#0ea5e9', fontWeight: '800' },

  // Toast
  toastWrap: {
    position: 'absolute',
    top: Platform.select({ ios: 66, android: 48, default: 56 }),
    left: 10,
    right: 10,
    backgroundColor: '#0e141b',
    borderColor: '#17202a',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    zIndex: 999,
  },
  toastText: { color: '#fff', textAlign: 'center', fontWeight: '700' },

  // OSM Row (spinner)
  osmRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
});
