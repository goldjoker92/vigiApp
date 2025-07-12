// app/(tabs)/_layout.jsx
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import CustomHeader from '../components/CustomHeader';
import SideDrawer from '../components/SideDrawer';
import CustomTabBar from '../components/CustomTabBar';
import { useUserStore } from '../../store/users';
import { House, AlertCircle, User } from 'lucide-react-native';

export default function TabsLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useUserStore();

  return (
    <View style={{ flex: 1 }}>
      {/* Header custom */}
      <CustomHeader
        user={user}
        onMenuPress={() => setDrawerOpen(true)}
      />
      {/* SideDrawer (menu latéral gauche) */}
      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
      />
      {/* TabBar (expo-router) */}
      <Tabs
        tabBar={props => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#888',
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            tabBarLabel: 'Accueil',
            tabBarIcon: ({ color }) => <House color={color} size={26} />,
          }}
        />
        <Tabs.Screen
          name="report"
          options={{
            tabBarLabel: 'Sinalizar',
            tabBarIcon: ({ color }) => <AlertCircle color={color} size={26} />,
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

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#181A20',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    height: 70,
    paddingBottom: 12,
    paddingTop: 4,
    borderTopWidth: 0,
    position: 'absolute', // surélevé si tu veux
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 6,
  }
});
