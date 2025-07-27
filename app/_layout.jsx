import { Stack } from 'expo-router';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import CustomTopToast from './components/CustomTopToast';

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
