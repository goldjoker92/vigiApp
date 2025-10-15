// ============================================================================
// /app/missCh/missing-start.jsx
// VigiApp — Flux "Criança desaparecida" (écran de départ / formulaire)
// HARD-TRACE EDITION: commentaires exhaustifs + logs détaillés.
// - Lit caseId depuis la query string, charge le DRAFT Firestore
// - Enregistre un rascunho (draft) partiel
// - Uploads réels via Cloud Functions HTTP (multipart) => URL "redacted" stockées
// - Validations client (âge ≤ 12/13), CPF (11 chiffres), consentement
// - Géoloc capturée à l’envoi (best effort)
// - Partage: Share natif + bouton WhatsApp (si app installée, sinon fallback)
// - Import dynamique du picker pour ne JAMAIS faire planter Metro
// - Tracing : traceId global + mesure des durées par étape
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Share,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import {
  TriangleAlert,
  User,
  ShieldCheck,
  ImageIcon,
  FileCheck2,
  Calendar,
  Baby,
  MapPin,
  ChevronLeft,
  Share2,
} from 'lucide-react-native';

// Libs locales
import { formatDateBRToISO, todayISO } from '../../src/miss/lib/helpers';
import { validateDraftClient } from '../../src/miss/lib/validations';
import { uploadIdDocument, uploadLinkDocument, uploadChildPhoto } from '../../src/miss/lib/uploads';

// ============================================================================
// LOGGER / TRACER (verbeux, avec chronométrage par étape)
// ============================================================================
const NS = '[MISSING_CHILD/START]';

function nowTs() {
  return new Date().toISOString();
}
function newTraceId(prefix = 'trace') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function msSince(t0) {
  return `${Math.max(0, Date.now() - t0)}ms`;
}
const Log = {
  info: (...a) => console.log(NS, ...a),
  warn: (...a) => console.warn(NS, '⚠️', ...a),
  error: (...a) => console.error(NS, '❌', ...a),
  step: (traceId, step, extra = {}) =>
    console.log(NS, 'STEP', step, { traceId, at: nowTs(), ...extra }),
};

// ============================================================================
// Toast ultra léger inline (non-bloquant, avec logs)
// ============================================================================
function useLiteToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);

  const show = (text) => {
    clearTimeout(timer.current);
    const s = String(text);
    Log.info('TOAST', s);
    setMsg(s);
    timer.current = setTimeout(() => setMsg(null), 3500);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const Toast = !msg ? null : (
    <View style={styles.toastWrap}>
      <Text style={styles.toastText}>{msg}</Text>
    </View>
  );
  return { show, Toast };
}

// ============================================================================
// Helpers locaux
// ============================================================================
const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

// Détection de WhatsApp
function useHasWhatsApp() {
  const [hasWA, setHasWA] = useState(false);
  useEffect(() => {
    Linking.canOpenURL('whatsapp://send')
      .then((ok) => {
        console.log(NS, 'WHATSAPP/canOpenURL', { ok });
        setHasWA(!!ok);
      })
      .catch((e) => {
        console.warn(NS, '⚠️ WHATSAPP/canOpenURL error', e?.message || String(e));
        setHasWA(false);
      });
  }, []);
  return hasWA;
}

// Construction du message de partage
function buildShareMessage({ caseId, childFirstName, lastCidade, lastUF, lastSeenDateBR, lastSeenTime }) {
  const link = `https://vigi.app/case/${caseId}`;
  return (
    `🚨 ALERTA - Criança desaparecida\n\n` +
    `Nome: ${childFirstName || 'N/I'}\n` +
    `Local: ${lastCidade || 'N/I'}${lastUF ? ` (${lastUF})` : ''}\n` +
    `Data: ${lastSeenDateBR || 'N/I'}${lastSeenTime ? ` às ${lastSeenTime}` : ''}\n\n` +
    `Ajude agora:\n${link}`
  );
}

// Actions de partage
async function shareNative(msg) {
  console.log(NS, 'SHARE/NATIVE', { len: msg?.length || 0 });
  await Share.share({ message: msg });
}
async function shareWhatsApp(msg) {
  const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
  try {
    const ok = await Linking.canOpenURL(url);
    console.log(NS, 'WHATSAPP/check', { supported: ok, msgLen: msg?.length || 0 });
    if (ok) {
      await Linking.openURL(url);
      console.log(NS, 'WHATSAPP/openURL/OK');
    } else {
      console.warn(NS, '⚠️ WHATSAPP/not installed → fallback Share');
      await Share.share({ message: msg });
    }
  } catch (e) {
    console.error(NS, '❌ WHATSAPP/openURL/ERR', e?.message || String(e));
    await Share.share({ message: msg });
  }
}

