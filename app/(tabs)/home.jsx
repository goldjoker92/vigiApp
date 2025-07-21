import React, { useEffect, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useUserStore } from '../../store/users';
import { useGrupoDetails } from '../../hooks/useGrupoDetails';
import { useGruposPorCep } from '../../hooks/useGruposPorCep';
import { Handshake, PlusCircle } from 'lucide-react-native';
import { FontAwesome, Feather, MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import WeatherCard from '../components/WeatherCard';
import { useUserGroupEffect } from '../../hooks/useUserGroupEffect';
import Toast from 'react-native-toast-message';

function AnimatedSkeletonLine({ style, delay = 0 }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [delay, opacity]);
  return <Animated.View style={[style, { opacity }]} />;
}

function GroupSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <AnimatedSkeletonLine style={styles.skeletonLineLarge} delay={0} />
      <AnimatedSkeletonLine style={styles.skeletonLineShort} delay={150} />
      <AnimatedSkeletonLine style={styles.skeletonLine} delay={300} />
      <AnimatedSkeletonLine style={styles.skeletonLineThin} delay={450} />
    </View>
  );
}

function getCriador(grupo, user) {
  if (!grupo) return "Desconhecido";
  if (grupo.creatorUserId && grupo.creatorNome) {
    return grupo.creatorUserId === user.uid
      ? user.apelido || user.username || "Você"
      : grupo.creatorNome;
  }
  if (grupo.creatorNome) return grupo.creatorNome;
  if (Array.isArray(grupo.members) && grupo.members[0]?.apelido)
    return grupo.members[0].apelido;
  return "Desconhecido";
}

