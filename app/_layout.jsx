// app/_layout.jsx ou app/_layout.js
import { Stack } from 'expo-router';
import Toast from 'react-native-toast-message';

export default function Layout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </>
  );
}
// Ce fichier sert de layout principal pour l'application, incluant le Stack Navigator et Toast pour les notifications.     