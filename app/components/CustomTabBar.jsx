// app/(tabs)/components/CustomTabBar.jsx
import React, { useMemo, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { House, User, AlertCircle, MapPinned, Users } from 'lucide-react-native';

const ICONS = {
  home: House,
  mapa: MapPinned,
  vizinhos: Users,
  profile: User,
};

const TAB_BAR_HEIGHT = 78;

function CustomTabBarImpl({ state, descriptors, navigation }) {
  const router = useRouter();

  const activeRoute = state.routes[state.index];
  const activeName = activeRoute?.name;
  const fabBg = activeName === 'mapa' ? '#007AFF' : '#FF4444';

  // ✅ Garde-fou DEV : prévient les doublons de noms
  if (__DEV__) {
    const names = state.routes.map(r => r.name);
    const dups = names.filter((n, i) => names.indexOf(n) !== i);
    if (dups.length) {
      console.warn('[TabBar] Noms d’onglets en double:', dups, '— vérifie tes <Tabs.Screen name="...">');
    }
  }

  // ✅ Stable key builder
  const tabKey = (route) => `tab-${String(route.name)}`;

  const onPressTab = useCallback(
    (route, isFocused) => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    },
    [navigation]
  );

  const tabs = useMemo(() => {
    return state.routes.map((route, index) => {
      const isFocused = state.index === index;
      const options = descriptors[route.key]?.options || {};
      const label =
        options.tabBarLabel ||
        options.title ||
        (route.name ? route.name.charAt(0).toUpperCase() + route.name.slice(1) : '');

      const Icon = ICONS[route.name] || House;

      return (
        <TouchableOpacity
          key={tabKey(route)} // ✅ Clé sûre et stable
          accessibilityRole="button"
          accessibilityState={isFocused ? { selected: true } : {}}
          onPress={() => onPressTab(route, isFocused)}
          onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          style={styles.tabBtn}
          activeOpacity={0.7}
        >
          <Icon color={isFocused ? '#00C859' : '#bbb'} size={26} />
          <Text style={[styles.tabLabel, isFocused && { color: '#00C859' }]}>{label}</Text>
        </TouchableOpacity>
      );
    });
  }, [state.routes, state.index, descriptors, onPressTab, navigation]);

  return (
    <>
      <View style={styles.tabBar}>{tabs}</View>

      {/* Bouton flottant Sinalizar */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: fabBg }]}
        activeOpacity={0.9}
        onPress={() => router.push('/grupo-sinalizar')}
      >
        <AlertCircle color="#fff" size={32} />
        <Text style={styles.fabText}>Sinalizar</Text>
      </TouchableOpacity>
    </>
  );
}

export default React.memo(CustomTabBarImpl);

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(24,26,32,0.97)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 9,
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'ios' ? 26 : 10,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    borderTopWidth: 0,
  },
  tabBtn: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  tabLabel: { color: '#bbb', fontSize: 13, fontWeight: '600', marginTop: 2 },
  fab: {
    position: 'absolute',
    bottom: TAB_BAR_HEIGHT + 24,
    right: 26,
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
    zIndex: 99,
  },
  fabText: { color: '#fff', fontWeight: 'bold', marginLeft: 12, fontSize: 16, letterSpacing: 0.5 },
});
