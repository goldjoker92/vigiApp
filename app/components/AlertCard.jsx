import { View, Text, StyleSheet, Dimensions } from 'react-native';

const CARD_WIDTH = Math.min(320, Dimensions.get('window').width - 36);

export default function AlertCard({ title, subtitle, badge }) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>
      <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    minHeight: 70,
    backgroundColor: '#22252b',
    borderRadius: 18,
    margin: 6,
    padding: 14,
    justifyContent: 'center',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontWeight: 'bold', fontSize: 18, color: '#fff' },
  badge: {
    backgroundColor: '#FF3B30',
    color: '#fff',
    fontWeight: 'bold',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
    fontSize: 14
  },
  subtitle: { color: '#00C859', fontSize: 16, marginTop: 8 }
});
