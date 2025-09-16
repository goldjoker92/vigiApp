// Détail d'une alerte publique
// - Texte pt-BR, commentaires FR
// - Écrit un "receipt" (preuve de réception/ouverture) dans Firestore:
//     alerts/{alertId}/receipts/{uid} = { ts, deviceId, platform }
// - Affiche carte + cercle radius, statut "Em vigor / Expirada"
// - Masque visuellement passé 24h (l'alerte reste en base pour audit)

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert as RNAlert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, Circle } from 'react-native-maps';
import { db, auth } from '@/firebase';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { Bell, MapPin, ArrowLeft, Clock } from 'lucide-react-native';
import { ONE_DAY_MS, timeLeft, timeAgo } from './parts/usePublicAlerts24h';

function isExpired(ts) {
  if (!ts) {
    return false;
  }
  const created = ts.toMillis?.() ?? 0;
  return Date.now() - created >= ONE_DAY_MS;
}

export default function PublicAlertDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // alertId
  const [alertDoc, setAlertDoc] = useState(null);

  // --- Accusé de réception (preuve que la notif a "abouti" côté client)
  async function writeReceipt(alertId) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid || !alertId) {
        return;
      }
      await setDoc(
        doc(db, `alerts/${alertId}/receipts/${uid}`),
        {
          ts: serverTimestamp(),
          deviceId: Device.modelName ?? 'unknown',
          platform: Device.osName ?? 'unknown',
          opened_from_notification: true, // utile pour analytics
        },
        { merge: true }
      );
      console.log('[PublicAlertDetail] receipt saved for', alertId, uid);
    } catch (e) {
      console.log('[PublicAlertDetail] receipt error:', e?.message || e);
    }
  }

  // --- Abonnement au document
  useEffect(() => {
    if (!id) {
      return;
    }
    console.log('[PublicAlertDetail] subscribe alert', id);
    const unsub = onSnapshot(doc(db, 'publicAlerts', String(id)), (snap) => {
      if (!snap.exists()) {
        RNAlert.alert('Alerta', 'Este alerta não está mais disponível.');
        router.back();
        return;
      }
      const data = { id: snap.id, ...snap.data() };
      setAlertDoc(data);

      // Accusé de réception (1re ouverture)
      writeReceipt(snap.id);
    });
    return () => unsub();
  }, [id]);

  const expired = useMemo(() => isExpired(alertDoc?.createdAt), [alertDoc]);

  if (!alertDoc) {
    return (
      <View style={{ flex: 1, backgroundColor: '#181A20', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#9aa3b2' }}>Carregando…</Text>
      </View>
    );
  }

  const color = alertDoc.color || '#FFA500';
  const radius_m = alertDoc.radius_m || alertDoc.radius || 1000;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#181A20' }} contentContainerStyle={{ padding: 16 }}>
      {/* Header simple */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ padding: 8, borderRadius: 10, backgroundColor: '#23262F', marginRight: 8 }}
        >
          <ArrowLeft size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Alerta público</Text>
      </View>

      {/* Bandeau statut */}
      {expired ? (
        <View style={{ backgroundColor: '#39202a', borderColor: '#5e2b38', borderWidth: 1, padding: 12, borderRadius: 12, marginBottom: 12 }}>
          <Text style={{ color: '#ff8fa3', fontWeight: '700' }}>Este alerta expirou.</Text>
          <Text style={{ color: '#ffbdc9', marginTop: 4, fontSize: 12 }}>
            Alertas permanecem visíveis por 24h nesta página, mas seguem armazenados para auditoria.
          </Text>
        </View>
      ) : (
        <View style={{ backgroundColor: '#1e2b22', borderColor: '#2f4636', borderWidth: 1, padding: 12, borderRadius: 12, marginBottom: 12 }}>
          <Text style={{ color: '#9ee6b8', fontWeight: '700' }}>Em vigor</Text>
          <Text style={{ color: '#bfe9cd', marginTop: 4, fontSize: 12 }}>
            {timeLeft(alertDoc.createdAt)}
          </Text>
        </View>
      )}

      {/* Carte + cercle radius */}
      {alertDoc?.location?.latitude && (
        <MapView
          style={{ height: 220, borderRadius: 14, marginBottom: 12 }}
          initialRegion={{
            latitude: alertDoc.location.latitude,
            longitude: alertDoc.location.longitude,
            latitudeDelta: 0.01, longitudeDelta: 0.01
          }}
          onMapReady={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        >
          <Marker coordinate={{ latitude: alertDoc.location.latitude, longitude: alertDoc.location.longitude }} />
          <Circle
            center={{ latitude: alertDoc.location.latitude, longitude: alertDoc.location.longitude }}
            radius={radius_m}
            strokeWidth={1}
          />
        </MapView>
      )}

      {/* Carte info */}
      <View style={{ backgroundColor: '#1F222A', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#2B2F3A', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Bell size={18} color={color} />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 8 }}>
            {alertDoc.categoria || 'Alerta'}
          </Text>
        </View>

        {alertDoc.apelido ? (
          <Text style={{ color: '#9aa3b2', marginBottom: 6 }}>
            Enviado por <Text style={{ color: '#cfd3dc', fontWeight: '700' }}>{alertDoc.apelido}</Text>
          </Text>
        ) : null}

        {!!alertDoc.descricao && (
          <Text style={{ color: '#cfd3dc', marginBottom: 10 }}>
            {alertDoc.descricao}
          </Text>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <MapPin size={14} color="#9aa3b2" />
          <Text style={{ color: '#9aa3b2', marginLeft: 6 }}>
            {alertDoc.ruaNumero ? `${alertDoc.ruaNumero} — ${alertDoc.cidade}/${alertDoc.estado}` : (alertDoc.cidade || '')}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ color: '#8fa0b3', fontSize: 12 }}>{timeAgo(alertDoc.createdAt)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Clock size={14} color="#8fa0b3" />
            <Text style={{ color: '#8fa0b3', fontSize: 12, marginLeft: 6 }}>
              {timeLeft(alertDoc.createdAt)}
            </Text>
          </View>
        </View>
      </View>

      {/* Infos complémentaires */}
      <View style={{ backgroundColor: '#1F222A', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#2B2F3A', marginBottom: 14 }}>
        <Text style={{ color: '#cfd3dc' }}>
          Gravidade: <Text style={{ color: '#fff', fontWeight: '700' }}>{alertDoc.gravidade || 'média'}</Text>
        </Text>
        {!!alertDoc.cep && (
          <Text style={{ color: '#cfd3dc', marginTop: 4 }}>
            CEP: <Text style={{ color: '#fff' }}>{alertDoc.cep}</Text>
          </Text>
        )}
        {!!alertDoc.location?.accuracy && (
          <Text style={{ color: '#cfd3dc', marginTop: 4 }}>
            Precisão GPS: <Text style={{ color: '#fff' }}>{Math.round(alertDoc.location.accuracy)} m</Text>
          </Text>
        )}
      </View>

      {/* CTA sécurité simple */}
      {!expired && (
        <TouchableOpacity
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            RNAlert.alert('Atenção', 'Se for uma emergência, ligue 190 (Polícia) ou 192 (Samu).');
          }}
          style={{ backgroundColor: color, borderRadius: 14, padding: 16, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Preciso de ajuda</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
