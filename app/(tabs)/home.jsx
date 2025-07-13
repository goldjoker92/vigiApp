import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';

import AlertCard from '../components/AlertCard';
import { useRouter } from 'expo-router';
import { useUserStore } from '../../store/users';
import QuickActions from '../components/QuickActions';

const BUTTON_WIDTH = (Dimensions.get('window').width - 48) / 4;

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useUserStore();

  // Greeting dynamique selon l’heure brésilienne
  const horaBrasil = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Fortaleza' });
  const hora = parseInt(horaBrasil, 10);
  let greeting = 'Bom dia';
  if (hora >= 12 && hora < 18) greeting = 'Boa tarde';
  else if (hora >= 18 || hora < 6) greeting = 'Boa noite';

  // Apelido > username > fallback
  const nome = user?.apelido || user?.username || 'Cidadão';

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Text style={styles.greeting}>
          {greeting}, <Text style={styles.username}>{nome}</Text> 👋
        </Text>

        {/* Bloc météo simulé */}
        <View style={styles.weatherCard}>
          <Text style={styles.weatherTitle}>Tempo agora</Text>
          <Text style={styles.weatherInfo}>☀️ Ensolarado, 29ºC</Text>
          <Text style={styles.weatherSub}>Nenhum alerta de chuva forte</Text>
        </View>

        {/* Alertes récentes (horizontales) */}
        <Text style={styles.sectionTitle}>Alertas recentes</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <AlertCard
            title="Roubo"
            badge="Novo"
            subtitle="Praça Central Hoje 14:13"
          />
          <AlertCard
            title="Incêndio"
            badge="Novo"
            subtitle="Rua das Flores Hoje 13:05"
          />
          {/* ... autres AlertCard */}
        </ScrollView>

        {/* Actions principales */}
        <QuickActions
          onSinalizar={() => router.push('/(tabs)/report')}
          onProfile={() => router.push('/(tabs)/profile')}
          onMap={() => router.push('/(tabs)/map')}
          onHelp={() => {/* Ouvre une modale ou appelle le SOS */}}
  />

        {/* Statistiques */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>📊 Estatísticas</Text>
          <Text style={styles.statsInfo}>Esta semana: <Text style={{ color: '#00C859', fontWeight: 'bold' }}>8</Text> alertas</Text>
        </View>

        {/* Communauté */}
        <View style={styles.communityCard}>
          <Text style={styles.communityTitle}>Comunidade ativa</Text>
          <Text style={styles.communityInfo}>Participantes: <Text style={{ color: '#00C859', fontWeight: 'bold' }}>163</Text></Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { paddingBottom: 90, backgroundColor: '#181A20' },
  container: { flex: 1, alignItems: 'center', padding: 18 },
  greeting: { color: '#fff', fontSize: 27, fontWeight: '700', marginBottom: 18, marginTop: 5, alignSelf: 'flex-start' },
  username: { color: '#00C859', fontWeight: '900' },
  weatherCard: {
    width: '100%',
    backgroundColor: '#24262e',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    alignItems: 'flex-start'
  },
  weatherTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  weatherInfo: { color: '#ffe568', fontSize: 15, marginBottom: 3 },
  weatherSub: { color: '#bbb', fontSize: 13 },
  sectionTitle: { color: '#fff', fontSize: 19, fontWeight: 'bold', marginTop: 20, marginBottom: 12, alignSelf: 'flex-start' },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
    marginBottom: 18,
    gap: 6
  },
  actionBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 0,
    width: BUTTON_WIDTH,
    alignItems: 'center',
    marginHorizontal: 3,
    elevation: 2,
  },
  actionText: { color: '#fff', fontWeight: 'bold', fontSize: 15, marginTop: 7, textAlign: 'center' },
  statsCard: {
    backgroundColor: '#202228',
    borderRadius: 15,
    padding: 16,
    marginTop: 12,
    width: '100%',
    alignItems: 'flex-start'
  },
  statsTitle: { color: '#6cffe5', fontWeight: 'bold', fontSize: 17, marginBottom: 6 },
  statsInfo: { color: '#eee', fontSize: 15 },
  communityCard: {
    backgroundColor: '#202228',
    borderRadius: 15,
    padding: 15,
    marginTop: 13,
    width: '100%',
    alignItems: 'flex-start'
  },
  communityTitle: { color: '#6cffe5', fontWeight: 'bold', fontSize: 17, marginBottom: 6 },
  communityInfo: { color: '#eee', fontSize: 15 },
});
