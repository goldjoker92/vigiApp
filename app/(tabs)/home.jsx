// app/(tabs)/home.jsx
// -------------------------------------------------------------
// HomeScreen
// - Garde tout ce que tu avais (météo, groupes, etc.)
// - Ajoute l'aperçu "Últimos alertas (24h)" (PublicAlertsPreview)
// - Si on vient d'une notification (fromNotif=1&alertId=...):
//     • Affiche un bandeau InlineAlertHighlight (CTA "Ver detalhes")
//     • Scroll en douceur vers la section alertes (pas d'empilement de scroll)
// - Code commenté en FR, UI en pt-BR
// -------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';

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
import { PlusCircle } from 'lucide-react-native';
import { FontAwesome, Feather, MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, Link } from 'expo-router';
import WeatherCard from '../components/WeatherCard';
import { useUserGroupEffect } from '../../hooks/useUserGroupEffect';
import Toast from 'react-native-toast-message';
import AvailableGroupsCarousel from '../components/AvailableGroupsCarousel';

// ✅ Nouveautés
import PublicAlertsPreview from '../components/PublicAlertsPreview';
import InlineAlertHighlight from '../components/InlineAlertHighlight';

// ---- Skeleton animé (inchangé)
function AnimatedSkeletonLine({ style, delay = 0 }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, delay, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 600, useNativeDriver: true }),
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

// ---- Affichage du créateur (friendly)
function getCriador(grupo, user) {
  if (!grupo) {
    return 'Desconhecido';
  }
  if (grupo.creatorUserId && grupo.creatorNome) {
    return grupo.creatorUserId === user?.id || grupo.creatorUserId === user?.uid
      ? user?.apelido || user?.username || 'Você'
      : grupo.creatorNome;
  }
  if (grupo.creatorNome) {
    return grupo.creatorNome;
  }
  if (Array.isArray(grupo.members) && grupo.members[0]?.apelido) {
    return grupo.members[0].apelido;
  }
  return 'Desconhecido';
}

