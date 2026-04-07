import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { FlightState } from '../types';
import { AIRPORT_COORDS } from '../utils';

// Fix default Leaflet marker icons (broken by Vite's asset pipeline)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Top-down aircraft SVG paths, pointing UP (north) at heading=0, centered at (0,0)
const JET_PATH       = 'M0,-18 L4,-8 L18,2 L18,7 L4,1 L3,14 L8,15 L8,18 L0,16 L-8,18 L-8,15 L-3,14 L-4,1 L-18,7 L-18,2 L-4,-8 Z';
const PROP_PATH      = 'M0,-18 L3,-8 L3,-4 L16,0 L16,4 L3,3 L3,14 L7,15 L7,18 L0,16 L-7,18 L-7,15 L-3,14 L-3,3 L-16,4 L-16,0 L-3,-4 L-3,-8 Z';
const SMALL_PATH     = 'M0,-17 L2.5,-13 L2.5,-4 L14,0 L14,3.5 L2.5,1.5 L2.5,12 L5.5,13 L5.5,16 L0,17 L-5.5,16 L-5.5,13 L-2.5,12 L-2.5,1.5 L-14,3.5 L-14,0 L-2.5,-4 L-2.5,-13 Z';
// Swept delta-wing fighter silhouette (F-16 / F-22 style)
const FIGHTER_PATH   = 'M0,-20 L2,-14 L3,-3 L20,10 L15,15 L3,9 L3,14 L6,17 L2,19 L0,20 L-2,19 L-6,17 L-3,14 L-3,9 L-15,15 L-20,10 L-3,-3 L-2,-14 Z';
// Wide swept wings, shorter body — B-52 / B-1B style
const BOMBER_PATH    = 'M0,-13 L2,-7 L3,-1 L22,6 L21,10 L3,5 L2.5,13 L5.5,14 L5.5,17 L0,15 L-5.5,17 L-5.5,14 L-2.5,13 L-3,5 L-21,10 L-22,6 L-3,-1 L-2,-7 Z';
// Wide body with engine-nacelle bumps on wing — C-17 / C-130 / KC-135 style
const TRANSPORT_PATH = 'M0,-17 L3,-9 L5,-6 L20,2 L20,7 L5,2 L4,14 L8,15 L8,18 L0,16 L-8,18 L-8,15 L-4,14 L-5,2 L-20,7 L-20,2 L-5,-6 L-3,-9 Z';
// Nearly straight wings, twin-engine rear — A-10 Warthog style
const ATTACK_PATH    = 'M0,-18 L2,-12 L3,-1 L19,2 L19,6 L3,1 L4.5,13 L8,14 L7,17 L0,16 L-7,17 L-8,14 L-4.5,13 L-3,1 L-19,6 L-19,2 L-3,-1 L-2,-12 Z';
// Extremely high aspect-ratio wings, tiny body — MQ-9 / RQ-4 style
const UAV_PATH       = 'M0,-10 L1,-5 L2,-1 L25,3 L25,6 L2,2 L1.5,11 L4,12 L4,14 L0,13 L-4,14 L-4,12 L-1.5,11 L-2,2 L-25,6 L-25,3 L-2,-1 L-1,-5 Z';

