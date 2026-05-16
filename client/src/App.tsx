import { useEffect, useMemo, useRef, useState } from 'react';
import { useFlightStream } from './hooks/useFlightStream';
import { useFlightInfo } from './hooks/useFlightInfo';
import { FlightCard } from './components/FlightCard';
import { FlightMap, categorizeAircraft, MILITARY_CATS, WARBIRD_CATS, AircraftCategory } from './components/FlightMap';
import { aircraftTypeName, wellKnownAircraftName, msToMph, clusterFlights, Hotspot, groupByBroadRegion, BroadRegionGroup, getCountryFromIcao } from './utils';
import { ShutdownButton } from './components/ShutdownButton';
import { useAutoReload } from './hooks/useAutoReload';
import { RouteInfo, FlightState } from './types';
import { APP_VERSION } from './version';
import { CHANGELOG } from './changelog';


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


type FilterCategory = 'jet' | 'prop' | 'small' | 'heli' | 'military' | 'police' | 'warbird'
  | 'fighter' | 'bomber' | 'transport' | 'attack' | 'uav' | 'mil-heli';

const NORMAL_CATEGORIES = new Set<FilterCategory>(['jet', 'prop', 'small', 'heli', 'military', 'police', 'warbird']);
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
  {
    category: 'warbird',
    label: 'Warbird / Vintage',
    desc: 'WWII-era aircraft: P-51, B-17, Corsair, Spitfire…',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-26 -26 52 52"><path d="M0,-22 L1.5,-14 L2.5,-5 L17,4 L15,8 L2.5,4 L3,12 L6,14 L5,17 L0,16 L-5,17 L-6,14 L-3,12 L-2.5,4 L-15,8 L-17,4 L-2.5,-5 L-1.5,-14 Z" fill="#fb923c" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
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

// SVG paths (same as map icons, pointing up at heading=0)
const ICON_PATHS: Partial<Record<AircraftCategory, string>> = {
  jet:       'M0,-18 L4,-8 L18,2 L18,7 L4,1 L3,14 L8,15 L8,18 L0,16 L-8,18 L-8,15 L-3,14 L-4,1 L-18,7 L-18,2 L-4,-8 Z',
  prop:      'M0,-18 L3,-8 L3,-4 L16,0 L16,4 L3,3 L3,14 L7,15 L7,18 L0,16 L-7,18 L-7,15 L-3,14 L-3,3 L-16,4 L-16,0 L-3,-4 L-3,-8 Z',
  small:     'M0,-17 L2.5,-13 L2.5,-4 L14,0 L14,3.5 L2.5,1.5 L2.5,12 L5.5,13 L5.5,16 L0,17 L-5.5,16 L-5.5,13 L-2.5,12 L-2.5,1.5 L-14,3.5 L-14,0 L-2.5,-4 L-2.5,-13 Z',
  warbird:   'M0,-22 L1.5,-14 L2.5,-5 L17,4 L15,8 L2.5,4 L3,12 L6,14 L5,17 L0,16 L-5,17 L-6,14 L-3,12 L-2.5,4 L-15,8 L-17,4 L-2.5,-5 L-1.5,-14 Z',
  fighter:   'M0,-20 L2,-14 L3,-3 L20,10 L15,15 L3,9 L3,14 L6,17 L2,19 L0,20 L-2,19 L-6,17 L-3,14 L-3,9 L-15,15 L-20,10 L-3,-3 L-2,-14 Z',
  bomber:    'M0,-13 L2,-7 L3,-1 L22,6 L21,10 L3,5 L2.5,13 L5.5,14 L5.5,17 L0,15 L-5.5,17 L-5.5,14 L-2.5,13 L-3,5 L-21,10 L-22,6 L-3,-1 L-2,-7 Z',
  transport: 'M0,-17 L3,-9 L5,-6 L20,2 L20,7 L5,2 L4,14 L8,15 L8,18 L0,16 L-8,18 L-8,15 L-4,14 L-5,2 L-20,7 L-20,2 L-5,-6 L-3,-9 Z',
  attack:    'M0,-18 L2,-12 L3,-1 L19,2 L19,6 L3,1 L4.5,13 L8,14 L7,17 L0,16 L-7,17 L-8,14 L-4.5,13 L-3,1 L-19,6 L-19,2 L-3,-1 L-2,-12 Z',
  uav:       'M0,-10 L1,-5 L2,-1 L25,3 L25,6 L2,2 L1.5,11 L4,12 L4,14 L0,13 L-4,14 L-4,12 L-1.5,11 L-2,2 L-25,6 L-25,3 L-2,-1 L-1,-5 Z',
};

function CategoryIcon({ category, isPolice }: { category: AircraftCategory; isPolice: boolean }) {
  const isMil = MILITARY_CATS.has(category);
  const isWarbird = WARBIRD_CATS.has(category);
  const color = isPolice ? '#60a5fa' : isMil ? '#4ade80' : isWarbird ? '#fb923c' : 'currentColor';
  const isHeli = category === 'heli' || category === 'mil-heli';
  const isAirship = category === 'airship';
  const path = ICON_PATHS[category] ?? ICON_PATHS.jet!;
  return (
    <svg width="14" height="14" viewBox="-26 -26 52 52" fill={color} className="flex-shrink-0 opacity-80">
      {isAirship ? (
        <>
          <ellipse cx="0" cy="-3" rx="7" ry="18" />
          <rect x="-3" y="8" width="6" height="5" rx="1.5" />
          <path d="M-7,10 L-13,21 L-3,14 Z" />
          <path d="M7,10 L13,21 L3,14 Z" />
        </>
      ) : isHeli ? (
        <>
          <rect x="-20" y="-2" width="40" height="4" rx="2" />
          <rect x="-2" y="-20" width="4" height="40" rx="2" />
          <circle cx="0" cy="0" r="3" />
          <path d="M0,-11 C5,-11 8,-5 8,1 C8,7 5,11 0,13 C-5,11 -8,7 -8,1 C-8,-5 -5,-11 0,-11 Z" />
          <rect x="-1.5" y="12" width="3" height="10" rx="1" />
          <rect x="-8" y="19" width="16" height="3" rx="1.5" />
        </>
      ) : (
        <path d={path} />
      )}
    </svg>
  );
}

type FullscreenPanel = 'map' | 'flights' | 'card' | null;

const TOP_GUN_QUIPS = [
  "I feel the need… the need for speed.",
  "Talk to me, Goose.",
  "That's a negative, Ghost Rider.",
  "You can be my wingman any time.",
  "Highway to the Danger Zone.",
  "It's classified. I could tell you, but then I'd have to kill you.",
  "Son, your ego is writing checks your body can't cash.",
  "Great balls of fire.",
  "I'm not leaving my wingman.",
  "The plaque for the alternates is in the ladies' room.",
  "Maverick, you big stud.",
  "You didn't tell me who you were flying against.",
];

function playRadarLock() {
  try {
    const ctx = new AudioContext();
    const beep = (t: number, freq: number, dur: number, vol = 0.25) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur + 0.05);
    };
    // Radar pings accelerating toward lock
    [0, 0.45, 0.83, 1.15, 1.41, 1.62, 1.79, 1.93].forEach(t => beep(t, 880, 0.12));
    // Lock acquired — dual-tone chord
    beep(2.05, 1320, 1.4, 0.2);
    beep(2.05, 1760, 1.4, 0.12);
  } catch { /* AudioContext blocked by browser */ }
}

