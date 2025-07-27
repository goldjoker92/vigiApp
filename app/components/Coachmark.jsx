import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COACHMARK_KEY = "coachmark_swipe_grouphelp_v1";

export default function Coachmark({ onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(COACHMARK_KEY).then(val => {
      if (!val) setVisible(true);
    });
  }, []);

  const handleClose = async () => {
    setVisible(false);
    await AsyncStorage.setItem(COACHMARK_KEY, "seen");
    onClose && onClose();
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.box}>
        <Text style={styles.text}>
          Dica: arraste a demanda para o lado para remover do seu feed!
        </Text>
        <TouchableOpacity style={styles.btn} onPress={handleClose}>
          <Text style={styles.btnText}>Ok, entendi!</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute", top: 30, left: 0, right: 0, zIndex: 100,
    alignItems: "center", justifyContent: "center",
  },
  box: {
    backgroundColor: "#ffd600", borderRadius: 18, padding: 21, alignItems: "center", justifyContent: "center",
    minWidth: "66%", maxWidth: 360, alignSelf: "center"
  },
  text: { color: "#222", fontWeight: "bold", fontSize: 16.7, textAlign: "center" },
  btn: { marginTop: 13, backgroundColor: "#222", borderRadius: 12, paddingVertical: 8, paddingHorizontal: 19 },
  btnText: { color: "#ffd600", fontWeight: "bold", fontSize: 15 }
});