export default function HomeScreen() {
  const { groupId, user, isGroupLoading } = useUserStore();
  const { grupo, loading: loadingGrupo } = useGrupoDetails(groupId);
  const { grupos, loading: loadingGrupos } = useGruposPorCep(user?.cep);
  const router = useRouter();
  console.log('[DEBUG][HomeScreen] Zustand user:', useUserStore.getState().user);

  useUserGroupEffect();

  // ✅ On capte les params passés par la notif (libs/notifications.js)
  const { quitGroup, fromNotif, alertId } = useLocalSearchParams();

  // ✅ Réfs pour gérer le scroll doux vers la section alertes (pas d'empilement)
  const scrollRef = useRef(null);
  const [alertsSectionY, setAlertsSectionY] = useState(null);

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

  // --- GROUPES DISPOS À REJOINDRE (pas déjà membre)
  const outrosGrupos = (grupos || []).filter(
    (g) =>
      !(g.membersIds || []).includes(user?.id || user?.uid) &&
      (g.members?.length || 0) < (g.maxMembers || 30)
  );

  // ---- Salutation dynamique
  const horaBrasil = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'America/Fortaleza',
  });
  const hora = parseInt(horaBrasil, 10);
  let saudacao = 'Bom dia';
  if (hora >= 12 && hora < 18) {
    saudacao = 'Boa tarde';
  } else if (hora >= 18 || hora < 6) {
    saudacao = 'Boa noite';
  }

  const nome = user?.apelido || user?.username || 'Cidadão';

  // ✅ Scroll automatique (doux) vers la section "Últimos alertas (24h)" si fromNotif
  useEffect(() => {
    if (fromNotif && alertsSectionY !== null && scrollRef.current?.scrollTo) {
      console.log('[Home] fromNotif detected, smooth scroll to alerts at Y=', alertsSectionY);
      const t = setTimeout(() => {
        const y = Math.max(0, alertsSectionY - 12);
        scrollRef.current.scrollTo({ y, animated: true });
      }, 350); // on laisse le temps de peindre
      return () => clearTimeout(t);
    }
  }, [fromNotif, alertsSectionY]);

  // --- Loader user pas chargé
  if (!user) {
    console.log('[DEBUG][HomeScreen] Zustand user:', useUserStore.getState().user);
    console.trace();

    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00C859" />
      </View>
    );
  }
  // --- Loader groupe loading
  if (isGroupLoading) {
    return <GroupSkeleton />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.greeting}>
          {saudacao}, <Text style={styles.username}>{nome}</Text> 👋
        </Text>

        {/* Météo (existant) */}
        <WeatherCard cep={user?.cep} />

        {/* ✅ Bandeau si on vient d'une notif (pour minor/medium routées vers Home) */}
        {fromNotif && alertId ? (
          <InlineAlertHighlight
            color="#FF3B30"
            endereco={undefined /* tu peux charger le doc ici si tu veux afficher la rua/cidade */}
            onPress={() => router.push(`/public-alerts/${alertId}`)}
          />
        ) : null}

        {/* ✅ Section: Últimos alertas (24h) — preview (pas de scroll interne) */}
        <View onLayout={(e) => setAlertsSectionY(e.nativeEvent.layout.y)}>
          <PublicAlertsPreview />
        </View>

        {/* --- PAS DE GROUPE --- */}
        {!groupId && !loadingGrupo ? (
          <View style={styles.infoBox}>
            <Text style={{ color: '#bbb', fontSize: 16, marginBottom: 12, textAlign: 'center' }}>
              Nenhum grupo encontrado
            </Text>
            <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/group-create')}>
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
              <Text style={{ color: '#eee', fontSize: 14, marginLeft: 4 }}>{grupo.cep}</Text>
              <Text style={{ marginHorizontal: 8, color: '#666' }}>|</Text>
              <FontAwesome name="users" size={16} color="#facc15" />
              <Text style={{ color: '#eee', fontSize: 14, marginLeft: 4 }}>
                {grupo.members?.length || 0} / {grupo.maxMembers || 30} vizinhos
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text>pub</Text>
              <Link href="/test-ads">Voir la bannière AdMob (test)</Link>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* --- GROUPES À REJOINDRE --- */}
        <AvailableGroupsCarousel groups={outrosGrupos} loading={loadingGrupos} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#181A20' },
  container: { backgroundColor: '#181A20', padding: 18, paddingBottom: 120 },
  greeting: {
    color: '#fff',
    fontSize: 27,
    fontWeight: '700',
    marginBottom: 18,
    marginTop: 5,
    alignSelf: 'flex-start',
  },
  username: { color: '#00C859', fontWeight: '900' },
  groupCard: {
    backgroundColor: '#202228',
    borderRadius: 15,
    padding: 18,
    marginBottom: 20,
    alignItems: 'flex-start',
    shadowColor: '#00C859',
    shadowOpacity: 0.09,
    shadowRadius: 5,
  },
  groupTitle: { color: '#6cffe5', fontWeight: 'bold', fontSize: 17, marginBottom: 4 },
  groupName: { color: '#00C859', fontWeight: '900', fontSize: 21, marginBottom: 3 },
  infoBox: {
    marginTop: 30,
    alignItems: 'center',
    padding: 18,
    backgroundColor: '#23262F',
    borderRadius: 14,
  },
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
    color: '#00C859',
    fontWeight: 'bold',
    marginLeft: 10,
    fontSize: 16,
    textAlign: 'center',
    flex: 1,
  },
  skeletonCard: {
    backgroundColor: '#23262F',
    borderRadius: 16,
    padding: 20,
    marginBottom: 22,
    marginTop: 14,
    shadowColor: '#00C859',
    shadowOpacity: 0.07,
    shadowRadius: 7,
    minHeight: 130,
    justifyContent: 'center',
  },
  skeletonLineLarge: {
    backgroundColor: '#30323b',
    height: 22,
    borderRadius: 9,
    marginBottom: 13,
    width: '80%',
    alignSelf: 'flex-start',
  },
  skeletonLineShort: {
    backgroundColor: '#363946',
    height: 16,
    borderRadius: 8,
    marginBottom: 13,
    width: '45%',
    alignSelf: 'flex-start',
  },
  skeletonLine: {
    backgroundColor: '#30323b',
    height: 15,
    borderRadius: 7,
    marginBottom: 11,
    width: '65%',
    alignSelf: 'flex-start',
  },
  skeletonLineThin: {
    backgroundColor: '#363946',
    height: 13,
    borderRadius: 7,
    width: '35%',
    alignSelf: 'flex-start',
  },
});