export default function HomeScreen() {
  const { groupId, user, isGroupLoading } = useUserStore();
  const { grupo, loading: loadingGrupo } = useGrupoDetails(groupId);
  const { grupos, loading: loadingGrupos } = useGruposPorCep(user?.cep);
  const router = useRouter();
  useUserGroupEffect();
  const { quitGroup } = useLocalSearchParams();

  useEffect(() => {
    if (quitGroup) {
      Toast.show({
        type: 'success',
        text1: `Você saiu do grupo ${quitGroup}`,
        duration: 4000,
        props: { duration: 4000 },
      });
    }
  }, [quitGroup]);

  const outrosGrupos = (grupos || []).filter(
    g => g.id !== groupId && (g.members?.length || 0) < (g.maxMembers || 30)
  );

  const horaBrasil = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit', hour12: false, timeZone: 'America/Fortaleza'
  });
  const hora = parseInt(horaBrasil, 10);
  let saudacao = 'Bom dia';
  if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
  else if (hora >= 18 || hora < 6) saudacao = 'Boa noite';

  const nome = user?.apelido || user?.username || 'Cidadão';

  if (!user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00C859" />
      </View>
    );
  }

  // 👉 Ici, c'est la clé UX :
  if (isGroupLoading) {
    return <GroupSkeleton />;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.greeting}>
          {saudacao}, <Text style={styles.username}>{nome}</Text> 👋
        </Text>
        <WeatherCard cep={user?.cep} />

        {/* --- SI PAS DE GROUPE --- */}
        {!groupId && !loadingGrupo ? (
          <View style={styles.infoBox}>
            <Text style={{ color: '#bbb', fontSize: 16, marginBottom: 12, textAlign: "center" }}>
              Nenhum grupo encontrado
            </Text>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => router.push("/group-create")}
            >
              <PlusCircle color="#FFD600" size={22} style={{ marginRight: -15 }} />
              <Text style={styles.createBtnText}>Criar grupo com vizinhos do seu CEP</Text>
            </TouchableOpacity>
          </View>
        ) : groupId && grupo ? (
          <TouchableOpacity
            style={styles.groupCard}
            onPress={() => router.push('/(tabs)/vizinhos')}
          >
            <Text style={styles.groupTitle}>Seu grupo de vizinhança</Text>
            <Text style={styles.groupName}>{grupo.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <MaterialIcons name="person-pin" size={18} color="#00C859" />
              <Text style={{ color: '#eee', fontSize: 15, marginLeft: 6 }}>
                Criador : {getCriador(grupo, user)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Feather name="map-pin" size={16} color="#60a5fa" />
              <Text style={{ color: '#eee', fontSize: 14, marginLeft: 4 }}>
                {grupo.cep}
              </Text>
              <Text style={{ marginHorizontal: 8, color: '#666' }}>|</Text>
              <FontAwesome name="users" size={16} color="#facc15" />
              <Text style={{ color: '#eee', fontSize: 14, marginLeft: 4 }}>
                {grupo.members?.length || 0} / {grupo.maxMembers || 30} vizinhos
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Liste autres groupes */}
        <Text style={styles.sectionTitle}>Outros grupos disponíveis</Text>
        {loadingGrupos ? (
          <Text style={{ color: '#bbb', fontSize: 16, textAlign: 'center' }}>Carregando...</Text>
        ) : outrosGrupos.length === 0 ? (
          <View style={styles.infoBox}>
            <Text style={{ color: '#bbb', fontSize: 15, textAlign: 'center' }}>
              Ainda não há outros grupos no seu CEP.
            </Text>
          </View>
        ) : (
          outrosGrupos.map(g => (
            <View key={g.id} style={styles.otherGroupCard}>
              <Text style={styles.otherGroupName}>{g.name}</Text>
              <Text style={styles.otherGroupInfo}>
                Criador: <Text style={{ color: g.creatorUserId === user.uid ? '#00C859' : '#F7B801' }}>{getCriador(g, user)}</Text> — {g.members?.length || 0} / {g.maxMembers || 30} vizinhos
              </Text>
              <TouchableOpacity
                style={styles.joinBtn}
                onPress={() => router.push({ pathname: '/group-join', params: { groupId: g.id } })}
              >
                <Handshake color="#fff" size={20} />
                <Text style={styles.joinBtnText}>Entrar no grupo</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#181A20" },
  container: { backgroundColor: '#181A20', padding: 18, paddingBottom: 120 },
  greeting: { color: '#fff', fontSize: 27, fontWeight: '700', marginBottom: 18, marginTop: 5, alignSelf: 'flex-start' },
  username: { color: '#00C859', fontWeight: '900' },
  groupCard: { backgroundColor: '#202228', borderRadius: 15, padding: 18, marginBottom: 20, alignItems: 'flex-start', shadowColor: '#00C859', shadowOpacity: 0.09, shadowRadius: 5 },
  groupTitle: { color: '#6cffe5', fontWeight: 'bold', fontSize: 17, marginBottom: 4 },
  groupName: { color: '#00C859', fontWeight: '900', fontSize: 21, marginBottom: 3 },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 12, marginTop: 12 },
  otherGroupCard: { backgroundColor: '#23262F', borderRadius: 13, padding: 14, marginBottom: 10 },
  otherGroupName: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  otherGroupInfo: { color: '#bbb', fontSize: 14, marginBottom: 4 },
  joinBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00C859', padding: 9, borderRadius: 10, marginTop: 6, alignSelf: 'flex-start' },
  joinBtnText: { color: "#fff", fontWeight: "bold", marginLeft: 8 },
   createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#23262F',
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 6,
    minWidth: 190,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#00C859',
    shadowColor: '#00C859',
    shadowOpacity: 0.07,
    shadowRadius: 5,
  },
  createBtnText: {
    color: "#00C859", // VERT habituel
    fontWeight: "bold",
    marginLeft: 10,
    fontSize: 16,
    textAlign: 'center',
    flex: 1,
  },
  infoBox: { marginTop: 30, alignItems: 'center', padding: 18, backgroundColor: '#23262F', borderRadius: 14 },
  skeletonCard: {
    backgroundColor: "#23262F",
    borderRadius: 16,
    padding: 20,
    marginBottom: 22,
    marginTop: 14,
    shadowColor: "#00C859",
    shadowOpacity: 0.07,
    shadowRadius: 7,
    minHeight: 130,
    justifyContent: "center",
  },
  skeletonLineLarge: {
    backgroundColor: "#30323b",
    height: 22,
    borderRadius: 9,
    marginBottom: 13,
    width: "80%",
    alignSelf: "flex-start",
  },
  skeletonLineShort: {
    backgroundColor: "#363946",
    height: 16,
    borderRadius: 8,
    marginBottom: 13,
    width: "45%",
    alignSelf: "flex-start",
  },
  skeletonLine: {
    backgroundColor: "#30323b",
    height: 15,
    borderRadius: 7,
    marginBottom: 11,
    width: "65%",
    alignSelf: "flex-start",
  },
  skeletonLineThin: {
    backgroundColor: "#363946",
    height: 13,
    borderRadius: 7,
    width: "35%",
    alignSelf: "flex-start",
  },
});