const RETICLE_SVG_PATHS = (
  <>
    <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 5" />
    <circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="50" cy="50" r="4" fill="currentColor" />
    <line x1="50" y1="4"  x2="50" y2="26" stroke="currentColor" strokeWidth="1.5" />
    <line x1="50" y1="74" x2="50" y2="96" stroke="currentColor" strokeWidth="1.5" />
    <line x1="4"  y1="50" x2="26" y2="50" stroke="currentColor" strokeWidth="1.5" />
    <line x1="74" y1="50" x2="96" y2="50" stroke="currentColor" strokeWidth="1.5" />
    <path d="M14,34 L14,14 L34,14" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M66,14 L86,14 L86,34" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M14,66 L14,86 L34,86" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M66,86 L86,86 L86,66" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </>
);

function TopGunAlert({ flights, selectedFlight, onTrack, takeover, onDismissModal }: {
  flights: FlightState[];
  selectedFlight: FlightState | null;
  onTrack: (icao24: string | null) => void;
  takeover: boolean;
  onDismissModal: () => void;
}) {
  const primary = flights[0];
  const quipIdx = primary.icao24.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % TOP_GUN_QUIPS.length;
  const typeName = wellKnownAircraftName(primary.icao24) ?? (primary.aircraftType ? (aircraftTypeName(primary.aircraftType) ?? primary.aircraftType.toUpperCase()) : 'UNKNOWN BOGEY');
  const isTracking = primary.icao24 === selectedFlight?.icao24;
  const [countdown, setCountdown] = useState(10);
  const [exiting, setExiting] = useState(false);
  const dismissRef = useRef(onDismissModal);
  dismissRef.current = onDismissModal;
  const prevTakeoverRef = useRef(false);

  // Play exit animation whenever takeover transitions true → false
  useEffect(() => {
    if (!takeover && prevTakeoverRef.current) {
      setExiting(true);
      setTimeout(() => setExiting(false), 450);
    }
    if (takeover) setExiting(false);
    prevTakeoverRef.current = takeover;
  }, [takeover]);

  useEffect(() => {
    if (!takeover) return;
    setCountdown(10);
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(id); dismissRef.current(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [takeover]);

  const gridBg = { backgroundImage: 'repeating-linear-gradient(0deg,#f59e0b 0,transparent 1px,transparent 24px),repeating-linear-gradient(90deg,#f59e0b 0,transparent 1px,transparent 24px)' };

  if (takeover || exiting) {
    return (
      <div className={`${exiting ? 'topgun-overlay-out' : 'topgun-overlay'} topgun-scanline fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center overflow-hidden select-none`}>
        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.05]" style={gridBg} />
        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.85) 100%)' }} />

        <div className="relative flex flex-col items-center gap-3 px-8 py-6 max-w-md w-full">
          {/* Header */}
          <div className="flex items-center gap-3 w-full justify-center">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400" />
            </span>
            <span className="topgun-blink text-xs font-black text-amber-400 uppercase tracking-[0.35em] font-mono">
              Bogey in the AO{flights.length > 1 ? ` (${flights.length})` : ''}
            </span>
            <span className="text-xs font-mono text-amber-700 ml-auto">
              {new Date().toISOString().slice(11, 19)}Z
            </span>
          </div>

          {/* Large reticle */}
          <div className="relative flex items-center justify-center">
            <svg width="150" height="150" viewBox="0 0 100 100" className="text-amber-500 animate-spin [animation-duration:12s]">
              {RETICLE_SVG_PATHS}
            </svg>
            <svg width="120" height="120" viewBox="0 0 100 100" className="text-amber-400/40 animate-spin absolute [animation-duration:7s] [animation-direction:reverse]">
              <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="3 9" />
            </svg>
          </div>

          {/* Aircraft name */}
          <div className="text-center">
            <div className="topgun-glitch text-4xl font-black text-amber-300 font-mono uppercase tracking-widest leading-none">
              {typeName}
            </div>
            <div className="text-sm text-amber-500 font-mono mt-2 tracking-wider">
              {primary.callsign ?? primary.icao24.toUpperCase()} &nbsp;·&nbsp; {primary.distanceMiles.toFixed(1)} mi
              {primary.velocity != null && ` · ${Math.round(primary.velocity * 1.944)} kts`}
            </div>
          </div>

          {/* Other bogeys */}
          {flights.length > 1 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {flights.slice(1).map(f => (
                <button key={f.icao24} onClick={() => onTrack(f.icao24 === selectedFlight?.icao24 ? null : f.icao24)}
                  className="text-[11px] font-mono text-amber-700 hover:text-amber-500 transition-colors border border-amber-900/50 rounded px-2 py-0.5">
                  {f.callsign ?? f.icao24.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Quip */}
          <div className="text-sm text-amber-700 italic font-mono text-center border-t border-amber-900/50 pt-4 w-full">
            "{TOP_GUN_QUIPS[quipIdx]}"
          </div>

          {/* Buttons */}
          <div className="flex gap-3 w-full">
            <button
              onClick={() => { onTrack(isTracking ? null : primary.icao24); onDismissModal(); }}
              className="flex-1 text-sm font-mono font-black px-4 py-3 rounded border border-amber-400/70 bg-amber-500/15 text-amber-300 hover:bg-amber-500/30 transition-all uppercase tracking-[0.2em]"
            >
              ⊕ Lock On
            </button>
            <button
              onClick={onDismissModal}
              className="flex-1 text-sm font-mono font-black px-4 py-3 rounded border border-amber-900/60 bg-transparent text-amber-700 hover:text-amber-500 hover:border-amber-700/60 transition-all uppercase tracking-[0.2em]"
            >
              Clear
            </button>
          </div>

          {/* Countdown bar */}
          <div className="w-full">
            <div className="flex justify-between text-[10px] font-mono text-amber-900 mb-1">
              <span>AUTO-CLEAR</span><span>{countdown}s</span>
            </div>
            <div className="h-1 w-full bg-amber-950/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-600/70 rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${(countdown / 10) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sidebar widget (after takeover is dismissed)
  return (
    <div className="flex-shrink-0 rounded-xl border border-amber-500/60 bg-black overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'repeating-linear-gradient(0deg,#f59e0b 0,transparent 1px,transparent 18px),repeating-linear-gradient(90deg,#f59e0b 0,transparent 1px,transparent 18px)' }} />

      <div className="relative px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-[0.2em] font-mono flex-1">
            Bogey in the AO{flights.length > 1 ? ` (${flights.length})` : ''}
          </span>
          <span className="text-[10px] font-mono text-amber-700">
            {new Date().toISOString().slice(11, 19)}Z
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
            <svg width="48" height="48" viewBox="0 0 100 100" className="text-amber-500 animate-spin [animation-duration:9s]">
              {RETICLE_SVG_PATHS}
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-amber-300 font-mono uppercase tracking-wide truncate leading-tight">
              {typeName}
            </div>
            <div className="text-xs text-amber-500 font-mono mt-0.5">
              {primary.callsign ?? primary.icao24.toUpperCase()} · {primary.distanceMiles.toFixed(1)} mi
              {primary.velocity != null && ` · ${Math.round(primary.velocity * 1.944)} kts`}
            </div>
            {flights.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {flights.slice(1).map(f => (
                  <button key={f.icao24} onClick={() => onTrack(f.icao24 === selectedFlight?.icao24 ? null : f.icao24)}
                    className="text-[10px] font-mono text-amber-700 hover:text-amber-500 transition-colors">
                    {f.callsign ?? f.icao24.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 text-[10px] text-amber-700 italic font-mono border-t border-amber-900/60 pt-1.5">
          "{TOP_GUN_QUIPS[quipIdx]}"
        </div>

        <button
          onClick={() => onTrack(isTracking ? null : primary.icao24)}
          className={`mt-2 w-full text-[11px] font-mono font-bold px-3 py-1.5 rounded border transition-all uppercase tracking-[0.15em] ${
            isTracking
              ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20 hover:border-amber-400/50 hover:text-amber-300'
          }`}
        >
          {isTracking ? '✓  Tracking' : '⊕  Lock On'}
        </button>
      </div>
    </div>
  );
}

const WARBIRD_QUIPS = [
  "Tally-ho! Bandits at twelve.",
  "She's a long way from the Pacific.",
  "They don't make 'em like this anymore.",
  "Gear up. It's showtime.",
  "Full power — press the attack.",
  "Flying for the love of it since '43.",
  "Brought to you by 100LL and nostalgia.",
  "Cleared hot. Good hunting.",
  "One pass, haul ass.",
  "Flame on — let's go hunting.",
];

function WarbirdAlert({ flights, selectedFlight, onTrack }: {
  flights: FlightState[];
  selectedFlight: FlightState | null;
  onTrack: (icao24: string | null) => void;
}) {
  const primary = flights[0];
  const quipIdx = primary.icao24.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % WARBIRD_QUIPS.length;
  const typeName = wellKnownAircraftName(primary.icao24) ?? (primary.aircraftType
    ? (aircraftTypeName(primary.aircraftType) ?? primary.aircraftType.toUpperCase())
    : 'VINTAGE AIRCRAFT');
  const isTracking = primary.icao24 === selectedFlight?.icao24;

  return (
    <div className="flex-shrink-0 rounded-xl border border-orange-400/60 bg-black overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'repeating-linear-gradient(0deg,#f97316 0,transparent 1px,transparent 18px),repeating-linear-gradient(90deg,#f97316 0,transparent 1px,transparent 18px)' }} />
      <div className="relative px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-400" />
          </span>
          <span className="text-[10px] font-bold text-orange-400 uppercase tracking-[0.2em] font-mono flex-1">
            Warbird Spotted{flights.length > 1 ? ` (${flights.length})` : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
            <svg width="40" height="40" viewBox="-26 -26 52 52" className="text-orange-500 animate-spin [animation-duration:2s]">
              <ellipse cx="0" cy="-18" rx="6" ry="1" fill="currentColor" opacity="0.9"/>
              <ellipse cx="0" cy="18" rx="6" ry="1" fill="currentColor" opacity="0.9"/>
              <ellipse cx="-18" cy="0" rx="1" ry="6" fill="currentColor" opacity="0.9"/>
              <ellipse cx="18" cy="0" rx="1" ry="6" fill="currentColor" opacity="0.9"/>
              <circle cx="0" cy="0" r="4" fill="currentColor"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-orange-300 font-mono uppercase tracking-wide truncate leading-tight">
              {typeName}
            </div>
            <div className="text-xs text-orange-500 font-mono mt-0.5">
              {primary.callsign ?? primary.icao24.toUpperCase()} · {primary.distanceMiles.toFixed(1)} mi
              {primary.velocity != null && ` · ${Math.round(primary.velocity * 1.944)} kts`}
            </div>
            {flights.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {flights.slice(1).map(f => (
                  <button key={f.icao24} onClick={() => onTrack(f.icao24 === selectedFlight?.icao24 ? null : f.icao24)}
                    className="text-[10px] font-mono text-orange-700 hover:text-orange-500 transition-colors">
                    {f.callsign ?? f.icao24.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 text-[10px] text-orange-700 italic font-mono border-t border-orange-900/60 pt-1.5">
          "{WARBIRD_QUIPS[quipIdx]}"
        </div>
        <button
          onClick={() => onTrack(isTracking ? null : primary.icao24)}
          className={`mt-2 w-full text-[11px] font-mono font-bold px-3 py-1.5 rounded border transition-all uppercase tracking-[0.15em] ${
            isTracking
              ? 'bg-orange-500/20 border-orange-400/60 text-orange-300'
              : 'bg-orange-500/10 border-orange-500/30 text-orange-500 hover:bg-orange-500/20 hover:border-orange-400/50 hover:text-orange-300'
          }`}
        >
          {isTracking ? '✓  Tracking' : '⊕  Track'}
        </button>
      </div>
    </div>
  );
}

interface SpeedRecord {
  velocityMs: number;
  callsign: string | null;
  icao24: string;
  aircraftType: string | null;
  seenAt: number;
}

interface StatsResponse {
  faHistory: { date: string; fresh: number; cached: number }[];
  speedRecord: SpeedRecord | null;
  cacheSize: number;
}

function SpeedRecordCard({ speedRecord }: { speedRecord: SpeedRecord }) {
  const typeName = wellKnownAircraftName(speedRecord.icao24) ?? aircraftTypeName(speedRecord.aircraftType) ?? null;
  const info = useFlightInfo(speedRecord.icao24, typeName, speedRecord.callsign);
  const speedMph = Math.round(msToMph(speedRecord.velocityMs)).toLocaleString();
  const speedKts = Math.round(speedRecord.velocityMs * 1.94384).toLocaleString();
  const speedLabel = typeName ?? speedRecord.aircraftType ?? speedRecord.callsign ?? speedRecord.icao24;
  const speedDate = new Date(speedRecord.seenAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="rounded-lg bg-slate-900/60 border border-white/5 flex items-stretch overflow-hidden h-20">
      <div className="px-3 py-2.5 flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-semibold text-white">{speedMph} mph</span>
          <span className="text-xs text-slate-500 font-mono">{speedKts} kts</span>
        </div>
        <div className="text-xs text-slate-300 mt-0.5">
          {speedLabel}
          {speedRecord.callsign && speedRecord.callsign !== speedLabel
            ? <span className="text-slate-500 ml-1">{speedRecord.callsign}</span>
            : null}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">{speedDate}</div>
      </div>
      {info?.photoUrl && (
        <img src={info.photoUrl} alt="Aircraft" className="w-36 h-full object-cover object-center flex-shrink-0" />
      )}
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    function load() {
      fetch('/api/stats')
        .then(r => r.ok ? r.json() : null)
        .then((data: StatsResponse | null) => { if (data) setStats(data); })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!stats) return <div className="px-3 py-3 text-xs text-slate-500">Loading…</div>;

  const { faHistory, speedRecord, cacheSize } = stats;
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = faHistory.find(d => d.date === today);
  const todayFresh = todayEntry?.fresh ?? 0;
  const totalFresh = faHistory.reduce((sum, d) => sum + d.fresh, 0);

  return (
    <div className="p-3 flex flex-col gap-3">
      {speedRecord && (
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Speed Record</div>
          <SpeedRecordCard speedRecord={speedRecord} />
        </div>
      )}
      <div>
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">FlightAware Lookups</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-slate-900/60 border border-white/5 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Today · Fresh</div>
            <div className="text-2xl font-mono font-semibold text-white">{todayFresh.toLocaleString()}</div>
          </div>
          <div className="rounded-lg bg-slate-900/60 border border-white/5 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Cached Routes</div>
            <div className="text-2xl font-mono font-semibold text-slate-400">{cacheSize.toLocaleString()}</div>
          </div>
          <div className="col-span-2 rounded-lg bg-slate-900/60 border border-white/5 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">30-day · Fresh</div>
            <div className="text-xl font-mono font-semibold text-white">{totalFresh.toLocaleString()}</div>
          </div>
        </div>
      </div>
      {faHistory.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">By day</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 uppercase tracking-wider text-[10px]">
                <th className="text-left font-medium pb-1.5">Date</th>
                <th className="text-right font-medium pb-1.5">Fresh</th>
                <th className="text-right font-medium pb-1.5">Cached</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {faHistory.map(d => (
                <tr key={d.date} className={d.date === today ? 'text-white' : 'text-slate-400'}>
                  <td className="py-1 font-mono">{d.date}</td>
                  <td className="py-1 text-right font-mono">{d.fresh.toLocaleString()}</td>
                  <td className="py-1 text-right font-mono">{d.cached.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const EXPLORE_CITIES: { name: string; region: string; lat: number; lon: number; category: 'city' | 'military' }[] = [
  // Cities
  { name: 'Washington D.C.', region: 'United States',   lat:  38.8951, lon:  -77.0364, category: 'city' },
  { name: 'New York City',   region: 'United States',   lat:  40.7128, lon:  -74.0060, category: 'city' },
  { name: 'Los Angeles',     region: 'United States',   lat:  34.0522, lon: -118.2437, category: 'city' },
  { name: 'Chicago',         region: 'United States',   lat:  41.9742, lon:  -87.9073, category: 'city' },
  { name: 'Atlanta',         region: 'United States',   lat:  33.6407, lon:  -84.4277, category: 'city' },
  { name: 'London',          region: 'United Kingdom',  lat:  51.4775, lon:   -0.4614, category: 'city' },
  { name: 'Dubai',           region: 'UAE',             lat:  25.2048, lon:   55.2708, category: 'city' },
  { name: 'Tel Aviv',        region: 'Israel',          lat:  32.0853, lon:   34.7818, category: 'city' },
  { name: 'Tokyo',           region: 'Japan',           lat:  35.5494, lon:  139.7798, category: 'city' },
  { name: 'Singapore',       region: 'Singapore',       lat:   1.3644, lon:  103.9915, category: 'city' },
  // Military bases
  { name: 'Nellis AFB',      region: 'Nevada, USA',     lat:  36.2356, lon: -115.0342, category: 'military' },
  { name: 'Edwards AFB',     region: 'California, USA', lat:  34.9054, lon: -117.8838, category: 'military' },
  { name: 'Eglin AFB',       region: 'Florida, USA',    lat:  30.4832, lon:  -86.5253, category: 'military' },
  { name: 'JBSA Randolph',   region: 'San Antonio, TX', lat:  29.5302, lon:  -98.2789, category: 'military' },
  { name: 'Laughlin AFB',    region: 'Del Rio, TX',     lat:  29.3595, lon: -100.7817, category: 'military' },
  { name: 'Ramstein AB',     region: 'Germany',         lat:  49.4369, lon:    7.6003, category: 'military' },
  { name: 'Kadena AB',       region: 'Okinawa, Japan',  lat:  26.3558, lon:  127.7681, category: 'military' },
  { name: 'Al Udeid AB',     region: 'Qatar',           lat:  25.1173, lon:   51.3147, category: 'military' },
];

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

function routeSkipReason(f: { callsign?: string | null; isPolice?: boolean; aircraftType?: string | null }): string | null {
  if (f.isPolice) return 'Police';
  const cat = categorizeAircraft(f.aircraftType ?? null);
  if (MILITARY_CATS.has(cat)) return 'Military';
  if (cat === 'warbird') return 'Warbird';
  if (cat === 'heli' || cat === 'mil-heli') return 'Helicopter';
  if (!f.callsign) return 'No callsign';
  if (/^N\d/.test(f.callsign) || /^[A-Z]{1,2}-[A-Z0-9]{2,5}$/.test(f.callsign)) return 'Private';
  return null;
}

type UpdateState = 'idle' | 'checking' | 'updating' | 'upToDate' | 'error';

function UpdateButton() {
  const [state, setState] = useState<UpdateState>('idle');
  const [log, setLog] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (state !== 'updating' && state !== 'error') return;

    async function fetchLog() {
      const res = await fetch('/api/update-log');
      if (res.ok) setLog(await res.text());
    }

    if (state === 'error') { fetchLog(); return; }

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const { startedAt } = await res.json() as { startedAt: number };
        if (startedAtRef.current === null) {
          startedAtRef.current = startedAt;
        } else if (startedAt !== startedAtRef.current) {
          window.location.reload();
        }
      } catch {
        // server restarting — keep polling
      }
    }, 3000);

    const timeout = setTimeout(() => setState('error'), 3 * 60 * 1000);

    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [state]);

  async function handleClick() {
    if (state === 'error') { setState('idle'); setLog(null); return; }
    setState('checking');
    setLog(null);
    try {
      const res = await fetch('/api/version');
      if (res.ok) {
        const { startedAt } = await res.json() as { startedAt: number };
        startedAtRef.current = startedAt;
      }
      const updateRes = await fetch('/api/check-update', { method: 'POST' });
      const data = await updateRes.json() as { updating: boolean };
      setState(data.updating ? 'updating' : 'upToDate');
    } catch {
      setState('idle');
    }
  }

  const label =
    state === 'checking' ? 'Checking…' :
    state === 'updating' ? 'Update in progress — reloading when ready…' :
    state === 'upToDate' ? 'Already up to date' :
    state === 'error' ? 'Update may have failed — tap to dismiss' :
    'Check for Updates';

  const disabled = state === 'checking' || state === 'updating';

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={disabled}
        className="self-start text-xs px-3 py-1.5 rounded-md bg-white/10 text-slate-300 hover:bg-white/15 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {label}
      </button>
      {log && (
        <pre className="text-[10px] text-slate-400 bg-black/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
          {log}
        </pre>
      )}
    </div>
  );
}

const TOPGUN_DUMMY: FlightState = {
  icao24: '000000',
  callsign: 'TOPGUN1',
  originCountry: 'United States',
  latitude: 0, // filled in at render time
  longitude: 0,
  baroAltitude: 8534,
  onGround: false,
  velocity: 480,
  trueTrack: 270,
  verticalRate: 0,
  geoAltitude: 8700,
  distanceMiles: 3.7,
  bearingDeg: 45,
  route: null,
  aircraftType: 'F22',
  isPolice: false,
};

const WARBIRD_DUMMY: FlightState = {
  icao24: '000001',
  callsign: 'HURI1',
  originCountry: 'United Kingdom',
  latitude: 0, // filled in at render time
  longitude: 0,
  baroAltitude: 1500,
  onGround: false,
  velocity: 130,
  trueTrack: 90,
  verticalRate: 0,
  geoAltitude: 1600,
  distanceMiles: 2.1,
  bearingDeg: 120,
  route: null,
  aircraftType: 'HURI',
  isPolice: false,
};

function Dashboard({ lat, lon, dev, topgun, warbird }: { lat: number; lon: number; dev: boolean; topgun: boolean; warbird: boolean }) {
  const [militaryMode, setMilitaryMode] = useState(false);
  const [normalTab, setNormalTab] = useState<'nearby' | 'explore' | 'changelog' | 'stats'>('nearby');
  const [exploreCity, setExploreCity] = useState<typeof EXPLORE_CITIES[number] | null>(null);
  const homeLat = exploreCity?.lat ?? lat;
  const homeLon = exploreCity?.lon ?? lon;
  // Delay injecting the dummy so the app looks normal for 5s before the alert fires
  const [topGunActive, setTopGunActive] = useState(false);
  const [warbirdActive, setWarbirdActive] = useState(false);
  const { flights: rawFlights, status } = useFlightStream(
    homeLat, homeLon, militaryMode ? 'military' : 'normal', dev,
    () => setTopGunActive(true), () => setTopGunActive(false),
    () => setWarbirdActive(true), () => setWarbirdActive(false),
  );
  useEffect(() => {
    if (!topgun) return;
    const t = setTimeout(() => setTopGunActive(true), 5000);
    return () => clearTimeout(t);
  }, [topgun]);
  useEffect(() => {
    if (!warbird) return;
    const t = setTimeout(() => setWarbirdActive(true), 5000);
    return () => clearTimeout(t);
  }, [warbird]);
  const flights = useMemo(() => {
    if (militaryMode) return rawFlights;
    let result = rawFlights;
    if (topGunActive) {
      const dummy = { ...TOPGUN_DUMMY, latitude: homeLat + 0.04, longitude: homeLon + 0.04 };
      result = [dummy, ...result.filter(f => f.icao24 !== dummy.icao24)];
    }
    if (warbirdActive) {
      const dummy = { ...WARBIRD_DUMMY, latitude: homeLat + 0.03, longitude: homeLon - 0.04 };
      result = [...result.filter(f => f.icao24 !== dummy.icao24), dummy];
    }
    return result;
  }, [rawFlights, topGunActive, warbirdActive, militaryMode, homeLat, homeLon]);
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
  const allCategories = militaryMode ? MILITARY_CATEGORIES : NORMAL_CATEGORIES;
  const [activeCategories, setActiveCategories] = useState<Set<FilterCategory>>(NORMAL_CATEGORIES);
  const [fullscreenPanel, setFullscreenPanel] = useState<FullscreenPanel>(null);
  const [milTab, setMilTab] = useState<'nearby' | 'hotspots' | 'regions'>('nearby');
  const [focusPoint, setFocusPoint] = useState<[number, number, number?] | null>(null);
  const flightHistoryRef = useRef<Map<string, [number, number, number?][]>>(new Map());
  const traceFetchedRef = useRef<Set<string>>(new Set());
  const [selectedTrail, setSelectedTrail] = useState<[number, number, number?][]>([]);
  // Routes fetched on-demand when the user selects a non-closest flight.
  // Merged into selectedFlight for display until the next SSE tick brings it in via cache.
  const [routeOverrides, setRouteOverrides] = useState<Record<string, RouteInfo | null>>({});
  const routeFetchAttemptedRef = useRef<Set<string>>(new Set());

  // Reset active categories, tab, and focus whenever mode changes
  useEffect(() => {
    setActiveCategories(militaryMode ? MILITARY_CATEGORIES : NORMAL_CATEGORIES);
    setMilTab('nearby');
    setFocusPoint(null);
  }, [militaryMode]);

  // Reset selection and history when explore city changes
  useEffect(() => {
    setSelectedIcao(null);
    flightHistoryRef.current.clear();
    traceFetchedRef.current.clear();
    routeFetchAttemptedRef.current.clear();
    setRouteOverrides({});
    setSelectedTrail([]);
    if (exploreCity) setFocusPoint([exploreCity.lat, exploreCity.lon, 9]);
  }, [exploreCity]);

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

  // Warbird aircraft present in the full (unfiltered) flight list
  const warbirdFlights = useMemo(() =>
    flights.filter(f => !f.isPolice && categorizeAircraft(f.aircraftType) === 'warbird'),
    [flights]
  );

  // Fighter/attack aircraft — shown in normal mode with special alert
  const topGunFlights = useMemo(() =>
    !militaryMode ? flights.filter(f => {
      const cat = categorizeAircraft(f.aircraftType);
      return !f.isPolice && (cat === 'fighter' || cat === 'attack');
    }) : [],
    [flights, militaryMode]
  );

  // Top Gun takeover — fires once when fighters first appear
  const [topGunTakeover, setTopGunTakeover] = useState(false);
  // Keep component mounted for 500ms after dismiss so exit animation can play
  const [topGunDismissing, setTopGunDismissing] = useState(false);
  const dismissTopGunRef = useRef(() => {
    setTopGunTakeover(false);
    setTopGunDismissing(true);
    setTimeout(() => setTopGunDismissing(false), 500);
  });
  const prevTopGunCountRef = useRef(0);
  const prevMilitaryModeRef = useRef(militaryMode);
  useEffect(() => {
    // When military mode changes, reset all top gun state and skip detection for this cycle
    if (prevMilitaryModeRef.current !== militaryMode) {
      prevMilitaryModeRef.current = militaryMode;
      prevTopGunCountRef.current = 0;
      setTopGunTakeover(false);
      setTopGunDismissing(false);
      return;
    }
    const count = topGunFlights.length;
    if (count > 0 && prevTopGunCountRef.current === 0) {
      setTopGunTakeover(true);
      playRadarLock();
    }
    if (count === 0 && prevTopGunCountRef.current > 0) dismissTopGunRef.current();
    prevTopGunCountRef.current = count;
  }, [topGunFlights.length, militaryMode]);

  // Flights to show in the alert — real fighters if present, dummy otherwise
  const topGunAlertFlights = useMemo(() => {
    if (topGunFlights.length > 0) return topGunFlights;
    return [{ ...TOPGUN_DUMMY, latitude: homeLat + 0.04, longitude: homeLon + 0.04 }];
  }, [topGunFlights, homeLat, homeLon]);

  // Filter flights by active categories
  const displayFlights = useMemo(() => {
    if (activeCategories.size === allCategories.size) return flights;
    return flights.filter(f => {
      if (f.isPolice) return activeCategories.has('police');
      const raw = categorizeAircraft(f.aircraftType);
      if (raw === 'airship') return true; // always show — not in the legend/filter UI
      const cat: FilterCategory = militaryMode
        ? raw as FilterCategory
        : MILITARY_CATS.has(raw) ? 'military' : raw as FilterCategory;
      return activeCategories.has(cat);
    });
  }, [flights, activeCategories, allCategories, militaryMode]);

  const hotspots = useMemo<Hotspot[]>(() => {
    if (!militaryMode) return [];
    return clusterFlights(flights, lat, lon);
  }, [flights, militaryMode, lat, lon]);

  const regionGroups = useMemo<BroadRegionGroup[]>(() => {
    if (!militaryMode) return [];
    return groupByBroadRegion(flights);
  }, [flights, militaryMode]);

  // Use manually selected flight if still visible, otherwise fall back to closest visible
  const baseSelectedFlight = (selectedIcao ? displayFlights.find(f => f.icao24 === selectedIcao) : null) ?? displayFlights[0] ?? null;
  // Apply on-demand route override (from /api/route fetch) if the stream hasn't filled it in yet
  const selectedFlight = baseSelectedFlight && !baseSelectedFlight.route && routeOverrides[baseSelectedFlight.icao24]
    ? { ...baseSelectedFlight, route: routeOverrides[baseSelectedFlight.icao24] }
    : baseSelectedFlight;

  // Accumulate position history for every flight on each poll
  useEffect(() => {
    const activeIcaos = new Set(flights.map(f => f.icao24));
    for (const f of flights) {
      const prev = flightHistoryRef.current.get(f.icao24) ?? [];
      const last = prev[prev.length - 1];
      if (!last || last[0] !== f.latitude || last[1] !== f.longitude) {
        const next = [...prev, [f.latitude, f.longitude, f.velocity ?? undefined] as [number, number, number?]];
        flightHistoryRef.current.set(f.icao24, next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next);
      }
    }
    // Evict history for flights no longer in the current response
    for (const icao of flightHistoryRef.current.keys()) {
      if (!activeIcaos.has(icao)) flightHistoryRef.current.delete(icao);
    }
    const icao = (selectedIcao ?? selectedFlight?.icao24) ?? null;
    if (icao) setSelectedTrail(flightHistoryRef.current.get(icao) ?? []);
  }, [flights]);

  // Select a flight and immediately swap the trail in the same render (no flash of old trail)
  const selectFlight = (icao24: string | null) => {
    setSelectedIcao(icao24);
    setSelectedTrail(icao24 ? (flightHistoryRef.current.get(icao24) ?? []) : []);
  };

  // Backfill trail from globe.adsbexchange.com for whichever flight is displayed.
  // Keyed on selectedFlight so it also fires for the auto-selected first flight.
  // A Set prevents re-fetching the same plane within a session.
  useEffect(() => {
    const icao = selectedFlight?.icao24;
    if (!icao || traceFetchedRef.current.has(icao)) return;
    let cancelled = false;
    fetch(`/api/trace/${icao}`)
      .then(r => r.ok ? r.json() : null)
      .then((positions: [number, number, number][] | null) => {
        if (cancelled || !positions || positions.length === 0) return;
        traceFetchedRef.current.add(icao);
        // Prepend historical data to any live positions already accumulated,
        // so the trail bridges from history all the way to the current position.
        const live = flightHistoryRef.current.get(icao) ?? [];
        const merged = ([...positions, ...live] as [number, number, number?][]).slice(-MAX_HISTORY);
        flightHistoryRef.current.set(icao, merged);
        setSelectedTrail(merged);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedFlight?.icao24]);

  // On-demand route lookup: when the user explicitly selects a flight that has
  // no route yet (poller only auto-fetches the closest), hit /api/route to
  // trigger a FlightAware lookup. Subject to the same daily cap on the server.
  useEffect(() => {
    if (!selectedIcao) return;
    const f = baseSelectedFlight;
    if (!f || f.icao24 !== selectedIcao) return;
    if (f.route) return;
    if (!f.callsign) return;
    if (routeFetchAttemptedRef.current.has(f.icao24)) return;
    routeFetchAttemptedRef.current.add(f.icao24);
    let cancelled = false;
    fetch(`/api/route?icao24=${encodeURIComponent(f.icao24)}&callsign=${encodeURIComponent(f.callsign)}${dev ? '&dev=1' : ''}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { route: RouteInfo | null } | null) => {
        if (cancelled || !data) return;
        setRouteOverrides(prev => ({ ...prev, [f.icao24]: data.route }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedIcao, baseSelectedFlight?.icao24, baseSelectedFlight?.callsign, baseSelectedFlight?.route]);

  const info = useFlightInfo(selectedFlight?.icao24 ?? null, selectedFlight?.aircraftType ? (aircraftTypeName(selectedFlight.aircraftType) ?? null) : null, selectedFlight?.callsign ?? null);

  return (
    <div className="h-full flex flex-col bg-slate-900 relative">
      <div className="flex-1 flex flex-col md:flex-row gap-2 p-2 overflow-hidden min-h-0">
        {/* Map + flight list — hidden when card is fullscreen */}
        {fullscreenPanel !== 'card' && (
        <div className={`${fullscreenPanel ? 'flex-1' : 'flex-[3]'} flex flex-col gap-2 min-h-0 min-w-0`}>

          {/* Map — hidden when flights is fullscreen */}
          {fullscreenPanel !== 'flights' && (
          <div className={`${fullscreenPanel === 'map' ? 'flex-1' : 'flex-[2]'} min-h-0 rounded-2xl overflow-hidden shadow-xl relative`}>
            <FlightMap userLat={homeLat} userLon={homeLon} flight={selectedFlight} flights={displayFlights} trail={selectedTrail} onSelectFlight={(icao24) => selectFlight(icao24 === selectedFlight?.icao24 ? null : icao24)} militaryMode={militaryMode} focusPoint={focusPoint} />
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
              {militaryMode ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setMilTab('nearby')}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${milTab === 'nearby' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >Nearby <span className="opacity-60">{displayFlights.length}{displayFlights.length !== flights.length ? `/${flights.length}` : ''}</span></button>
                  <button
                    onClick={() => setMilTab('hotspots')}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${milTab === 'hotspots' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >Hotspots <span className="opacity-60">{hotspots.length}</span></button>
                  <button
                    onClick={() => setMilTab('regions')}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${milTab === 'regions' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >Regions <span className="opacity-60">{regionGroups.length}</span></button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setNormalTab('nearby')}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${normalTab === 'nearby' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >Nearby <span className="opacity-60">{Math.min(displayFlights.length, 10)}{flights.length > 10 ? `/${flights.length}` : ''}</span></button>
                  <button
                    onClick={() => setNormalTab('explore')}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${normalTab === 'explore' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >Explore</button>
                  <button
                    onClick={() => setNormalTab('changelog')}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${normalTab === 'changelog' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >Changelog</button>
                  <button
                    onClick={() => setNormalTab('stats')}
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${normalTab === 'stats' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >Stats</button>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                {dev && <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">DEV</span>}
                <span className="text-[10px] font-mono text-slate-500 select-none" title="App version">{APP_VERSION}</span>
                {fullscreenPanel === 'flights'
                  ? <CollapseBtn onClick={() => setFullscreenPanel(null)} />
                  : <ExpandBtn onClick={() => setFullscreenPanel('flights')} />}
              </div>
            </div>

            {/* Hotspots tab */}
            {militaryMode && milTab === 'hotspots' && (
              hotspots.length === 0 ? (
                <div className="px-3 py-3 text-xs text-slate-500">No clusters yet…</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {hotspots.map((h, i) => (
                    <button
                      key={h.id}
                      onClick={() => setFocusPoint([h.lat, h.lon])}
                      className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-slate-500 text-xs font-mono w-4">#{i + 1}</span>
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">{h.flights.length} aircraft</span>
                        <span className="text-xs font-medium text-slate-200 flex-1 min-w-0 truncate">{h.regionName}</span>
                        <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">{h.distanceMiles < 1000 ? `${Math.round(h.distanceMiles)} mi` : `${(h.distanceMiles / 1000).toFixed(1)}k mi`}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 pl-6">
                        {h.flights.slice(0, 6).map(f => (
                          <span key={f.icao24} className="text-xs font-mono text-green-400/70">{f.callsign ?? f.icao24.toUpperCase()}</span>
                        ))}
                        {h.flights.length > 6 && <span className="text-xs text-slate-500">+{h.flights.length - 6} more</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}

            {/* Regions tab */}
            {militaryMode && milTab === 'regions' && (
              regionGroups.length === 0 ? (
                <div className="px-3 py-3 text-xs text-slate-500">No data yet…</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {regionGroups.map(r => (
                    <button
                      key={r.name}
                      onClick={() => setFocusPoint([r.centerLat, r.centerLon, r.zoom])}
                      className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 flex-shrink-0">{r.count}</span>
                        <span className="text-xs font-medium text-slate-200 flex-1 min-w-0">{r.name}</span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-slate-600 flex-shrink-0">
                          <path d="M3.5 1.5L7 5l-3.5 3.5L2 7.5 5 5 2 2.5z"/>
                        </svg>
                      </div>
                      <div className="flex flex-wrap gap-1 pl-7">
                        {r.flights.slice(0, 5).map(f => (
                          <span key={f.icao24} className="text-xs font-mono text-green-400/70">{f.callsign ?? f.icao24.toUpperCase()}</span>
                        ))}
                        {r.count > 5 && <span className="text-xs text-slate-500">+{r.count - 5} more</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}

            {/* Explore city indicator when on nearby tab */}
            {!militaryMode && normalTab === 'nearby' && exploreCity && (
              <div className="px-3 py-1.5 border-b border-white/5 flex items-center gap-2 bg-sky-500/5">
                <span className="text-xs text-sky-400 font-medium flex-1 truncate">Exploring {exploreCity.name}</span>
                <button
                  onClick={() => setExploreCity(null)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
                >✕ Home</button>
              </div>
            )}

            {/* Explore tab */}
            {!militaryMode && normalTab === 'explore' && (
              <div className="p-2 flex flex-col gap-2">
                {exploreCity && (
                  <button
                    onClick={() => { setExploreCity(null); setNormalTab('nearby'); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-400/20 text-sky-400 text-xs hover:bg-sky-500/20 transition-colors"
                  >
                    <span>←</span> Return to home location
                  </button>
                )}
                {(['city', 'military'] as const).map(cat => (
                  <div key={cat}>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1">
                      {cat === 'city' ? 'Cities' : 'Military Bases'}
                    </div>
                    <div className="flex flex-col gap-1">
                      {EXPLORE_CITIES.filter(c => c.category === cat).map(city => (
                        <button
                          key={city.name}
                          onClick={() => { setExploreCity(city); setNormalTab('nearby'); }}
                          className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                            exploreCity?.name === city.name
                              ? 'bg-sky-500/20 border-sky-400/40 text-white'
                              : 'bg-slate-900/60 border-white/5 text-slate-300 hover:bg-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="text-sm font-semibold">{city.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{city.region}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Changelog tab */}
            {!militaryMode && normalTab === 'changelog' && (
              <div className="p-3 flex flex-col gap-3">
                <UpdateButton />
                {CHANGELOG.map(entry => (
                  <div key={entry.version}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-semibold text-white font-mono">v{entry.version}</span>
                      <span className="text-xs text-slate-500">{entry.date}</span>
                    </div>
                    <ul className="text-xs text-slate-300 space-y-1 list-disc pl-4 marker:text-slate-600">
                      {entry.changes.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* Stats tab */}
            {!militaryMode && normalTab === 'stats' && <StatsTab />}

            {/* Nearby aircraft tab (normal mode always, military mode when nearby tab active) */}
            {(!militaryMode || milTab === 'nearby') && (militaryMode || normalTab === 'nearby') && (
              displayFlights.length === 0 ? (
                <div className="px-3 py-3 text-xs text-slate-500">No data yet…</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 uppercase tracking-wider">
                      <th className="px-3 py-1 text-left font-medium w-px">Callsign</th>
                      {!militaryMode && <th className="px-3 py-1 text-left font-medium">Route</th>}
                      {militaryMode && <th className="px-3 py-1 text-left font-medium w-full">Model</th>}
                      <th className="px-3 py-1 text-right font-medium w-px">Dist</th>
                      <th className="px-3 py-1 text-right font-medium w-px">Alt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayFlights.slice(0, militaryMode ? displayFlights.length : 10).map((f) => (
                      <tr
                        key={f.icao24}
                        onClick={() => selectFlight(f.icao24 === selectedFlight?.icao24 ? null : f.icao24)}
                        className={`cursor-pointer ${f.icao24 === selectedFlight?.icao24
                          ? 'bg-red-500/15 text-white'
                          : 'text-slate-300 hover:bg-white/5'}`}
                      >
                        <td className="px-3 py-1 font-mono whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <CategoryIcon category={categorizeAircraft(f.aircraftType)} isPolice={f.isPolice} />
                            {militaryMode && (() => { const c = getCountryFromIcao(f.icao24); return c ? <span className="text-base leading-none" title={c.name}>{c.flag}</span> : null; })()}
                            {f.callsign ?? f.icao24}
                          </span>
                        </td>
                        {!militaryMode && <td className="px-3 py-1 max-w-0 truncate">
                          {(f.route ?? routeOverrides[f.icao24])
                            ? <span className="text-slate-400">{(f.route ?? routeOverrides[f.icao24])!.originCity} → {(f.route ?? routeOverrides[f.icao24])!.destinationCity}</span>
                            : <span className="text-slate-600 italic">{routeSkipReason(f) ?? '—'}</span>}
                        </td>}
                        {militaryMode && <td className="px-3 py-1 w-full max-w-0 truncate">
                          {f.aircraftType
                            ? <span className="text-slate-300">{aircraftTypeName(f.aircraftType) ?? f.aircraftType.toUpperCase()}</span>
                            : <span className="text-slate-600">—</span>}
                        </td>}
                        <td className="px-3 py-1 text-right whitespace-nowrap">{f.distanceMiles.toFixed(1)} mi</td>
                        <td className="px-3 py-1 text-right whitespace-nowrap">
                          {f.baroAltitude != null ? `${Math.round(f.baroAltitude * 3.28084 / 100) * 100}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
          )}
        </div>
        )}

        {/* Sidebar — hidden when map or flights is fullscreen */}
        {(fullscreenPanel === null || fullscreenPanel === 'card') && (
        <div className={`${fullscreenPanel === 'card' ? 'flex-1' : 'flex-[2]'} flex flex-col gap-1.5 min-w-0 ${fullscreenPanel === 'card' ? 'overflow-hidden' : 'overflow-y-auto'}`}>

          <div className={fullscreenPanel === 'card' ? 'flex-1 min-h-0 flex flex-col' : 'flex-shrink-0'}>
            {selectedFlight ? (
              <div key={selectedFlight.icao24} className={`flight-card-enter${fullscreenPanel === 'card' ? ' flex-1 min-h-0' : ''}`}>
                <FlightCard
                  flight={selectedFlight}
                  info={info}
                  isFullscreen={fullscreenPanel === 'card'}
                  onToggleFullscreen={() => setFullscreenPanel(fullscreenPanel === 'card' ? null : 'card')}
                  militaryMode={militaryMode}
                />
              </div>
            ) : (
              <div className="bg-slate-800/60 rounded-xl p-3 text-center text-slate-400 text-xs border border-white/10">
                {status === 'connecting' || status === 'reconnecting'
                  ? 'Searching for nearby flights…'
                  : 'No airborne flights detected nearby. Click a row to select.'}
              </div>
            )}
            {selectedIcao && (
              <button
                onClick={() => selectFlight(null)}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 mt-1.5 rounded-xl bg-sky-500/15 border border-sky-400/30 text-sky-400 text-xs font-medium hover:bg-sky-500/25 transition-colors"
              >
                <span>⟳</span> Return to closest plane
              </button>
            )}
          </div>

          {/* Top Gun alert — fighter/attack aircraft in normal mode, or SSH-triggered */}
          {fullscreenPanel === null && (topGunFlights.length > 0 || topGunTakeover || topGunDismissing) && (
            <TopGunAlert
              flights={topGunAlertFlights}
              selectedFlight={selectedFlight}
              onTrack={selectFlight}
              takeover={topGunTakeover}
              onDismissModal={() => dismissTopGunRef.current()}
            />
          )}

          {/* Warbird alert — vintage aircraft in normal mode */}
          {fullscreenPanel === null && !militaryMode && warbirdFlights.length > 0 && (
            <WarbirdAlert
              flights={warbirdFlights}
              selectedFlight={selectedFlight}
              onTrack={selectFlight}
            />
          )}

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
                      onClick={() => selectFlight(f.icao24 === selectedFlight?.icao24 ? null : f.icao24)}
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
                      onClick={() => selectFlight(f.icao24 === selectedFlight?.icao24 ? null : f.icao24)}
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
              {[...(militaryMode ? MILITARY_LEGEND_ENTRIES : LEGEND_ENTRIES)]
                .sort((a, b) => (categoryCounts.get(b.category) ?? 0) - (categoryCounts.get(a.category) ?? 0))
                .map(({ category, label, svg }) => {
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

            {/* Trail speed gradient key */}
            <div className="mt-2 px-1.5">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Trail Speed</div>
              <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(to right, #a855f7, #38bdf8, #4ade80, #facc15)' }} />
              <div className="flex justify-between mt-0.5">
                <span className="text-xs font-mono text-slate-500">≤35 mph</span>
                <span className="text-xs font-mono text-slate-500">~375 mph</span>
                <span className="text-xs font-mono text-slate-500">≥635 mph</span>
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
  const params = new URLSearchParams(window.location.search);
  const dev = params.get('dev') === '1';
  const topgun = params.get('topgun') === '1';
  const warbird = params.get('warbird') === '1';

  return <Dashboard lat={geo.lat} lon={geo.lon} dev={dev} topgun={topgun} warbird={warbird} />;
}
