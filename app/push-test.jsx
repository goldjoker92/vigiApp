// app/push-test.jsx
// -------------------------------------------------------------
// Écran DEV pour valider la chaîne end-to-end en solo
// - Obtenir le token Expo & envoyer un push test (Expo API)
// - Enregistrer le device dans Firestore avec CEP
// - Notifications locales (immédiate & 5s)
// - UI/UX VigiApp: clair, gros boutons, responsive
// -------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import '../firebase'; // ⚡ Assure l'init Firebase côté client
import { upsertDevice } from '../libs/registerDevice';
import {
  attachNotificationListeners,
  cancelAll,
  fireLocalNow,
  registerForPushNotificationsAsync,
  scheduleLocalIn,
  sendExpoTestPushAsync,
} from '../src/notifications';

export default function PushTestScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState(null);
  const [cep, setCep] = useState('62595-000'); // ⚙️ Mets ton CEP réel ici si tu veux auto-remplir
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    console.log('🟦 [PushTest] mount');
    const detach = attachNotificationListeners({
      onReceive: () => console.log('🟢 [PushTest] onReceive'),
      onResponse: () => console.log('🟡 [PushTest] onResponse'),
    });
    return () => {
      console.log('🟥 [PushTest] unmount');
      mounted.current = false;
      detach && detach();
    };
  }, []);

  const cardWidth = useMemo(() => Math.min(width - 24, 640), [width]);

  async function onRegister() {
    try {
      setLoading(true);
      const t = await registerForPushNotificationsAsync();
      if (mounted.current) {
        setToken(t);
      }
      Alert.alert('Token obtenu', 'Tu peux maintenant tester un push.');
    } catch (e) {
      console.error('register error', e);
      Alert.alert('Erreur', e?.message || 'Impossible d’obtenir le token');
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }

  async function onSendExpoTest() {
    if (!token) {
      Alert.alert('Manque le token', "Clique d'abord sur 'Obtenir le token'.");
      return;
    }
    try {
      setSending(true);
      const res = await sendExpoTestPushAsync(token, 'Alerte test — VigiApp solo 🦄');
      console.log('ExpoPushAPI result:', res);
      Alert.alert('Push envoyé', 'Regarde la barre de notifications.');
    } catch (e) {
      console.error('send push error', e);
      Alert.alert('Erreur d’envoi', e?.message || 'Impossible d’envoyer le push');
    } finally {
      if (mounted.current) {
        setSending(false);
      }
    }
  }

  async function onSaveDevice() {
    if (!token) {
      Alert.alert('Token manquant', "Obtiens d'abord le token.");
      return;
    }
    if (!cep || typeof cep !== 'string' || cep.length < 5) {
      Alert.alert('CEP invalide', 'Renseigne un CEP valide.');
      return;
    }
    try {
      setSaving(true);
      const res = await upsertDevice({
        userId: 'DEV_SOLO', // remplace par ton userId si tu as l'auth
        expoPushToken: token,
        cep: cep.trim(),
        lat: null,
        lng: null, // optionnels pour la V1 CEP
        geohash: null,
        groups: [], // ex: ["grp_test"] si tu veux tester privé
      });
      if (res.ok) {
        Alert.alert('Device enregistré', `CEP=${cep} • token lié`);
      } else {
        Alert.alert('Erreur enregistrement', res.error || 'inconnue');
      }
    } catch (e) {
      console.error('save device error', e);
      Alert.alert('Erreur enregistrement', e?.message || 'inconnue');
    } finally {
      if (mounted.current) {
        setSaving(false);
      }
    }
  }

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { width: cardWidth }]}>
          <Text style={styles.title}>VigiApp — Test Push (solo)</Text>
          <Text style={styles.subtitle}>
            Valide FCM ⇄ Expo ⇄ ton device. Zéro UI publique, juste DEV.
          </Text>

          {/* 1) Token */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1) Autorisations & Token</Text>
            <Pressable
              style={[styles.btn, loading && styles.disabled]}
              onPress={onRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.btnText}>Obtenir le token</Text>
              )}
            </Pressable>

            <View style={styles.tokenBox}>
              <Text style={styles.tokenLabel}>Expo push token</Text>
              <Text selectable style={styles.tokenValue}>
                {token || '— token non obtenu —'}
              </Text>
            </View>

            <Pressable
              style={[styles.btn, sending && styles.disabled]}
              onPress={onSendExpoTest}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.btnText}>Envoyer un push test</Text>
              )}
            </Pressable>
            <Text style={styles.hint}>
              Si rien n’arrive: permissions notifs + batterie (exclusion) + réseau OK.
            </Text>
          </View>

          {/* 2) CEP + Enregistrement device */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2) Enregistrer ce device (CEP)</Text>
            <View style={styles.row}>
              <TextInput
                value={cep}
                onChangeText={setCep}
                placeholder="CEP ex: 62595-000"
                placeholderTextColor="#88909C"
                style={styles.input}
              />
              <Pressable
                style={[styles.btn, styles.btnInline, saving && styles.disabled]}
                onPress={onSaveDevice}
                disabled={saving}
              >
                {saving ? <ActivityIndicator /> : <Text style={styles.btnText}>Enregistrer</Text>}
              </Pressable>
            </View>
            <Text style={styles.hint}>
              Vérifie dans Firestore → devices que le doc existe (cep + token).
            </Text>
          </View>

          {/* 3) Notifs locales (pour visuel rapide) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3) Notifications locales</Text>
            <View style={styles.row}>
              <Pressable style={styles.btnGhost} onPress={fireLocalNow}>
                <Text style={styles.btnGhostText}>Locale immédiate</Text>
              </Pressable>
              <Pressable style={styles.btnGhost} onPress={() => scheduleLocalIn(5)}>
                <Text style={styles.btnGhostText}>Programmer 5s</Text>
              </Pressable>
            </View>
            <Pressable style={styles.btnDanger} onPress={cancelAll}>
              <Text style={styles.btnText}>Annuler toutes</Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>
            Une fois validé, appelle la Function “public = CEP” depuis la console Firebase.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const palette = {
  bg: '#0F1115',
  card: '#181A20',
  text: '#E6E8EC',
  sub: '#A0A6B0',
  primary: '#4E9EFF',
  primaryText: '#0A0A0A',
  ghostBorder: '#2E3440',
  danger: '#EF4444',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scroll: { alignItems: 'center', paddingHorizontal: 12 },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    marginVertical: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  title: { fontSize: 22, fontWeight: '700', color: palette.text },
  subtitle: { fontSize: 14, color: palette.sub, marginTop: -2 },
  section: { marginTop: 12, gap: 10 },
  sectionTitle: { color: palette.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  tokenBox: {
    backgroundColor: '#11141A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.ghostBorder,
    gap: 8,
  },
  tokenLabel: { color: palette.sub, fontSize: 12 },
  tokenValue: { color: palette.text, fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#11141A',
    color: palette.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.ghostBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btn: {
    backgroundColor: palette.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnInline: { paddingHorizontal: 16 },
  btnText: { color: palette.primaryText, fontWeight: '700', fontSize: 16 },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.ghostBorder,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnGhostText: { color: palette.text, fontWeight: '600' },
  btnDanger: {
    backgroundColor: palette.danger,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  disabled: { opacity: 0.5 },
  hint: { color: palette.sub, fontSize: 12, marginTop: 6 },
  footer: { color: palette.sub, fontSize: 12, marginTop: 8, textAlign: 'center' },
});
