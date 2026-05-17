import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { GeoJSONSource } from 'mapbox-gl';
import { FlightState } from '../types';
import { AIRPORT_COORDS } from '../utils';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;

// Top-down aircraft SVG paths, nose points UP (north) at heading=0, centered at (0,0).
const JET_PATH       = 'M0,-22 L2,-15 L2.5,-5 L20,5 L20,9 L2.5,4 L3,12 L8,14 L8,17 L1.5,16 L0,18 L-1.5,16 L-8,17 L-8,14 L-3,12 L-2.5,4 L-20,9 L-20,5 L-2.5,-5 L-2,-15 Z';
const PROP_PATH      = 'M0,-19 L2,-13 L2.5,-3 L16,0 L16,4 L2.5,2 L2.5,12 L7,14 L7,17 L1,16 L0,18 L-1,16 L-7,17 L-7,14 L-2.5,12 L-2.5,2 L-16,4 L-16,0 L-2.5,-3 L-2,-13 Z';
const SMALL_PATH     = 'M0,-16 L1.5,-11 L2,-2 L14,1 L14,4 L2,1 L2,11 L5,12 L5,15 L1,14 L0,16 L-1,14 L-5,15 L-5,12 L-2,11 L-2,1 L-14,4 L-14,1 L-2,-2 L-1.5,-11 Z';
const FIGHTER_PATH   = 'M0,-22 L1.5,-14 L2.5,-4 L21,10 L16,15 L2.5,9 L3,14 L6,17 L2,20 L0,21 L-2,20 L-6,17 L-3,14 L-2.5,9 L-16,15 L-21,10 L-2.5,-4 L-1.5,-14 Z';
const BOMBER_PATH    = 'M0,-14 L2,-8 L3,-1 L23,6 L22,10 L3,5 L3,13 L6,14 L6,17 L1,16 L0,18 L-1,16 L-6,17 L-6,14 L-3,13 L-3,5 L-22,10 L-23,6 L-3,-1 L-2,-8 Z';
const TRANSPORT_PATH = 'M0,-18 L3,-10 L5,-4 L20,2 L20,7 L5,2 L4,13 L8,15 L8,18 L1,17 L0,19 L-1,17 L-8,18 L-8,15 L-4,13 L-5,2 L-20,7 L-20,2 L-5,-4 L-3,-10 Z';
const ATTACK_PATH    = 'M0,-19 L2,-12 L2.5,-2 L20,2 L20,6 L2.5,4 L4,12 L8,13 L7,16 L0,15 L-7,16 L-8,13 L-4,12 L-2.5,4 L-20,6 L-20,2 L-2.5,-2 L-2,-12 Z';
const UAV_PATH       = 'M0,-11 L1,-6 L1.5,0 L25,4 L25,7 L1.5,3 L2,11 L5,13 L4,15 L0,14 L-4,15 L-5,13 L-2,11 L-1.5,3 L-25,7 L-25,4 L-1.5,0 L-1,-6 Z';
const WARBIRD_PATH   = 'M0,-22 L1.5,-14 L2.5,-5 L17,4 L15,8 L2.5,4 L3,12 L6,14 L5,17 L0,16 L-5,17 L-6,14 L-3,12 L-2.5,4 L-15,8 L-17,4 L-2.5,-5 L-1.5,-14 Z';
const HELI_ICON_PATH = 'M-22,-2.5 L22,-2.5 L22,2.5 L-22,2.5 Z M-2.5,-22 L2.5,-22 L2.5,22 L-2.5,22 Z';

export function heliInnerSvg(color: string, filterAttr: string): string {
  const s = `stroke="rgba(0,0,0,0.7)" stroke-width="0.8"`;
  return (
    `<rect x="-20" y="-2" width="40" height="4" rx="2" fill="${color}" ${s}/>` +
    `<rect x="-2" y="-20" width="4" height="40" rx="2" fill="${color}" ${s}/>` +
    `<circle cx="0" cy="0" r="3" fill="${color}" stroke="rgba(0,0,0,0.85)" stroke-width="1"/>` +
    `<path d="M0,-11 C5,-11 8,-5 8,1 C8,7 5,11 0,13 C-5,11 -8,7 -8,1 C-8,-5 -5,-11 0,-11 Z" ` +
    `fill="${color}" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" ${filterAttr}/>` +
    `<rect x="-1.5" y="12" width="3" height="10" rx="1" fill="${color}" ${s}/>` +
    `<rect x="-8" y="19" width="16" height="3" rx="1.5" fill="${color}" ${s}/>`
  );
}