function heliInnerSvg(color: string, filterAttr: string): string {
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

export type AircraftCategory = 'jet' | 'prop' | 'small' | 'heli' | 'fighter' | 'bomber' | 'transport' | 'attack' | 'uav' | 'mil-heli';

/** Military sub-categories used to pick icon shapes */
export const MILITARY_CATS: ReadonlySet<AircraftCategory> = new Set(['fighter', 'bomber', 'transport', 'attack', 'uav', 'mil-heli']);

function categorizeMilitary(t: string): 'fighter' | 'bomber' | 'transport' | 'attack' | 'uav' | 'mil-heli' {
  if (['B52','B1B','B2'].includes(t)) return 'bomber';
  if (['C130','C17','C5A','C5M','KC10','KC135','KC46','E3','E8','E6','P3','P8'].includes(t)) return 'transport';
  if (['A10','AC13','AC130'].includes(t)) return 'attack';
  if (['U2','SR71','RQ4','MQ9','MQ1','X47B','RQ180'].includes(t)) return 'uav';
  // Military helicopters — H60 must be checked here before the civilian 'H*' prefix catches it
  if (['H60','S70','UH60','HH60','MH60','SH60','CH47','AH64','UH1','UH1Y','AH1',
       'CH53','OH58','HH65','HH1'].includes(t)) return 'mil-heli';
  return 'fighter'; // F-14, F-15, F-16, F-22, F-35, T-38, T-45, V-22, etc.
}

export function categorizeAircraft(typeCode: string | null): AircraftCategory {
  if (!typeCode) return 'jet';
  const t = typeCode.toUpperCase();

  // Military checked first so known military types (C17, H60, etc.) aren't
  // misidentified as civilian Cessna 172 / generic H* helicopter prefixes.
  const militaryCodes = new Set([
    'F14','F15','F16','F18','FA18','F22','F35','F117', // fighters / strike
    'B52','B1B','B2',                                   // bombers
    'A10','AC13','AC130',                               // attack / gunship
    'C130','C17','C5A','C5M',                           // military transports
    'KC10','KC135','KC46',                              // tankers
    'E3','E8','E6',                                     // AWACS / recon
    'U2','SR71','RQ4','MQ9','MQ1','X47B','RQ180',       // recon / UAV
    'P3','P8',                                          // maritime patrol
    'V22',                                              // tiltrotor
    'T38','T6','T45',                                   // trainers
    // Military helicopters
    'H60','S70','UH60','HH60','MH60','SH60',            // Black Hawk / Seahawk family
    'CH47',                                             // Chinook
    'AH64',                                             // Apache
    'UH1','UH1Y','HH1',                                 // Huey family
    'AH1',                                              // Cobra / Viper
    'CH53',                                             // Sea Stallion / Super Stallion
    'OH58',                                             // Kiowa Warrior
    'HH65',                                             // Dolphin (Coast Guard)
  ]);
  if (militaryCodes.has(t)) return categorizeMilitary(t);

  if (t.startsWith('H') || ['EC35','EC45','EC55','EC75','AS50','AS32','AS35','S76','S92',
    'B06','B07','R22','R44','R66','B505','AW13','AW16','AW17','AW18','AW19'].includes(t)) return 'heli';

  const smallPrefixes = [
    // Piston GA
    'C15','C17','C18','C19',           // Cessna 150/172/182/195
    'PA2','PA3','PA4',                 // Piper PA-24/28/32/34/44
    'SR2','SR3',                       // Cirrus SR20/SR22
    'DA4','DA5','DA6',                 // Diamond DA40/50/62
    'M20',                             // Mooney
    'BE33','BE35','BE36',              // Beechcraft Bonanza
    'RV','C42','C72','CT4',            // Light sport / trainers
    'P28','P32','P46','GA',
    // Light & midsize charter jets
    'C5',                              // Cessna Citation family (C500/510/525/550/560/56X/680/750)
    'LJ',                              // Learjet (all variants LJ23–LJ75)
    'E50','E55',                       // Embraer Phenom 100/300 (E50P, E55P)
    'BE40',                            // Beechcraft Premier I
    'HDJT',                            // HondaJet
    'EA50',                            // Eclipse 500
    'FA1','FA2',                       // Dassault Falcon 10/20 (small Falcons)
    // Small regional jets
    'CRJ',                             // Bombardier CRJ-100/200/700/900/1000
    'E13','E14',                       // Embraer ERJ-135/145 (50-seat regional)
  ];
  if (smallPrefixes.some(p => t.startsWith(p))) return 'small';

  const propPrefixes = ['AT4','AT7','DH8','SB2','SB3','SF3','JS4','JS3','C208','C212',
    'BE20','BE30','PA31','PA42','TBM','PC12','PC24','L18','L4','PL2'];
  if (propPrefixes.some(p => t.startsWith(p))) return 'prop';

  return 'jet';
}

function aircraftIcon(heading: number, selected: boolean, aircraftType: string | null, isPolice: boolean): L.DivIcon {
  const cat = categorizeAircraft(aircraftType);
  const isMil = MILITARY_CATS.has(cat);
  const color = selected ? '#ef4444'
    : isPolice ? '#60a5fa'   // blue-400
    : isMil    ? '#4ade80'   // green-400
    : '#facc15';
  const glowColor = selected ? 'rgba(239,68,68,0.8)'
    : isPolice ? 'rgba(96,165,250,0.8)'
    : isMil    ? 'rgba(74,222,128,0.8)'
    : 'rgba(0,0,0,0)';
  const glow = (selected || isPolice || isMil)
    ? `<filter id="glow"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${glowColor}"/></filter>`
    : '';
  const filterAttr = (selected || isPolice || isMil) ? 'filter="url(#glow)"' : '';

  let body: string;
  if (cat === 'heli' || cat === 'mil-heli') {
    body = heliInnerSvg(color, filterAttr);
  } else {
    const planePath =
      cat === 'prop'      ? PROP_PATH :
      cat === 'small'     ? SMALL_PATH :
      cat === 'bomber'    ? BOMBER_PATH :
      cat === 'transport' ? TRANSPORT_PATH :
      cat === 'attack'    ? ATTACK_PATH :
      cat === 'uav'       ? UAV_PATH :
      cat === 'fighter'   ? FIGHTER_PATH :
      JET_PATH;
    body = `<g transform="rotate(${heading})"><path d="${planePath}" fill="${color}" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round" ${filterAttr}/></g>`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="-26 -26 52 52">` +
    `<defs>${glow}</defs>${body}</svg>`;
  return L.divIcon({ className: '', html: svg, iconSize: [40, 40], iconAnchor: [20, 20] });
}

const locationIcon = L.divIcon({
  className: '',
  html: `<div style="font-size: 24px; line-height: 1; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5))">📍</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

// Dead-reckon a lat/lon forward by dt seconds at the given heading + speed
function deadReckon(
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

const POLL_S = 10; // seconds between server updates

// Start (or continue) a CSS transition to the projected position POLL_S seconds
// ahead of the latest server fix. On updates we do NOT snap to the reported
// position first — CSS picks up from the current animated position and flows
// directly into the new target, eliminating the jump at every 10-second reload.
function startPositionTransition(marker: L.Marker, flight: FlightState) {
  const el = marker.getElement();
  if (!el) return;
  const v = flight.velocity ?? 0;
  const h = flight.trueTrack ?? 0;

  if (v <= 1) {
    // Stationary — snap without animation
    el.style.transition = 'none';
    marker.setLatLng([flight.latitude, flight.longitude]);
    return;
  }

  // Transition from wherever the marker is right now to the projected
  // position one full poll interval ahead. CSS interpolates from the
  // current computed transform value, so no visible jump occurs.
  const future = deadReckon(flight.latitude, flight.longitude, h, v, POLL_S);
  el.style.transition = `transform ${POLL_S * 1000}ms linear`;
  marker.setLatLng(future);
}

interface FlightEntry {
  marker: L.Marker;
  flight: FlightState;
  initialized: boolean; // false until the first update after initial placement
}

interface AnimatedLayerProps {
  flights: FlightState[];
  selectedIcao: string | null;
  onSelectFlight: (icao24: string) => void;
}

function AnimatedFlightLayer({ flights, selectedIcao, onSelectFlight }: AnimatedLayerProps) {
  const map = useMap();
  const entriesRef = useRef<Map<string, FlightEntry>>(new Map());
  const onSelectRef = useRef(onSelectFlight);
  const mapReadyRef = useRef(false);   // true once AutoBounds pan has settled
  const setupDoneRef = useRef(false);  // true once we've registered the moveend listener
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPollTimeRef = useRef<number>(Date.now());
  useEffect(() => { onSelectRef.current = onSelectFlight; });

  // During zoom Leaflet repositions all markers; disable transition so they
  // don't drift to new screen coordinates. On zoomend, snap to the current
  // dead-reckoned position and restart the transition for remaining time.
  useEffect(() => {
    const onZoomStart = () => {
      for (const { marker } of entriesRef.current.values()) {
        const el = marker.getElement();
        if (el) el.style.transition = 'none';
      }
    };
    const onZoomEnd = () => {
      const elapsed = (Date.now() - lastPollTimeRef.current) / 1000;
      const remaining = Math.max(0, POLL_S - elapsed);
      for (const e of entriesRef.current.values()) {
        if (!e.initialized) continue;
        const el = e.marker.getElement();
        if (!el) continue;
        const v = e.flight.velocity ?? 0;
        const h = e.flight.trueTrack ?? 0;
        if (v <= 1) {
          el.style.transition = 'none';
          e.marker.setLatLng([e.flight.latitude, e.flight.longitude]);
          continue;
        }
        // Snap to where the plane actually is right now
        const currentPos = deadReckon(e.flight.latitude, e.flight.longitude, h, v, elapsed);
        el.style.transition = 'none';
        e.marker.setLatLng(currentPos);
        void el.getBoundingClientRect();
        // Resume transition for the time remaining in this poll interval
        if (remaining > 0) {
          const futurePos = deadReckon(e.flight.latitude, e.flight.longitude, h, v, POLL_S);
          el.style.transition = `transform ${remaining * 1000}ms linear`;
          e.marker.setLatLng(futurePos);
        }
      }
    };
    map.on('zoomstart', onZoomStart);
    map.on('zoomend', onZoomEnd);
    return () => {
      map.off('zoomstart', onZoomStart);
      map.off('zoomend', onZoomEnd);
    };
  }, [map]);

  // Sync marker set and start/restart CSS transitions on each server update
  useEffect(() => {
    lastPollTimeRef.current = Date.now();
    const entries = entriesRef.current;
    const flightSet = new Set(flights.map(f => f.icao24));

    for (const [icao24, entry] of entries) {
      if (!flightSet.has(icao24)) {
        entry.marker.remove();
        entries.delete(icao24);
      }
    }

    for (const flight of flights) {
      const isSelected = flight.icao24 === selectedIcao;
      const icon = aircraftIcon(flight.trueTrack ?? 0, isSelected, flight.aircraftType ?? null, flight.isPolice);
      const entry = entries.get(flight.icao24);

      if (entry) {
        entry.flight = flight;
        entry.marker.setIcon(icon);
        if (!entry.initialized) {
          // Server update arrived before map settled — snap and start now.
          const el = entry.marker.getElement();
          if (el) {
            el.style.transition = 'none';
            entry.marker.setLatLng([flight.latitude, flight.longitude]);
            void el.getBoundingClientRect();
          }
          entry.initialized = true;
        }
        startPositionTransition(entry.marker, flight);
      } else {
        const marker = L.marker([flight.latitude, flight.longitude], { icon }).addTo(map);
        marker.on('click', () => onSelectRef.current(flight.icao24));
        entries.set(flight.icao24, { marker, flight, initialized: false });

        if (mapReadyRef.current) {
          // Map already settled (flight appeared after initial load) — start immediately.
          requestAnimationFrame(() => {
            const e = entriesRef.current.get(flight.icao24);
            if (e && !e.initialized) {
              const el = e.marker.getElement();
              if (el) {
                el.style.transition = 'none';
                e.marker.setLatLng([e.flight.latitude, e.flight.longitude]);
                void el.getBoundingClientRect();
              }
              e.initialized = true;
              startPositionTransition(e.marker, e.flight);
            }
          });
        }
      }
    }

    // Register the "map ready" listener the first time flights arrive.
    // We do this HERE (not on mount) so we don't accidentally catch Leaflet's
    // own initial-render moveend, which fires before AutoBounds ever runs.
    if (!setupDoneRef.current && flights.length > 0) {
      setupDoneRef.current = true;

      const onMapReady = () => {
        if (mapReadyRef.current) return;
        mapReadyRef.current = true;
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        for (const e of entriesRef.current.values()) {
          if (!e.initialized) {
            const el = e.marker.getElement();
            if (el) {
              el.style.transition = 'none';
              e.marker.setLatLng([e.flight.latitude, e.flight.longitude]);
              void el.getBoundingClientRect();
            }
            e.initialized = true;
            startPositionTransition(e.marker, e.flight);
          }
        }
      };

      map.once('moveend', onMapReady);
      // Fallback: if AutoBounds doesn't trigger a moveend (map already in bounds),
      // start after a short delay anyway.
      fallbackTimerRef.current = setTimeout(onMapReady, 800);
    }
  }, [flights, selectedIcao, map]);

  // Clean up all markers on unmount
  useEffect(() => {
    return () => {
      for (const entry of entriesRef.current.values()) entry.marker.remove();
      entriesRef.current.clear();
    };
  }, [map]);

  return null;
}

interface AutoBoundsProps {
  userLat: number;
  userLon: number;
  flights: FlightState[];
}

function MilitaryAutoBounds({ flights }: { flights: FlightState[] }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current || flights.length === 0) return;
    fittedRef.current = true;
    const bounds = L.latLngBounds(flights.map(f => [f.latitude, f.longitude]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, flights.length]);

  return null;
}

function AutoBounds({ userLat, userLon, flights }: AutoBoundsProps) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current || flights.length === 0) return;
    fittedRef.current = true;
    const closest = flights[0];
    map.fitBounds(
      L.latLngBounds([[userLat, userLon], [closest.latitude, closest.longitude]]),
      { padding: [60, 60], maxZoom: 11 }
    );
  }, [map, userLat, userLon, flights.length]);

  return null;
}

