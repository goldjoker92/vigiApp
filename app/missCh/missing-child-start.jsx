// app/missing-child/start.jsx
// ============================================================================
// VigiApp — Flux "Criança desaparecida" (écran de départ / formulaire)
// - Lis le caseId (DRAFT) et remplit les infos Responsável + Criança
// - Sauvegarde non sensible côté /missingCases (draft persistant)
// - Envoi de vérification via CF verifyGuardian (CPF non stocké en clair côté client)
// - Uploads mockés → brancher GCS + redaction pipeline plus tard
// - Logs ultra verbeux [MISSING_CHILD] + toasts UX
// - Dark UI, cohérente avec Report.jsx
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db } from '../../firebase';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { TriangleAlert, User, ShieldCheck, ImageIcon, FileCheck2, Calendar, Baby, MapPin, ChevronLeft } from 'lucide-react-native';

// ----------------------------------------------------------------------------
// Logs homogènes
// ----------------------------------------------------------------------------
const log = (...a) => console.log('[MISSING_CHILD][START]', ...a);
const warn = (...a) => console.warn('[MISSING_CHILD][START] ⚠️', ...a);

// ----------------------------------------------------------------------------
// Toast léger inline (simple, pas de queue ici)
// ----------------------------------------------------------------------------
function useLiteToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const show = (text) => {
    clearTimeout(timer.current);
    setMsg(String(text));
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

// ----------------------------------------------------------------------------
// Helpers simples (aucun stockage de PII sensible côté client)
// ----------------------------------------------------------------------------
const onlyDigits = (v) => String(v || '').replace(/\D/g, '');
const isValidCPF = (cpf) => onlyDigits(cpf).length === 11; // validation simple (serveur fera le vrai check)
const isValidUF = (uf) => /^[A-Z]{2}$/.test(String(uf || '').trim());
const todayISO = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// Validation de base (client) — le serveur fait foi pour le passage d'états
function validateDraftClient({ guardianName, cpfRaw, childFirstName, childDob, childSex }) {
  if (!guardianName?.trim()) {return { ok: false, msg: 'Nome completo do responsável é obrigatório.' };}
  if (!isValidCPF(cpfRaw)) {return { ok: false, msg: 'CPF inválido (11 dígitos).' };}
  if (!childFirstName?.trim()) {return { ok: false, msg: 'Primeiro nome da criança é obrigatório.' };}
  if (!childDob) {return { ok: false, msg: 'Data de nascimento é obrigatória.' };}
  if (!childSex) {return { ok: false, msg: 'Sexo é obrigatório.' };}
  // L’âge ≤ 12 ans sera revalidé côté serveur (source de vérité)
  return { ok: true };
}

// Mock upload (à remplacer par ton pipeline GCS + redaction)
async function mockUpload(fileKind) {
  // Simule un chemin GCS redacted (ne JAMAIS exposer 'original/' publiquement)
  const id = Math.random().toString(36).slice(2, 9);
  return { ok: true, path: `gs://vigiapp/redacted/${fileKind}_${id}.jpg` };
}

export default function MissingChildStart() {
  const router = useRouter();
  const { caseId } = useLocalSearchParams();
  const { show, Toast } = useLiteToast();

  // const uid = auth.currentUser?.uid || null;
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Draft (lecture initiale)
  // const [draft, setDraft] = useState(null);

  // Form — Responsável (PII sensible en mémoire uniquement)
  const [guardianName, setGuardianName] = useState('');
  const [cpfRaw, setCpfRaw] = useState('');

  // Preuves (flags + chemins redacted simulés)
  const [hasIdDoc, setHasIdDoc] = useState(false);
  const [hasLinkDoc, setHasLinkDoc] = useState(false);
  const [idDocPath, setIdDocPath] = useState('');
  const [linkDocPath, setLinkDocPath] = useState('');

  // Enfant
  const [childFirstName, setChildFirstName] = useState('');
  const [childDob, setChildDob] = useState(''); // YYYY-MM-DD
  const [childSex, setChildSex] = useState(''); // 'M' | 'F' | 'X'
  const [lastSeenDate, setLastSeenDate] = useState(todayISO());
  const [lastSeenTime, setLastSeenTime] = useState(''); // HH:mm
  const [lastRuaNumero, setLastRuaNumero] = useState('');
  const [lastCidade, setLastCidade] = useState('');
  const [lastUF, setLastUF] = useState('');

  // Photo redacted
  const [photoPath, setPhotoPath] = useState('');

  // Consentement
  const [consent, setConsent] = useState(false);

  // --------------------------------------------------------------------------
  // Load draft
  // --------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        if (!caseId) {
          Alert.alert('Erro', 'Identificador do caso ausente.');
          router.back();
          return;
        }
        const ref = doc(db, 'missingCases', String(caseId));
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          Alert.alert('Rascunho não encontrado', 'Este caso pode ter sido apagado.');
          router.back();
          return;
        }
        const data = snap.data();
        // setDraft({ id: snap.id, ...data });

        // Init champs à partir du draft si dispo (non sensibles)
        if (data?.guardian?.fullName) {setGuardianName(data.guardian.fullName);}
        if (data?.child?.firstName) { setChildFirstName(data.child.firstName); }
        if (data?.child?.dob) {setChildDob(data.child.dob);}
        if (data?.child?.sex) {setChildSex(data.child.sex);}
        if (data?.child?.lastSeenAt) {
          const d = new Date(data.child.lastSeenAt);
          const iso = d.toISOString();
          setLastSeenDate(iso.slice(0, 10));
          setLastSeenTime(iso.slice(11, 16));
        }
        if (data?.child?.lastKnownAddress) {
          setLastRuaNumero(data.child.lastKnownAddress.ruaNumero || '');
          setLastCidade(data.child.lastKnownAddress.cidade || '');
          setLastUF(data.child.lastKnownAddress.uf || '');
        }
        if (data?.media?.photoRedacted) {setPhotoPath(data.media.photoRedacted);}

        setLoading(false);
      } catch (e) {
        warn('load draft:', e?.message || e);
        setLoading(false);
        show('Não foi possível carregar o rascunho.');
      }
    })();
  }, [caseId, router, show]);

  const canSaveDraft = useMemo(() => {
    // Sauvegarde partielle OK (pas de CPF ici)
    return guardianName.trim().length > 0 || childFirstName.trim().length > 0 || photoPath;
  }, [guardianName, childFirstName, photoPath]);

  const canRequestVerification = useMemo(() => {
    // Pré-val client pour activer le CTA de vérification
    const base = validateDraftClient({ guardianName, cpfRaw, childFirstName, childDob, childSex });
    // Preuves minimales: ID + doc de lien + photo redacted
    const proofsOk = hasIdDoc && idDocPath && hasLinkDoc && linkDocPath && photoPath;
    const addrOk = lastRuaNumero.trim() && lastCidade.trim() && isValidUF(lastUF);
    const tOk = lastSeenDate; // time optionnel mais mieux
    return base.ok && proofsOk && addrOk && consent && Boolean(tOk);
  }, [
    guardianName, cpfRaw, childFirstName, childDob, childSex,
    hasIdDoc, idDocPath, hasLinkDoc, linkDocPath, photoPath,
    lastRuaNumero, lastCidade, lastUF, lastSeenDate, consent
  ]);

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------
  const onDiscard = async () => {
    try {
      setBusy(true);
      const ref = doc(db, 'missingCases', String(caseId));
      await deleteDoc(ref);
      setBusy(false);
      show('Rascunho descartado.');
      router.replace('/(tabs)/home');
    } catch (e) {
      setBusy(false);
      show('Falha ao descartar.');
      warn('discard:', e?.message || e);
    }
  };

  const onMockUpload = async (kind) => {
    try {
      setBusy(true);
      const r = await mockUpload(kind);
      if (r.ok) {
        if (kind === 'id') {
          setHasIdDoc(true);
          setIdDocPath(r.path);
          show('Documento de identidade anexado.');
        } else if (kind === 'link') {
          setHasLinkDoc(true);
          setLinkDocPath(r.path);
          show('Documento de vínculo anexado.');
        } else if (kind === 'photo') {
          setPhotoPath(r.path);
          show('Foto anexada.');
        }
      } else {
        show('Falha no upload.');
      }
    } catch (e) {
      show('Erro no upload.');
      warn('upload:', e?.message || e);
    } finally {
      setBusy(false);
    }
  };

  const onSaveDraft = async () => {
    try {
      if (!canSaveDraft) {
        show('Preencha pelo menos um campo para salvar.');
        return;
      }
      setBusy(true);
      const ref = doc(db, 'missingCases', String(caseId));
      const lastSeenAtISO = lastSeenDate ? `${lastSeenDate}T${lastSeenTime || '00:00'}:00.000Z` : null;

      const payload = {
        // ⚠️ pas de CPF en clair ici
        guardian: {
          fullName: guardianName.trim() || '',
          // côté serveur, on stockera uniquement cpfHash
        },
        child: {
          firstName: childFirstName.trim() || '',
          dob: childDob || '',
          sex: childSex || '',
          lastSeenAt: lastSeenAtISO,
          lastKnownAddress: {
            ruaNumero: lastRuaNumero || '',
            cidade: lastCidade || '',
            uf: String(lastUF || '').toUpperCase(),
          },
        },
        media: {
          photoRedacted: photoPath || '',
          // originals → GCS privé (jamais ici)
        },
        updatedAt: Timestamp.now(),
      };

      await updateDoc(ref, payload);
      show('Rascunho salvo.');
    } catch (e) {
      warn('save draft:', e?.message || e);
      show('Não foi possível salvar o rascunho.');
    } finally {
      setBusy(false);
    }
  };

  const onRequestVerification = async () => {
    // Client-side check
    const v = validateDraftClient({ guardianName, cpfRaw, childFirstName, childDob, childSex });
    if (!v.ok) {
      show(v.msg);
      return;
    }
    if (!canRequestVerification) {
      show('Complete os documentos e aceite o aviso.');
      return;
    }

    try {
      setBusy(true);

      // 1) Sauvegarde draft (non sensible)
      await onSaveDraft();

      // 2) Appel CF verifyGuardian (CPF en mémoire uniquement)
      //    Remplace l’URL par ton callable HTTPS; fallback → flag "requestedVerification"
      try {
        const resp = await fetch(
          'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/verifyGuardian',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              caseId: String(caseId),
              payload: {
                guardian: {
                  fullName: guardianName.trim(),
                  cpfRaw: onlyDigits(cpfRaw),
                  docProofs: ['ID_FRONT', 'LINK_CHILD_DOC'],
                },
                child: {
                  firstName: childFirstName.trim(),
                  dob: childDob,
                  sex: childSex,
                  lastSeenAt: `${lastSeenDate}T${lastSeenTime || '00:00'}:00.000Z`,
                  lastKnownAddress: {
                    ruaNumero: lastRuaNumero,
                    cidade: lastCidade,
                    uf: String(lastUF || '').toUpperCase(),
                  },
                },
                media: { photoRedacted: photoPath },
              },
            }),
          }
        );

        if (!resp.ok) {throw new Error(`verifyGuardian http ${resp.status}`);}

        const json = await resp.json().catch(() => null);
        log('verifyGuardian OK', json);
        show('Enviado para verificação.');
      } catch {
        warn('verifyGuardian CF not available, fallback flag.');
        const ref = doc(db, 'missingCases', String(caseId));
        await updateDoc(ref, {
          requestedVerification: true,
          requestedAt: Timestamp.now(),
        });
        show('Solicitação registrada. Verificação pendente.');
      }

      // 3) Navigation (optionnel) vers écran de acompanhamento do caso
      setTimeout(() => {
        router.replace({ pathname: '/(tabs)/home' });
      }, 600);
    } catch (e) {
      warn('request verification:', e?.message || e);
      show('Falha ao enviar para verificação.');
    } finally {
      setBusy(false);
    }
  };

  // --------------------------------------------------------------------------
  // UI
  // --------------------------------------------------------------------------
  if (loading) {
    return (
      <View style={[styles.page, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#22C55E" />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      {Toast}

      {/* Top bar */}
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft color="#fff" size={22} />
          <Text style={styles.backTxt}>Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Criança desaparecida</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Alerte / Aviso */}
        <View style={styles.alertCard}>
          <TriangleAlert color="#fff" size={22} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>Atenção — somente até 12 anos</Text>
            <Text style={styles.alertMsg}>
              Este fluxo é exclusivo para crianças de até <Text style={{ fontWeight: 'bold' }}>12 anos</Text>.
              Sua <Text style={{ fontWeight: 'bold' }}>boa fé</Text> e <Text style={{ fontWeight: 'bold' }}>responsabilidade</Text> são imprescindíveis.
              Em risco imediato, acione <Text style={{ fontWeight: 'bold' }}>190 (Polícia)</Text> ou <Text style={{ fontWeight: 'bold' }}>192 (Samu)</Text>.
            </Text>
          </View>
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
          onChangeText={setGuardianName}
        />

        <Text style={styles.label}>CPF (não será salvo em claro)</Text>
        <TextInput
          style={styles.input}
          placeholder="Somente números"
          placeholderTextColor="#9aa0a6"
          keyboardType="numeric"
          value={cpfRaw}
          onChangeText={(t) => setCpfRaw(onlyDigits(t))}
          maxLength={11}
        />

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btnGhost, hasIdDoc && styles.btnGhostOk]}
            onPress={() => onMockUpload('id')}
            disabled={busy}
          >
            <FileCheck2 color={hasIdDoc ? '#22C55E' : '#7dd3fc'} size={16} />
            <Text style={styles.btnGhostTxt}>
              {hasIdDoc ? 'Documento de identidade ✅' : 'Anexar doc. identidade'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnGhost, hasLinkDoc && styles.btnGhostOk]}
            onPress={() => onMockUpload('link')}
            disabled={busy}
          >
            <FileCheck2 color={hasLinkDoc ? '#22C55E' : '#7dd3fc'} size={16} />
            <Text style={styles.btnGhostTxt}>
              {hasLinkDoc ? 'Doc. vínculo ✅' : 'Anexar doc. de vínculo'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Criança */}
        <Text style={styles.sectionTitle}>
          <Baby color="#fde68a" size={18} style={{ marginRight: 6 }} />
          Dados da criança
        </Text>

        <Text style={styles.label}>Primeiro nome</Text>
        <TextInput
          style={styles.input}
          placeholder="Primeiro nome"
          placeholderTextColor="#9aa0a6"
          value={childFirstName}
          onChangeText={setChildFirstName}
        />

        <Text style={styles.label}>Data de nascimento (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex.: 2016-04-21"
          placeholderTextColor="#9aa0a6"
          value={childDob}
          onChangeText={setChildDob}
          maxLength={10}
        />

        <Text style={styles.label}>Sexo</Text>
        <View style={styles.row}>
          {['M', 'F', 'X'].map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, childSex === s && styles.chipActive]}
              onPress={() => setChildSex(s)}
            >
              <Text style={[styles.chipTxt, childSex === s && styles.chipTxtActive]}>
                {s === 'M' ? 'Menino' : s === 'F' ? 'Menina' : 'Outro'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>
          <Calendar color="#93c5fd" size={18} style={{ marginRight: 6 }} />
          Última vez visto(a)
        </Text>

        <Text style={styles.label}>Data (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex.: 2025-10-10"
          placeholderTextColor="#9aa0a6"
          value={lastSeenDate}
          onChangeText={setLastSeenDate}
          maxLength={10}
        />

        <Text style={styles.label}>Hora (HH:mm) — opcional</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex.: 14:30"
          placeholderTextColor="#9aa0a6"
          value={lastSeenTime}
          onChangeText={setLastSeenTime}
          maxLength={5}
        />

        <Text style={styles.label}>
          <MapPin color="#93c5fd" size={16} /> Rua e número
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Rua e número"
          placeholderTextColor="#9aa0a6"
          value={lastRuaNumero}
          onChangeText={setLastRuaNumero}
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Cidade</Text>
            <TextInput
              style={styles.input}
              placeholder="Cidade"
              placeholderTextColor="#9aa0a6"
              value={lastCidade}
              onChangeText={setLastCidade}
            />
          </View>
          <View style={{ width: 90 }}>
            <Text style={styles.label}>UF</Text>
            <TextInput
              style={styles.input}
              placeholder="CE"
              placeholderTextColor="#9aa0a6"
              value={lastUF}
              onChangeText={(v) => setLastUF(String(v).toUpperCase())}
              maxLength={2}
              autoCapitalize="characters"
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          <ImageIcon color="#fca5a5" size={18} style={{ marginRight: 6 }} />
          Foto recente (redigida)
        </Text>

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btnGhost, photoPath && styles.btnGhostOk]}
            onPress={() => onMockUpload('photo')}
            disabled={busy}
          >
            <ImageIcon color={photoPath ? '#22C55E' : '#fca5a5'} size={16} />
            <Text style={styles.btnGhostTxt}>
              {photoPath ? 'Foto anexada ✅' : 'Anexar foto'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Consentement */}
        <TouchableOpacity
          style={[styles.consentBox, consent && styles.consentBoxOn]}
          onPress={() => setConsent((v) => !v)}
        >
          <User color={consent ? '#22C55E' : '#9aa0a6'} size={16} />
          <Text style={styles.consentTxt}>
            Confirmo que sou o responsável legal ou autorizado, agindo de boa fé.
          </Text>
        </TouchableOpacity>

        {/* Actions */}
        <View style={{ height: 10 }} />

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: canRequestVerification ? '#22C55E' : '#475569' }]}
          onPress={onRequestVerification}
          disabled={!canRequestVerification || busy}
        >
          <Text style={styles.primaryTxt}>
            {busy ? 'Enviando...' : 'Enviar para verificação'}
          </Text>
        </TouchableOpacity>

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.secondaryBtn, !canSaveDraft && { opacity: 0.6 }]}
            onPress={onSaveDraft}
            disabled={!canSaveDraft || busy}
          >
            <Text style={styles.secondaryTxt}>Salvar rascunho</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dangerBtn} onPress={onDiscard} disabled={busy}>
            <Text style={styles.dangerTxt}>Descartar rascunho</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Styles (dark, arrondis doux, cohérent avec Report.jsx)
// ============================================================================
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

  scroll: { padding: 18, paddingBottom: 36 },

  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#FF3B30',
    padding: 14,
    borderRadius: 14,
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  alertTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  alertMsg: { color: '#fff', fontSize: 13.5, opacity: 0.95 },

  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: { color: '#cfd3db', marginBottom: 4, marginTop: 10, fontSize: 13.5 },
  input: {
    borderWidth: 1,
    borderColor: '#353840',
    backgroundColor: '#222',
    color: '#fff',
    padding: 11,
    borderRadius: 8,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },

  chip: {
    backgroundColor: '#23262F',
    borderWidth: 2,
    borderColor: '#23262F',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipTxt: { color: '#9aa0a6', fontWeight: '600' },
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

  primaryBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryTxt: { color: '#000', fontWeight: '800', fontSize: 16 },

  secondaryBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0ea5e9',
  },
  secondaryTxt: { color: '#00131a', fontWeight: '800' },

  dangerBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#b91c1c',
  },
  dangerTxt: { color: '#fff', fontWeight: '800' },

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
