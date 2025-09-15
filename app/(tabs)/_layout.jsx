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

// If the correct path is 'src/hooks/useAdsSetup', update to:
import { useAdsSetup } from '../../hooks/useAdsSetup';
// Or, if the file does not exist, create 'hooks/useAdsSetup.js' or '.ts' in your project.
import AdBanner from '../components/AdBanner';

// TODO: branche à RevenueCat/Firestore
const useHasPro = () => false;

// Routes où on masque la bannière (ajuste selon ton app)
const HIDE_ROUTES = new Set([
  '/auth/login',
  '/auth/signup',
  '/auth/profile-onboarding',
  '/paywall',
  '/checkout',
  '/camera',
  '/video',
  // Optionnel: si ta carte est plein écran et doit rester clean
  '/(tabs)/mapa',
]);

export default function TabsLayout() {
  // Init consent + SDK Ads (une fois, au niveau layout)
  useAdsSetup();

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [kbVisible, setKbVisible] = React.useState(false);

  const { user } = useUserStore();
  const router = useRouter();
  const pathname = usePathname();
  const hasPro = useHasPro();

  React.useEffect(() => {
    if (isProfileIncomplete(user)) {
      router.replace('/auth/profile-onboarding');
    }
  }, [user, router]);

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

  // On ajoute un padding bas quand la bannière est affichée
  const contentPaddingBottom = shouldHideAd ? 0 : 60;

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
          tabBar={(props) => <CustomTabBar {...props} />}
          screenOptions={{ headerShown: false }}
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
              tabBarLabel: 'vizinhos',
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
