// app/(tabs)/home.jsx
// -------------------------------------------------------------
// HomeScreen — version stable (sans régression UI/UX)
// - Météo en premier (WeatherCard)
// - Hub Rápido monté en différé (InteractionManager) → pas visible au boot
// - Bandeau InlineAlertHighlight si fromNotif & alertId
// - Scroll doux vers la section "Últimos alertas (24h)" si fromNotif
// - Groupes : carte du groupe courant + carrousel des groupes dispos
// - Logs modérés pour debug terrain (préfixe [Home])
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
  InteractionManager,
} from 'react-native';

import { useRouter, useLocalSearchParams, Link } from 'expo-router';
import { FontAwesome, Feather, MaterialIcons } from '@expo/vector-icons';
import { PlusCircle } from 'lucide-react-native';

import Toast from 'react-native-toast-message';

import { useUserStore } from '../../store/users';
import { useGrupoDetails } from '../../hooks/useGrupoDetails';
import { useGruposPorCep } from '../../hooks/useGruposPorCep';
import { useUserGroupEffect } from '../../hooks/useUserGroupEffect';

// Cartes / composants
import WeatherCard from '../components/WeatherCard';
import HubRapidoCard from '../components/HubRapidoCard';
import PublicAlertsPreview from '../components/PublicAlertsPreview';
import InlineAlertHighlight from '../components/InlineAlertHighlight';
import AvailableGroupsCarousel from '../components/AvailableGroupsCarousel';

// ---- Skeleton animé léger (inchangé)
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

const log = (...a) => console.log('[Home]', ...a);

export default function HomeScreen() {
  const router = useRouter();
  const { groupId, user, isGroupLoading } = useUserStore();

  const { grupo, loading: loadingGrupo } = useGrupoDetails(groupId);
  const { grupos, loading: loadingGrupos } = useGruposPorCep(user?.cep);

  // Effet groupe (comme avant)
  useUserGroupEffect();

  // Params éventuels (depuis notif)
  const { quitGroup, fromNotif, alertId } = useLocalSearchParams();

  // Réf scroll + ancre section alertes
  const scrollRef = useRef(null);
  const [alertsSectionY, setAlertsSectionY] = useState(null);

  // Hub différé (pas au boot → la météo garde la scène)
  const [showHub, setShowHub] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      // petit délai pour laisser WeatherCard sortir de son skeleton
      const t = setTimeout(() => setShowHub(true), 700);
      return () => clearTimeout(t);
    });
    return () => task?.cancel && task.cancel();
  }, []);

  // Toast si sortie de groupe
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

  // Scroll doux vers les alertes si on vient d'une notif
  useEffect(() => {
    if (fromNotif && alertsSectionY !== null && scrollRef.current?.scrollTo) {
      log('fromNotif → smooth scroll to alerts at Y =', alertsSectionY);
      const t = setTimeout(() => {
        const y = Math.max(0, alertsSectionY - 12);
        scrollRef.current.scrollTo({ y, animated: true });
      }, 350);
      return () => clearTimeout(t);
    }
  }, [fromNotif, alertsSectionY]);

  // Groupes dispo (pas déjà membre)
  const outrosGrupos = (grupos || []).filter(
    (g) =>
      !(g.membersIds || []).includes(user?.id || user?.uid) &&
      (g.members?.length || 0) < (g.maxMembers || 30)
  );

  // Salutation dynamique (pt-BR)
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

  // Loaders
  if (!user) {
    log('user not ready → spinner');
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00C859" />
      </View>
    );
  }
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
        {/* Titre */}
        <Text style={styles.greeting}>
          {saudacao}, <Text style={styles.username}>{nome}</Text> 👋
        </Text>

        {/* 1) Météo — toujours en premier */}
        <WeatherCard cep={user?.cep} showScrollHint />

        {/* 2) Hub Rápido — monté en différé (pas visible au démarrage) */}
        {showHub ? <HubRapidoCard /> : null}

        {/* 3) Bandeau si retour d’une notif (minor/medium routées vers Home) */}
        {fromNotif && alertId ? (
          <InlineAlertHighlight
            color="#FF3B30"
            endereco={undefined /* charge le doc si tu veux afficher rua/cidade */}
            onPress={() => router.push(`/public-alerts/${alertId}`)}
          />
        ) : null}

        {/* 4) Últimos alertas (24h) — ancrage pour le scroll depuis notif */}
        <View onLayout={(e) => setAlertsSectionY(e.nativeEvent.layout.y)}>
          <PublicAlertsPreview />
        </View>

        {/* 5) Groupe courant ou CTA créer groupe */}
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

            {/* zone démo / pub – inchangée */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#9aa3ad', marginTop: 10, marginBottom: 4 }}>pub</Text>
              <Link href="/test-ads">Voir la bannière AdMob (test)</Link>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* 6) Groupes à rejoindre */}
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

  // Carte groupe
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

  // Boîte "aucun groupe"
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

  // Skeleton groupe
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
