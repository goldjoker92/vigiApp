import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Vibration, Dimensions } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function CustomTopToast({
  text1,
  duration = 4000,
  textColor = '#fff',
  containerStyle = {},
}) {
  const slideAnim = useRef(new Animated.Value(-80)).current; // start above
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Vibre quand le toast apparaît
    Vibration.vibrate([0, 40, 40, 40]);

    // Slide in
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 14,
    }).start();

    // Progress bar
    Animated.timing(progress, {
      toValue: 1,
      duration: duration,
      useNativeDriver: false,
    }).start();

    const hideTimeout = setTimeout(() => {
      Animated.timing(slideAnim, {
        toValue: -80,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }, duration - 200);
    return () => clearTimeout(hideTimeout);
  }, [slideAnim, progress, duration]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['100%', '0%'],
  });

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          transform: [{ translateY: slideAnim }],
          ...containerStyle,
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.row}>
        <FontAwesome
          name="exclamation-circle"
          size={25}
          color="#FFD700"
          style={{ marginRight: 10 }}
        />
        <Text style={[styles.toastText, { color: textColor }]}>{text1}</Text>
      </View>
      <Animated.View style={[styles.progressBar, { width }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    width: SCREEN_WIDTH * 0.94,
    alignSelf: 'center',
    backgroundColor: '#181A20',
    padding: 18,
    borderRadius: 12,
    marginTop: 30,
    alignItems: 'center',
    elevation: 7,
    shadowColor: '#00C859',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  toastText: {
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
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
});
