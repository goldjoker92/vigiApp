// app/(tabs)/_layout.jsx
import { useState } from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import CustomHeader from '../components/CustomHeader';
import SideDrawer from '../components/SideDrawer';
import CustomTabBar from '../components/CustomTabBar';
import { useUserStore } from '../../store/users';
import { House, MapPinned, Star, User } from 'lucide-react-native';

export default function TabsLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useUserStore();

  return (
    <View style={{ flex: 1, backgroundColor: '#181A20' }}>
      {/* Header */}
      <CustomHeader
        user={user}
        notifs={user?.notifs || 0}
        onMenuPress={() => setDrawerOpen(true)}
        onSearchPress={() => {/* Action de recherche future */}}
        onNotifPress={() => {/* Navigation notifications future */}}
      />
      {/* Menu latéral */}
      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
      />
      {/* Tabs (Expo Router) */}
      <Tabs
        tabBar={props => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
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
          name="favoritos"
          options={{
            tabBarLabel: 'Favoritos',
            tabBarIcon: ({ color }) => <Star color={color} size={26} />,
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
  );
}
