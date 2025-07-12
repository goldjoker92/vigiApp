import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { House, User, AlertCircle, MapPinned, Star } from 'lucide-react-native';
import { useRouter } from 'expo-router';

const TABS = [
  { name: 'home', label: 'Início', icon: House },
  { name: 'mapa', label: 'Mapa', icon: MapPinned },
  { name: 'favoritos', label: 'Favoritos', icon: Star },
  { name: 'profile', label: 'Perfil', icon: User }
];

export default function CustomTabBar({ state, descriptors, navigation }) {
  const router = useRouter();
  return (
    <>
      <View style={styles.tabBar}>
        {TABS.map((tab, idx) => {
          const isFocused = state.index === idx;
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.name}
              onPress={() => navigation.navigate(tab.name)}
              style={styles.tabBtn}
              activeOpacity={0.7}
            >
              <Icon color={isFocused ? "#00C859" : "#bbb"} size={26} />
              <Text style={[styles.tabLabel, isFocused && { color: '#00C859' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* BOUTON FLOTTANT - style Google Drive */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.9}
        onPress={() => router.push('/report')}
      >
        <AlertCircle color="#fff" size={32} />
        <Text style={styles.fabText}>Sinalizar</Text>
      </TouchableOpacity>
    </>
  );
}

const TAB_BAR_HEIGHT = 78;

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(24,26,32,0.97)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 9,
    height: TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'ios' ? 26 : 10,
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2,
    borderTopWidth: 0,
  },
  tabBtn: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  tabLabel: { color: '#bbb', fontSize: 13, fontWeight: '600', marginTop: 2 },
  // FAB = Floating Action Button
  fab: {
    position: 'absolute',
    bottom: TAB_BAR_HEIGHT + 24, // <- **surélevé, NE CACHE PAS les icônes**
    right: 26,
    backgroundColor: '#FF4444',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#FF4444',
    shadowOpacity: 0.21,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 99
  },
  fabText: { color: '#fff', fontWeight: 'bold', marginLeft: 12, fontSize: 16, letterSpacing: 0.5 }
});
