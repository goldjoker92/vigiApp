// ============================================================================
// VigiApp — Flux unifié "Missing" (child/animal/object)
// SANS DRAFT — écriture directe dans /missingCases, validation heuristique locale,
// puis notification publique automatique (5 km enfant, 2 km animal/objet).
// ============================================================================

import React, { useEffect, useMemo, useRef, useReducer, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, Platform, KeyboardAvoidingView, Share, Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db, auth } from '../../firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { TriangleAlert, User, FileCheck2, ImageIcon, ChevronLeft, Share2 } from 'lucide-react-native';

// Flux
import { FLOW_RULES, getFlow } from '../../src/miss/lib/flowRules';

// Libs locales
import { formatDateBRToISO, todayISO, onlyDigits } from '../../src/miss/lib/helpers';

// Uploads
import { uploadIdDocument, uploadLinkDocument, uploadChildPhoto } from '../../src/miss/lib/uploads';

// Guard
import { useSubmitGuard } from '../../src/miss/lib/useSubmitGuard';

// Validation centralisée (warnings non bloquants pour animal/objet)
import { validateClient } from '../../src/miss/lib/validations';

// ---------------------------------------------------------------------------
// Logger / Tracer
// ---------------------------------------------------------------------------
const NS = '[MISSING/UNIFIED]';
const nowTs = () => new Date().toISOString();
const newTraceId = (p = 'trace') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const msSince = (t0) => `${Math.max(0, Date.now() - t0)}ms`;
const Log = {
  info: (...a) => console.log(NS, ...a),
  warn: (...a) => console.warn(NS, '⚠️', ...a),
  error: (...a) => console.error(NS, '❌', ...a),
  step: (traceId, step, extra = {}) => console.log(NS, 'STEP', step, { traceId, at: nowTs(), ...extra }),
};

// ---------------------------------------------------------------------------
// Toast léger inline
// ---------------------------------------------------------------------------
function useLiteToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const show = (text) => {
    if (timer.current) { clearTimeout(timer.current); } // reset timer
    const s = String(text);
    Log.info('TOAST', s);
    setMsg(s);
    timer.current = setTimeout(() => setMsg(null), 3200);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); } }, []);
  const Toast = !msg ? null : (
    <View style={styles.toastWrap}><Text style={styles.toastText}>{msg}</Text></View>
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
      .then((ok) => { Log.info('WHATSAPP/canOpenURL', ok); setHasWA(!!ok); })
      .catch((e) => { Log.warn('WHATSAPP/error', e?.message || String(e)); setHasWA(false); });
  }, []);
  return hasWA;
}

