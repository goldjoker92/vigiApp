// app/components/AdminFootprintsPanel.jsx
'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  BRAZIL_BOUNDS,
  renderLeafletCircles,
  loadBrazilFootprints,
  getFootprintsByBBox,
} from '../../services/footprintsGateway';
import { safeForEach } from '../../utils/safeEach';

import {
  getBlockedUsersSnapshotByBlockedUntil,
  getBlockedUsersSnapshotByName,
  getBlockedUsersCount,
} from '../../platform_services/abuse_monitor';

// BBox approximatives des UFs
const UF_BBOX = {
  /* ... (inchangé, garde tout ton objet UF_BBOX ici) ... */
};
// Liste UF
const UF_LIST = Object.keys(UF_BBOX);

// --- Utils: détecte http(s) dans du texte et rend <a> cliquable
function AutoLink({ text }) {
  if (!text) {
    return null;
  }
  const parts = String(text).split(/(https?:\/\/[^\s)]+(?:\/)?)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//i.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * Props ajoutées (optionnelles):
 * - userLinkBase?: string     → ex. 'https://admin.vigiapp/app/users/'  (on append userId)
 * - alertLinkBase?: string    → ex. 'https://admin.vigiapp/app/alerts/' (on append alertId)
 * - openInNewWindow?: boolean → défaut true (sécurité noopener/noreferrer)
 */
export default function AdminFootprintsPanel({
  map,
  L,
  apiKey,
  userLinkBase,
  alertLinkBase,
  openInNewWindow = true,
}) {
  // Onglets
  const [tab, setTab] = useState('footprints'); // 'footprints' | 'blocks'

  // FOOTPRINTS
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('brazil'); // 'brazil' | 'uf' | 'viewport'
  const [uf, setUf] = useState('CE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const circleLayersRef = useRef([]);

  // BLOCAGES
  const [blockOrderKind, setBlockOrderKind] = useState('blockedUntil'); // 'blockedUntil' | 'name'
  const [blockOrderDir, setBlockOrderDir] = useState('asc'); // 'asc' | 'desc'
  // const [blocksTick, setBlocksTick] = useState(0);

  // Nettoyage couches Leaflet
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

  // Agrégats dédupliqués
  const stats = useMemo(() => {
    const uniqIds = new Set();
    const byUF = {},
      byCity = {},
      byCEP = {},
      byStreet = {};
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
        const key = `${city}${uf ? `/${uf}` : ''}`;
        byCity[key] = (byCity[key] || 0) + 1;
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

    // Top 10 alertIds pour liens rapides (si alertLinkBase)
    const topAlertIds = Array.from(uniqIds).slice(0, 10);

    return {
      total: uniqIds.size,
      byUF: toSortedArr(byUF),
      byCity: toSortedArr(byCity).slice(0, 15),
      byCEP: toSortedArr(byCEP).slice(0, 15),
      byStreet: toSortedArr(byStreet).slice(0, 15),
      topAlertIds,
    };
  }, [items]);

  // Rendu des cercles
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
        style: { color: '#3B82F6', fillColor: '#93C5FD', fillOpacity: 0.18, weight: 2 },
      });
      circleLayersRef.current = layers;
    },
    [L, map, clearLayers],
  );

  // Loaders
  const loadBrazil = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await loadBrazilFootprints({ limit: 10000, apiKey });
      setItems(res.items || []);
      renderCircles(res.items || []);
      if (map && L) {
        map.fitBounds(
          L.latLngBounds(
            [BRAZIL_BOUNDS.south, BRAZIL_BOUNDS.west],
            [BRAZIL_BOUNDS.north, BRAZIL_BOUNDS.east],
          ),
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
        const res = await getFootprintsByBBox({ ...box, sinceDays: 90, limit: 6000, apiKey });
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
    [apiKey, map, L, renderCircles],
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
      const res = await getFootprintsByBBox({ ...box, sinceDays: 90, limit: 6000, apiKey });
      setItems(res.items || []);
      renderCircles(res.items || []);
    } catch (e) {
      setError(e.message || 'Erreur chargement viewport');
    } finally {
      setLoading(false);
    }
  }, [apiKey, map, renderCircles]);

  // Mount
  useEffect(() => {
    if (tab === 'footprints' && map && L) {
      loadBrazil();
    }
  }, [tab, map, L, loadBrazil]);

  // Reload viewport on moveend
  useEffect(() => {
    if (!map || tab !== 'footprints' || mode !== 'viewport') {
      return;
    }
    const onEnd = () => loadViewport();
    map.on('moveend', onEnd);
    return () => map.off('moveend', onEnd);
  }, [map, tab, mode, loadViewport]);

  // --- Blocages snapshots (tri + refresh périodique) ---
  const blocksData = useMemo(() => {
    const total = getBlockedUsersCount();
    const list =
      blockOrderKind === 'blockedUntil'
        ? getBlockedUsersSnapshotByBlockedUntil(blockOrderDir)
        : getBlockedUsersSnapshotByName(blockOrderDir);
    return { total, list };
  }, [blockOrderKind, blockOrderDir]);

  // useEffect(() => {
  //   if (tab !== 'blocks') {return;}
  //   const t = setInterval(() => setBlocksTick((x) => x + 1), 30_000);
  //   return () => clearInterval(t);
  // }, [tab]);

  // Helpers liants
  const buildUserHref = (userId) => {
    if (!userLinkBase) {
      return null;
    }
    const base = userLinkBase.endsWith('/') ? userLinkBase : `${userLinkBase}/`;
    return `${base}${encodeURIComponent(String(userId))}`;
  };

  const buildAlertHref = (alertId) => {
    if (!alertLinkBase) {
      return null;
    }
    const base = alertLinkBase.endsWith('/') ? alertLinkBase : `${alertLinkBase}/`;
    return `${base}${encodeURIComponent(String(alertId))}`;
  };

  const Anchor = ({ href, children }) => {
    if (!href) {
      return <>{children}</>;
    }
    return (
      <a
        href={href}
        target={openInNewWindow ? '_blank' : undefined}
        rel={openInNewWindow ? 'noopener noreferrer' : undefined}
        className="text-blue-400 hover:underline"
      >
        {children}
      </a>
    );
  };

  return (
    <div className="absolute top-4 right-4 bg-gray-900 text-white rounded-xl shadow-lg p-4 w-[440px] z-[1000]">
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setTab('footprints')}
          className={`px-3 py-2 rounded-md text-sm font-semibold transition ${tab === 'footprints' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
        >
          📊 Footprints
        </button>
        <button
          onClick={() => setTab('blocks')}
          className={`px-3 py-2 rounded-md text-sm font-semibold transition ${tab === 'blocks' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
        >
          🚫 Blocages
        </button>
        <div className="ml-auto text-xs text-gray-400">
          {tab === 'footprints' ? '90 dias' : 'auto-refresh 30s'}
        </div>
      </div>

      {tab === 'footprints' ? (
        <>
          {/* Contrôles */}
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMode('brazil');
                  loadBrazil();
                }}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition ${mode === 'brazil' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
              >
                🇧🇷 Tout le Brésil
              </button>
              <button
                onClick={() => {
                  setMode('viewport');
                  loadViewport();
                }}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition ${mode === 'viewport' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
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
                className={`px-3 py-2 rounded-md text-sm font-semibold transition ${mode === 'uf' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
              >
                🔎 Charger l’état
              </button>
            </div>
          </div>

          {/* Status */}
          {loading && <p className="text-sm text-blue-400 mb-2">Chargement…</p>}
          {error && (
            <p className="text-sm text-red-400 mb-2">
              <AutoLink text={error} />
            </p>
          )}

          {/* KPIs */}
          <div className="bg-gray-800 rounded-lg p-3 mb-3">
            <div className="text-sm">
              Incidents (dédupliqués) :{' '}
              <span className="font-bold text-blue-400">{stats.total}</span>
            </div>
          </div>

          {/* Tableaux */}
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
                    <span className="text-gray-300">
                      <AutoLink text={r.k} />
                    </span>
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
                    <span className="text-gray-300">
                      <AutoLink text={r.k} />
                    </span>
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
                    <span className="text-gray-300">
                      <AutoLink text={r.k} />
                    </span>
                    <span className="font-semibold">{r.v}</span>
                  </div>
                ))}
                {stats.byStreet.length === 0 && <div className="text-gray-500 text-xs">—</div>}
              </div>
            </div>
          </div>

          {/* Liens rapides d’alertes — si alertLinkBase fourni */}
          {alertLinkBase && stats.topAlertIds.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-3 mt-3">
              <div className="font-semibold text-sm mb-2">Liens rapides (alerts)</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {stats.topAlertIds.map((id) => (
                  <Anchor key={id} href={buildAlertHref(id)}>
                    <span className="inline-block bg-gray-700 px-2 py-1 rounded hover:bg-gray-600">
                      {id}
                    </span>
                  </Anchor>
                ))}
              </div>
            </div>
          )}

          <div className="text-[11px] text-gray-500 mt-3">
            Survolez les cercles pour voir: incident, date/heure, adresse, alertId, userId.
          </div>
        </>
      ) : (
        // --------------------- Onglet BLOCAGES ---------------------
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Blocages (temp ban)</h3>
            <div className="text-sm">
              Total bloqués:{' '}
              <span className="font-bold text-rose-400">{getBlockedUsersCount()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-300">Tri:</label>
            <select
              value={blockOrderKind}
              onChange={(e) => setBlockOrderKind(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs"
            >
              <option value="blockedUntil">Échéance</option>
              <option value="name">Nom</option>
            </select>
            <select
              value={blockOrderDir}
              onChange={(e) => setBlockOrderDir(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs"
            >
              <option value="asc">ASC</option>
              <option value="desc">DESC</option>
            </select>
            {/* <button
              onClick={() => setBlocksTick((x) => x + 1)}
              className="ml-auto px-2 py-1 text-xs rounded-md bg-gray-800 hover:bg-gray-700"
            >
              ↻ Refresh
            </button> */}
          </div>

          <div className="bg-gray-800 rounded-lg p-2 max-h-64 overflow-y-auto text-xs">
            {/* on recalcule à chaque render via blocksTick */}
            {(() => {
              const { list } = blocksData;
              if (!list?.length) {
                return <div className="text-gray-500">— Aucun utilisateur bloqué</div>;
              }
              return (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="py-1 pr-2">User</th>
                      <th className="py-1 pr-2">Apelido</th>
                      <th className="py-1 pr-2">UserId</th>
                      <th className="py-1 pr-2">Reste</th>
                      <th className="py-1 pr-2">Déblocage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((u) => {
                      const href = buildUserHref(u.userId);
                      return (
                        <tr
                          key={`${u.userId}-${u.blockedUntil}`}
                          className="border-t border-gray-700/60"
                        >
                          <td className="py-1 pr-2">
                            {u.name || <span className="text-gray-500">—</span>}
                          </td>
                          <td className="py-1 pr-2">
                            {u.apelido || <span className="text-gray-500">—</span>}
                          </td>
                          <td className="py-1 pr-2 text-gray-300">
                            {href ? (
                              <Anchor href={href}>{String(u.userId)}</Anchor>
                            ) : (
                              <span>{String(u.userId)}</span>
                            )}
                          </td>
                          <td className="py-1 pr-2 font-semibold text-rose-300">{u.leftHuman}</td>
                          <td className="py-1 pr-2 text-gray-300">
                            {new Date(u.blockedUntil).toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>

          <div className="text-[11px] text-gray-500">
            Source: abuse_strikes (mémoire-process). GC interne purge les entrées expirées.
          </div>
        </div>
      )}
    </div>
  );
}
