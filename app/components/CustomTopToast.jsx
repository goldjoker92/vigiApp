import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Vibration } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

const CustomTopToast = ({ text1, props }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Vibration.vibrate([0, 40, 40, 40]);
    Animated.timing(progress, {
      toValue: 1,
      duration: props?.duration || 4000,
      useNativeDriver: false,
    }).start();
  }, [progress, props?.duration]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['100%', '0%'],
  });

  return (
    <View style={styles.toastContainer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center' }}>
        <FontAwesome name="exclamation-circle" size={25} color="#FFD700" style={{ marginRight: 10 }} />
        <Text style={styles.toastText}>{text1}</Text>
      </View>
      <Animated.View style={[styles.progressBar, { width }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    width: '94%',
    alignSelf: 'center',
    backgroundColor: '#00C859',
    padding: 18,
    borderRadius: 12,
    marginTop: 35,
    marginBottom: 5,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#00C859',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    position: 'relative',
  },
  toastText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 17,
    textAlign: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#00C859',
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
});

export default CustomTopToast;