export type AircraftCategory = 'jet' | 'prop' | 'small' | 'heli' | 'fighter' | 'bomber' | 'transport' | 'attack' | 'uav' | 'mil-heli' | 'warbird' | 'airship';

export function getAircraftSvgInfo(category: AircraftCategory): { path: string; rotates: boolean } {
  switch (category) {
    case 'heli': case 'mil-heli': return { path: HELI_ICON_PATH, rotates: false };
    case 'prop':      return { path: PROP_PATH,      rotates: true };
    case 'small':     return { path: SMALL_PATH,     rotates: true };
    case 'fighter':   return { path: FIGHTER_PATH,   rotates: true };
    case 'bomber':    return { path: BOMBER_PATH,    rotates: true };
    case 'transport': return { path: TRANSPORT_PATH, rotates: true };
    case 'attack':    return { path: ATTACK_PATH,    rotates: true };
    case 'uav':       return { path: UAV_PATH,       rotates: true };
    case 'warbird':   return { path: WARBIRD_PATH,   rotates: true };
    default:          return { path: JET_PATH,       rotates: true };
  }
}

export const MILITARY_CATS: ReadonlySet<AircraftCategory> = new Set(['fighter', 'bomber', 'transport', 'attack', 'uav', 'mil-heli']);
export const WARBIRD_CATS: ReadonlySet<AircraftCategory> = new Set(['warbird']);

function categorizeMilitary(t: string): 'fighter' | 'bomber' | 'transport' | 'attack' | 'uav' | 'mil-heli' {
  if (['B52','B1B','B2'].includes(t)) return 'bomber';
  if (['C130','C30J','C17','C5A','C5M','SW4','CN35','A400','DHC6','M28','IL76',
       'KC10','KC135','KC46','K35R',
       'E3','E3TF','E8','E6','E2','P3','P8','W135','R135','GLF3','GLF5'].includes(t)) return 'transport';
  if (['A10','AC13','AC130','TUCA'].includes(t)) return 'attack';
  if (['U2','SR71','RQ4','Q4','MQ9','MQ1','X47B','RQ180','BTB2'].includes(t)) return 'uav';
  if (['H60','S70','UH60','HH60','MH60','SH60','CH47','H47','AH64','UH1','UH1Y','AH1',
       'CH53','H53S','OH58','HH65','HH1','AS65','B212','B412','A119','A139','A169',
       'H500','AS55'].includes(t)) return 'mil-heli';
  return 'fighter';
}

