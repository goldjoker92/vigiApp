// components/CustomToast.jsx
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

export default function CustomToast({ text1, type }) {
  const width = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: 0,
      duration: 3400,
      useNativeDriver: false,
    }).start();
  }, []);

  const bgColor =
    type === "success"
      ? "#22C55E"
      : type === "error"
      ? "#FF4D4F"
      : "#36C5FF";

  return (
    <View style={[styles.toastContainer, { borderLeftColor: bgColor }]}>
      <Text style={styles.text}>{text1}</Text>
      <Animated.View
        style={[
          styles.bar,
          {
            backgroundColor: bgColor,
            width: width.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    minWidth: 220,
    maxWidth: 340,
    borderRadius: 10,
    marginTop: 12,
    marginHorizontal: 8,
    padding: 15,
    backgroundColor: "#23262F",
    borderLeftWidth: 7,
    position: "relative",
    justifyContent: "center"
  },
  text: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  bar: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 3,
    borderRadius: 3,
  },
});
