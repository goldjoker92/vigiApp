// components/map/GeoFilters.jsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function GeoFilters({ estado, pais, onEstado, onPais, topOffset = 48 }) {
  const insets = useSafeAreaInsets();
  const top = insets.top + topOffset;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top }]}>
      <View style={styles.box}>
        <Picker
          selectedValue={estado}
          onValueChange={onEstado}
          dropdownIconColor="#fff"
          style={styles.picker}
        >
          <Picker.Item label="État" value="" />
          <Picker.Item label="Ceará" value="CE" />
          <Picker.Item label="São Paulo" value="SP" />
          <Picker.Item label="Rio de Janeiro" value="RJ" />
        </Picker>
      </View>

      <View style={[styles.box, { marginLeft: 8 }]}>
        <Picker
          selectedValue={pais}
          onValueChange={onPais}
          dropdownIconColor="#fff"
          style={styles.picker}
        >
          <Picker.Item label="Pays" value="" />
          <Picker.Item label="Brasil" value="BR" />
          <Picker.Item label="Argentina" value="AR" />
          <Picker.Item label="Chile" value="CL" />
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,          // <— on élargit, la barre radar est centrée
    flexDirection: "row",
    zIndex: 28,
    elevation: 28,
  },
  box: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 12,
    overflow: "hidden",
  },
  picker: {
    color: "#fff",
    height: 44,
  },
});
