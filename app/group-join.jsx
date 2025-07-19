// app/group-join.jsx
import { useRouter, useSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Vibration, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { joinGroup } from '../services/groupService';
import { useUserStore } from '../store/users';

export default function GroupJoinScreen() {
  const router = useRouter();
  const { groupId } = useSearchParams();
  const { user, setGroupId } = useUserStore();

  useEffect(() => {
    async function join() {
      if (!user || !groupId) return;
      try {
        await joinGroup({ groupId, userId: user.uid, apelido: user.apelido });
        setGroupId(groupId);
        Toast.show({
          type: 'success',
          text1: "Você entrou no grupo!",
        });
        Vibration.vibrate(60);
        setTimeout(() => {
          router.replace('/(tabs)/vizinhos');
        }, 900); // Laisse le toast s’afficher avant de route
      } catch (e) {
        Toast.show({
          type: 'error',
          text1: "Erro ao juntar-se",
          text2: e.message,
        });
        Vibration.vibrate([0, 80, 40, 80]);
        setTimeout(() => {
          router.replace('/(tabs)/home');
        }, 1000);
      }
    }
    join();
  }, [user, groupId, router, setGroupId]);

  return (
    <View style={{ flex: 1, backgroundColor: "#181A20", alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color="#00C859" size="large" />
    </View>
  );
}
