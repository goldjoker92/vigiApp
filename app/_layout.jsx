// app/_layout.jsx
import { Stack } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';               
import { useUserStore } from '../store/users';    

export default function Layout() {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Recharge le user profile (et donc groupId, etc)
        await useUserStore.getState().loadUser(user.uid);
      } else {
        useUserStore.getState().clearUser();
      }
    });
    return unsub; // Clean-up quand le layout est démonté
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </>
  );
}
