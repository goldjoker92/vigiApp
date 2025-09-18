import { useLocalSearchParams } from 'expo-router';
import { useUserStore } from '../../store/users';
import ChatScreen from '../components/ChatScreen';

export default function ChatRoute() {
  const { chatId } = useLocalSearchParams();
  const currentUser = useUserStore((state) => state.user);

  if (!chatId || !currentUser) {return null;} // ou écran de chargement

  return <ChatScreen chatId={chatId} currentUser={currentUser} />;
}
