import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import Purchases from "react-native-purchases";
import { useMonetizationStore } from "../../src/monetization/store";
import AdBanner from "../../src/monetization/AdBanner";
import { preloadInterstitial, showInterstitialIfAllowed } from "../../src/monetization/interstitial";

export default function MonetizationTest() {
  const isPro = useMonetizationStore((s) => s.isPro);
  const offerings = useMonetizationStore((s) => s.offerings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { preloadInterstitial(); }, []);

  const refresh = async () => {
    setBusy(true);
    try {
      const [off, ci] = await Promise.all([Purchases.getOfferings(), Purchases.getCustomerInfo()]);
      useMonetizationStore.getState().setOfferings(off);
      useMonetizationStore.getState().applyCustomerInfo(ci, "pro");
      setMsg("Refresh OK");
    } catch (e) { setMsg(`Refresh error: ${e?.message}`); } finally { setBusy(false); }
  };

  const buy = async (pkg) => {
    setBusy(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      useMonetizationStore.getState().applyCustomerInfo(customerInfo, "pro");
      setMsg("Achat OK");
    } catch (e) { setMsg(`Achat annulé/erreur: ${e?.message || e}`); } finally { setBusy(false); }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const ci = await Purchases.restorePurchases();
      useMonetizationStore.getState().applyCustomerInfo(ci, "pro");
      setMsg("Restore OK");
    } catch (e) { setMsg(`Restore error: ${e?.message}`); } finally { setBusy(false); }
  };

  const pkgs = offerings?.current?.availablePackages || [];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "bold" }}>Monetization Test</Text>
      <Text>isPro: {String(isPro)}</Text>

      <Pressable onPress={() => showInterstitialIfAllowed()} style={{ backgroundColor: "#0A84FF", padding: 12, borderRadius: 8 }}>
        <Text style={{ color: "#fff", textAlign: "center" }}>Interstitiel (si non-pro)</Text>
      </Pressable>

      <AdBanner />

      <Pressable onPress={refresh} disabled={busy} style={{ backgroundColor: "#222", padding: 10, borderRadius: 8 }}>
        <Text style={{ color: "#fff", textAlign: "center" }}>{busy ? "…" : "Rafraîchir offres & statut"}</Text>
      </Pressable>

      {pkgs.length === 0 ? (
        <Text style={{ color: "#999" }}>Aucune offre RevenueCat (vérifie Play Console + RC).</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {pkgs.map((p) => (
            <Pressable key={p.identifier} onPress={() => buy(p)} disabled={busy} style={{ backgroundColor: "#34C759", padding: 12, borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>
                Acheter {p.product.title} — {p.product.priceString}
              </Text>
              {!!p.product.description && <Text style={{ color: "#f0f0f0", fontSize: 12 }}>{p.product.description}</Text>}
            </Pressable>
          ))}
        </View>
      )}

      <Pressable onPress={restore} disabled={busy} style={{ backgroundColor: "#444", padding: 10, borderRadius: 8 }}>
        <Text style={{ color: "#fff", textAlign: "center" }}>Restaurer achats</Text>
      </Pressable>

      {!!msg && <Text style={{ color: "#888" }}>{msg}</Text>}
    </ScrollView>
  );
}
