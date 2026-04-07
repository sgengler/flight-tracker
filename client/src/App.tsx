import { useEffect, useMemo, useRef, useState } from 'react';
import { useFlightStream } from './hooks/useFlightStream';
import { useFlightInfo } from './hooks/useFlightInfo';
import { FlightCard } from './components/FlightCard';
import { FlightMap, categorizeAircraft, MILITARY_CATS } from './components/FlightMap';
import { aircraftTypeName } from './utils';
import { ShutdownButton } from './components/ShutdownButton';
import { useAutoReload } from './hooks/useAutoReload';


// Default fallback location (Chesterbrook, PA)
const DEFAULT_LAT = 40.074845;
const DEFAULT_LON = -75.457016;

type GeoState =
  | { phase: 'granted'; lat: number; lon: number };

function useGeolocation(): GeoState {
  const params = new URLSearchParams(window.location.search);
  const lat = parseFloat(params.get('lat') ?? '');
  const lon = parseFloat(params.get('lon') ?? '');
  if (!isNaN(lat) && !isNaN(lon)) {
    return { phase: 'granted', lat, lon };
  }
  return { phase: 'granted', lat: DEFAULT_LAT, lon: DEFAULT_LON };
}


type FilterCategory = 'jet' | 'prop' | 'small' | 'heli' | 'military' | 'police'
  | 'fighter' | 'bomber' | 'transport' | 'attack' | 'uav' | 'mil-heli';

const NORMAL_CATEGORIES = new Set<FilterCategory>(['jet', 'prop', 'small', 'heli', 'military', 'police']);
const MILITARY_CATEGORIES = new Set<FilterCategory>(['fighter', 'bomber', 'transport', 'attack', 'uav', 'mil-heli']);

