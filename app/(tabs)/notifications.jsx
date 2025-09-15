import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { db } from '../../firebase';
import { useUserStore } from '../../store/users';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useAuthGuard } from '../../hooks/useAuthGuard';

export default function NotificationsScreen() {
  const user = useAuthGuard();
  const { groupId, setLastSeenAlert } = useUserStore();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetchAlerts() {
      setLoading(true);
      const q = query(
        collection(db, 'alerts'),
        where('groupId', '==', groupId),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      setAlerts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }
    fetchAlerts();
    setLastSeenAlert(Date.now());
  }, [user, groupId, setLastSeenAlert]);

  return (
    <View style={{ flex: 1, backgroundColor: '#1B2232', padding: 20 }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 12 }}>
        Notificações do grupo
      </Text>
      {loading ? (
        <ActivityIndicator color="#22C55E" size="large" />
      ) : (
        <ScrollView>
          {alerts.length === 0 && <Text style={{ color: '#aaa' }}>Nenhum alerta ainda.</Text>}
          {alerts.map((alert) => (
            <View
              key={alert.id}
              style={{
                backgroundColor: '#22293a',
                borderRadius: 14,
                marginBottom: 14,
                padding: 16,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>{alert.title}</Text>
              <Text style={{ color: '#aaa' }}>{alert.description}</Text>
              <Text style={{ color: '#22C55E', marginTop: 5 }}>
                {alert.createdAt?.toDate?.().toLocaleString?.() || ''}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
