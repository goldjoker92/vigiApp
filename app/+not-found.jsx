import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';

export default function NotFoundScreen() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontWeight: '700', fontSize: 18 }}>Écran introuvable</Text>
      <Text style={{ opacity: 0.8, textAlign: 'center' }}>
        La route demandée n’existe pas (ou pas encore).
      </Text>
      <Pressable
        onPress={() => router.replace('/')}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 10,
          backgroundColor: '#222',
        }}
      >
        <Text style={{ color: 'white' }}>Revenir à l’accueil</Text>
      </Pressable>
    </View>
  );
}
