import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Handshake } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useUserStore } from '../../store/users';
import { joinGroup } from '../../services/groupService';

export default function AvailableGroupsCarousel({ groups, loading }) {
  const { user, setGroupId } = useUserStore();
  const [joining, setJoining] = useState(null);

  useEffect(() => {
    console.log('[AvailableGroupsCarousel] Props groups:', groups);
  }, [groups]);

  const handleJoin = async (group) => {
    if (joining) {
      return;
    }
    setJoining(group.id);
    try {
      await joinGroup({ groupId: group.id, user });
      setGroupId(group.id);
      Toast.show({ type: 'success', text1: `Entré dans le groupe "${group.name}"` });
      console.log('[AvailableGroupsCarousel] ✅ User ajouté au groupe', group.id);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erreur:', text2: err.message });
      console.error('[AvailableGroupsCarousel] ❌ Erreur:', err);
    }
    setJoining(null);
  };

  if (loading) {
    return (
      <View style={{ height: 165, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00C859" />
      </View>
    );
  }

  if (!groups?.length) {
    return (
      <View style={styles.infoBox}>
        <Text style={{ color: '#bbb', fontSize: 15, textAlign: 'center' }}>
          Aucun groupe à rejoindre pour ce CEP.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 34 }}>
      <Text style={styles.sectionTitle}>Grupos disponíveis</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalScroll}
      >
        {groups.map((g) => (
          <View key={g.id} style={styles.card}>
            <Text style={styles.groupName}>{g.name}</Text>
            <Text style={styles.creator}>
              Criador:{' '}
              <Text style={{ color: '#FFD600', fontWeight: 'bold' }}>
                {g.creatorNome || g.creatorApelido || '?'}
              </Text>
            </Text>
            <Text style={styles.members}>
              {g.members?.length || 0} / {g.maxMembers || 30} vizinhos
            </Text>
            <TouchableOpacity
              style={styles.joinBtn}
              disabled={joining === g.id}
              onPress={() => handleJoin(g)}
            >
              <Handshake color="#fff" size={19} />
              <Text style={styles.joinBtnText}>
                {joining === g.id ? 'Entrando...' : 'Entrar no grupo'}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: '#fff', fontWeight: 'bold', fontSize: 18, marginBottom: 9, marginLeft: 8 },
  horizontalScroll: { flexDirection: 'row', paddingLeft: 2, paddingRight: 10 },
  card: {
    backgroundColor: '#23262F',
    borderRadius: 14,
    padding: 16,
    width: 215,
    marginRight: 14,
    marginLeft: 2,
    shadowColor: '#00C859',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  groupName: { color: '#fff', fontWeight: 'bold', fontSize: 18, marginBottom: 6 },
  creator: { color: '#bbb', fontSize: 15, marginBottom: 5 },
  members: { color: '#facc15', fontWeight: 'bold', fontSize: 15, marginBottom: 10 },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00C859',
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
    minWidth: 105,
    justifyContent: 'center',
  },
  joinBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 8, fontSize: 15 },
  infoBox: {
    backgroundColor: '#23262F',
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 7,
    marginBottom: 24,
  },
});
