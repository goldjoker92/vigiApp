// libsMissing/geoTiles.js
// Carroyage léger ~5km — NS: [Missing][Geo]
const NS = '[Missing][Geo]';
const TILE_STEP_LAT = 0.05; // ~5.5 km
const TILE_STEP_LNG = 0.05; // ~5.5 km à l’équateur (OK pour BR)

function tileKey(lat, lng) {
  const i = Math.round(lat / TILE_STEP_LAT);
  const j = Math.round(lng / TILE_STEP_LNG);
  return `t_${i}_${j}`;
}
function tilesForRadius(lat, lng) {
  const i = Math.round(lat / TILE_STEP_LAT),
    j = Math.round(lng / TILE_STEP_LNG);
  const out = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      out.push(`t_${i + di}_${j + dj}`);
    }
  }
  console.log(NS, 'tiles', { center: tileKey(lat, lng), count: out.length });
  return out;
}

module.exports = { tileKey, tilesForRadius };