function FlyToFlight({ flight }: { flight: FlightState | null }) {
  const map = useMap();
  const prevIcaoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!flight || flight.icao24 === prevIcaoRef.current) return;
    prevIcaoRef.current = flight.icao24;
    map.panTo([flight.latitude, flight.longitude], { animate: true, duration: 0.8 });
  }, [map, flight?.icao24]);

  return null;
}

function InvalidateSizeOnResize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

interface Props {
  userLat: number;
  userLon: number;
  flight: FlightState | null;
  flights: FlightState[];
  trail: [number, number][];
  onSelectFlight: (icao24: string) => void;
  militaryMode?: boolean;
}

export function FlightMap({ userLat, userLon, flight, flights, trail, onSelectFlight, militaryMode }: Props) {
  const displayFlights = flights.length > 0 ? flights : (flight ? [flight] : []);

  return (
    <MapContainer
      center={[userLat, userLon]}
      zoom={8}
      className="h-full w-full rounded-2xl overflow-hidden"
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      <InvalidateSizeOnResize />
      {militaryMode
        ? <MilitaryAutoBounds flights={flights} />
        : <AutoBounds userLat={userLat} userLon={userLon} flights={flights} />
      }
      <FlyToFlight flight={flight} />

      {/* User location pin — hidden in military mode */}
      {!militaryMode && <Marker position={[userLat, userLon]} icon={locationIcon} />}

      {/* Aircraft — CSS transition carries each plane to its projected position */}
      <AnimatedFlightLayer
        flights={displayFlights}
        selectedIcao={flight?.icao24 ?? null}
        onSelectFlight={onSelectFlight}
      />

      {/* Destination line */}
      {flight?.route && (() => {
        const dest = AIRPORT_COORDS[flight.route.destination?.toUpperCase()];
        const pos: [number, number] = [flight.latitude, flight.longitude];
        return dest ? (
          <Polyline
            positions={[pos, dest]}
            pathOptions={{ color: '#f97316', weight: 2, opacity: 0.3, dashArray: '6 5' }}
          />
        ) : null;
      })()}

      {/* Historical trail */}
      {trail.length > 1 && (
        <Polyline
          positions={trail}
          pathOptions={{ color: '#38bdf8', weight: 3, opacity: 0.8 }}
        />
      )}
    </MapContainer>
  );
}
