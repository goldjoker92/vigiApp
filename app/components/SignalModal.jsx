import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertCircle, Users } from 'lucide-react-native';

export default function SignalModal({ visible, onClose, onSelect }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalBox}>
          <AlertCircle color="#22C55E" size={38} style={{ marginBottom: 10 }} />
          <Text style={styles.title}>Tipo de sinalização</Text>
          <Text style={styles.desc}>
            Escolha se seu alerta será <Text style={{ color:'#22C55E', fontWeight:'bold' }}>público</Text> (toda a vizinhança)
            {"\n"}ou só para o seu <Text style={{ color:'#007AFF', fontWeight:'bold' }}>grupo privado</Text>.
          </Text>
          <TouchableOpacity style={styles.btnPublic} onPress={() => onSelect('public')}>
            <Text style={styles.btnText}>Sinalizar Público</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnGroup} onPress={() => onSelect('group')}>
            <Users color="#fff" size={19} style={{ marginRight: 6 }} />
            <Text style={styles.btnText}>Sinalizar para seu Grupo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'center', alignItems:'center' },
  modalBox: { backgroundColor:'#23262F', padding:28, borderRadius:20, alignItems:'center', width:330 },
  title: { color:'#fff', fontWeight:'bold', fontSize:19, marginBottom:9 },
  desc: { color:'#bbb', fontSize:15, marginBottom:19, textAlign:'center' },
  btnPublic: { backgroundColor:'#22C55E', padding:14, borderRadius:9, width:'100%', marginBottom:12 },
  btnGroup: { flexDirection:'row', backgroundColor:'#007AFF', padding:14, borderRadius:9, width:'100%', marginBottom:10, alignItems:'center', justifyContent:'center' },
  btnText: { color:'#fff', fontWeight:'bold', fontSize:17, textAlign:'center' },
  btnCancel: { marginTop:8, padding:8 },
  cancelText: { color:'#bbb', fontWeight:'bold', fontSize:16 }
});
