import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { House, AlertCircle, User } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function CustomTabBar({ state, descriptors, navigation }) {
  const router = useRouter();
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, idx) => {
        const isFocused = state.index === idx;
        let icon;
        if (route.name === 'home') icon = <House color={isFocused ? "#00C859" : "#bbb"} size={26} />;
        if (route.name === 'profile') icon = <User color={isFocused ? "#00C859" : "#bbb"} size={26} />;
        // Sinalizar -> central, spécial
        if (route.name === 'report') return (
          <TouchableOpacity key={route.key} onPress={() => router.push('/report')}
            style={styles.signalBtn}>
            <AlertCircle color="#fff" size={32} />
            <Text style={styles.signalLabel}>Sinalizar</Text>
          </TouchableOpacity>
        );
        return (
          <TouchableOpacity key={route.key} onPress={() => navigation.navigate(route.name)}
            style={styles.tabBtn}>
            {icon}
            <Text style={[styles.tabLabel, isFocused && {color:'#00C859'}]}>
              {descriptors[route.key].options.tabBarLabel}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  tabBar: {
    flexDirection:'row',
    backgroundColor:'rgba(24,26,32,0.97)',
    borderTopLeftRadius:22,
    borderTopRightRadius:22,
    shadowColor:'#000', shadowOpacity:0.12, shadowRadius:9,
    height:78, alignItems:'center', justifyContent:'space-around',
    paddingBottom:10,
    position:'absolute', bottom:0, left:0, right:0, zIndex:5,
  },
  tabBtn: { alignItems:'center', flex:1 },
  tabLabel:{ color:'#bbb', fontSize:13, fontWeight:'600', marginTop:2 },
  signalBtn: {
    backgroundColor:'#007AFF', borderRadius:44, height:64, width:64,
    alignItems:'center', justifyContent:'center', marginBottom: 25, elevation:5,
    shadowColor:'#007AFF', shadowOpacity:0.34, shadowRadius:17,
    position:'absolute', left:'50%', marginLeft:-32, top:-32, zIndex:10,
  },
  signalLabel: { color:'#fff', fontSize:11, fontWeight:'bold', marginTop:4 },
});
