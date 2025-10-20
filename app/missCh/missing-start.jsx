// app/missing-start.jsx
// ============================================================================
// VigiApp — Flux "Missing" (child/animal/object)
// Version épurée + UX responsive + docs séparés (Responsável / Criança)
// Ajouts:
//  - Type de doc adulte: RG (F+V), Passaporte (1), RNE (F+V) [étrangers]
//  - Type de doc enfant: Certidão (1), RG criança (F+V), Passaporte criança (1), RNE criança (F+V)
//  - Consent box: checkbox verte + contour + glow à l’activation
//  - Placeholders plus légers, espacements aérés, scroll/keyboard agréables
//  - Conservation de la logique (uploads id_front/id_back & link_front/link_back)
//  - Logs & traces: traceId d’écran, step() pour étapes clés, timings msSince()
//  - ImagePicker: API non dépréciée (mediaTypes, selectionLimit)
//  - Uploads: progression %, annulation par fichier (AbortController)
// ============================================================================

import React, {
  useEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
  useCallback,
} from 'react';
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
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db, auth } from '../../firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import {
  TriangleAlert,
  User,
  FileCheck2,
  ImageIcon,
  ChevronLeft,
  Share2,
  Check,
  X,
} from 'lucide-react-native';

// Flux
import { FLOW_RULES, getFlow } from '../../src/miss/lib/flowRules';

// Libs locales
import { formatDateBRToISO, todayISO, onlyDigits } from '../../src/miss/lib/helpers';

// ✅ Nouveaux uploaders unifiés (avec progress + abort)
import {
  uploadIdFront,
  uploadIdBack,
  uploadLinkFront,
  uploadLinkBack,
  uploadChildPhoto as uploadMainPhoto,
} from '../../src/miss/lib/uploaders';

// Guard
import { useSubmitGuard } from '../../src/miss/lib/useSubmitGuard';

// Validation centralisée (warnings non bloquants pour animal/objet)
import { validateClient } from '../../src/miss/lib/validations';

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
// Toast léger inline
// ---------------------------------------------------------------------------
function useLiteToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const show = (text) => {
    if (timer.current) {clearTimeout(timer.current);}
    const s = String(text);
    Log.info('TOAST', s);
    setMsg(s);
    timer.current = setTimeout(() => setMsg(null), 3200);
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
      .then((ok) => {
        Log.info('WHATSAPP/canOpenURL', ok);
        setHasWA(!!ok);
      })
      .catch((e) => {
        Log.warn('WHATSAPP/error', e?.message || String(e));
        setHasWA(false);
      });
  }, []);
  return hasWA;
}

// ---------------------------------------------------------------------------
// Partage
// ---------------------------------------------------------------------------
function buildShareMessage({ type, caseId, name, cidade, uf, dateBR, time }) {
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
    `Data: ${dateBR || 'N/I'}${time ? ` às ${time}` : ''}\n\n` +
    `Ajude agora:\n${link}`
  );
}
async function shareNative(msg) {
  Log.info('SHARE/native', { len: msg?.length || 0 });
  await Share.share({ message: msg });
}
async function shareWhatsApp(msg) {
  const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
  try {
    const ok = await Linking.canOpenURL(url);
    Log.info('WHATSAPP/check', { ok, len: msg?.length || 0 });
    if (ok) {
      await Linking.openURL(url);
    } else {
      await Share.share({ message: msg });
    }
  } catch (e) {
    Log.warn('WHATSAPP/fallback', e?.message || String(e));
    await Share.share({ message: msg });
  }
}

// ---------------------------------------------------------------------------
// Services — CF + backoff + publish
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cfFetch(url, opts = {}, { attempts = 2, baseDelay = 400 } = {}) {
  Log.info('CF/FETCH', { url, attempts, baseDelay });
  let lastErr;
  for (let i = 0; i <= attempts; i++) {
    try {
      const resp = await fetch(url, opts);
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {throw new Error(`HTTP_${resp.status}`);}
      Log.info('CF/OK', { status: resp.status });
      return { ok: true, json, status: resp.status };
    } catch (e) {
      lastErr = e;
      Log.warn('CF/RETRY', { i, err: e?.message || String(e) });
      if (i < attempts) {await sleep(baseDelay * Math.pow(2, i));}
    }
  }
  Log.error('CF/FAIL', lastErr?.message || String(lastErr));
  return { ok: false, error: lastErr?.message || String(lastErr) };
}

