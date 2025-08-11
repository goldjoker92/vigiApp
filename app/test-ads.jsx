import React from "react";
import { SafeAreaView, View, Text } from "react-native";
import { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";

export default function TestAds() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#121212" }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "600" }}>
          Bannière AdMob (TEST)
        </Text>
        <Text style={{ color: "#bbb" }}>
          Si tout est bien configuré, tu devrais voir “Test Ad”.
        </Text>
      </View>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <BannerAd unitId={TestIds.BANNER} size={BannerAdSize.ADAPTIVE_BANNER} />
      </View>
    </SafeAreaView>
  );
}
