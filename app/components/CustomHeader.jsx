import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Bell, Search, Menu } from 'lucide-react-native';
import logoVigiApp from '../../assets/images/logoVigiApp.png';

export default function CustomHeader({ notifs = 0, onMenuPress, onSearchPress, onNotifPress }) {
  return (
    <View style={styles.headerContainer}>
      {/* Logo */}
      <Image source={logoVigiApp} style={styles.logoImage} resizeMode="contain" />

      {/* Actions */}
      <View style={styles.actionsRow}>
        {/* Notifications */}
        <TouchableOpacity style={styles.iconWrapper} onPress={onNotifPress}>
          <Bell size={25} color="#222" />
          {notifs > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notifs > 99 ? '99+' : notifs}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Search */}
        <TouchableOpacity style={styles.iconWrapper} onPress={onSearchPress}>
          <Search size={25} color="#222" />
        </TouchableOpacity>

        {/* Menu burger */}
        <TouchableOpacity style={styles.menuButton} onPress={onMenuPress}>
          <Menu size={27} color="#222" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logoImage: {
    width: 120, // ajuste selon la taille voulue
    height: 60,
    marginLeft: -10,
    padding: 5,
  },
  headerContainer: {
    paddingTop: Platform.OS === 'ios' ? 54 : 34,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  logoText: {
    fontSize: 25,
    fontWeight: '800',
    color: '#F12C2C',
    letterSpacing: 0.2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrapper: {
    marginHorizontal: 2,
    position: 'relative',
    padding: 8,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F12C2C',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    zIndex: 99,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  menuButton: {
    marginLeft: 5,
    padding: 8,
    borderRadius: 50,
    backgroundColor: '#F6F8FA',
    elevation: 2,
  },
});
