import { useRouter } from 'expo-router';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { HandHeart, Send } from "lucide-react-native";
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../firebase';
import { useUserStore } from '../store/users';

export default function HelpRequestScreen() {
  const { user, groupId } = useUserStore();
  const router = useRouter();
  const [mensagem, setMensagem] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    if (!mensagem.trim()) return Alert.alert("Mensagem obrigatória", "Descreva o que você precisa.");
    setLoading(true);
    try {
      await addDoc(collection(db, "groupHelps"), {
        groupId,
        userId: user.uid,
        apelido: user.apelido,
        mensagem,
        status: 'aberta',
        createdAt: serverTimestamp()
      });
      Alert.alert("Pedido enviado", "Seu pedido de ajuda foi publicado para o grupo.");
      router.replace('/(tabs)/vizinhos');
    } catch (e) {
      Alert.alert("Erro", e.message);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}><HandHeart color="#36C5FF" size={23}/> Pedir ajuda ao grupo</Text>
      <Text style={styles.label}>Explique o que você precisa *</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Preciso de uma furadeira emprestada, carregar um móvel…"
        value={mensagem}
        onChangeText={setMensagem}
        multiline
      />
      <TouchableOpacity style={styles.btn} onPress={handleRequest} disabled={loading}>
        <Send color="#fff" size={19} style={{marginRight:7}}/>
        <Text style={styles.btnText}>{loading ? 'Enviando…' : 'Pedir ajuda'}</Text>
      </TouchableOpacity>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#181A20', justifyContent:'center', padding:26 },
  title: { color:'#36C5FF', fontWeight:'bold', fontSize:21, marginBottom:24 },
  label: { color:'#fff', marginBottom:8, fontSize:16 },
  input: { borderWidth:1, borderColor:'#353840', backgroundColor:'#23262F', color:'#fff', padding:14, borderRadius:9, marginBottom:14, fontSize:15, minHeight:80 },
  btn: { backgroundColor:'#22C55E', padding:14, borderRadius:8, flexDirection:'row', alignItems:'center', justifyContent:'center', marginTop:16 },
  btnText: { color:'#fff', fontWeight:'bold', fontSize:17 }
});
