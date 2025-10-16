import { View, Text, TouchableOpacity } from 'react-native';
import { useUserStore } from '../../store/users';
import { useUnreadAlerts } from '../../hooks/useUnreadAlerts';
import { Bell } from 'lucide-react-native'; // installe lucide-react-native ou adapte

export default function NotificationBell({ groupId, onPress }) {
  const { user } = useUserStore();
  const unread = useUnreadAlerts(user, groupId);

  return (
    <TouchableOpacity onPress={onPress} style={{ position: 'relative' }}>
      <Bell color="#fff" size={28} />
      {unread > 0 && (
        <View
          style={{
            position: 'absolute',
            right: -5,
            top: -5,
            backgroundColor: '#FF4D4F',
            borderRadius: 10,
            minWidth: 20,
            height: 20,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 5,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>{unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
