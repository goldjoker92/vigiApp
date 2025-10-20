// app/(tabs)/_layout.tsx
import React from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Keyboard, View } from 'react-native';

import CustomHeader from '../components/CustomHeader';
import SideDrawer from '../components/SideDrawer';
import CustomTabBar from '../components/CustomTabBar';

import { useUserStore } from '../../store/users';
import { isProfileIncomplete } from '../../utils/isProfileIncomplete';
import { House, MapPinned, Users, User } from 'lucide-react-native';

import { useAdsSetup } from '../../hooks/useAdsSetup';
import AdBanner from '../components/AdBanner';

// TODO: branche à RevenueCat/Firestore
const useHasPro = () => false;

// Routes où on masque la bannière
const HIDE_ROUTES = new Set([
  '/auth/login',
  '/auth/signup',
  '/auth/profile-onboarding',
  '/paywall',
  '/checkout',
  '/camera',
  '/video',
  '/(tabs)/mapa', // carte plein écran
]);

export default function TabsLayout() {
  // Init consent + SDK Ads
  useAdsSetup();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [kbVisible, setKbVisible] = React.useState(false);

  const { user } = useUserStore();
  const router = useRouter();
  const pathname = usePathname();
  const hasPro = useHasPro();

  // Redirige si profil incomplet
  React.useEffect(() => {
    if (isProfileIncomplete(user)) {
      router.replace('/auth/profile-onboarding');
    }
  }, [user, router]);

  // Détecte clavier (pour masquer la pub)
  React.useEffect(() => {
    const s1 = Keyboard.addListener('keyboardDidShow', () => setKbVisible(true));
    const s2 = Keyboard.addListener('keyboardDidHide', () => setKbVisible(false));
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  const shouldHideAd =
    hasPro || kbVisible || Array.from(HIDE_ROUTES).some((r) => pathname.startsWith(r));

  // Padding bas quand la bannière est affichée
  const contentPaddingBottom = shouldHideAd ? 0 : 60;

  // ✅ Corrige: expo-router Tabs attend une FONCTION pour tabBar
  const renderTabBar = React.useCallback((props) => <CustomTabBar {...props} />, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#181A20' }}>
      {/* Header */}
      <CustomHeader
        user={user}
        notifs={user?.notifs || 0}
        onMenuPress={() => setDrawerOpen(true)}
        onSearchPress={() => {}}
        onNotifPress={() => {}}
      />

      {/* Drawer latéral */}
      <SideDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} user={user} />

      {/* Conteneur des tabs avec padding bas si pub */}
      <View style={{ flex: 1, paddingBottom: contentPaddingBottom }}>
        <Tabs
          tabBar={renderTabBar}
          screenOptions={{
            headerShown: false,
            // Anti “saut”/remount
            unmountOnBlur: false,
            freezeOnBlur: true,
            detachInactiveScreens: false,
            lazy: false,
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              tabBarLabel: 'Início',
              tabBarIcon: ({ color }) => <House color={color} size={26} />,
            }}
          />
          <Tabs.Screen
            name="mapa"
            options={{
              tabBarLabel: 'Mapa',
              tabBarIcon: ({ color }) => <MapPinned color={color} size={26} />,
            }}
          />
          <Tabs.Screen
            name="vizinhos"
            options={{
              tabBarLabel: 'Vizinhos',
              tabBarIcon: ({ color }) => <Users color={color} size={26} />,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              tabBarLabel: 'Perfil',
              tabBarIcon: ({ color }) => <User color={color} size={26} />,
            }}
          />
        </Tabs>
      </View>

      {!shouldHideAd && <AdBanner />}
    </View>
  );
}
