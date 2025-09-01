// components/map/ZoomControls.jsx
import React, { useCallback, useRef } from "react";
import { View, StyleSheet, Platform, Text } from "react-native";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * ZoomControls
 * - Tap: zoom +/- d'un cran
 * - Long press: zoom continu tant que pressé
 * - Boutons ronds, discrets, overlay non-bloquant
 *
 * Props:
 *  - mapRef: ref du MapView (obligatoire)
 *  - bottomOffset: number (px) distance du bas (def: 120)
 *  - side: 'right' | 'left' (def: 'right')
 *  - offset: number (px) marge latérale (def: 12)
 *  - step: incrément de zoom par action (def: 1)
 *  - minZoom: (def: 3)
 *  - maxZoom: (def: 20)
 */
export function ZoomControls({
  mapRef,
  bottomOffset = 120,
  side = "right",
  offset = 12,
  step = 1,
  minZoom = 3,
  maxZoom = 20,
}) {
  const holdTimer = useRef(null);
  const repeatTimer = useRef(null);

  const applyZoom = useCallback(
    async (delta) => {
      const m = mapRef?.current;
      if (!m) return;
      try {
        // getCamera() est supporté par react-native-maps sur iOS/Android
        const camera = await m.getCamera();
        const current = Number.isFinite(camera.zoom) ? camera.zoom : 14;
        const nextZoom = clamp(current + delta, minZoom, maxZoom);
        if (nextZoom === current) return;
        camera.zoom = nextZoom;
        m.animateCamera(camera, { duration: 160 });
      } catch (_) {
        // Fallback minimal si getCamera fait défaut
        try {
          m.animateCamera({ zoom: delta > 0 ? maxZoom : minZoom }, { duration: 160 });
        } catch (_) {}
      }
    },
    [mapRef, minZoom, maxZoom]
  );

  const startContinuous = useCallback(
    (delta) => {
      // Petit délai pour distinguer tap vs long-press, puis répétition
      clearTimeout(holdTimer.current);
      clearInterval(repeatTimer.current);

      holdTimer.current = setTimeout(() => {
        repeatTimer.current = setInterval(() => applyZoom(delta), 120);
      }, 250);
    },
    [applyZoom]
  );

  const stopContinuous = useCallback(() => {
    clearTimeout(holdTimer.current);
    clearInterval(repeatTimer.current);
  }, []);

  const onTap = useCallback(
    (delta) => {
      // Tap unique: zoom d'un cran
      stopContinuous();
      applyZoom(delta * step);
    },
    [applyZoom, step, stopContinuous]
  );

  const sideStyle =
    side === "left"
      ? { left: offset }
      : { right: offset };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: bottomOffset }, sideStyle]}
      accessibilityRole="toolbar"
      accessibilityLabel="Contrôles de zoom"
      testID="ZoomControls"
    >
      <View
        style={styles.btn}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Zoomer"
        onTouchStart={() => startContinuous(step)}
        onTouchEnd={stopContinuous}
        onTouchCancel={stopContinuous}
        onStartShouldSetResponder={() => true}
        onResponderRelease={() => onTap(step)}
      >
        <View>
          <Text style={styles.t}>+</Text>
        </View>
      </View>
      <View
        style={[styles.btn, styles.btnBelow]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Dézoomer"
        onTouchStart={() => startContinuous(-step)}
        onTouchEnd={stopContinuous}
        onTouchCancel={stopContinuous}
        onStartShouldSetResponder={() => true}
        onResponderRelease={() => onTap(-step)}
      >
        <View>
          <Text style={styles.t}>-</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 25,
    elevation: 25,
    alignItems: "center",
  },
  btn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.60)",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
    // ombre légère
    shadowColor: "#000",
    shadowOpacity: Platform.select({ ios: 0.25, android: 0.35 }),
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  btnBelow: {
    marginTop: 8,
  },
  btnPressed: {
    transform: [{ scale: 0.92 }],
  },
  t: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    includeFontPadding: false,
  },
});

export default ZoomControls;