const LEGEND_ENTRIES: { category: FilterCategory; label: string; desc: string; svg: string }[] = [
  {
    category: 'jet',
    label: 'Jet / Airliner',
    desc: 'Commercial & business jets',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-18 L4,-8 L18,2 L18,7 L4,1 L3,14 L8,15 L8,18 L0,16 L-8,18 L-8,15 L-3,14 L-4,1 L-18,7 L-18,2 L-4,-8 Z" fill="#facc15" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  },
  {
    category: 'prop',
    label: 'Turboprop',
    desc: 'Regional turboprop airliners (ATR, Dash-8…)',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-18 L3,-8 L3,-4 L16,0 L16,4 L3,3 L3,14 L7,15 L7,18 L0,16 L-7,18 L-7,15 L-3,14 L-3,3 L-16,4 L-16,0 L-3,-4 L-3,-8 Z" fill="#facc15" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  },
  {
    category: 'small',
    label: 'Private / Charter',
    desc: 'GA & light jets (Cessna, Piper, Citation, Learjet…)',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-17 L2.5,-13 L2.5,-4 L14,0 L14,3.5 L2.5,1.5 L2.5,12 L5.5,13 L5.5,16 L0,17 L-5.5,16 L-5.5,13 L-2.5,12 L-2.5,1.5 L-14,3.5 L-14,0 L-2.5,-4 L-2.5,-13 Z" fill="#facc15" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  },
  {
    category: 'heli',
    label: 'Helicopter',
    desc: 'Rotorcraft',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><rect x="-20" y="-2" width="40" height="4" rx="2" fill="#facc15" stroke="rgba(0,0,0,0.7)" stroke-width="0.8"/><rect x="-2" y="-20" width="4" height="40" rx="2" fill="#facc15" stroke="rgba(0,0,0,0.7)" stroke-width="0.8"/><circle cx="0" cy="0" r="3" fill="#facc15" stroke="rgba(0,0,0,0.85)" stroke-width="1"/><path d="M0,-11 C5,-11 8,-5 8,1 C8,7 5,11 0,13 C-5,11 -8,7 -8,1 C-8,-5 -5,-11 0,-11 Z" fill="#facc15" stroke="rgba(0,0,0,0.85)" stroke-width="1.5"/><rect x="-1.5" y="12" width="3" height="10" rx="1" fill="#facc15" stroke="rgba(0,0,0,0.7)" stroke-width="0.8"/><rect x="-8" y="19" width="16" height="3" rx="1.5" fill="#facc15" stroke="rgba(0,0,0,0.7)" stroke-width="0.8"/></svg>`,
  },
  {
    category: 'military',
    label: 'Military',
    desc: 'Fighter jets, bombers, military transports & UAVs',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-20 L2,-14 L3,-3 L20,10 L15,15 L3,9 L3,14 L6,17 L2,19 L0,20 L-2,19 L-6,17 L-3,14 L-3,9 L-15,15 L-20,10 L-3,-3 L-2,-14 Z" fill="#4ade80" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  },
  {
    category: 'police',
    label: 'Police / Law Enforcement',
    desc: 'Police, sheriff & public safety aircraft',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-18 L4,-8 L18,2 L18,7 L4,1 L3,14 L8,15 L8,18 L0,16 L-8,18 L-8,15 L-3,14 L-4,1 L-18,7 L-18,2 L-4,-8 Z" fill="#60a5fa" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  },
];

const MIL_COLOR = '#4ade80';
const MIL_STROKE = 'stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round"';
const MILITARY_LEGEND_ENTRIES: { category: FilterCategory; label: string; desc: string; svg: string }[] = [
  {
    category: 'fighter',
    label: 'Fighter',
    desc: 'F-14, F-15, F-16, F-22, F-35, T-38…',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-20 L2,-14 L3,-3 L20,10 L15,15 L3,9 L3,14 L6,17 L2,19 L0,20 L-2,19 L-6,17 L-3,14 L-3,9 L-15,15 L-20,10 L-3,-3 L-2,-14 Z" fill="${MIL_COLOR}" ${MIL_STROKE}/></svg>`,
  },
  {
    category: 'bomber',
    label: 'Bomber',
    desc: 'B-52, B-1B, B-2…',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-13 L2,-7 L3,-1 L22,6 L21,10 L3,5 L2.5,13 L5.5,14 L5.5,17 L0,15 L-5.5,17 L-5.5,14 L-2.5,13 L-3,5 L-21,10 L-22,6 L-3,-1 L-2,-7 Z" fill="${MIL_COLOR}" ${MIL_STROKE}/></svg>`,
  },
  {
    category: 'transport',
    label: 'Transport / Tanker',
    desc: 'C-17, C-130, KC-135, E-3, P-8…',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-17 L3,-9 L5,-6 L20,2 L20,7 L5,2 L4,14 L8,15 L8,18 L0,16 L-8,18 L-8,15 L-4,14 L-5,2 L-20,7 L-20,2 L-5,-6 L-3,-9 Z" fill="${MIL_COLOR}" ${MIL_STROKE}/></svg>`,
  },
  {
    category: 'attack',
    label: 'Attack / Gunship',
    desc: 'A-10, AC-130…',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-18 L2,-12 L3,-1 L19,2 L19,6 L3,1 L4.5,13 L8,14 L7,17 L0,16 L-7,17 L-8,14 L-4.5,13 L-3,1 L-19,6 L-19,2 L-3,-1 L-2,-12 Z" fill="${MIL_COLOR}" ${MIL_STROKE}/></svg>`,
  },
  {
    category: 'uav',
    label: 'UAV / Recon',
    desc: 'MQ-9, RQ-4, U-2, SR-71…',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-10 L1,-5 L2,-1 L25,3 L25,6 L2,2 L1.5,11 L4,12 L4,14 L0,13 L-4,14 L-4,12 L-1.5,11 L-2,2 L-25,6 L-25,3 L-2,-1 L-1,-5 Z" fill="${MIL_COLOR}" ${MIL_STROKE}/></svg>`,
  },
  {
    category: 'mil-heli',
    label: 'Helicopter',
    desc: 'UH-60 Black Hawk, CH-47 Chinook, AH-64 Apache…',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><rect x="-20" y="-2" width="40" height="4" rx="2" fill="${MIL_COLOR}" stroke="rgba(0,0,0,0.7)" stroke-width="0.8"/><rect x="-2" y="-20" width="4" height="40" rx="2" fill="${MIL_COLOR}" stroke="rgba(0,0,0,0.7)" stroke-width="0.8"/><circle cx="0" cy="0" r="3" fill="${MIL_COLOR}" stroke="rgba(0,0,0,0.85)" stroke-width="1"/><path d="M0,-11 C5,-11 8,-5 8,1 C8,7 5,11 0,13 C-5,11 -8,7 -8,1 C-8,-5 -5,-11 0,-11 Z" fill="${MIL_COLOR}" stroke="rgba(0,0,0,0.85)" stroke-width="1.5"/><rect x="-1.5" y="12" width="3" height="10" rx="1" fill="${MIL_COLOR}" stroke="rgba(0,0,0,0.7)" stroke-width="0.8"/><rect x="-8" y="19" width="16" height="3" rx="1.5" fill="${MIL_COLOR}" stroke="rgba(0,0,0,0.7)" stroke-width="0.8"/></svg>`,
  },
];

const MAX_HISTORY = 300; // ~50 minutes at 10s poll

type FullscreenPanel = 'map' | 'flights' | 'card' | null;

function ExpandBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-white/10 transition-colors" title="Expand">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <path d="M0 0h4v1.5H1.5V4H0V0zm8 0h4v4h-1.5V1.5H8V0zM0 8h1.5v2.5H4V12H0V8zm10.5 2.5V8H12v4H8v-1.5h2.5z"/>
      </svg>
    </button>
  );
}

function CollapseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 text-slate-300 hover:bg-white/15 hover:text-white transition-colors text-xs font-medium" title="Exit fullscreen">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <path d="M3.5 0H5v5H0V3.5h3.5V0zM7 0h1.5v3.5H12V5H7V0zM0 7h5v5H3.5V8.5H0V7zm7 0h5v1.5H8.5V12H7V7z"/>
      </svg>
      Exit fullscreen
    </button>
  );
}

function Dashboard({ lat, lon }: { lat: number; lon: number }) {
  const [militaryMode, setMilitaryMode] = useState(false);
  const { flight, flights, status } = useFlightStream(lat, lon, militaryMode ? 'military' : 'normal');
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
  const allCategories = militaryMode ? MILITARY_CATEGORIES : NORMAL_CATEGORIES;
  const [activeCategories, setActiveCategories] = useState<Set<FilterCategory>>(NORMAL_CATEGORIES);
  const [fullscreenPanel, setFullscreenPanel] = useState<FullscreenPanel>(null);
  const flightHistoryRef = useRef<Map<string, [number, number][]>>(new Map());
  const [selectedTrail, setSelectedTrail] = useState<[number, number][]>([]);

  // Reset active categories whenever mode changes
  useEffect(() => {
    setActiveCategories(militaryMode ? MILITARY_CATEGORIES : NORMAL_CATEGORIES);
  }, [militaryMode]);

  const toggleCategory = (cat: FilterCategory) => {
    setActiveCategories(prev => {
      // From "show all", clicking one isolates to just that type
      if (prev.size === allCategories.size) return new Set([cat]);
      const next = new Set(prev);
      if (next.has(cat)) {
        // If it's the only active category, clicking it reverts to show all
        if (next.size === 1) return allCategories;
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  // Count flights by category from the full (unfiltered) list
  const categoryCounts = useMemo(() => {
    const counts = new Map<FilterCategory, number>();
    for (const f of flights) {
      const raw = categorizeAircraft(f.aircraftType);
      const cat: FilterCategory = f.isPolice
        ? 'police'
        : militaryMode
          ? raw as FilterCategory   // use sub-type directly in military mode
          : MILITARY_CATS.has(raw) ? 'military' : raw as FilterCategory;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [flights, militaryMode]);

  // Military aircraft present in the full (unfiltered) flight list
  const militaryFlights = useMemo(() =>
    flights.filter(f => !f.isPolice && MILITARY_CATS.has(categorizeAircraft(f.aircraftType))),
    [flights]
  );

  // Police aircraft present in the full (unfiltered) flight list
  const policeFlights = useMemo(() =>
    flights.filter(f => f.isPolice),
    [flights]
  );

  // Filter flights by active categories
  const displayFlights = useMemo(() => {
    if (activeCategories.size === allCategories.size) return flights;
    return flights.filter(f => {
      if (f.isPolice) return activeCategories.has('police');
      const raw = categorizeAircraft(f.aircraftType);
      const cat: FilterCategory = militaryMode
        ? raw as FilterCategory
        : MILITARY_CATS.has(raw) ? 'military' : raw as FilterCategory;
      return activeCategories.has(cat);
    });
  }, [flights, activeCategories, allCategories, militaryMode]);

  // Accumulate position history for every flight on each poll
  useEffect(() => {
    for (const f of flights) {
      const prev = flightHistoryRef.current.get(f.icao24) ?? [];
      const last = prev[prev.length - 1];
      if (!last || last[0] !== f.latitude || last[1] !== f.longitude) {
        const next = [...prev, [f.latitude, f.longitude] as [number, number]];
        flightHistoryRef.current.set(f.icao24, next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next);
      }
    }
    const icao = (selectedIcao ?? flight?.icao24) ?? null;
    if (icao) setSelectedTrail(flightHistoryRef.current.get(icao) ?? []);
  }, [flights]);

  // When the selected flight changes, load its accumulated history
  useEffect(() => {
    const icao = (selectedIcao ?? flight?.icao24) ?? null;
    setSelectedTrail(icao ? (flightHistoryRef.current.get(icao) ?? []) : []);
  }, [selectedIcao, flight?.icao24]);

  // Use manually selected flight if still visible, otherwise fall back to closest visible
  const selectedFlight = (selectedIcao ? displayFlights.find(f => f.icao24 === selectedIcao) : null) ?? displayFlights[0] ?? null;
  const info = useFlightInfo(selectedFlight?.icao24 ?? null, selectedFlight?.aircraftType ? (aircraftTypeName(selectedFlight.aircraftType) ?? null) : null);

  return (
    <div className="h-full flex flex-col bg-slate-900 relative">
      <div className="flex-1 flex flex-col md:flex-row gap-2 p-2 overflow-hidden min-h-0">
        {/* Map + flight list — hidden when card is fullscreen */}
        {fullscreenPanel !== 'card' && (
        <div className={`${fullscreenPanel ? 'flex-1' : 'flex-[3]'} flex flex-col gap-2 min-h-0 min-w-0`}>

          {/* Map — hidden when flights is fullscreen */}
          {fullscreenPanel !== 'flights' && (
          <div className={`${fullscreenPanel === 'map' ? 'flex-1' : 'flex-[2]'} min-h-0 rounded-2xl overflow-hidden shadow-xl relative`}>
            <FlightMap userLat={lat} userLon={lon} flight={selectedFlight} flights={displayFlights} trail={selectedTrail} onSelectFlight={(icao24) => setSelectedIcao(icao24 === selectedFlight?.icao24 ? null : icao24)} militaryMode={militaryMode} />
            <div className="absolute bottom-2 left-2 z-[1000]">
              {fullscreenPanel === 'map'
                ? (
                  <button onClick={() => setFullscreenPanel(null)} className="p-1 rounded-md bg-white/70 text-slate-700 hover:bg-white/90 hover:text-slate-900 transition-colors backdrop-blur-sm" title="Exit fullscreen">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M3.5 0H5v5H0V3.5h3.5V0zM7 0h1.5v3.5H12V5H7V0zM0 7h5v5H3.5V8.5H0V7zm7 0h5v1.5H8.5V12H7V7z"/>
                    </svg>
                  </button>
                )
                : (
                  <button onClick={() => setFullscreenPanel('map')} className="p-1 rounded-md bg-white/70 text-slate-700 hover:bg-white/90 hover:text-slate-900 transition-colors backdrop-blur-sm" title="Expand map">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M0 0h4v1.5H1.5V4H0V0zm8 0h4v4h-1.5V1.5H8V0zM0 8h1.5v2.5H4V12H0V8zm10.5 2.5V8H12v4H8v-1.5h2.5z"/>
                    </svg>
                  </button>
                )}
            </div>
          </div>
          )}

          {/* Flight list — hidden when map is fullscreen */}
          {fullscreenPanel !== 'map' && (
          <div className="flex-1 min-h-0 rounded-2xl bg-slate-800/60 border border-white/10 overflow-y-auto">
            <div className="px-3 py-1.5 border-b border-white/10 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {militaryMode ? 'Military Aircraft' : 'Nearby Flights'}
              </span>
              <span className="text-xs text-slate-500">({displayFlights.length}{displayFlights.length !== flights.length ? ` of ${flights.length}` : ''})</span>
              <div className="ml-auto">
                {fullscreenPanel === 'flights'
                  ? <CollapseBtn onClick={() => setFullscreenPanel(null)} />
                  : <ExpandBtn onClick={() => setFullscreenPanel('flights')} />}
              </div>
            </div>
            {displayFlights.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-500">No data yet…</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-1 text-left font-medium">Callsign</th>
                    {!militaryMode && <th className="px-3 py-1 text-left font-medium">Route</th>}
                    {militaryMode && <th className="px-3 py-1 text-left font-medium">Type</th>}
                    <th className="px-3 py-1 text-right font-medium">Dist</th>
                    <th className="px-3 py-1 text-right font-medium">Alt</th>
                  </tr>
                </thead>
                <tbody>
                  {displayFlights.map((f) => (
                    <tr
                      key={f.icao24}
                      onClick={() => setSelectedIcao(f.icao24 === selectedFlight?.icao24 ? null : f.icao24)}
                      className={`cursor-pointer ${f.icao24 === selectedFlight?.icao24
                        ? 'bg-red-500/15 text-white'
                        : 'text-slate-300 hover:bg-white/5'}`}
                    >
                      <td className="px-3 py-1 font-mono">{f.callsign ?? f.icao24}</td>
                      {!militaryMode && <td className="px-3 py-1">
                        {f.route
                          ? <span className="text-slate-400">{f.route.originCity} → {f.route.destinationCity}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>}
                      {militaryMode && <td className="px-3 py-1">
                        {f.aircraftType
                          ? <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">{aircraftTypeName(f.aircraftType) ?? f.aircraftType}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>}
                      <td className="px-3 py-1 text-right">{f.distanceMiles.toFixed(1)} mi</td>
                      <td className="px-3 py-1 text-right">
                        {f.baroAltitude != null ? `${Math.round(f.baroAltitude * 3.28084 / 100) * 100}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          )}
        </div>
        )}

        {/* Sidebar — hidden when map or flights is fullscreen */}
        {(fullscreenPanel === null || fullscreenPanel === 'card') && (
        <div className={`${fullscreenPanel === 'card' ? 'flex-1' : 'flex-[2]'} flex flex-col gap-1.5 min-w-0 ${fullscreenPanel === 'card' ? 'overflow-hidden' : 'overflow-y-auto'}`}>

          {/* Police alert — hidden in card fullscreen */}
          {fullscreenPanel === null && policeFlights.length > 0 && (
            <div className="flex-shrink-0 rounded-xl border border-blue-400/40 bg-blue-500/10 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="-26 -26 52 52" className="flex-shrink-0">
                  <path d="M0,-20 L2,-14 L3,-3 L20,10 L15,15 L3,9 L3,14 L6,17 L2,19 L0,20 L-2,19 L-6,17 L-3,14 L-3,9 L-15,15 L-20,10 L-3,-3 L-2,-14 Z" fill="#60a5fa" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                  Police {policeFlights.length > 1 ? `(${policeFlights.length})` : 'Aircraft Detected'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {policeFlights.map(f => (
                  <div key={f.icao24} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-blue-300 font-medium flex-1 min-w-0 truncate">
                      {f.callsign ?? f.icao24.toUpperCase()}
                      {f.aircraftType && <span className="text-blue-600 ml-1">· {aircraftTypeName(f.aircraftType) ?? f.aircraftType}</span>}
                    </span>
                    <span className="text-xs text-blue-600 flex-shrink-0">{f.distanceMiles.toFixed(1)} mi</span>
                    <button
                      onClick={() => setSelectedIcao(f.icao24 === selectedFlight?.icao24 ? null : f.icao24)}
                      className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-md border transition-colors ${
                        f.icao24 === selectedFlight?.icao24
                          ? 'bg-blue-500/30 border-blue-400/50 text-blue-300'
                          : 'bg-blue-500/15 border-blue-400/30 text-blue-400 hover:bg-blue-500/25'
                      }`}
                    >
                      {f.icao24 === selectedFlight?.icao24 ? 'Tracking' : 'Track'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Military alert — hidden in card fullscreen and in military mode */}
          {fullscreenPanel === null && !militaryMode && militaryFlights.length > 0 && (
            <div className="flex-shrink-0 rounded-xl border border-green-400/40 bg-green-500/10 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="-26 -26 52 52" className="flex-shrink-0">
                  <path d="M0,-20 L2,-14 L3,-3 L20,10 L15,15 L3,9 L3,14 L6,17 L2,19 L0,20 L-2,19 L-6,17 L-3,14 L-3,9 L-15,15 L-20,10 L-3,-3 L-2,-14 Z" fill="#4ade80" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">
                  Military {militaryFlights.length > 1 ? `(${militaryFlights.length})` : 'Aircraft Detected'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {militaryFlights.map(f => (
                  <div key={f.icao24} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-green-300 font-medium flex-1 min-w-0 truncate">
                      {f.callsign ?? f.icao24.toUpperCase()}
                      {f.aircraftType && <span className="text-green-600 ml-1">· {aircraftTypeName(f.aircraftType) ?? f.aircraftType}</span>}
                    </span>
                    <span className="text-xs text-green-600 flex-shrink-0">{f.distanceMiles.toFixed(1)} mi</span>
                    <button
                      onClick={() => setSelectedIcao(f.icao24 === selectedFlight?.icao24 ? null : f.icao24)}
                      className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-md border transition-colors ${
                        f.icao24 === selectedFlight?.icao24
                          ? 'bg-green-500/30 border-green-400/50 text-green-300'
                          : 'bg-green-500/15 border-green-400/30 text-green-400 hover:bg-green-500/25'
                      }`}
                    >
                      {f.icao24 === selectedFlight?.icao24 ? 'Tracking' : 'Track'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={fullscreenPanel === 'card' ? 'flex-1 min-h-0 flex flex-col' : 'flex-shrink-0'}>
            {selectedIcao && (
              <button
                onClick={() => setSelectedIcao(null)}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 mb-1.5 rounded-xl bg-sky-500/15 border border-sky-400/30 text-sky-400 text-xs font-medium hover:bg-sky-500/25 transition-colors"
              >
                <span>⟳</span> Return to closest plane
              </button>
            )}
            {selectedFlight ? (
              <FlightCard
                flight={selectedFlight}
                info={info}
                isFullscreen={fullscreenPanel === 'card'}
                onToggleFullscreen={() => setFullscreenPanel(fullscreenPanel === 'card' ? null : 'card')}
              />
            ) : (
              <div className="bg-slate-800/60 rounded-xl p-3 text-center text-slate-400 text-xs border border-white/10">
                {status === 'connecting' || status === 'reconnecting'
                  ? 'Searching for nearby flights…'
                  : 'No airborne flights detected nearby. Click a row to select.'}
              </div>
            )}
          </div>

          {/* Icon legend — hidden in card fullscreen */}
          {fullscreenPanel === null && (
          <div className="flex-shrink-0 rounded-2xl bg-slate-800/60 border border-white/10 px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Map Icon Key</div>
              <div className="flex items-center gap-2">
                {activeCategories.size < allCategories.size && (
                  <button
                    onClick={() => setActiveCategories(allCategories)}
                    className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                  >
                    Show all
                  </button>
                )}
                <button
                  onClick={() => { setMilitaryMode(m => !m); setSelectedIcao(null); }}
                  className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                    militaryMode
                      ? 'bg-green-500/20 border-green-400/50 text-green-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="-26 -26 52 52">
                    <path d="M0,-20 L2,-14 L3,-3 L20,10 L15,15 L3,9 L3,14 L6,17 L2,19 L0,20 L-2,19 L-6,17 L-3,14 L-3,9 L-15,15 L-20,10 L-3,-3 L-2,-14 Z" fill="currentColor"/>
                  </svg>
                  Military Mode
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(militaryMode ? MILITARY_LEGEND_ENTRIES : LEGEND_ENTRIES).map(({ category, label, svg }) => {
                const active = activeCategories.has(category);
                const count = categoryCounts.get(category) ?? 0;
                return (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    title={label}
                    className={`flex items-center gap-1.5 w-full text-left rounded-lg px-1.5 py-1 transition-opacity hover:bg-white/5 ${active ? 'opacity-100' : 'opacity-30'}`}
                  >
                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5" dangerouslySetInnerHTML={{ __html: svg }} />
                    <div className="text-xs font-medium text-slate-200 truncate flex-1 min-w-0">{label}</div>
                    {count > 0 && (
                      <span className="flex-shrink-0 text-xs font-mono font-semibold text-slate-300 bg-white/10 rounded px-1 leading-4">{count}</span>
                    )}
                  </button>
                );
              })}
              {/* Selected — not filterable, static */}
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52">
                    <path d="M0,-18 L4,-8 L18,2 L18,7 L4,1 L3,14 L8,15 L8,18 L0,16 L-8,18 L-8,15 L-3,14 L-4,1 L-18,7 L-18,2 L-4,-8 Z" fill="#ef4444" stroke="rgba(0,0,0,0.85)" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-xs font-medium text-slate-200 truncate">Selected</div>
              </div>
            </div>
          </div>
          )}
        </div>
        )}
      </div>
      <div className="absolute bottom-3 right-3 z-[1001]">
        <ShutdownButton />
      </div>
    </div>
  );
}

export default function App() {
  const geo = useGeolocation();
  useAutoReload();

  return <Dashboard lat={geo.lat} lon={geo.lon} />;
}
