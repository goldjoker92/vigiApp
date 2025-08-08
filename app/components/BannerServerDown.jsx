// src/components/BannerServerDown.js
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

export default function BannerServerDown() {
  return (
    <View style={styles.banner}>
      <MaterialIcons name="error-outline" size={28} color="#FFD600" style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Servidor indisponível</Text>
        <Text style={styles.desc}>
          Desculpe, não foi possível conectar ao servidor agora.
          Algumas funções estão temporariamente inativas.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#23262F",
    borderBottomWidth: 2,
    borderBottomColor: "#FFD600",
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 0,
    shadowColor: "#FFD600",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    zIndex: 1000,
  },
  title: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 17,
    marginBottom: 2,
  },
  desc: {
    color: "#fff",
    fontSize: 13.7,
    marginTop: 1,
    fontWeight: "400",
    lineHeight: 18,
  },
});