// ---------------------------------------------------------------------------
// Partage
// ---------------------------------------------------------------------------
function buildShareMessage({ type, caseId, name, cidade, uf, dateBR, time }) {
  const link = `https://vigi.app/case/${caseId || ''}`;
  const prefix =
    type === 'animal' ? '🐾 ALERTA - Animal perdido' :
    type === 'object' ? '🧳 ALERTA - Objeto perdido' :
    '🚨 ALERTA - Criança desaparecida';
  return (
    `${prefix}\n\n` +
    `Nome: ${name || 'N/I'}\n` +
    `Local: ${cidade || 'N/I'}${uf ? ` (${uf})` : ''}\n` +
    `Data: ${dateBR || 'N/I'}${time ? ` às ${time}` : ''}\n\n` +
    `Ajude agora:\n${link}`
  );
}
async function shareNative(msg) { Log.info('SHARE/native', { len: msg?.length || 0 }); await Share.share({ message: msg }); }
async function shareWhatsApp(msg) {
  const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
  try {
    const ok = await Linking.canOpenURL(url);
    Log.info('WHATSAPP/check', { ok, len: msg?.length || 0 });
    if (ok) { await Linking.openURL(url); }
    else { await Share.share({ message: msg }); }
  } catch (e) { Log.warn('WHATSAPP/fallback', e?.message || String(e)); await Share.share({ message: msg }); }
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
      if (!resp.ok) { throw new Error(`HTTP_${resp.status}`); } // normalize errors
      Log.info('CF/OK', { status: resp.status });
      return { ok: true, json, status: resp.status };
    } catch (e) {
      lastErr = e;
      Log.warn('CF/RETRY', { i, err: e?.message || String(e) });
      if (i < attempts) { await sleep(baseDelay * Math.pow(2, i)); }
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

async function cfSendPublicAlert({ alertId, endereco, cidade, uf, cep, lat, lng, radius_m, severity, color, traceId }) {
  const body = {
    alertId, endereco, cidade, uf, cep, lat, lng, radius_m, severidade: severity, color, traceId, debug: '1',
  };
  Log.info('[NOTIF][CALL] sendPublicAlertByAddress', body);
  return await cfFetch(
    'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/sendPublicAlertByAddress',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { attempts: 2, baseDelay: 600 }
  );
}

// ---------------------------------------------------------------------------
// Reducer — modèle de formulaire
// ---------------------------------------------------------------------------
const isoToday = todayISO();
const [Y, M, D] = isoToday.split('-');
const initialDateBR = `${D}/${M}/${Y}`;

const initialForm = {
  // meta
  caseId: '',
  type: 'child',

  // guardian / legal (child only)
  guardianName: '',
  cpfRaw: '',
  hasIdDoc: false,
  hasLinkDoc: false,
  idDocPath: '',
  linkDocPath: '',

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
  if (currentId && String(currentId).trim()) { return String(currentId); } // keep provided id
  const newId = makeCaseId();
  try { dispatchRef({ type: 'SET', key: 'caseId', value: newId }); } catch {}
  Log.info('CASE_ID/GENERATED', { newId });
  return newId;
}

// ---------------------------------------------------------------------------
// Validation heuristique + helpers
// ---------------------------------------------------------------------------
// NOTE: screenTraceIdRef est utilisé ci-dessous ; défini plus bas puis injecté.
async function captureGeolocationOnce({ timeoutMs = 6000 } = {}) {
  const traceId = screenTraceIdRef.current;
  Log.step(traceId, 'GEO/BEGIN');

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    Log.info('GEO/perm', status);
    if (status !== 'granted') { Log.warn('GEO/denied'); return null; }

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
        const geo = { lat: last.coords.latitude, lng: last.coords.longitude, t: Date.now(), lastKnown: true };
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

// ============================================================================
// Composant principal
// ============================================================================
// NOTE: screenTraceIdRef est utilisé dans captureGeolocationOnce ; on le déclare avant son appel
let screenTraceIdRef;

export default function MissingUnified() {
  screenTraceIdRef = useRef(newTraceId('missing'));
  const screenMountTsRef = useRef(Date.now());

  const { guard, running, withBackoff } = useSubmitGuard({ cooldownMs: 1200, maxParallel: 1 });

  const router = useRouter();
  const params = useLocalSearchParams();
  const routeType = String(params?.type || 'child').toLowerCase();
  const type = ['child', 'animal', 'object'].includes(routeType) ? routeType : 'child';
  const flow = getFlow(type);

  const initialParamCaseId = String(params?.caseId || '');
  const [{ caseId, ...form }, dispatch] = useReducer(
    formReducer,
    { ...initialForm, type, caseId: initialParamCaseId }
  );

  const { show, Toast } = useLiteToast();
  const hasWA = useHasWhatsApp();
  const [busy, setBusy] = useState(false);

  // Partage
  const shareMsg = useMemo(() => buildShareMessage({
    type,
    caseId,
    name: form.primaryName,
    cidade: form.lastCidade,
    uf: form.lastUF,
    dateBR: form.lastSeenDateBR,
    time: form.lastSeenTime,
  }), [type, caseId, form.primaryName, form.lastCidade, form.lastUF, form.lastSeenDateBR, form.lastSeenTime]);

  // Trace mount/unmount
  useEffect(() => {
    const traceId = screenTraceIdRef.current;
    const mountTs = screenMountTsRef.current;
    Log.info('MOUNT', { traceId, at: nowTs(), type, caseId: initialParamCaseId || '(none)' });
    return () => { Log.warn('UNMOUNT', { traceId, alive: msSince(mountTs) }); };
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
      hasIdDoc: form.hasIdDoc,
      hasLinkDoc: form.hasLinkDoc,
      photoPath: form.photoPath,
    });
    return v.ok;
  }, [type, form]);

  // Uploads
  async function pickFileFromLibrary(kind) {
    const t0 = Date.now();
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'PICK/BEGIN', { kind });
    try {
      const ImagePicker = await import('expo-image-picker');

      // 1) Permission
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      Log.info('PICK/perm', { status: perm?.status, granted: perm?.granted });
      if (!perm.granted) {
        show('Permissão recusada para galeria.');
        Log.warn('PICK/denied');
        return null;
      }

      // 2) Lancement — API non dépréciée
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [ImagePicker.MediaType.Images],
        selectionLimit: 1,
        allowsEditing: false,
        quality: 0.9,
        exif: false,
      });

      Log.info('PICK/result', {
        canceled: result?.canceled,
        count: result?.assets?.length || 0,
        ms: msSince(t0),
      });
      if (result.canceled || !result.assets?.length) { return null; }

      // 3) Normalisation
      const asset = result.assets[0];
      const uri = asset.uri;
      const fileName = asset.fileName || asset.filename || `upload_${Date.now()}.jpg`;
      const lower = (uri || '').toLowerCase();

      let mime = asset.type === 'image' ? 'image/jpeg' : 'application/octet-stream';
      if (lower.endsWith('.png')) { mime = 'image/png'; }
      else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) { mime = 'image/jpeg'; }
      else if (lower.endsWith('.webp')) { mime = 'image/webp'; }

      return { uri, name: fileName, mime, kind };
    } catch (e) {
      Log.error('PICK/ERROR', e?.message || e);
      show('Falha ao acessar a galeria.');
      return null;
    }
  }

  async function onUpload(kind) {
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'UPLOAD/BEGIN', { kind, type, caseId });
    const picked = await pickFileFromLibrary(kind);
    if (!picked) { Log.warn('UPLOAD/ABORT_NO_PICK', { kind }); return; }
    const { uri, name, mime } = picked;
    setBusy(true);
    try {
      const ensuredId = ensureCaseId(caseId, dispatch);
      const common = {
        uri, name, mime,
        caseId: String(ensuredId),
        userId: auth.currentUser?.uid || 'anon',
        cpfRaw: form.cpfRaw,
        geo: undefined,
      };
      let resp;
      if (kind === 'id') { resp = await uploadIdDocument(common); }
      else if (kind === 'link') { resp = await uploadLinkDocument(common); }
      else if (kind === 'photo') { resp = await uploadChildPhoto(common); }
      else { Log.warn('UPLOAD/UNKNOWN_KIND', kind); return; }

      Log.info('UPLOAD/RESP', { kind, ok: !!resp?.ok });
      if (!resp?.ok) { show(resp?.reason || 'Falha no upload.'); Log.warn('UPLOAD/KO', { kind }); return; }

      if (kind === 'id') {
        dispatch({ type: 'BULK_SET', payload: { hasIdDoc: true, idDocPath: resp.redactedUrl, caseId: ensuredId } });
        show('Documento de identidade anexado.');
      } else if (kind === 'link') {
        dispatch({ type: 'BULK_SET', payload: { hasLinkDoc: true, linkDocPath: resp.redactedUrl, caseId: ensuredId } });
        show('Documento de vínculo anexado.');
      } else if (kind === 'photo') {
        dispatch({ type: 'BULK_SET', payload: { photoPath: resp.redactedUrl, caseId: ensuredId } });
        show('Foto anexada.');
      }

      Log.step(traceId, 'UPLOAD/END', { kind });
    } catch (e) {
      Log.error('UPLOAD/ERROR', e?.message || e);
      show('Erro no upload.');
    } finally {
      setBusy(false);
    }
  }

  // Submit (sans draft)
  const onSubmit = useCallback(async () => {
    const t0 = Date.now();
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'SUBMIT/BEGIN', { type });

    // Validation centralisée
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
      hasIdDoc: form.hasIdDoc,
      hasLinkDoc: form.hasLinkDoc,
      photoPath: form.photoPath,
    });

    setBusy(true);
    try {
      // Assurer un caseId
      const ensuredId = ensureCaseId(caseId, dispatch);

      // Localisation (best-effort)
      const geo = await captureGeolocationOnce();

      // Timestamps
      const lastSeenISO = form.lastSeenDateBR
        ? `${formatDateBRToISO(form.lastSeenDateBR)}T${form.lastSeenTime || '00:00'}:00.000Z`
        : null;

      if (!v.ok) {
        // Rejet: persistance + raisons + toast
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
          guardian: type === 'child' ? {
            fullName: form.guardianName?.trim() || '',
            cpfRaw: onlyDigits(form.cpfRaw),
            docs: { idDocRedacted: form.idDocPath || '', linkDocRedacted: form.linkDocPath || '' },
          } : undefined,
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

      // Validé: on persiste (warnings inclus)
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
        guardian: type === 'child' ? {
          fullName: form.guardianName?.trim() || '',
          cpfRaw: onlyDigits(form.cpfRaw),
          docs: { idDocRedacted: form.idDocPath || '', linkDocRedacted: form.linkDocPath || '' },
        } : undefined,
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
            docProofs: ['ID_FRONT', 'LINK_CHILD_DOC'],
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

      // Publication auto (5 km enfant / 2 km animal/objet)
      const endereco = [
        [form.lastRua, form.lastNumero].filter(Boolean).join(', '),
        [form.lastCidade, String(form.lastUF || '').toUpperCase()].filter(Boolean).join(' / '),
      ].filter(Boolean).join(' · ');

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
      if (!ok) { Log.warn('[PUBLIC_ALERT] dispatch KO — cfSendPublicAlert'); }

      if (Array.isArray(v.warnings) && v.warnings.length) {
        show(`Validado com avisos (${v.warnings.length}). Você pode detalhar depois.`);
      } else {
        show('Validado ✅ — alerta enviado.');
      }

      Log.step(traceId, 'SUBMIT/END', { ms: msSince(t0), status: 'validated' });
      setTimeout(() => { Log.info('NAVIGATE/home'); router.replace({ pathname: '/(tabs)/home' }); }, 700);
    } catch (e) {
      Log.error('SUBMIT/ERROR', e?.message || e);
      Alert.alert('Erro', 'Falha ao enviar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }, [type, form, router, caseId, show]);

  // RENDER
  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={{ flex: 1 }}>
      <View style={styles.page}>
        {/* Toast overlay */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>{Toast}</View>

        {/* Top bar */}
        <View style={styles.topbar}>
          <TouchableOpacity onPress={() => { Log.info('NAVIGATE/back'); router.back(); }} style={styles.backBtn}>
            <ChevronLeft color="#fff" size={22} />
            <Text style={styles.backTxt}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>{(FLOW_RULES[type]?.title || 'Missing')}</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Bandeau attention */}
          <View style={styles.alertCard}>
            <TriangleAlert color="#1f2937" size={20} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Uso responsável</Text>
              <Text style={styles.alertMsg}>Boa fé e responsabilidade. VigiApp não substitui autoridades.</Text>
            </View>
          </View>

          {/* Bloc docs légaux — uniquement child */}
          {type === 'child' && (
            <>
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
                  onChangeText={(t) => dispatch({ type: 'SET', key: 'cpfRaw', value: onlyDigits(t) })}
                />
              </View>

              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.btnGhost, form.hasIdDoc && styles.btnGhostOk]}
                  onPress={() => onUpload('id')}
                  disabled={busy}
                >
                  <FileCheck2 color={form.hasIdDoc ? '#22C55E' : '#7dd3fc'} size={16} />
                  <Text style={styles.btnGhostTxt}>{form.hasIdDoc ? 'ID anexado ✅' : 'Anexar doc. identidade'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnGhost, form.hasLinkDoc && styles.btnGhostOk]}
                  onPress={() => onUpload('link')}
                  disabled={busy}
                >
                  <FileCheck2 color={form.hasLinkDoc ? '#22C55E' : '#7dd3fc'} size={16} />
                  <Text style={styles.btnGhostTxt}>{form.hasLinkDoc ? 'Vínculo anexado ✅' : 'Anexar doc. vínculo'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Nom principal */}
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder={
                type === 'animal' ? 'Nome do animal' :
                type === 'object' ? 'Objeto (ex.: iPhone 13, mochila preta)' :
                'Primeiro nome da criança'
              }
              placeholderTextColor="#9aa0a6"
              value={form.primaryName}
              onChangeText={(v) => dispatch({ type: 'SET', key: 'primaryName', value: v })}
              autoCapitalize="words"
            />
          </View>

          {/* Child-only extras */}
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
              <View style={[styles.row, { gap: 10 }]}>
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

          {/* Date/heure + adresse */}
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
          </View>

          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="Hora (HH:mm) — opcional"
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
              placeholder="N° (opcional)"
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
              onChangeText={(v) => dispatch({ type: 'SET', key: 'lastUF', value: String(v).toUpperCase() })}
              autoCapitalize="characters"
              maxLength={2}
            />
          </View>

          {/* Photo */}
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btnGhost, form.photoPath && styles.btnGhostOk]}
              onPress={() => onUpload('photo')}
              disabled={busy}
            >
              <ImageIcon color={form.photoPath ? '#22C55E' : '#fca5a5'} size={16} />
              <Text style={styles.btnGhostTxt}>{form.photoPath ? 'Foto anexada ✅' : 'Anexar foto'}</Text>
            </TouchableOpacity>
          </View>

          {/* Description + Infos complémentaires */}
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder={
                type === 'animal'
                  ? 'Descrição (porte, raça, coleira, comportamento, onde foi visto)...'
                  : type === 'object'
                    ? 'Descrição (marca, modelo, cor, número de série se houver)...'
                    : 'Descrição do caso (onde/como, último trajeto, companhia, motivo provável)...'
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
                  ? 'Informações complementares (sinais, microchip, necessidades especiais)...'
                  : type === 'object'
                    ? 'Informações complementares (capa, adesivos, acessórios, IMEI)...'
                    : 'Informações complementares (roupa, apelidos, sinais visíveis)...'
              }
              placeholderTextColor="#9aa0a6"
              value={form.extraInfo}
              onChangeText={(v) => dispatch({ type: 'SET', key: 'extraInfo', value: v })}
              multiline
            />
          </View>

          {/* Consentement */}
          <TouchableOpacity
            style={[styles.consentBox, form.consent && styles.consentBoxOn]}
            onPress={() => dispatch({ type: 'SET', key: 'consent', value: !form.consent })}
          >
            <User color={form.consent ? '#22C55E' : '#9aa0a6'} size={16} />
            <Text style={styles.consentTxt}>{flow.consentLabel}</Text>
          </TouchableOpacity>

          {/* Actions */}
          <View style={{ height: 12 }} />

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: canSubmit ? '#22C55E' : '#475569' }]}
            onPress={guard('submit', async () => withBackoff(onSubmit, { attempts: 2, baseDelay: 600 }))}
            disabled={!canSubmit || busy || running('submit')}
          >
            <Text style={styles.primaryTxt}>{(busy || running('submit')) ? 'Enviando...' : 'Enviar'}</Text>
          </TouchableOpacity>

          {/* Partilha */}
          <View style={styles.row}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={async () => { Log.info('SHARE/native/click'); await shareNative(shareMsg); }}
              disabled={busy}
            >
              <Share2 color="#0ea5e9" size={16} />
              <Text style={styles.shareTxt}>Compartilhar</Text>
            </TouchableOpacity>
          </View>

          {hasWA && (
            <View style={{ marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.shareBtn, { borderColor: '#22C55E' }]}
                onPress={async () => { Log.info('SHARE/whatsapp/click'); await shareWhatsApp(shareMsg); }}
                disabled={busy}
              >
                <Share2 color="#22C55E" size={16} />
                <Text style={[styles.shareTxt, { color: '#22C55E' }]}>WhatsApp</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 28 }} />
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
  if (s === 'F') { colorStyles = active ? styles.chipFActive : styles.chipF; }
  else if (s === 'M') { colorStyles = active ? styles.chipMActive : styles.chipM; }
  return [base, colorStyles];
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#181A20' },
  topbar: {
    paddingTop: Platform.select({ ios: 14, android: 10, default: 12 }),
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#2a2f39',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backTxt: { color: '#fff', marginLeft: 4, fontSize: 15 },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  scroll: { padding: 18, paddingBottom: 40 },

  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#fbbf24',
    padding: 12,
    borderRadius: 12,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  alertTitle: { color: '#1f2937', fontSize: 14, fontWeight: '800', marginBottom: 2 },
  alertMsg: { color: '#1f2937', fontSize: 13, opacity: 0.95 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },

  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#353840',
    backgroundColor: '#222',
    color: '#fff',
    padding: 11,
    borderRadius: 10,
  },
  multiline: { height: 96, textAlignVertical: 'top' },

  chip: { borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
  chipF: { backgroundColor: '#31232c', borderWidth: 2, borderColor: '#f472b6' },
  chipFActive: { backgroundColor: '#f472b6', borderWidth: 2, borderColor: '#f472b6' },
  chipM: { backgroundColor: '#2f2222', borderWidth: 2, borderColor: '#ef4444' },
  chipMActive: { backgroundColor: '#ef4444', borderWidth: 2, borderColor: '#ef4444' },
  chipTxtActive: { color: '#fff', fontWeight: '700' },

  btnGhost: {
    flex: 1,
    backgroundColor: '#23262F',
    borderWidth: 2,
    borderColor: '#23262F',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  btnGhostOk: { borderColor: '#22C55E' },
  btnGhostTxt: { color: '#cfd3db', fontWeight: '600' },

  consentBox: {
    marginTop: 12,
    backgroundColor: '#23262F',
    borderColor: '#353840',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  consentBoxOn: { borderColor: '#22C55E' },
  consentTxt: { color: '#cfd3db', flex: 1 },

  primaryBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryTxt: { color: '#000', fontWeight: '800', fontSize: 16 },

  shareBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#111827',
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
    backgroundColor: '#2b2e36',
    borderColor: '#3a3f4b',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    zIndex: 999,
  },
  toastText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
});
