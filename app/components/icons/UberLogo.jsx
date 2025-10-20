// app/components/icons/UberLogo.jsx
// Minimal Uber badge (fond noir arrondi + "U" nette) en SVG
// - Taille contrôlée par props size (par défaut 22)
// - Couleurs brand: fond #000, tracé #FFF

import React from 'react';
import Svg, { Rect, Path } from 'react-native-svg';

export default function UberLogo({ size = 22, bg = '#000', fg = '#FFF', radius = 6 }) {
  const s = Number(size);
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Rect x="1" y="1" width="22" height="22" rx={radius} fill={bg} />
      {/* "U" stylisée, épaisse et centrée */}
      <Path d="M8 6v8a4 4 0 0 0 4 4h5v-2h-5a2 2 0 0 1-2-2V6H8Z" fill={fg} />
    </Svg>
  );
}
