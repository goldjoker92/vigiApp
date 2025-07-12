// app/(tabs)/profile.jsx
import { View, Text, StyleSheet } from 'react-native';
import { auth } from '../../firebase';

export default function ProfileScreen() {
  const user = auth.currentUser;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meu Perfil</Text>
      <Text style={styles.info}>Nome: {user?.displayName || 'Usuário'}</Text>
      <Text style={styles.info}>Email: {user?.email}</Text>
      {/* Ajoute ici les infos récupérées du Firestore si tu veux */}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#181A20', padding:24 },
  title: { color:'#fff', fontSize:24, fontWeight:'bold', marginBottom:14 },
  info: { color:'#aaa', fontSize:16, marginBottom:6, textAlign:'center' },
});