export function categorizeAircraft(typeCode: string | null): AircraftCategory {
  if (!typeCode) return 'jet';
  const t = typeCode.toUpperCase();

  if (['SHIP', 'ZNTH'].includes(t)) return 'airship';

  const warbirdCodes = new Set([
    'P51','P51D','P38','P38L','P40','P40N','P47','P47D',
    'F4U','F4U1','F6F','FM2','ZERO',
    'ME09','FW19','SPIT','HURI','YAK3','YAK9',
    'AT6','SNJ','PT17','B17','B25','SBD','TBF','A26',
    'DC3','C47','BE18',
    'F86','F86D','F86F','MIG15',
    'T28','T28A','T34',
  ]);
  if (warbirdCodes.has(t)) return 'warbird';

  const militaryCodes = new Set([
    'F14','F15','F16','F18','FA18','F22','F35','F117','F5',
    'B52','B1B','B2',
    'A10','AC13','AC130','TUCA',
    'C130','C30J','C17','C5A','C5M','SW4',
    'CN35','A400','DHC6','M28','IL76',
    'KC10','KC135','KC46','K35R',
    'E3','E3TF','E8','E6','E2',
    'U2','SR71','RQ4','Q4','MQ9','MQ1','X47B','RQ180','BTB2',
    'P3','P8',
    'W135','R135','GLF3','GLF5',
    'V22',
    'T38','T6','T45','TEX2','HAWK','G120','G12T','PC7',
    'EF2000','EUFI',
    'RFAL',
    'JAS3',
    'TORA',
    'AV8B',
    'AJET',
    'L39',
    'MIG29','MIG21',
    'SU27','SU30','SU35',
    'F2',
    'T50',
    'H60','S70','UH60','HH60','MH60','SH60',
    'CH47','H47',
    'AH64',
    'UH1','UH1Y','HH1',
    'AH1',
    'CH53','H53S',
    'OH58',
    'HH65',
    'AS65',
    'B212','B412',
    'A119','A139','A169',
    'H500','AS55',
  ]);
  if (militaryCodes.has(t)) return categorizeMilitary(t);

  if (t.startsWith('H') || ['EC35','EC45','EC55','EC75','AS50','AS32','AS35','S76','S92',
    'B06','B07','R22','R44','R66','B505','AW13','AW16','AW17','AW18','AW19'].includes(t)) return 'heli';

  const smallPrefixes = [
    'C15','C17','C18','C19',
    'PA2','PA3','PA4',
    'SR2','SR3',
    'DA4','DA5','DA6',
    'M20',
    'BE33','BE35','BE36',
    'RV','C42','C72','CT4',
    'P28','P32','P46','GA',
    'C5',
    'LJ',
    'E50','E55',
    'BE40',
    'HDJT',
    'EA50',
    'FA1','FA2',
    'CRJ',
    'E13','E14',
  ];
  if (smallPrefixes.some(p => t.startsWith(p))) return 'small';

  const propPrefixes = ['AT4','AT7','DH8','SB2','SB3','SF3','JS4','JS3','C208','C212',
    'BE20','BE30','PA31','PA42','TBM','PC12','PC24','L18','L4','PL2'];
  if (propPrefixes.some(p => t.startsWith(p))) return 'prop';

  return 'jet';
}

// ── Tile options ─────────────────────────────────────────────────────────────

export const TILE_OPTIONS = [
  { id: 'outdoors',          label: 'Terrain' },
  { id: 'light',             label: 'Light' },
  { id: 'dark',              label: 'Dark' },
  { id: 'streets',           label: 'Streets' },
  { id: 'satellite_streets', label: 'Satellite' },
] as const;
export type TileId = typeof TILE_OPTIONS[number]['id'];

const MAPBOX_STYLES: Record<TileId, string> = {
  outdoors:          'mapbox://styles/mapbox/outdoors-v12',
  light:             'mapbox://styles/mapbox/light-v11',
  dark:              'mapbox://styles/mapbox/dark-v11',
  streets:           'mapbox://styles/mapbox/streets-v12',
  satellite_streets: 'mapbox://styles/mapbox/satellite-streets-v12',
};

// ── Shared utilities (also used by FlightMap3D) ──────────────────────────────

