import { View, Text, StyleSheet } from 'react-native';
import { useUserStore } from '../../store/users';

export default function ProfileScreen() {
  const { user } = useUserStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meu Perfil</Text>
      <Text style={styles.info}>Nome: {user?.nome || 'Usuário'}</Text>
      <Text style={styles.info}>Apelido: {user?.apelido || '-'}</Text>
      <Text style={styles.info}>Email: {user?.email}</Text>
      <Text style={styles.info}>Telefone: {user?.telefone || '-'}</Text>
      <Text style={styles.info}>Cidade: {user?.cidade || '-'}</Text>
      <Text style={styles.info}>CEP: {user?.cep || '-'}</Text>
      {/* etc, ajoute les autres champs si tu veux */}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#181A20', padding:24 },
  title: { color:'#fff', fontSize:24, fontWeight:'bold', marginBottom:14 },
  info: { color:'#aaa', fontSize:16, marginBottom:6, textAlign:'center' },
});
