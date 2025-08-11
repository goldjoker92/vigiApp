// app/_layout.js

import React from 'react';
import { Stack } from 'expo-router';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from 'react-error-boundary';
import { View, Text } from 'react-native';
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

// === Fallback UI en cas de bug JS (Error Boundary) ===
function MyFallback({ error }) {
  return (
    <View style={{ flex:1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#181A20' }}>
      <Text style={{ color:'#FFD600', fontWeight:'bold', fontSize:20, marginBottom:16 }}>Oops !</Text>
      <Text style={{ color:'#fff', textAlign:'center', fontSize:16, marginBottom:10 }}>
        {error?.message || "Une erreur est survenue."}
      </Text>
      <Text style={{ color:'#aaa', fontSize:12 }}>Essaie de relancer l’application.</Text>
    </View>
  );
}

export default function Layout() {
  const publishableKey = Constants.expoConfig?.extra?.STRIPE_PUBLISHABLE_KEY || '';

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PaperProvider>
          <StripeProvider publishableKey={publishableKey}>
            <ErrorBoundary FallbackComponent={MyFallback}>
              <Stack screenOptions={{ headerShown: false }} />
              <Toast
                config={{ success: (props) => <CustomTopToast {...props} /> }}
                position="top"
                topOffset={42}
              />
            </ErrorBoundary>
          </StripeProvider>
        </PaperProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
