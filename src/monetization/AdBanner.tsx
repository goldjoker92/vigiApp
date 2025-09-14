import React from "react";
import { View, ViewStyle } from "react-native";
import {
  BannerAd,
  BannerAdSize,
  TestIds,
} from "react-native-google-mobile-ads";

const DEFAULT_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : "ca-app-pub-3940256099942544/6300978111"; // Remplace par ton vrai ID en prod

type Props = {
  unitId?: string;
  size?: string;
  style?: ViewStyle | ViewStyle[];
};

export default function AdBanner({
  unitId = DEFAULT_UNIT_ID,
  size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
  style,
}: Props) {
  return (
    <View style={[{ alignItems: "center", justifyContent: "center" }, style]}>
      <BannerAd unitId={unitId} size={size} />
    </View>
  );
}
