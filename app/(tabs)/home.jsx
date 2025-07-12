import { View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList } from 'react-native';
import { MapPin, User, Users, Sun, ShieldAlert, PlusCircle, BarChartBig, Phone } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useUserStore } from '../../store/users';




function getGreeting() {
  const now = new Date();
  // Décale en fuseau Brésil (GMT-3)
  const brTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hour = brTime.getHours();
  if (hour >= 6 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default function HomeScreen() {
  const { user } = useUserStore();
  const displayName = user?.apelido?.trim()
    ? user.apelido
    : user?.username?.trim()
      ? user.username
      : 'Cidadão';

  const router = useRouter();

  const greeting = getGreeting();

  // Faux exemples d’alertes, tu pourras binder Firestore ou REST ici
  const alertasRecentes = [
    { id: '1', type: 'Roubo', place: 'Praça Central', date: 'Hoje 14:13', novo: true },
    { id: '2', type: 'Incêndio', place: 'Rua das Flores', date: 'Ontem 21:40', novo: false },
    { id: '3', type: 'Acidente', place: 'Avenida Brasil', date: 'Ontem 19:12', novo: true },
  ];

  // Faux stats
  const stats = {
    semana: 8,
    mes: 27,
    ativos: 36,
    novos: 4,
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Message d’accueil dynamique */}
      <Text style={styles.greeting}>{greeting}, <Text style={styles.name}>{displayName} 👋</Text></Text>

      {/* CARD MÉTÉO */}
      <View style={[styles.card, styles.cardRow]}>
        <Sun size={34} color="#FFCB05" style={{ marginRight: 12 }} />
        <View>
          <Text style={styles.cardTitle}>Tempo agora</Text>
          <Text style={styles.cardInfo}>☀️ Ensolarado, 29°C</Text>
          <Text style={styles.cardSmall}>Nenhum alerta de chuva forte</Text>
        </View>
      </View>

      {/* ALERTES RÉCENTES (scroll horizontal) */}
      <Text style={styles.sectionTitle}>Alertas recentes perto de você</Text>
      <FlatList
        horizontal
        data={alertasRecentes}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 14 }}
        contentContainerStyle={{ gap: 14, paddingLeft: 3, paddingRight: 14 }}
        renderItem={({ item }) => (
          <View style={[styles.card, styles.alertCard]}>
            <ShieldAlert size={24} color="#FF3B30" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.alertType}>{item.type} {item.novo && <Text style={styles.badge}>Novo</Text>}</Text>
              <Text style={styles.alertPlace}>{item.place}</Text>
              <Text style={styles.alertDate}>{item.date}</Text>
            </View>
          </View>
        )}
      />

      {/* Boutons rapides */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/report')}>
          <PlusCircle color="#fff" size={26} />
          <Text style={styles.actionLabel}>Sinalizar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/profile')}>
          <User color="#fff" size={26} />
          <Text style={styles.actionLabel}>Meu perfil</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => {/* Ajoute map plus tard */}}>
          <MapPin color="#fff" size={26} />
          <Text style={styles.actionLabel}>Ver mapa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => {/* Ajoute ici un numéro d’urgence, ex: tel://190 */}}>
          <Phone color="#fff" size={26} />
          <Text style={styles.actionLabel}>Chamar ajuda</Text>
        </TouchableOpacity>
      </View>

      {/* Statistiques */}
      <View style={styles.card}>
        <BarChartBig size={20} color="#00C859" style={{ marginBottom: 6 }} />
        <Text style={styles.cardTitle}>Estatísticas</Text>
        <Text style={styles.statsText}>Esta semana: <Text style={styles.statsNumber}>{stats.semana}</Text> alertas</Text>
        <Text style={styles.statsText}>Este mês: <Text style={styles.statsNumber}>{stats.mes}</Text> alertas</Text>
        <Text style={styles.statsText}>Vizinhos ativos: <Text style={styles.statsNumber}>{stats.ativos}</Text></Text>
        <Text style={styles.statsText}>Novos vizinhos: <Text style={styles.statsNumber}>{stats.novos}</Text></Text>
      </View>

      {/* État communauté (exemple future) */}
      <View style={[styles.card, styles.communityCard]}>
        <Users size={24} color="#007AFF" style={{ marginRight: 9 }} />
        <Text style={styles.cardTitle}>Comunidade ativa</Text>
        <Text style={styles.cardSmall}>Participação crescente. Juntos somos mais fortes!</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: '#181A20' },
  container: { flexGrow: 1, padding: 24, backgroundColor: '#181A20', justifyContent: 'flex-start' },
  greeting:  { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 14, marginTop: 18 },
  name:      { color: '#00C859', fontWeight: 'bold' },

  // Cards général
  card: {
    backgroundColor: '#22242A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 12, elevation: 2,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 3 },
  cardInfo: { color: '#bbb', fontSize: 15, fontWeight: '600' },
  cardSmall: { color: '#888', fontSize: 13, fontWeight: '400', marginTop: 3 },
  sectionTitle: { color: '#bbb', fontSize: 17, fontWeight: '700', marginBottom: 7, marginLeft: 1 },

  // Alertes récentes
  alertCard: {
    minWidth: 195, maxWidth: 235, backgroundColor: '#292B33',
    flexDirection: 'row', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 18,
    borderRadius: 14, elevation: 1,
  },
  alertType: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 2 },
  alertPlace: { color: '#00C859', fontWeight: 'bold', fontSize: 14 },
  alertDate: { color: '#bbb', fontSize: 13, marginTop: 2 },
  badge: { backgroundColor: '#FF3B30', color: '#fff', borderRadius: 9, paddingHorizontal: 7, marginLeft: 5, fontSize: 11, overflow: 'hidden', fontWeight: 'bold' },

  // Actions rapides
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 9, marginBottom: 18 },
  actionBtn: {
    flex: 1, backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 4, elevation: 3, flexDirection: 'column'
  },
  actionLabel: { color: '#fff', fontWeight: 'bold', fontSize: 13, marginTop: 4, letterSpacing: 0.1 },

  // Stats
  statsText: { color: '#bbb', fontSize: 15, marginBottom: 2 },
  statsNumber: { color: '#00C859', fontWeight: 'bold', fontSize: 16 },

  // Communauté
  communityCard: { flexDirection: 'row', alignItems: 'center', gap: 10 }
});