async function cfVerifyGuardian({ caseId, body, idempotencyKey }) {
  Log.info('CF/VERIFY_GUARDIAN', { caseId, idempotencyKey });
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
  Log.info('[NOTIF][CALL] sendPublicAlertByAddress', body);
  return await cfFetch(
    'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/sendPublicAlertByAddress',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { attempts: 2, baseDelay: 600 },
  );
}

// ---------------------------------------------------------------------------
// Reducer — modèle de formulaire
// ---------------------------------------------------------------------------
const isoToday = todayISO();
const [Y, M, D] = isoToday.split('-');
const initialDateBR = `${D}/${M}/${Y}`;

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
  adultIdType: 'rg', // 'rg' | 'passport' | 'rne'
  childDocType: 'certidao', // 'certidao' | 'rg_child' | 'passport_child' | 'rne_child'

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

  // entity (name differs by type)
  primaryName: '',

  // child-only extras
  childDobBR: '',
  childSex: '',

  // when/where
  lastSeenDateBR: initialDateBR,
  lastSeenTime: '',
  lastRua: '',
  lastNumero: '',
  lastCidade: '',
  lastUF: '',

  // media
  photoPath: '',

  // texts
  description: '',
  extraInfo: '',

  // consent
  consent: false,
};

function formReducer(state, action) {
  Log.info('REDUCER', action?.type, action);
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
// Génération d'ID local (pas de draft)
// ---------------------------------------------------------------------------
function makeCaseId() {
  return `mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function ensureCaseId(currentId, dispatchRef) {
  if (currentId && String(currentId).trim()) {return String(currentId);}
  const newId = makeCaseId();
  try {
    dispatchRef({ type: 'SET', key: 'caseId', value: newId });
  } catch {}
  Log.info('CASE_ID/GENERATED', { newId });
  return newId;
}

// ---------------------------------------------------------------------------
/** Capture GEO best-effort */
async function captureGeolocationOnce({ timeoutMs = 6000 } = {}) {
  const traceId = screenTraceIdRef.current;
  Log.step(traceId, 'GEO/BEGIN');

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    Log.info('GEO/perm', status);
    if (status !== 'granted') {
      Log.warn('GEO/denied');
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
      const geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() };
      Log.step(traceId, 'GEO/CURRENT_OK', geo);
      return geo;
    } catch {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 300000 });
      if (last?.coords) {
        const geo = {
          lat: last.coords.latitude,
          lng: last.coords.longitude,
          t: Date.now(),
          lastKnown: true,
        };
        Log.step(traceId, 'GEO/LAST_KNOWN_OK', geo);
        return geo;
      }
      Log.warn('GEO/NONE');
      return null;
    }
  } catch (e) {
    Log.error('GEO/ERROR', e?.message || e);
    return null;
  }
}

async function fsUpsertCase(caseId, payload) {
  Log.info('FS/UPSERT_CASE', { caseId, keys: Object.keys(payload || {}) });
  const ref = doc(db, 'missingCases', String(caseId));
  await setDoc(ref, payload, { merge: true });
  Log.info('FS/UPSERT_CASE/OK');
}

// ---------------------------------------------------------------------------
// UI sous-composants
// ---------------------------------------------------------------------------
const Section = ({ title, subtitle, children, style }) => (
  <View style={[styles.card, style]}>
    <Text style={styles.cardTitle}>{title}</Text>
    {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
    <View style={{ marginTop: 8 }}>{children}</View>
  </View>
);

const ChipGroup = ({ options, activeKey, onSelect }) => (
  <View style={styles.chipRow}>
    {options.map((opt) => {
      const active = activeKey === opt.key;
      return (
        <TouchableOpacity
          key={opt.key}
          onPress={() => onSelect(opt.key)}
          style={[styles.chipBox, active && styles.chipBoxActive]}
        >
          <Text style={[styles.chipBoxTxt, active && styles.chipBoxTxtActive]}>{opt.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// ============================================================================
// Composant principal
// ============================================================================
let screenTraceIdRef;
export default function MissingStart() {
  // TraceId écran + refs
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

  // Upload state (par "kind")
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

  const setPct = (kind, pct) =>
    setUploadPct((s) => ({ ...s, [kind]: Math.max(0, Math.min(100, pct || 0)) }));
  const setIsUploading = (kind, val) =>
    setUploading((s) => ({ ...s, [kind]: !!val }));

  const cancelUpload = (kind) => {
    try {
      abortersRef.current[kind]?.abort();
      abortersRef.current[kind] = null;
      setIsUploading(kind, false);
      setPct(kind, 0);
      show('Upload cancelado.');
      Log.warn('UPLOAD/CANCELLED', { kind });
    } catch {}
  };

  // Permissions (Image Picker) — best effort
  useEffect(() => {
    (async () => {
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
        Log.info('IMG/perm_boot', perm);
      } catch (e) {
        Log.warn('IMG/perm_boot_err', e?.message || String(e));
      }
    })();
  }, []);

  // Partage
  const shareMsg = useMemo(
    () =>
      buildShareMessage({
        type,
        caseId,
        name: form.primaryName,
        cidade: form.lastCidade,
        uf: form.lastUF,
        dateBR: form.lastSeenDateBR,
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

  // Trace mount/unmount
  useEffect(() => {
    const traceId = screenTraceIdRef.current;
    const mountTs = screenMountTsRef.current;
    Log.info('MOUNT', { traceId, at: nowTs(), type, caseId: initialParamCaseId || '(none)' });
    const __ensureMountRef = screenMountTsRef.current;
    void __ensureMountRef;
    return () => {
      Log.warn('UNMOUNT', { reason: lastActionRef.current, traceId, alive: msSince(mountTs) });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bouton actif ? (ok même si warnings animal/objet)
  const canSubmit = useMemo(() => {
    const v = validateClient({
      type,
      guardianName: form.guardianName,
      cpfRaw: form.cpfRaw,
      childFirstName: form.primaryName,
      childDobBR: form.childDobBR,
      childSex: form.childSex,
      lastCidade: form.lastCidade,
      lastUF: String(form.lastUF || '').toUpperCase(),
      contextDesc: form.description,
      extraInfo: form.extraInfo,
      hasIdDoc: form.hasIdDocFront || form.hasIdDocBack || ['passport'].includes(form.adultIdType),
      hasLinkDoc:
        form.hasLinkDocFront ||
        form.hasLinkDocBack ||
        ['certidao', 'passport_child'].includes(form.childDocType),
      photoPath: form.photoPath,
    });
    return v.ok;
  }, [type, form]);

  // -------------------------------------------------------------------------
  // Uploads (ImagePicker sans dépréciation) + progress + abort
  // -------------------------------------------------------------------------
  async function pickFileFromLibrary(kind) {
    const t0 = Date.now();
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'PICK/BEGIN', { kind });
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
      Log.info('PICK/perm', { status: perm?.status, granted: perm?.granted });
      if (perm && !perm.granted) {
        show('Permissão recusada para galeria.');
        Log.warn('PICK/denied');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
        exif: false,
        selectionLimit: 1,
      });

      Log.info('PICK/result', {
        canceled: result?.canceled,
        count: result?.assets?.length || 0,
        ms: msSince(t0),
      });
      if (result?.canceled || !result?.assets?.length) {return null;}

      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = asset.fileName || asset.filename || `upload_${Date.now()}.jpg`;
      const lower = (uri || '').toLowerCase();

      let mime =
        asset.mimeType || (asset.type === 'image' ? 'image/jpeg' : 'application/octet-stream');
      if (lower.endsWith('.png')) {mime = 'image/png';}
      else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {mime = 'image/jpeg';}
      else if (lower.endsWith('.webp')) {mime = 'image/webp';}

      return { uri, fileName, mime, kind };
    } catch (e) {
      Log.error('PICK/ERROR', e?.message || e);
      show('Falha ao acessar a galeria.');
      return null;
    }
  }

  async function onUpload(kind) {
    if (uploading[kind]) {
      // si on reclique pendant un upload, on propose d’annuler
      cancelUpload(kind);
      return;
    }

    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'UPLOAD/BEGIN', { kind, type, caseId });

    const picked = await pickFileFromLibrary(kind);
    if (!picked) {
      Log.warn('UPLOAD/ABORT_NO_PICK', { kind });
      return;
    }

    const { uri, fileName, mime } = picked;
    const ensuredId = ensureCaseId(caseId, dispatch);

    // Prépare progress + abort
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
      if (kind === 'photo') {res = await uploadMainPhoto(common);}
      else if (kind === 'id_front') {res = await uploadIdFront(common);}
      else if (kind === 'id_back') {res = await uploadIdBack(common);}
      else if (kind === 'link_front') {res = await uploadLinkFront(common);}
      else if (kind === 'link_back') {res = await uploadLinkBack(common);}
      else {
        Log.warn('UPLOAD/UNKNOWN_KIND', kind);
        return;
      }

      Log.info('UPLOAD/RESP', { kind, url: res?.url, path: res?.path, bytes: res?.bytes });
      if (!res?.url) {
        show('Falha no upload.');
        Log.warn('UPLOAD/KO', { kind, res });
        return;
      }

      // Applique le résultat dans le state
      if (kind === 'photo') {
        dispatch({ type: 'BULK_SET', payload: { photoPath: res.url, caseId: ensuredId } });
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
      Log.step(traceId, 'UPLOAD/END', { kind, pct: 100 });
    } catch (e) {
      if (e?.name === 'AbortError') {
        Log.warn('UPLOAD/ABORTED', { kind });
      } else {
        Log.error('UPLOAD/ERROR', e?.message || e);
        show('Erro no upload.');
      }
    } finally {
      setIsUploading(kind, false);
      abortersRef.current[kind] = null;
      // on laisse la barre à 100% une seconde si succès visuel
      setTimeout(() => {
        if (uploadPct[kind] === 100) {setPct(kind, 0);}
      }, 900);
    }
  }

  // -------------------------------------------------------------------------
  // Submit (sans draft) — guard propre + traces
  // -------------------------------------------------------------------------
  const onSubmit = useCallback(async () => {
    lastActionRef.current = 'submit_tapped';
    const t0 = Date.now();
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'SUBMIT/BEGIN', { type });

    const v = validateClient({
      type,
      guardianName: form.guardianName,
      cpfRaw: form.cpfRaw,
      childFirstName: form.primaryName,
      childDobBR: form.childDobBR,
      childSex: form.childSex,
      lastCidade: form.lastCidade,
      lastUF: String(form.lastUF || '').toUpperCase(),
      contextDesc: form.description,
      extraInfo: form.extraInfo,
      hasIdDoc: form.hasIdDocFront || form.hasIdDocBack || ['passport'].includes(form.adultIdType),
      hasLinkDoc:
        form.hasLinkDocFront ||
        form.hasLinkDocBack ||
        ['certidao', 'passport_child'].includes(form.childDocType),
      photoPath: form.photoPath,
    });

    // Bloque l’envoi si un upload est en cours (évite les surprises réseau)
    const anyUploading = Object.values(uploading).some(Boolean);
    if (anyUploading) {
      Alert.alert('Aguarde', 'Um upload ainda está em andamento. Tente novamente em instantes.');
      return;
    }

    try {
      const ensuredId = ensureCaseId(caseId, dispatch);

      // Localisation (best-effort)
      const geo = await captureGeolocationOnce();

      // Timestamps
      const lastSeenISO = form.lastSeenDateBR
        ? `${formatDateBRToISO(form.lastSeenDateBR)}T${form.lastSeenTime || '00:00'}:00.000Z`
        : null;

      if (!v.ok) {
        await fsUpsertCase(ensuredId, {
          kind: type,
          ownerId: auth.currentUser?.uid || 'anon',
          media: { photoRedacted: form.photoPath || '' },
          primary: { name: form.primaryName || '' },
          lastSeenAt: lastSeenISO,
          lastKnownAddress: {
            rua: form.lastRua || '',
            numero: form.lastNumero || '',
            cidade: form.lastCidade || '',
            uf: String(form.lastUF || '').toUpperCase(),
          },
          context: { description: form.description || '', extraInfo: form.extraInfo || '' },
          guardian:
            type === 'child'
              ? {
                  fullName: form.guardianName?.trim() || '',
                  cpfRaw: onlyDigits(form.cpfRaw),
                  idType: form.adultIdType,
                  childDocType: form.childDocType,
                  docs: {
                    idDocFrontRedacted: form.idDocFrontPath || '',
                    idDocBackRedacted: form.idDocBackPath || '',
                    linkDocFrontRedacted: form.linkDocFrontPath || '',
                    linkDocBackRedacted: form.linkDocBackPath || '',
                  },
                }
              : undefined,
          consent: !!form.consent,
          status: 'rejected',
          statusReasons: v.reasons || [],
          statusWarnings: [],
          submitMeta: { geo: geo || null, submittedAt: Timestamp.now() },
          updatedAt: Timestamp.now(),
        });
        Log.warn('SUBMIT/REJECTED', v);
        Alert.alert('Rejeitado', v.msg || 'Dados insuficientes.');
        return;
      }

      // Validé
      const payloadValidated = {
        kind: type,
        ownerId: auth.currentUser?.uid || 'anon',
        media: { photoRedacted: form.photoPath || '' },
        primary: { name: form.primaryName || '' },
        lastSeenAt: lastSeenISO,
        lastKnownAddress: {
          rua: form.lastRua || '',
          numero: form.lastNumero || '',
          cidade: form.lastCidade || '',
          uf: String(form.lastUF || '').toUpperCase(),
        },
        context: { description: form.description || '', extraInfo: form.extraInfo || '' },
        guardian:
          type === 'child'
            ? {
                fullName: form.guardianName?.trim() || '',
                cpfRaw: onlyDigits(form.cpfRaw),
                idType: form.adultIdType,
                childDocType: form.childDocType,
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

      await fsUpsertCase(ensuredId, payloadValidated);

      // Vérif CF non bloquante (child)
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
            dob: form.childDobBR ? formatDateBRToISO(form.childDobBR) : '',
            sex: form.childSex || '',
            lastSeenAt: lastSeenISO,
            lastKnownAddress: {
              rua: form.lastRua || '',
              numero: form.lastNumero || '',
              cidade: form.lastCidade || '',
              uf: String(form.lastUF || '').toUpperCase(),
            },
          },
          media: { photoRedacted: form.photoPath || '' },
          meta: { geo: geo || null },
        };
        cfVerifyGuardian({ caseId: String(ensuredId), body, idempotencyKey: idem })
          .then((resp) => Log.info('CF verifyGuardian resp', resp))
          .catch((e) => Log.warn('CF verifyGuardian err', e?.message || String(e)));
      }

      // Publication auto
      const endereco = [
        [form.lastRua, form.lastNumero].filter(Boolean).join(', '),
        [form.lastCidade, String(form.lastUF || '').toUpperCase()].filter(Boolean).join(' / '),
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
        cep: '',
        lat: geo?.lat || null,
        lng: geo?.lng || null,
        radius_m,
        severity,
        color,
        traceId,
      });
      if (!ok) {Log.warn('[PUBLIC_ALERT] dispatch KO — cfSendPublicAlert');}

      if (Array.isArray(v.warnings) && v.warnings.length) {
        show(`Validado com avisos (${v.warnings.length}). Você pode detalhar depois.`);
      } else {
        show('Validado ✅ — alerta enviado.');
      }

      Log.step(traceId, 'SUBMIT/END', { ms: msSince(t0), status: 'validated' });
      setTimeout(() => {
        Log.info('NAVIGATE/home');
        lastActionRef.current = 'submit_success_navigate';
        router.replace({ pathname: '/(tabs)/home' });
      }, 700);
    } catch (e) {
      Log.error('SUBMIT/ERROR', e?.message || e);
      Alert.alert('Erro', 'Falha ao enviar. Tente novamente.');
    }
  }, [type, form, router, caseId, show, uploading]);

  // RENDER rules (recto/verso)
  const needsAdultBack = ['rg', 'rne'].includes(form.adultIdType);
  const needsChildBack = ['rg_child', 'rne_child'].includes(form.childDocType);
  const needsChildFront = ['certidao', 'rg_child', 'passport_child', 'rne_child'].includes(
    form.childDocType,
  );

  // petit helper UI progression
  const ProgressInline = ({ kind }) => {
    const pct = uploadPct[kind] || 0;
    const isUp = uploading[kind];
    if (!isUp && pct === 0) {return null;}
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
              Log.info('NAVIGATE/back');
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

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Bandeau attention minimal */}
          <View style={styles.alertCard}>
            <TriangleAlert color="#111827" size={18} style={{ marginRight: 8 }} />
            <Text style={styles.alertMsg}>
              Uso responsável. Boa fé. VigiApp não substitui autoridades.
            </Text>
          </View>

          {/* DOCUMENTS — Responsável (Adulto) */}
          {type === 'child' && (
            <Section
              title="Documentos do responsável"
              subtitle="Escolha o tipo e anexe as imagens. Para RNE e RG, frentes e versos."
            >
              <ChipGroup
                options={ADULT_ID_TYPES}
                activeKey={form.adultIdType}
                onSelect={(k) => dispatch({ type: 'SET', key: 'adultIdType', value: k })}
              />

              {/* Identité du responsable */}
              <View style={styles.row}>
                <TextInput
                  style={styles.input}
                  placeholder="Nome completo do responsável"
                  placeholderTextColor="#9aa0a6"
                  value={form.guardianName}
                  onChangeText={(v) => dispatch({ type: 'SET', key: 'guardianName', value: v })}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.row}>
                <TextInput
                  style={styles.input}
                  placeholder="CPF (somente números)"
                  placeholderTextColor="#9aa0a6"
                  keyboardType="number-pad"
                  value={form.cpfRaw}
                  maxLength={11}
                  onChangeText={(t) =>
                    dispatch({ type: 'SET', key: 'cpfRaw', value: onlyDigits(t) })
                  }
                />
              </View>

              {/* Uploads Adulto */}
              <View style={styles.rowCol}>
                <TouchableOpacity
                  style={[
                    styles.btnGhost,
                    form.hasIdDocFront && styles.btnGhostOk,
                    uploading.id_front && styles.btnGhostBusy,
                  ]}
                  onPress={() => onUpload('id_front')}
                >
                  <FileCheck2
                    color={form.hasIdDocFront ? '#22C55E' : '#7dd3fc'}
                    size={16}
                  />
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
                      <FileCheck2
                        color={form.hasIdDocBack ? '#22C55E' : '#7dd3fc'}
                        size={16}
                      />
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

          {/* DOCUMENTOS — Criança (Vínculo) */}
          {type === 'child' && (
            <Section
              title="Documento da criança (vínculo)"
              subtitle="Certidão (1), RG/RNE (frente+verso) ou Passaporte (1)."
            >
              <ChipGroup
                options={CHILD_DOC_TYPES}
                activeKey={form.childDocType}
                onSelect={(k) => dispatch({ type: 'SET', key: 'childDocType', value: k })}
              />

              {needsChildFront && (
                <View style={styles.rowCol}>
                  <TouchableOpacity
                    style={[
                      styles.btnGhost,
                      form.hasLinkDocFront && styles.btnGhostOk,
                      uploading.link_front && styles.btnGhostBusy,
                    ]}
                    onPress={() => onUpload('link_front')}
                  >
                    <FileCheck2
                      color={form.hasLinkDocFront ? '#22C55E' : '#7dd3fc'}
                      size={16}
                    />
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
                        <FileCheck2
                          color={form.hasLinkDocBack ? '#22C55E' : '#7dd3fc'}
                          size={16}
                        />
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
            <View style={styles.row}>
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
                <View style={styles.row}>
                  <TextInput
                    style={styles.input}
                    placeholder="Data de nascimento (DD/MM/AAAA)"
                    placeholderTextColor="#9aa0a6"
                    value={form.childDobBR}
                    onChangeText={(v) => dispatch({ type: 'SET', key: 'childDobBR', value: v })}
                    maxLength={10}
                    keyboardType="number-pad"
                  />
                </View>
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
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                placeholder="Data (DD/MM/AAAA)"
                placeholderTextColor="#9aa0a6"
                value={form.lastSeenDateBR}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'lastSeenDateBR', value: v })}
                maxLength={10}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.input, { width: 120 }]}
                placeholder="Hora (HH:mm)"
                placeholderTextColor="#9aa0a6"
                value={form.lastSeenTime}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'lastSeenTime', value: v })}
                maxLength={5}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Rua (opcional)"
                placeholderTextColor="#9aa0a6"
                value={form.lastRua}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'lastRua', value: v })}
              />
              <TextInput
                style={[styles.input, { width: 120 }]}
                placeholder="N°"
                placeholderTextColor="#9aa0a6"
                value={form.lastNumero}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'lastNumero', value: v })}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Cidade"
                placeholderTextColor="#9aa0a6"
                value={form.lastCidade}
                onChangeText={(v) => dispatch({ type: 'SET', key: 'lastCidade', value: v })}
                autoCapitalize="words"
              />
              <TextInput
                style={[styles.input, { width: 100 }]}
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
          </Section>

          {/* PHOTO */}
          <Section title="Foto" subtitle="Melhor uma foto recente e nítida.">
            <View style={styles.rowCol}>
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

          {/* DESCRIÇÃO */}
          <Section title="Detalhes" subtitle="Ajude quem vê o alerta a reconhecer.">
            <View style={styles.row}>
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

            <View style={styles.row}>
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
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: canSubmit ? '#22C55E' : '#374151' }]}
            onPress={guard('submit', async () =>
              withBackoff(onSubmit, { attempts: 2, baseDelay: 600 }),
            )}
            disabled={!canSubmit || running('submit') || Object.values(uploading).some(Boolean)}
          >
            <Text style={styles.primaryTxt}>
              {running('submit') ? 'Enviando…' : 'Enviar'}
            </Text>
          </TouchableOpacity>

          {/* Partilha */}
          <View style={styles.shareRow}>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={async () => {
                Log.info('SHARE/native/click');
                await shareNative(shareMsg);
              }}
            >
              <Share2 color="#0ea5e9" size={16} />
              <Text style={styles.shareTxt}>Compartilhar</Text>
            </TouchableOpacity>
            {hasWA && (
              <TouchableOpacity
                style={[styles.shareBtn, { borderColor: '#22C55E' }]}
                onPress={async () => {
                  Log.info('SHARE/whatsapp/click');
                  await shareWhatsApp(shareMsg);
                }}
              >
                <Share2 color="#22C55E" size={16} />
                <Text style={[styles.shareTxt, { color: '#22C55E' }]}>WhatsApp</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 24 }} />
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
  if (s === 'F') {colorStyles = active ? styles.chipFActive : styles.chipF;}
  else if (s === 'M') {colorStyles = active ? styles.chipMActive : styles.chipM;}
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

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  rowCol: { gap: 10, marginTop: 10 },

  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1f2a35',
    backgroundColor: '#0b1117',
    color: '#e5e7eb',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  multiline: { height: 96, textAlignVertical: 'top' },

  sexoRow: { flexDirection: 'row', gap: 10, marginTop: 10 },

  chip: { borderRadius: 18, paddingVertical: 8, paddingHorizontal: 12 },
  chipF: { backgroundColor: '#241b24', borderWidth: 2, borderColor: '#f472b6' },
  chipFActive: { backgroundColor: '#f472b6', borderWidth: 2, borderColor: '#f472b6' },
  chipM: { backgroundColor: '#231a1a', borderWidth: 2, borderColor: '#ef4444' },
  chipMActive: { backgroundColor: '#ef4444', borderWidth: 2, borderColor: '#ef4444' },
  chipTxtActive: { color: '#fff', fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chipBox: {
    backgroundColor: '#0b1117',
    borderWidth: 1,
    borderColor: '#1f2a35',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  chipBoxActive: { borderColor: '#22C55E' },
  chipBoxTxt: { color: '#cfd3db', fontWeight: '700' },
  chipBoxTxtActive: { color: '#22C55E' },

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

  // Progress inline
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
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#22C55E',
  },
  progressTxt: {
    textAlign: 'center',
    color: '#e5e7eb',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  progressCancel: {
    position: 'absolute',
    right: 6,
    top: -12,
    padding: 6,
  },

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
  checkboxOn: {
    borderColor: '#16a34a',
    backgroundColor: '#22C55E',
  },
  consentTxt: { color: '#cfd3db', flex: 1, fontSize: 13, lineHeight: 18 },

  primaryBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryTxt: { color: '#0b0f14', fontWeight: '800', fontSize: 16 },

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
});
