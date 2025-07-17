import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useUserStore } from '../../store/users';
import { useGroupChat } from '../../hooks/useGroupChat';
import { Send, UserCircle } from "lucide-react-native";

export default function GroupChatScreen() {
  const route = useRoute();
  const { helpId } = route.params || {};
  const { user } = useUserStore();
  const { messages, loading, sendMessage } = useGroupChat(helpId);

  const [text, setText] = useState('');
  const flatRef = useRef();

  // Scroll to bottom auto
  useEffect(() => {
    if (messages.length && flatRef.current) flatRef.current.scrollToEnd({ animated: true });
  }, [messages]);

  const handleSend = async () => {
    if (text.trim().length === 0) return;
    await sendMessage({
      helpId,
      fromUserId: user.id,
      fromApelido: user.apelido,
      text
    });
    setText('');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex:1, backgroundColor:'#181A20' }}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat da Ajuda</Text>
      </View>
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[
            styles.msgBubble,
            item.fromUserId === user.id ? styles.myMsg : styles.otherMsg
          ]}>
            <UserCircle size={22} color={item.fromUserId === user.id ? "#22C55E" : "#36C5FF"} style={{marginRight:6}}/>
            <View>
              <Text style={styles.msgUser}>{item.fromApelido}</Text>
              <Text style={styles.msgText}>{item.text}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={{padding: 16, paddingBottom:80}}
        ListEmptyComponent={() => loading ? <Text style={{color:'#bbb',alignSelf:'center'}}>Carregando…</Text> : <Text style={{color:'#bbb'}}>Nenhuma mensagem ainda.</Text>}
      />
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          style={styles.input}
          placeholder="Digite sua mensagem…"
          placeholderTextColor="#888"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Send color="#fff" size={26}/>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  header: { padding:18, borderBottomWidth:1, borderColor:'#222', backgroundColor:'#23262F' },
  title: { color:'#fff', fontSize:18, fontWeight:'bold' },
  msgBubble: { flexDirection:'row', alignItems:'flex-end', marginBottom:11 },
  myMsg: { alignSelf:'flex-end' },
  otherMsg: { alignSelf:'flex-start' },
  msgUser: { color:'#36C5FF', fontWeight:'bold', fontSize:13 },
  msgText: { color:'#fff', fontSize:16, marginTop:2, maxWidth: 230 },
  inputRow: { flexDirection:'row', padding:14, backgroundColor:'#23262F', alignItems:'center', position:'absolute', bottom:0, left:0, right:0 },
  input: { flex:1, borderRadius: 8, backgroundColor:'#202228', color:'#fff', padding:10, marginRight:10, fontSize:16 },
  sendBtn: { backgroundColor:'#22C55E', borderRadius:7, padding:10 }
});
