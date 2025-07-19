// app/_layout.jsx ou app/layout.jsx
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import CustomToast from './components/CustomToast'; // Chemin selon ton projet

export default function RootLayout() {
  // Ajoute la couleur de statusBar si besoin
  useEffect(() => {
    // Ici, tu peux forcer une couleur pour la StatusBar si tu veux (optionnel)
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor="#181A20" />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
      <Toast
        position="top"
        topOffset={48}
        config={{
          success: (props) => <CustomToast {...props} type="success" />,
          error: (props) => <CustomToast {...props} type="error" />,
          info: (props) => <CustomToast {...props} type="info" />,
        }}
      />
    </>
  );
}