// ============================================================================
// Composant principal
// ============================================================================
export default function MissingChildStart() {
  // Trace global pour cette session d’écran
  const screenTraceIdRef = useRef(newTraceId('mc_start'));
  const screenMountTsRef = useRef(Date.now());

  const router = useRouter();
  const { caseId } = useLocalSearchParams();
  const { show, Toast } = useLiteToast();
  const hasWA = useHasWhatsApp();

  // State principal
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Responsável
  const [guardianName, setGuardianName] = useState('');
  const [cpfRaw, setCpfRaw] = useState('');

  // Docs (redacted URLs)
  const [hasIdDoc, setHasIdDoc] = useState(false);
  const [hasLinkDoc, setHasLinkDoc] = useState(false);
  const [idDocPath, setIdDocPath] = useState('');
  const [linkDocPath, setLinkDocPath] = useState('');

  // Criança
  const [childFirstName, setChildFirstName] = useState('');
  const [childDobBR, setChildDobBR] = useState(''); // DD/MM/AAAA
  const [childSex, setChildSex] = useState(''); // 'M' | 'F'
  const [lastSeenDateBR, setLastSeenDateBR] = useState(() => {
    const iso = todayISO(); // YYYY-MM-DD
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  });
  const [lastSeenTime, setLastSeenTime] = useState(''); // HH:mm

  // Endereço
  const [lastRua, setLastRua] = useState('');
  const [lastNumero, setLastNumero] = useState('');
  const [lastCidade, setLastCidade] = useState('');
  const [lastUF, setLastUF] = useState('');

  // Media criança
  const [photoPath, setPhotoPath] = useState('');

  // Contexte / infos
  const [contextDesc, setContextDesc] = useState(''); // obligatoire
  const [extraInfo, setExtraInfo] = useState(''); // facultatif

  // Consentement
  const [consent, setConsent] = useState(false);

  // Géoloc capturée à l’envoi
  const geoRef = useRef(null);

  // Partage: message calculé
  const shareMsg = buildShareMessage({
    caseId,
    childFirstName,
    lastCidade,
    lastUF,
    lastSeenDateBR,
    lastSeenTime,
  });

  // --------------------------------------------------------------------------
  // MOUNT / UNMOUNT TRACE
  // --------------------------------------------------------------------------
  useEffect(() => {
    const traceId = screenTraceIdRef.current;
    const mountTs = screenMountTsRef.current;
    Log.info('MOUNT', { traceId, at: nowTs(), caseId });
    return () => {
      Log.warn('UNMOUNT', {
        traceId,
        alive: msSince(mountTs),
      });
    };
  }, [caseId]);

  // --------------------------------------------------------------------------
  // CHARGEMENT DU DRAFT
  // --------------------------------------------------------------------------
  useEffect(() => {
    const traceId = screenTraceIdRef.current;
    const t0 = Date.now();

    (async () => {
      try {
        Log.step(traceId, 'LOAD_DRAFT/BEGIN', { caseId });
        if (!caseId) {
          Log.warn('LOAD_DRAFT/NO_CASE_ID');
          Alert.alert('Erro', 'Identificador do caso ausente.');
          router.back();
          return;
        }

        const ref = doc(db, 'missingCases', String(caseId));
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          Log.warn('LOAD_DRAFT/NOT_FOUND', { caseId });
          Alert.alert('Rascunho não encontrado', 'Este caso pode ter sido apagado.');
          router.back();
          return;
        }
        const data = snap.data() || {};
        Log.info('LOAD_DRAFT/OK', {
          ms: msSince(t0),
          keys: Object.keys(data || {}),
          child: !!data.child,
          docs: !!data.docs,
          media: !!data.media,
        });

        // Hydrate (non-sensibles)
        if (data?.guardian?.fullName) {
          setGuardianName(data.guardian.fullName);
          Log.info('HYDRATE/guardian.fullName', data.guardian.fullName);
        }
        if (data?.child?.firstName) {
          setChildFirstName(data.child.firstName);
          Log.info('HYDRATE/child.firstName', data.child.firstName);
        }
        if (data?.child?.dob) {
          const [yy, mm, dd] = String(data.child.dob).split('-');
          const v = `${dd}/${mm}/${yy}`;
          setChildDobBR(v);
          Log.info('HYDRATE/child.dob', { iso: data.child.dob, br: v });
        }
        if (data?.child?.sex) {
          setChildSex(data.child.sex);
          Log.info('HYDRATE/child.sex', data.child.sex);
        }

        if (data?.child?.lastSeenAt) {
          const d = new Date(data.child.lastSeenAt);
          const iso = d.toISOString();
          const dateBR = `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
          setLastSeenDateBR(dateBR);
          setLastSeenTime(iso.slice(11, 16));
          Log.info('HYDRATE/child.lastSeenAt', { iso, br: { date: dateBR, time: iso.slice(11, 16) } });
        }
        if (data?.child?.lastKnownAddress) {
          setLastRua(data.child.lastKnownAddress.rua || '');
          setLastNumero(data.child.lastKnownAddress.numero || '');
          setLastCidade(data.child.lastKnownAddress.cidade || '');
          setLastUF(data.child.lastKnownAddress.uf || '');
          Log.info('HYDRATE/child.lastKnownAddress', data.child.lastKnownAddress);
        }

        if (data?.media?.photoRedacted) {
          setPhotoPath(data.media.photoRedacted);
          Log.info('HYDRATE/media.photoRedacted', data.media.photoRedacted);
        }

        if (data?.docs?.idDocRedacted) {
          setHasIdDoc(true);
          setIdDocPath(data.docs.idDocRedacted);
          Log.info('HYDRATE/docs.idDocRedacted', data.docs.idDocRedacted);
        }
        if (data?.docs?.linkDocRedacted) {
          setHasLinkDoc(true);
          setLinkDocPath(data.docs.linkDocRedacted);
          Log.info('HYDRATE/docs.linkDocRedacted', data.docs.linkDocRedacted);
        }

        setLoading(false);
        Log.step(traceId, 'LOAD_DRAFT/END', { ms: msSince(t0) });
      } catch (e) {
        Log.error('LOAD_DRAFT/ERROR', e?.message || e);
        setLoading(false);
        show('Não foi possível carregar o rascunho.');
      }
    })();
  }, [caseId, router, show]);

  // --------------------------------------------------------------------------
  // Derivés (avec logs calculés)
  // --------------------------------------------------------------------------
  const canSaveDraft = useMemo(() => {
    const ok =
      guardianName.trim().length > 0 ||
      childFirstName.trim().length > 0 ||
      photoPath ||
      idDocPath ||
      linkDocPath ||
      contextDesc.trim().length > 0;
    Log.info('DERIVED/canSaveDraft', ok);
    return ok;
  }, [guardianName, childFirstName, photoPath, idDocPath, linkDocPath, contextDesc]);

  const canRequestVerification = useMemo(() => {
    const v = validateDraftClient({
      guardianName,
      cpfRaw,
      childFirstName,
      childDobBR,

      lastRua,
      lastNumero,
      lastCidade,
      lastUF,
      contextDesc,
      extraInfo,
    });
    const proofsOk = hasIdDoc && idDocPath && hasLinkDoc && linkDocPath && photoPath;
    const dateOk = Boolean(lastSeenDateBR);
    const ok = v.ok && proofsOk && consent && dateOk;
    Log.info('DERIVED/canRequestVerification', { ok, proofsOk, consent, dateOk, v });
    return ok;
  }, [
    guardianName,
    cpfRaw,
    childFirstName,
    childDobBR,
    lastRua,
    lastNumero,
    lastCidade,
    lastUF,
    contextDesc,
    extraInfo,
    hasIdDoc,
    idDocPath,
    hasLinkDoc,
    linkDocPath,
    photoPath,
    lastSeenDateBR,
    consent,
  ]);

  // --------------------------------------------------------------------------
  // PICKER (import dynamique + logs)
  // --------------------------------------------------------------------------
  async function pickFileFromLibrary(kind) {
    const t0 = Date.now();
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'PICK/BEGIN', { kind });

    try {
      const ImagePicker = await import('expo-image-picker');

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      Log.info('PICK/perm', { status: perm?.status, granted: perm?.granted });
      if (!perm.granted) {
        show('Permissão recusada para acessar a galeria.');
        Log.warn('PICK/denied');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [ImagePicker.MediaType.IMAGE],
        allowsEditing: false,
        quality: 0.9,
      });
      Log.info('PICK/result', {
        canceled: result?.canceled,
        count: result?.assets?.length || 0,
        ms: msSince(t0),
      });

      if (result.canceled || !result.assets?.length) {return null;}

      const asset = result.assets[0];
      const uri = asset.uri;

      // heuristique mime/name basiques (loggées)
      let name = asset.fileName || `upload_${Date.now()}.jpg`;
      let mime = asset.type === 'image' ? 'image/jpeg' : 'application/octet-stream';
      if (uri?.endsWith('.png')) {
        mime = 'image/png';
        if (!name.endsWith('.png')) {name += '.png';}
      }
      if (uri?.endsWith('.jpg') || uri?.endsWith('.jpeg')) {mime = 'image/jpeg';}
      if (uri?.endsWith('.webp')) {mime = 'image/webp';}

      const out = { uri, name, mime, kind };
      Log.step(traceId, 'PICK/END', { ms: msSince(t0), out });
      return out;
    } catch (e) {
      Log.error('PICK/ERROR', e?.message || e);
      show('Falha ao acessar a galeria.');
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // UPLOADS (chaque type + logs verbeux)
  // --------------------------------------------------------------------------
  async function onUpload(kind) {
    const t0 = Date.now();
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'UPLOAD/BEGIN', { kind });

    const picked = await pickFileFromLibrary(kind);
    if (!picked) {
      Log.warn('UPLOAD/ABORT_NO_PICK', { kind });
      return;
    }

    const { uri, name, mime } = picked;

    setBusy(true);
    try {
      const common = {
        uri,
        name,
        mime,
        caseId: String(caseId),
        userId: 'anon', // TODO: brancher uid si nécessaire
        cpfRaw, // jamais stocké en clair
        geo: geoRef.current || undefined,
      };
      Log.info('UPLOAD/payload', { kind, ...common, uri: '(omitted)' });

      let resp;
      if (kind === 'id') {resp = await uploadIdDocument(common);}
      else if (kind === 'link') {resp = await uploadLinkDocument(common);}
      else if (kind === 'photo') {resp = await uploadChildPhoto(common);}
      else {
        Log.warn('UPLOAD/UNKNOWN_KIND', kind);
        return;
      }

      Log.info('UPLOAD/resp', { kind, ok: !!resp?.ok, meta: resp?.meta });
      if (!resp?.ok) {
        const reason = resp?.reason || 'Falha no upload.';
        show(reason);
        Log.warn('UPLOAD/KO', { kind, reason });
        return;
      }

      if (kind === 'id') {
        setHasIdDoc(true);
        setIdDocPath(resp.redactedUrl);
        show('Documento de identidade anexado.');
      } else if (kind === 'link') {
        setHasLinkDoc(true);
        setLinkDocPath(resp.redactedUrl);
        show('Documento de vínculo anexado.');
      } else if (kind === 'photo') {
        setPhotoPath(resp.redactedUrl);
        show('Foto anexada.');
      }
      Log.step(traceId, 'UPLOAD/END', { kind, ms: msSince(t0) });
    } catch (e) {
      Log.error('UPLOAD/ERROR', e?.message || e);
      show('Erro no upload.');
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------------------------------
  // SAVE DRAFT
  // --------------------------------------------------------------------------
  async function onSaveDraft() {
    const t0 = Date.now();
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'SAVE_DRAFT/BEGIN');

    try {
      if (!canSaveDraft) {
        show('Preencha pelo menos un campo para salvar.');
        Log.warn('SAVE_DRAFT/BLOCKED_EMPTY');
        return;
      }
      setBusy(true);

      const ref = doc(db, 'missingCases', String(caseId));

      const lastSeenISO = lastSeenDateBR
        ? `${formatDateBRToISO(lastSeenDateBR)}T${lastSeenTime || '00:00'}:00.000Z`
        : null;

      const payload = {
        guardian: { fullName: guardianName.trim() || '' /* cpfHash côté serveur */ },
        child: {
          firstName: childFirstName.trim() || '',
          dob: childDobBR ? formatDateBRToISO(childDobBR) : '',
          sex: childSex || '',
          lastSeenAt: lastSeenISO,
          lastKnownAddress: {
            rua: lastRua || '',
            numero: lastNumero || '',
            cidade: lastCidade || '',
            uf: String(lastUF || '').toUpperCase(),
          },
        },
        docs: { idDocRedacted: idDocPath || '', linkDocRedacted: linkDocPath || '' },
        media: { photoRedacted: photoPath || '' },
        context: { description: contextDesc || '', extraInfo: extraInfo || '' },
        updatedAt: Timestamp.now(),
        status: 'draft',
      };

      Log.info('SAVE_DRAFT/payload', payload);
      await updateDoc(ref, payload);

      show('Rascunho salvo.');
      Log.step(traceId, 'SAVE_DRAFT/END', { ms: msSince(t0) });
    } catch (e) {
      Log.error('SAVE_DRAFT/ERROR', e?.message || e);
      show('Não foi possível salvar o rascunho.');
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------------------------------
  // GÉOLOC une fois (best effort)
  // --------------------------------------------------------------------------
  async function captureGeolocationOnce() {
    const t0 = Date.now();
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'GEO/BEGIN');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      Log.info('GEO/perm', status);
      if (status !== 'granted') {
        Log.warn('GEO/denied');
        return null;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const geo = { lat: loc.coords.latitude, lng: loc.coords.longitude, t: Date.now() };
      geoRef.current = geo;
      Log.step(traceId, 'GEO/END', { ms: msSince(t0), geo });
      return geo;
    } catch (e) {
      Log.error('GEO/ERROR', e?.message || e);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // SUBMIT: demande de vérification
  // --------------------------------------------------------------------------
  async function onRequestVerification() {
    const t0 = Date.now();
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'SUBMIT/BEGIN');

    // 1) Validations client
    const v = validateDraftClient({
      guardianName,
      cpfRaw,
      childFirstName,
      childDobBR,
      childSex,
      lastRua,
      lastNumero,
      lastCidade,
      lastUF,
      contextDesc,
      extraInfo,
    });
    if (!v.ok) {
      show(v.msg);
      Log.warn('SUBMIT/VALIDATION_KO', v);
      return;
    }
    if (!hasIdDoc || !idDocPath || !hasLinkDoc || !linkDocPath || !photoPath) {
      const reason = 'Anexe os documentos e a foto.';
      show(reason);
      Log.warn('SUBMIT/MISSING_PROOFS');
      return;
    }
    if (!consent) {
      const reason = 'Confirme o consentimento para prosseguir.';
      show(reason);
      Log.warn('SUBMIT/NO_CONSENT');
      return;
    }

    setBusy(true);
    try {
      // 2) Géoloc best effort
      await captureGeolocationOnce();

      // 3) Save draft -> status pending
      const ref = doc(db, 'missingCases', String(caseId));
      const lastSeenISO = lastSeenDateBR
        ? `${formatDateBRToISO(lastSeenDateBR)}T${lastSeenTime || '00:00'}:00.000Z`
        : null;

      const updatePayload = {
        guardian: { fullName: guardianName.trim() || '' },
        child: {
          firstName: childFirstName.trim() || '',
          dob: childDobBR ? formatDateBRToISO(childDobBR) : '',
          sex: childSex || '',
          lastSeenAt: lastSeenISO,
          lastKnownAddress: {
            rua: lastRua || '',
            numero: lastNumero || '',
            cidade: lastCidade || '',
            uf: String(lastUF || '').toUpperCase(),
          },
        },
        docs: { idDocRedacted: idDocPath || '', linkDocRedacted: linkDocPath || '' },
        media: { photoRedacted: photoPath || '' },
        context: { description: contextDesc || '', extraInfo: extraInfo || '' },
        submitMeta: { geo: geoRef.current || null, submittedAt: Timestamp.now() },
        status: 'pending',
        updatedAt: Timestamp.now(),
      };
      Log.info('SUBMIT/updateDoc/payload', updatePayload);
      await updateDoc(ref, updatePayload);

      // 4) CF verifyGuardian (cpfRaw transmis côté CF, jamais stocké en clair)
      try {
        const body = {
          caseId: String(caseId),
          payload: {
            guardian: {
              fullName: guardianName.trim(),
              cpfRaw: onlyDigits(cpfRaw),
              docProofs: ['ID_FRONT', 'LINK_CHILD_DOC'],
            },
            child: {
              firstName: childFirstName.trim(),
              dob: childDobBR ? formatDateBRToISO(childDobBR) : '',
              sex: childSex,
              lastSeenAt: lastSeenISO,
              lastKnownAddress: {
                rua: lastRua,
                numero: lastNumero,
                cidade: lastCidade,
                uf: String(lastUF || '').toUpperCase(),
              },
            },
            media: { photoRedacted: photoPath },
            meta: { geo: geoRef.current || null },
          },
        };
        Log.info('SUBMIT/CF/verifyGuardian/REQ', {
          ...body,
          payload: { ...body.payload, guardian: { ...body.payload.guardian, cpfRaw: '(masked)' } },
        });

        const resp = await fetch(
          'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/verifyGuardian',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        const json = await resp.json().catch(() => null);
        Log.info('SUBMIT/CF/verifyGuardian/RESP', { status: resp.status, ok: resp.ok, json });

        if (!resp.ok) {throw new Error(`verifyGuardian http ${resp.status}`);}

        show('Enviado para verificação. Pronto para enviar ao público.');
      } catch (err) {
        Log.warn('SUBMIT/CF_FALLBACK', err?.message || err);
        await updateDoc(ref, { requestedVerification: true, requestedAt: Timestamp.now() });
        show('Solicitação registrada. Verificação pendente.');
      }

      Log.step(traceId, 'SUBMIT/END', { ms: msSince(t0) });

      // 5) Navigate (home) après un court délai (UX)
      setTimeout(() => {
        Log.info('NAVIGATE/home');
        router.replace({ pathname: '/(tabs)/home' });
      }, 600);
    } catch (e) {
      Log.error('SUBMIT/ERROR', e?.message || e);
      show('Falha ao enviar para verificação.');
    } finally {
      setBusy(false);
    }
  }

  // --------------------------------------------------------------------------
  // PARTAGE (System share + WhatsApp si dispo)
  // --------------------------------------------------------------------------
  async function onShareSystem() {
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'SHARE/NATIVE/BEGIN');
    try {
      await shareNative(shareMsg);
      Log.step(traceId, 'SHARE/NATIVE/END', { ok: true });
    } catch (e) {
      Log.error('SHARE/NATIVE/ERROR', e?.message || e);
      show('Não foi possível compartilhar.');
    }
  }

  async function onShareWhatsApp() {
    const traceId = screenTraceIdRef.current;
    Log.step(traceId, 'SHARE/WA/BEGIN');
    try {
      await shareWhatsApp(shareMsg);
      Log.step(traceId, 'SHARE/WA/END', { ok: true });
    } catch (e) {
      Log.error('SHARE/WA/ERROR', e?.message || e);
      show('Não foi possível compartilhar.');
    }
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------
  if (loading) {
    return (
      <View style={[styles.page, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#22C55E" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={{ flex: 1 }}
    >
      <View style={styles.page}>
        {Toast}

        {/* Top bar */}
        <View style={styles.topbar}>
          <TouchableOpacity
            onPress={() => {
              Log.info('NAVIGATE/back');
              router.back();
            }}
            style={styles.backBtn}
          >
            <ChevronLeft color="#fff" size={22} />
            <Text style={styles.backTxt}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Criança desaparecida</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Atenção */}
          <View style={styles.alertCard}>
            <TriangleAlert color="#1f2937" size={22} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Atenção — uso responsável</Text>
              <Text style={styles.alertMsg}>
                Este recurso é colaborativo e depende de{' '}
                <Text style={{ fontWeight: 'bold' }}>boa fé e responsabilidade</Text>.{'\n'}
                <Text style={{ fontWeight: 'bold' }}>
                  VigiApp não substitui Polícia, Samu ou órgãos oficiais.
                </Text>
                {'\n'}
                Apenas para crianças de até <Text style={{ fontWeight: 'bold' }}>12 anos</Text> (13
                tolerado até o fim do ano).
              </Text>
            </View>
          </View>

          {/* Checklist de documentos */}
          <View style={styles.checklist}>
            <Text style={styles.checkTitle}>Documentos necessários</Text>
            <Text style={styles.checkItem}>• Documento de identidade do responsável (frente)</Text>
            <Text style={styles.checkItem}>• Documento de vínculo responsável ↔ criança</Text>
            <Text style={styles.checkItem}>
              • Foto recente da criança (sem filtros, rosto visível)
            </Text>
          </View>

          {/* Responsável */}
          <Text style={styles.sectionTitle}>
            <ShieldCheck color="#7dd3fc" size={18} style={{ marginRight: 6 }} />
            Dados do responsável
          </Text>

          <Text style={styles.label}>Nome completo</Text>
          <TextInput
            style={styles.input}
            placeholder="Nome completo do responsável"
            placeholderTextColor="#9aa0a6"
            value={guardianName}
            onChangeText={(v) => {
              setGuardianName(v);
              Log.info('FIELD/guardianName', v);
            }}
            autoCapitalize="words"
          />

          <Text style={styles.label}>CPF (não será salvo em claro)</Text>
          <TextInput
            style={styles.input}
            placeholder="Somente números"
            placeholderTextColor="#9aa0a6"
            keyboardType="number-pad"
            value={cpfRaw}
            onChangeText={(t) => {
              const d = onlyDigits(t);
              setCpfRaw(d);
              Log.info('FIELD/cpfRaw(len)', d.length);
            }}
            maxLength={11}
          />

          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btnGhost, hasIdDoc && styles.btnGhostOk]}
              onPress={() => onUpload('id')}
              disabled={busy}
            >
              <FileCheck2 color={hasIdDoc ? '#22C55E' : '#7dd3fc'} size={16} />
              <Text style={styles.btnGhostTxt}>
                {hasIdDoc ? 'Documento de identidade ✅' : 'Anexar doc. identidade'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnGhost, hasLinkDoc && styles.btnGhostOk]}
              onPress={() => onUpload('link')}
              disabled={busy}
            >
              <FileCheck2 color={hasLinkDoc ? '#22C55E' : '#7dd3fc'} size={16} />
              <Text style={styles.btnGhostTxt}>
                {hasLinkDoc ? 'Doc. vínculo ✅' : 'Anexar doc. de vínculo'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Criança */}
          <Text style={[styles.sectionTitle, { marginTop: 14 }]}>
            <Baby color="#fde68a" size={18} style={{ marginRight: 6 }} />
            Dados da criança
          </Text>

          <Text style={styles.label}>Primeiro nome</Text>
          <TextInput
            style={styles.input}
            placeholder="Primeiro nome"
            placeholderTextColor="#9aa0a6"
            value={childFirstName}
            onChangeText={(v) => {
              setChildFirstName(v);
              Log.info('FIELD/childFirstName', v);
            }}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Data de nascimento (DD/MM/AAAA)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex.: 21/04/2016"
            placeholderTextColor="#9aa0a6"
            value={childDobBR}
            onChangeText={(v) => {
              setChildDobBR(v);
              Log.info('FIELD/childDobBR', v);
            }}
            maxLength={10}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Sexo</Text>
          <View style={styles.row}>
            {['F', 'M'].map((s) => (
              <TouchableOpacity
                key={s}
                style={sexoChipStyle(childSex, s)}
                onPress={() => {
                  setChildSex(s);
                  Log.info('FIELD/childSex', s);
                }}
              >
                <Text style={styles.chipTxtActive}>{s === 'M' ? 'Menino' : 'Menina'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Última vez visto */}
          <Text style={styles.sectionTitle}>
            <Calendar color="#93c5fd" size={18} style={{ marginRight: 6 }} />
            Última vez visto(a)
          </Text>

          <Text style={styles.label}>Data (DD/MM/AAAA)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex.: 10/10/2025"
            placeholderTextColor="#9aa0a6"
            value={lastSeenDateBR}
            onChangeText={(v) => {
              setLastSeenDateBR(v);
              Log.info('FIELD/lastSeenDateBR', v);
            }}
            maxLength={10}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Hora (HH:mm) — opcional</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex.: 14:30"
            placeholderTextColor="#9aa0a6"
            value={lastSeenTime}
            onChangeText={(v) => {
              setLastSeenTime(v);
              Log.info('FIELD/lastSeenTime', v);
            }}
            maxLength={5}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>
            <MapPin color="#93c5fd" size={16} /> Rua (opcional) e número (opcional)
          </Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Rua"
              placeholderTextColor="#9aa0a6"
              value={lastRua}
              onChangeText={(v) => {
                setLastRua(v);
                Log.info('FIELD/lastRua', v);
              }}
            />
            <TextInput
              style={[styles.input, { width: 120 }]}
              placeholder="N°"
              placeholderTextColor="#9aa0a6"
              value={lastNumero}
              onChangeText={(v) => {
                setLastNumero(v);
                Log.info('FIELD/lastNumero', v);
              }}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Cidade</Text>
              <TextInput
                style={styles.input}
                placeholder="Cidade"
                placeholderTextColor="#9aa0a6"
                value={lastCidade}
                onChangeText={(v) => {
                  setLastCidade(v);
                  Log.info('FIELD/lastCidade', v);
                }}
                autoCapitalize="words"
              />
            </View>
            <View style={{ width: 100 }}>
              <Text style={styles.label}>UF</Text>
              <TextInput
                style={styles.input}
                placeholder="CE"
                placeholderTextColor="#9aa0a6"
                value={lastUF}
                onChangeText={(v) => {
                  const u = String(v).toUpperCase();
                  setLastUF(u);
                  Log.info('FIELD/lastUF', u);
                }}
                maxLength={2}
                autoCapitalize="characters"
              />
            </View>
          </View>

          {/* Foto redigida (upload) */}
          <Text style={styles.sectionTitle}>
            <ImageIcon color="#fca5a5" size={18} style={{ marginRight: 6 }} />
            Foto recente (redigida)
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btnGhost, photoPath && styles.btnGhostOk]}
              onPress={() => onUpload('photo')}
              disabled={busy}
            >
              <ImageIcon color={photoPath ? '#22C55E' : '#fca5a5'} size={16} />
              <Text style={styles.btnGhostTxt}>
                {photoPath ? 'Foto anexada ✅' : 'Anexar foto'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Contexte */}
          <Text style={styles.sectionTitle}>Contexto da desaparição</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Onde/como aconteceu? Último trajeto, companhia, motivo provável..."
            placeholderTextColor="#9aa0a6"
            value={contextDesc}
            onChangeText={(v) => {
              setContextDesc(v);
              Log.info('FIELD/contextDesc(len)', v.length);
            }}
            multiline
          />

          <Text style={styles.sectionTitle}>Informações complementares (opcional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Ex.: roupa, cor do cabelo, óculos, mochila, apelidos..."
            placeholderTextColor="#9aa0a6"
            value={extraInfo}
            onChangeText={(v) => {
              setExtraInfo(v);
              Log.info('FIELD/extraInfo(len)', v.length);
            }}
            multiline
          />

          {/* Consentement */}
          <TouchableOpacity
            style={[styles.consentBox, consent && styles.consentBoxOn]}
            onPress={() => {
              const nv = !consent;
              setConsent(nv);
              Log.info('FIELD/consent', nv);
            }}
          >
            <User color={consent ? '#22C55E' : '#9aa0a6'} size={16} />
            <Text style={styles.consentTxt}>
              Confirmo que sou o responsável legal ou autorizado, agindo de boa fé.
            </Text>
          </TouchableOpacity>

          {/* Actions */}
          <View style={{ height: 12 }} />

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: canRequestVerification ? '#22C55E' : '#475569' },
            ]}
            onPress={onRequestVerification}
            disabled={!canRequestVerification || busy}
          >
            <Text style={styles.primaryTxt}>{busy ? 'Enviando...' : 'Enviar para verificação'}</Text>
          </TouchableOpacity>

          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.secondaryBtn, !canSaveDraft && { opacity: 0.6 }]}
              onPress={onSaveDraft}
              disabled={!canSaveDraft || busy}
            >
              <Text style={styles.secondaryTxt}>Salvar rascunho</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareBtn} onPress={onShareSystem} disabled={busy}>
              <Share2 color="#0ea5e9" size={16} />
              <Text style={styles.shareTxt}>Compartilhar</Text>
            </TouchableOpacity>
          </View>

          {hasWA && (
            <View style={{ marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.shareBtn, { borderColor: '#22C55E' }]}
                onPress={onShareWhatsApp}
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

// ============================================================================
// Styles
// ============================================================================
function sexoChipStyle(current, s) {
  const active = current === s;
  const base = [styles.chip];
  let colorStyles = {};
  if (s === 'F') {colorStyles = active ? styles.chipFActive : styles.chipF;}
  else if (s === 'M') {colorStyles = active ? styles.chipMActive : styles.chipM;}
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
    padding: 14,
    borderRadius: 14,
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  alertTitle: { color: '#1f2937', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  alertMsg: { color: '#1f2937', fontSize: 13.5, opacity: 0.95 },

  checklist: {
    backgroundColor: '#23262F',
    borderColor: '#353840',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  checkTitle: { color: '#fff', fontWeight: '800', marginBottom: 6, fontSize: 14 },
  checkItem: { color: '#cfd3db', fontSize: 13.5 },

  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: { color: '#cfd3db', marginBottom: 4, marginTop: 8, fontSize: 13.5 },

  input: {
    borderWidth: 1,
    borderColor: '#353840',
    backgroundColor: '#222',
    color: '#fff',
    padding: 11,
    borderRadius: 10,
  },
  multiline: { height: 96, textAlignVertical: 'top' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },

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

  secondaryBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0ea5e9',
  },
  secondaryTxt: { color: '#00131a', fontWeight: '800' },

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


