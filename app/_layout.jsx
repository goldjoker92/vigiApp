// app/_layout.js
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import 'react-native-reanimated';
import React from 'react';
import { Stack } from 'expo-router';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';

// ⚠️ init monétisation hors de /app
import '../src/_bootstrap/monetization-init';

import CustomTopToast from './components/CustomTopToast'; // garde ton chemin

// === Polyfill structuredClone pour Hermes (si besoin) ===
if (typeof global.structuredClone !== 'function') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// === Suppression des logs en production ===
if (!__DEV__) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

export default function Layout() {
  const publishableKey = Constants.expoConfig?.extra?.STRIPE_PUBLISHABLE_KEY || '';

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PaperProvider>
          <StripeProvider publishableKey={publishableKey}>
            <Stack screenOptions={{ headerShown: false }} />
            <Toast
              config={{ success: (props) => <CustomTopToast {...props} /> }}
              position="top"
              topOffset={42}
            />
          </StripeProvider>
        </PaperProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
