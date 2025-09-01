// components/map/RadiusBar.jsx
import React from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

const { width } = Dimensions.get("window");

export default function RadiusBar({
  value,
  onChange,
  options = [1, 2, 5],
  stickOffset = 0, // si tu veux un petit écart sous le header
}) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const padH = Math.max(8, Math.min(20, width * 0.04)); // responsive padding

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + headerHeight + stickOffset, // collé au header
          paddingHorizontal: padH,
        },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <View style={styles.tag}>
          <Text style={styles.tagText}>RAIO</Text>
        </View>

        {options.map((km) => {
          const active = value === km;
          return (
            <Pressable
              key={km}
              onPress={() => onChange?.(km)}
              style={[styles.btn, active && styles.btnActive]}
              android_ripple={{ color: "#00000022", borderless: true }}
            >
              <Text style={[styles.btnText, active && styles.btnTextActive]}>
                {km} km
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1000, // au-dessus de la carte
  },
  row: {
    alignItems: "center",
    gap: 8,
  },
  tag: {
    backgroundColor: "#111",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    opacity: 0.9,
  },
  tagText: {
    color: "#fff",
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  btn: {
    backgroundColor: "#222",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    opacity: 0.95,
  },
  btnActive: {
    backgroundColor: "#fff",
    borderColor: "#fff",
  },
  btnText: {
    color: "#ddd",
    fontWeight: "700",
  },
  btnTextActive: {
    color: "#111",
  },
});