export function haversineDist(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const φ1 = (a[0] * Math.PI) / 180, φ2 = (b[0] * Math.PI) / 180;
  const Δφ = ((b[0] - a[0]) * Math.PI) / 180;
  const Δλ = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

export function trailColor(speedMs: number): string {
  const kts = speedMs * 1.94384;
  if (kts <= 30)  return '#a855f7';
  if (kts >= 550) return '#facc15';
  if (kts < 100)  return lerpColor('#a855f7', '#38bdf8', (kts - 30) / 70);
  if (kts < 350)  return lerpColor('#38bdf8', '#4ade80', (kts - 100) / 250);
  return lerpColor('#4ade80', '#facc15', (kts - 350) / 200);
}

export function deadReckon(
  lat: number, lon: number,
  headingDeg: number, velocityMs: number,
  dtSeconds: number,
): [number, number] {
  const dt = Math.min(dtSeconds, 20);
  const distM = velocityMs * dt;
  const headingRad = (headingDeg * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = (distM * Math.cos(headingRad)) / R;
  const dLon = (distM * Math.sin(headingRad)) / (R * Math.cos((lat * Math.PI) / 180));
  return [lat + (dLat * 180) / Math.PI, lon + (dLon * 180) / Math.PI];
}

// ── Aircraft marker element ──────────────────────────────────────────────────

function buildAircraftElement(flight: FlightState, isSelected: boolean): HTMLDivElement {
  const cat = categorizeAircraft(flight.aircraftType);
  const color = isSelected        ? '#ef4444'
    : flight.isPolice ? '#60a5fa'
    : MILITARY_CATS.has(cat)      ? '#4ade80'
    : WARBIRD_CATS.has(cat)       ? '#fb923c'
    : '#facc15';
  const heading = (cat === 'heli' || cat === 'mil-heli') ? 0 : (flight.trueTrack ?? 0);

  const ns = `stroke="rgba(0,0,0,0.7)" stroke-width="0.8"`;
  const pod = (cx: number, cy: number, rx: number, ry: number) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" ${ns}/>`;

  let body: string;
  if (cat === 'airship') {
    const st = `fill="${color}" stroke="rgba(0,0,0,0.85)" stroke-width="1.5"`;
    body = `<g transform="rotate(${heading})">` +
      `<ellipse cx="0" cy="-3" rx="7" ry="18" ${st}/>` +
      `<rect x="-3" y="8" width="6" height="5" rx="1.5" ${st}/>` +
      `<path d="M-7,10 L-13,21 L-3,14 Z" ${st}/>` +
      `<path d="M7,10 L13,21 L3,14 Z" ${st}/>` +
      `</g>`;
  } else if (cat === 'heli' || cat === 'mil-heli') {
    body = heliInnerSvg(color, '');
  } else {
    const { path } = getAircraftSvgInfo(cat);
    let nacelles = '';
    if (cat === 'jet') {
      nacelles = pod(13, 5, 1.5, 3) + pod(-13, 5, 1.5, 3);
    } else if (cat === 'prop') {
      nacelles = pod(10, 0.5, 1.5, 3) + pod(-10, 0.5, 1.5, 3) +
        `<ellipse cx="10" cy="-4" rx="5" ry="0.7" fill="${color}" ${ns}/>` +
        `<ellipse cx="-10" cy="-4" rx="5" ry="0.7" fill="${color}" ${ns}/>`;
    } else if (cat === 'transport') {
      nacelles = pod(10, 1, 1.5, 2.5) + pod(16, 3.5, 1.5, 2.5) +
                 pod(-10, 1, 1.5, 2.5) + pod(-16, 3.5, 1.5, 2.5);
    } else if (cat === 'bomber') {
      nacelles = pod(9, 4, 1.5, 2.5) + pod(16, 6.5, 1.5, 2.5) +
                 pod(-9, 4, 1.5, 2.5) + pod(-16, 6.5, 1.5, 2.5);
    } else if (cat === 'attack') {
      nacelles = pod(5, 9, 1.3, 3) + pod(-5, 9, 1.3, 3);
    } else if (cat === 'warbird') {
      nacelles = `<ellipse cx="0" cy="-23" rx="6.5" ry="0.8" fill="${color}" ${ns}/>`;
    }
    body = `<g transform="rotate(${heading})">` +
      `<path d="${path}" fill="${color}" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round"/>` +
      nacelles + `</g>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="-26 -26 52 52">${body}</svg>`;
  const el = document.createElement('div');
  el.style.cssText = 'cursor:pointer;z-index:2;line-height:0;';
  const inner = document.createElement('div');
  inner.style.cssText = 'filter:drop-shadow(6px 6px 0.5px rgba(0,0,0,0.28));line-height:0;';
  inner.innerHTML = svg;
  el.appendChild(inner);
  return el;
}

// ── GeoJSON source helpers ────────────────────────────────────────────────────

const TRAIL_POLL_S = 15;

function applyTrailData(map: mapboxgl.Map, trail: [number, number, number?, number?][]) {
  const source = map.getSource('trail-line') as GeoJSONSource | undefined;
  if (!source) return;
  if (trail.length < 2) {
    source.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  const features = [];
  for (let i = 0; i < trail.length - 1; i++) {
    const speedMs = trail[i][2] ?? haversineDist(
      [trail[i][0], trail[i][1]],
      [trail[i + 1][0], trail[i + 1][1]],
    ) / TRAIL_POLL_S;
    features.push({
      type: 'Feature' as const,
      properties: { color: trailColor(speedMs) },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [trail[i][1], trail[i][0]],
          [trail[i + 1][1], trail[i + 1][0]],
        ],
      },
    });
  }
  source.setData({ type: 'FeatureCollection', features });
}

function applyDestData(map: mapboxgl.Map, flight: FlightState | null) {
  const source = map.getSource('dest-line') as GeoJSONSource | undefined;
  if (!source) return;
  const dest = flight?.route ? AIRPORT_COORDS[flight.route.destination?.toUpperCase()] : null;
  if (!dest || !flight) {
    source.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  source.setData({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: [[flight.longitude, flight.latitude], [dest[1], dest[0]]],
    },
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

const POLL_S = 10;

interface Props {
  userLat: number;
  userLon: number;
  flight: FlightState | null;
  flights: FlightState[];
  trail: [number, number, number?, number?][];
  onSelectFlight: (icao24: string) => void;
  militaryMode?: boolean;
  focusPoint?: [number, number, number?] | null;
  tileId: TileId;
}

export function FlightMap({ userLat, userLon, flight, flights, trail, onSelectFlight, militaryMode, focusPoint, tileId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, { icon: mapboxgl.Marker; flight: FlightState }>>(new Map());
  const onSelectRef = useRef(onSelectFlight);
  onSelectRef.current = onSelectFlight;
  const trailRef = useRef(trail);
  trailRef.current = trail;
  const flightRef = useRef(flight);
  flightRef.current = flight;
  const lastPollTimeRef = useRef(Date.now());
  const animFrameRef = useRef<number | null>(null);
  const fittedRef = useRef(false);
  const userDraggedRef = useRef(false);
  const prevFlightIcaoRef = useRef<string | null>(null);
  const sourcesReadyRef = useRef(false);
  const bearingRef = useRef(0);

  // Mount / unmount the map once
  useEffect(() => {
    if (!containerRef.current) return;

    const tick = () => {
      const elapsed = Math.min((Date.now() - lastPollTimeRef.current) / 1000, POLL_S);
      for (const [, { icon, flight: f }] of markersRef.current) {
        const v = f.velocity ?? 0;
        if (v > 0.5) {
          const [la, lo] = deadReckon(f.latitude, f.longitude, f.trueTrack ?? 0, v, elapsed);
          icon.setLngLat([lo, la]);
        }
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLES[tileId],
      center: [userLon, userLat],
      zoom: 8,
      pitch: 0,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('dragstart', () => { userDraggedRef.current = true; });
    map.on('rotate', () => {
      const b = map.getBearing();
      bearingRef.current = b;
      const t = b === 0 ? '' : `rotate(${(-b).toFixed(1)}deg)`;
      for (const [, { icon }] of markersRef.current) {
        const inner = icon.getElement().firstElementChild as HTMLElement | null;
        if (inner) inner.style.transform = t;
      }
    });

    map.on('style.load', () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      sourcesReadyRef.current = true;

      map.addSource('trail-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'trail-shadow',
        type: 'line',
        source: 'trail-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#000000', 'line-width': 5, 'line-opacity': 0.22, 'line-blur': 2 },
      });
      map.addLayer({
        id: 'trail-color',
        type: 'line',
        source: 'trail-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'] as unknown as string,
          'line-width': 3,
          'line-opacity': 0.85,
        },
      });

      map.addSource('dest-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'dest-layer',
        type: 'line',
        source: 'dest-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#f97316',
          'line-width': 2,
          'line-opacity': 0.3,
          'line-dasharray': [6, 5],
        },
      });

      applyTrailData(map, trailRef.current);
      applyDestData(map, flightRef.current);
      animFrameRef.current = requestAnimationFrame(tick);
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      markersRef.current.forEach(({ icon }) => icon.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      sourcesReadyRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync markers + AutoBounds + KeepFlightInView on every server update
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    lastPollTimeRef.current = Date.now();

    const selectedIcao = flight?.icao24 ?? null;
    const incoming = new Map(flights.map(f => [f.icao24, f]));

    for (const [icao, { icon }] of markersRef.current) {
      if (!incoming.has(icao)) {
        icon.remove();
        markersRef.current.delete(icao);
      }
    }

    const bearing = bearingRef.current;
    const bearingTransform = bearing === 0 ? '' : `rotate(${(-bearing).toFixed(1)}deg)`;

    for (const f of flights) {
      const isSelected = f.icao24 === selectedIcao;
      const lngLat: [number, number] = [f.longitude, f.latitude];
      const existing = markersRef.current.get(f.icao24);

      if (existing) {
        const outerEl = existing.icon.getElement();
        const innerEl = outerEl.firstElementChild as HTMLElement;
        const tempEl = buildAircraftElement(f, isSelected);
        const tempInner = tempEl.firstElementChild as HTMLElement;
        innerEl.innerHTML = tempInner.innerHTML;
        innerEl.style.filter = tempInner.style.filter;
        if (bearingTransform) innerEl.style.transform = bearingTransform;
        markersRef.current.set(f.icao24, { icon: existing.icon, flight: f });
      } else {
        const el = buildAircraftElement(f, isSelected);
        const inner = el.firstElementChild as HTMLElement;
        if (bearingTransform) inner.style.transform = bearingTransform;
        el.addEventListener('click', () => onSelectRef.current(f.icao24));
        const icon = new mapboxgl.Marker({ element: el, anchor: 'center', rotationAlignment: 'viewport' })
          .setLngLat(lngLat)
          .addTo(map);
        markersRef.current.set(f.icao24, { icon, flight: f });
      }
    }

    // AutoBounds: fit on first data arrival
    if (!fittedRef.current && flights.length > 0) {
      fittedRef.current = true;
      if (militaryMode) {
        const lons = flights.map(f => f.longitude);
        const lats = flights.map(f => f.latitude);
        const bounds = new mapboxgl.LngLatBounds(
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        );
        map.fitBounds(bounds, { padding: 40, maxZoom: map.getZoom() < 7 ? 7 : map.getZoom() });
      } else {
        const closest = flights[0];
        const bounds = new mapboxgl.LngLatBounds(
          [Math.min(userLon, closest.longitude), Math.min(userLat, closest.latitude)],
          [Math.max(userLon, closest.longitude), Math.max(userLat, closest.latitude)],
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 11 });
      }
    }

    // KeepFlightInView: re-center if selected flight drifts toward viewport edge
    if (flight && !userDraggedRef.current) {
      const b = map.getBounds()!;
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const latRange = ne.lat - sw.lat;
      const lngRange = ne.lng - sw.lng;
      const pad = 0.25;
      const inBounds =
        flight.latitude  > sw.lat + latRange * pad &&
        flight.latitude  < ne.lat - latRange * pad &&
        flight.longitude > sw.lng + lngRange * pad &&
        flight.longitude < ne.lng - lngRange * pad;
      if (!inBounds) map.panTo([flight.longitude, flight.latitude]);
    }
  }, [flights, flight, militaryMode, userLat, userLon]);

  // FlyToFlight on new selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flight || flight.icao24 === prevFlightIcaoRef.current) return;
    prevFlightIcaoRef.current = flight.icao24;
    userDraggedRef.current = false;
    map.panTo([flight.longitude, flight.latitude], { duration: 800 } as unknown as mapboxgl.AnimationOptions);
  }, [flight?.icao24]); // eslint-disable-line react-hooks/exhaustive-deps

  // FlyToPoint (city focus in military mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPoint) return;
    const zoom = focusPoint[2] ?? Math.max(map.getZoom(), 7);
    map.flyTo({ center: [focusPoint[1], focusPoint[0]], zoom, duration: 1000 });
  }, [focusPoint?.[0], focusPoint?.[1], focusPoint?.[2]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync trail
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sourcesReadyRef.current) return;
    applyTrailData(map, trail);
  }, [trail]);

  // Sync destination line
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sourcesReadyRef.current) return;
    applyDestData(map, flight);
  }, [flight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle tile style changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    sourcesReadyRef.current = false;
    map.setStyle(MAPBOX_STYLES[tileId]);
  }, [tileId]);

  // Home pin (hidden in military mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || militaryMode) return;
    const pinEl = document.createElement('div');
    pinEl.style.cssText = 'font-size:20px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5));pointer-events:none;';
    pinEl.textContent = '📍';
    const pin = new mapboxgl.Marker({ element: pinEl, anchor: 'bottom' })
      .setLngLat([userLon, userLat])
      .addTo(map);
    return () => { pin.remove(); };
  }, [userLat, userLon, militaryMode]);

  return <div ref={containerRef} className="h-full w-full rounded-2xl overflow-hidden" />;
}
