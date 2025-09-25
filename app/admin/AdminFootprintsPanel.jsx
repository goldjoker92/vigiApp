// app/components/AdminFootprintsPanel.jsx
'use client';

/**
 * AdminFootprintsPanel
 * -----------------------------------------------------------------------------
 * - Bouton "Tout le Brésil" (bbox pays, 90j)
 * - Dropdown par État (UF → bbox), 90j
 * - Mode "Vue carte" (bbox dynamique du viewport, 90j)
 * - Rendu cercles bleus + tooltips (gw.renderLeafletCircles)
 * - Tableau d’agrégats (pays / UF / ville / CEP / rue) avec dédup par alertId
 * - x-api-key optionnelle (non bloquante)
 *
 * Prérequis:
 *  - Tailwind actif (classes utilisées)
 *  - Leaflet chargé et passé via props { map, L }
 *  - NEXT_PUBLIC_ENDPOINT_FOOTPRINTS défini (sinon fallback /getAlertFootprints)
 *
 * Déduplication:
 *  - Un incident est comptabilisé UNE fois (clé = alertId).
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  BRAZIL_BOUNDS,
  renderLeafletCircles,
  loadBrazilFootprints,
  getFootprintsByBBox,
} from '../../services/footprintsGateway';
import { safeForEach } from '../../utils/safeEach';

// BBox approximatives des UFs (lat/lng décimaux)
// NB: ce sont des bornes larges (suffisantes pour stats/heatmap).
const UF_BBOX = {
  AC: { north: -7.09, south: -11.15, east: -66.5, west: -73.99 },
  AL: { north: -8.8, south: -10.6, east: -35.15, west: -38.4 },
  AM: { north: 2.28, south: -9.84, east: -56.1, west: -73.99 },
  AP: { north: 3.88, south: 0.39, east: -49.8, west: -54.0 },
  BA: { north: -8.0, south: -18.45, east: -37.35, west: -46.67 },
  CE: { north: -2.72, south: -7.85, east: -37.25, west: -41.4 },
  DF: { north: -15.45, south: -16.11, east: -47.33, west: -48.3 },
  ES: { north: -17.89, south: -21.3, east: -39.65, west: -41.9 },
  GO: { north: -12.9, south: -19.75, east: -45.5, west: -53.3 },
  MA: { north: -1.02, south: -10.0, east: -41.8, west: -48.9 },
  MG: { north: -14.2, south: -22.95, east: -39.85, west: -51.1 },
  MS: { north: -17.15, south: -24.1, east: -50.9, west: -58.5 },
  MT: { north: -7.18, south: -18.08, east: -50.05, west: -61.25 },
  PA: { north: 1.8, south: -9.61, east: -46.63, west: -58.94 },
  PB: { north: -6.0, south: -8.8, east: -34.8, west: -38.1 },
  PE: { north: -7.5, south: -9.63, east: -34.8, west: -41.4 },
  PI: { north: -2.8, south: -10.9, east: -40.2, west: -45.95 },
  PR: { north: -22.4, south: -26.72, east: -48.0, west: -54.65 },
  RJ: { north: -20.75, south: -23.4, east: -40.85, west: -44.8 },
  RN: { north: -4.8, south: -6.98, east: -34.88, west: -38.65 },
  RO: { north: -8.38, south: -13.7, east: -60.53, west: -66.9 },
  RR: { north: 5.27, south: 0.84, east: -59.65, west: -64.83 },
  RS: { north: -27.08, south: -33.75, east: -49.7, west: -57.75 },
  SC: { north: -25.99, south: -29.35, east: -48.33, west: -53.84 },
  SE: { north: -10.21, south: -11.57, east: -36.4, west: -38.26 },
  SP: { north: -19.75, south: -25.3, east: -44.17, west: -53.1 },
  TO: { north: -5.18, south: -13.7, east: -45.8, west: -50.84 },
};

const UF_LIST = Object.keys(UF_BBOX);

export default function AdminFootprintsPanel({ map, L, apiKey }) {
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('brazil'); // 'brazil' | 'uf' | 'viewport'
  const [uf, setUf] = useState('CE'); // défaut CE (Fortaleza)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const circleLayersRef = useRef([]);

  // Cleanup cercles
  const clearLayers = useCallback(() => {
    if (!map || !circleLayersRef.current?.length) {
      return;
    }
    safeForEach(circleLayersRef.current, (layer) => {
      try {
        map.removeLayer(layer);
      } catch {}
    });
    circleLayersRef.current = [];
  }, [map]);

  // Dédoublonnage → agrégats
  const stats = useMemo(() => {
    // set des alertId uniques
    const uniqIds = new Set();
    const byUF = {};
    const byCity = {};
    const byCEP = {};
    const byStreet = {};

    for (const p of items) {
      const id = p.alertId || p.id;
      if (!id || uniqIds.has(id)) {
        continue;
      }
      uniqIds.add(id);

      const uf = (p.uf || p.estado || '').trim();
      const city = (p.cidade || '').trim();
      const cep = (p.cep || '').trim();
      const rua = (p.endereco || p.ruaNumero || '').trim();

      if (uf) {
        byUF[uf] = (byUF[uf] || 0) + 1;
      }
      if (city) {
        byCity[`${city}${uf ? `/${uf}` : ''}`] = (byCity[`${city}${uf ? `/${uf}` : ''}`] || 0) + 1;
      }
      if (cep) {
        byCEP[cep] = (byCEP[cep] || 0) + 1;
      }
      if (rua) {
        byStreet[rua] = (byStreet[rua] || 0) + 1;
      }
    }

    const toSortedArr = (obj) =>
      Object.entries(obj)
        .map(([k, v]) => ({ k, v }))
        .sort((a, b) => b.v - a.v);

    return {
      total: uniqIds.size,
      byUF: toSortedArr(byUF),
      byCity: toSortedArr(byCity).slice(0, 15),
      byCEP: toSortedArr(byCEP).slice(0, 15),
      byStreet: toSortedArr(byStreet).slice(0, 15),
    };
  }, [items]);

  // Rendu cercles
  const renderCircles = useCallback(
    (points) => {
      if (!map || !L) {
        return;
      }
      clearLayers();
      const layers = renderLeafletCircles({
        L,
        map,
        items: points,
        style: {
          color: '#3B82F6',
          fillColor: '#93C5FD',
          fillOpacity: 0.18,
          weight: 2,
        },
      });
      circleLayersRef.current = layers;
    },
    [L, map, clearLayers]
  );

  // Loaders
  const loadBrazil = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await loadBrazilFootprints({ limit: 10000, apiKey });
      setItems(res.items || []);
      renderCircles(res.items || []);
      // ajuste la vue sur le pays
      if (map && L) {
        map.fitBounds(
          L.latLngBounds(
            [BRAZIL_BOUNDS.south, BRAZIL_BOUNDS.west],
            [BRAZIL_BOUNDS.north, BRAZIL_BOUNDS.east]
          )
        );
      }
    } catch (e) {
      setError(e.message || 'Erreur chargement Brésil');
    } finally {
      setLoading(false);
    }
  }, [apiKey, map, L, renderCircles]);

  const loadUF = useCallback(
    async (ufCode) => {
      try {
        const box = UF_BBOX[ufCode];
        if (!box) {
          setError('UF inconnue');
          return;
        }
        setLoading(true);
        setError('');
        const res = await getFootprintsByBBox({
          ...box,
          sinceDays: 90,
          limit: 6000,
          apiKey,
        });
        setItems(res.items || []);
        renderCircles(res.items || []);
        if (map && L) {
          map.fitBounds(L.latLngBounds([box.south, box.west], [box.north, box.east]));
        }
      } catch (e) {
        setError(e.message || 'Erreur chargement UF');
      } finally {
        setLoading(false);
      }
    },
    [apiKey, map, L, renderCircles]
  );

  const loadViewport = useCallback(async () => {
    if (!map) {
      return;
    }
    try {
      setLoading(true);
      setError('');
      const b = map.getBounds();
      const box = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      };
      const res = await getFootprintsByBBox({
        ...box,
        sinceDays: 90,
        limit: 6000,
        apiKey,
      });
      setItems(res.items || []);
      renderCircles(res.items || []);
    } catch (e) {
      setError(e.message || 'Erreur chargement viewport');
    } finally {
      setLoading(false);
    }
  }, [apiKey, map, renderCircles]);

  // Mount: charge Brésil par défaut
  useEffect(() => {
    if (map && L) {
      loadBrazil();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, L]);

  // Si mode viewport, recharge au moveend
  useEffect(() => {
    if (!map || mode !== 'viewport') {
      return;
    }
    const onEnd = () => loadViewport();
    map.on('moveend', onEnd);
    return () => map.off('moveend', onEnd);
  }, [map, mode, loadViewport]);

  return (
    <div className="absolute top-4 right-4 bg-gray-900 text-white rounded-xl shadow-lg p-4 w-[380px] z-[1000]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">📊 Footprints</h2>
        <span className="text-xs text-gray-400">90 dias</span>
      </div>

      {/* Contrôles */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setMode('brazil');
              loadBrazil();
            }}
            className={`px-3 py-2 rounded-md text-sm font-semibold transition ${
              mode === 'brazil' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            🇧🇷 Tout le Brésil
          </button>

          <button
            onClick={() => {
              setMode('viewport');
              loadViewport();
            }}
            className={`px-3 py-2 rounded-md text-sm font-semibold transition ${
              mode === 'viewport' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            🗺️ Vue carte
          </button>
        </div>

        <div className="flex gap-2 items-center">
          <select
            value={uf}
            onChange={(e) => setUf(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-md px-2 py-2 text-sm w-28"
          >
            {UF_LIST.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setMode('uf');
              loadUF(uf);
            }}
            className={`px-3 py-2 rounded-md text-sm font-semibold transition ${
              mode === 'uf' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            🔎 Charger l’état
          </button>
        </div>
      </div>

      {/* Status */}
      {loading && <p className="text-sm text-blue-400 mb-2">Chargement…</p>}
      {error && <p className="text-sm text-red-400 mb-2">{error}</p>}

      {/* KPIs / Stats */}
      <div className="bg-gray-800 rounded-lg p-3 mb-3">
        <div className="text-sm">
          Incidents (dédupliqués) : <span className="font-bold text-blue-400">{stats.total}</span>
        </div>
      </div>

      {/* Tableaux (limités pour rester lisibles) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="font-semibold text-sm mb-2">Par État (UF)</div>
          <div className="max-h-40 overflow-y-auto text-xs space-y-1">
            {stats.byUF.slice(0, 15).map((r) => (
              <div key={r.k} className="flex justify-between">
                <span className="text-gray-300">{r.k}</span>
                <span className="font-semibold">{r.v}</span>
              </div>
            ))}
            {stats.byUF.length === 0 && <div className="text-gray-500 text-xs">—</div>}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-3">
          <div className="font-semibold text-sm mb-2">Top villes</div>
          <div className="max-h-40 overflow-y-auto text-xs space-y-1">
            {stats.byCity.map((r) => (
              <div key={r.k} className="flex justify-between">
                <span className="text-gray-300">{r.k}</span>
                <span className="font-semibold">{r.v}</span>
              </div>
            ))}
            {stats.byCity.length === 0 && <div className="text-gray-500 text-xs">—</div>}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-3">
          <div className="font-semibold text-sm mb-2">Top CEP</div>
          <div className="max-h-40 overflow-y-auto text-xs space-y-1">
            {stats.byCEP.map((r) => (
              <div key={r.k} className="flex justify-between">
                <span className="text-gray-300">{r.k}</span>
                <span className="font-semibold">{r.v}</span>
              </div>
            ))}
            {stats.byCEP.length === 0 && <div className="text-gray-500 text-xs">—</div>}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-3">
          <div className="font-semibold text-sm mb-2">Top rues</div>
          <div className="max-h-40 overflow-y-auto text-xs space-y-1">
            {stats.byStreet.map((r) => (
              <div key={r.k} className="flex justify-between">
                <span className="text-gray-300">{r.k}</span>
                <span className="font-semibold">{r.v}</span>
              </div>
            ))}
            {stats.byStreet.length === 0 && <div className="text-gray-500 text-xs">—</div>}
          </div>
        </div>
      </div>

      {/* Hint */}
      <div className="text-[11px] text-gray-500 mt-3">
        Survolez les cercles pour voir: incident, date/heure, adresse, alertId, userId.
      </div>
    </div>
  );
}
