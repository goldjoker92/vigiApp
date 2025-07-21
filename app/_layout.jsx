import { Stack } from 'expo-router';
import Toast from 'react-native-toast-message';
import  CustomTopToast  from './components/CustomTopToast'; 

export default function Layout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast
        config={{
          success: (props) => <CustomTopToast {...props} />,
        }}
        position="top"
        topOffset={42}
      />
    </>
  );
}

// Ce fichier sert de layout principal pour l'application, incluant le Stack Navigator et Toast pour les notifications.
