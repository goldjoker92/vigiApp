import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useUserStore } from '../../store/users';
import { useGrupoDetails } from '../../hooks/useGrupoDetails';
import { useGruposPorCep } from '../../hooks/useGruposPorCep';
import { Handshake, PlusCircle, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import WeatherCard from '../components/WeatherCard';
import { useUserGroupEffect } from '../../hooks/useUserGroupEffect';

// === SKELETON SHIMMER CLIGNOTANT ===
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

// === HOME SCREEN ===
export default function HomeScreen() {
  const { groupId, user } = useUserStore();
  const { grupo, loading: loadingGrupo } = useGrupoDetails(groupId);
  const { grupos, loading: loadingGrupos } = useGruposPorCep(user?.cep);
  const router = useRouter();

  useUserGroupEffect();

  const autresGroupes = (grupos || []).filter(
    g => g.id !== groupId && (g.members?.length || 0) < (g.maxMembers || 30)
  );

  // Greeting dynamique selon l’heure brésilienne
  const horaBrasil = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Fortaleza' });
  const hora = parseInt(horaBrasil, 10);
  let greeting = 'Bom dia';
  if (hora >= 12 && hora < 18) greeting = 'Boa tarde';
  else if (hora >= 18 || hora < 6) greeting = 'Boa noite';

  const nome = user?.apelido || user?.username || 'Cidadão';

  if (!user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00C859" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.greeting}>
          {greeting}, <Text style={styles.username}>{nome}</Text> 👋
        </Text>
        <WeatherCard cep={user?.cep} />

        {/* Ton groupe : skeleton animé puis vraie card */}
        {loadingGrupo ? (
          <GroupSkeleton />
        ) : groupId && grupo ? (
          <TouchableOpacity style={styles.groupCard} onPress={() => router.push('/(tabs)/vizinhos')}>
            <Text style={styles.groupTitle}>Seu grupo de vizinhança</Text>
            <Text style={styles.groupName}>{grupo.name}</Text>
            <Text style={styles.groupInfo}>
              Admin: <Text style={{ color: '#F7B801' }}>{grupo.adminApelido || "Desconhecido"}</Text>
            </Text>
            <Text style={styles.groupInfo}>
              CEP: {grupo.cep} | {grupo.members.length} / {grupo.maxMembers || 30} vizinhos
            </Text>
          </TouchableOpacity>
        ) : (
          !loadingGrupo && (
            <View style={styles.infoBox}>
              <Text style={{ color: '#bbb', fontSize: 16 }}>Aucun groupe trouvé</Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => router.push("/group-create")}
              >
                <PlusCircle color="#fff" size={22} />
                <Text style={styles.createBtnText}>Créer nouveau groupe</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* Section autres groupes */}
        <Text style={styles.sectionTitle}>Outros grupos disponíveis</Text>
        {loadingGrupos ? (
          <Text style={{ color: '#bbb', fontSize: 16, textAlign: 'center' }}>Carregando...</Text>
        ) : autresGroupes.length === 0 ? (
          <View style={styles.infoBox}>
            <Text style={{ color: '#bbb', fontSize: 15, textAlign: 'center' }}>
              Não há outros grupos do seu CEP ainda.
            </Text>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => router.push("/group-create")}
            >
              <PlusCircle color="#fff" size={22} />
              <Text style={styles.createBtnText}>Criar novo grupo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          autresGroupes.map(g => (
            <View key={g.id} style={styles.otherGroupCard}>
              <Text style={styles.otherGroupName}>{g.name}</Text>
              <Text style={styles.otherGroupInfo}>
                Admin: <Text style={{ color: '#F7B801' }}>{g.adminApelido || "?"}</Text> — {g.members.length} / {g.maxMembers || 30} vizinhos
              </Text>
              <TouchableOpacity
                style={styles.joinBtn}
                onPress={() => router.push({ pathname: '/group-join', params: { groupId: g.id } })}
              >
                <Handshake color="#fff" size={20} />
                <Text style={styles.joinBtnText}>Juntar-se</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Créer un groupe (toujours visible si aucun) */}
        {!groupId && (
          <TouchableOpacity
            style={[styles.createBtn, { marginTop: 26 }]}
            onPress={() => router.push("/group-create")}
          >
            <Users color="#fff" size={20} />
            <Text style={styles.createBtnText}>Criar grupo com vizinhos do seu CEP</Text>
          </TouchableOpacity>
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
  groupInfo: { color: '#eee', fontSize: 15, marginBottom: 2 },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 12, marginTop: 12 },
  otherGroupCard: { backgroundColor: '#23262F', borderRadius: 13, padding: 14, marginBottom: 10 },
  otherGroupName: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  otherGroupInfo: { color: '#bbb', fontSize: 14, marginBottom: 4 },
  joinBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00C859', padding: 9, borderRadius: 10, marginTop: 6, alignSelf: 'flex-start' },
  joinBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  createBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4F8DFF', padding: 11, borderRadius: 12, marginTop: 18, alignSelf: 'center' },
  createBtnText: { color: "#fff", fontWeight: "bold", marginLeft: 10, fontSize: 16 },
  infoBox: { marginTop: 30, alignItems: 'center', padding: 18, backgroundColor: '#23262F', borderRadius: 14 },

  // SKELETON maison stylé
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
