import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { FlightState } from '../types';
import { categorizeAircraft, getAircraftSvgInfo, MILITARY_CATS, WARBIRD_CATS, heliInnerSvg } from './FlightMap';

interface Props {
  userLat: number;
  userLon: number;
  flight: FlightState | null;
  flights: FlightState[];
  onSelectFlight: (icao24: string) => void;
  militaryMode?: boolean;
}

function iconColor(flight: FlightState, isSelected: boolean): string {
  const cat = categorizeAircraft(flight.aircraftType);
  if (isSelected)       return '#ef4444';
  if (flight.isPolice)  return '#60a5fa';
  if (MILITARY_CATS.has(cat)) return '#4ade80';
  if (WARBIRD_CATS.has(cat))  return '#fb923c';
  return '#facc15';
}

function buildAircraftElement(flight: FlightState, isSelected: boolean): HTMLDivElement {
  const cat = categorizeAircraft(flight.aircraftType);
  const color = iconColor(flight, isSelected);
  const heading = (cat === 'heli' || cat === 'mil-heli') ? 0 : (flight.trueTrack ?? 0);

  // Altitude-scaled drop shadow — higher altitude = larger offset + softer blur
  const altM = Math.max(0, flight.baroAltitude ?? 0);
  const t = Math.min(1, altM / 11000); // 0→1 across typical cruise altitudes
  const dx = (2 + t * 7).toFixed(1);
  const dy = (3 + t * 8).toFixed(1);
  const blur = (1.5 + t * 3.5).toFixed(1);

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

    // Leading-edge highlight for a 3D sheen — rotates with the aircraft
    const highlight = `<ellipse cx="-1" cy="-8" rx="4" ry="2.5" fill="rgba(255,255,255,0.32)" transform="rotate(${heading})"/>`;

    body = `<g transform="rotate(${heading})">` +
      `<path d="${path}" fill="${color}" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round"/>` +
      nacelles +
      `</g>` + highlight;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="-26 -26 52 52">${body}</svg>`;

  const el = document.createElement('div');
  // CSS drop-shadow scales with altitude so high-flying aircraft cast a more offset shadow
  el.style.cssText = `cursor:pointer; filter:drop-shadow(${dx}px ${dy}px ${blur}px rgba(0,0,0,0.55)); z-index:2; line-height:0;`;
  el.innerHTML = svg;
  return el;
}

function buildGroundShadowElement(baroAltitudeM: number | null): HTMLDivElement {
  const altM = Math.max(0, baroAltitudeM ?? 0);
  const altKm = altM / 1000;
  const blurPx = Math.round(2 + altKm * 1.5);
  const opacity = Math.max(0.06, 0.38 - altKm * 0.025).toFixed(2);

  const el = document.createElement('div');
  el.style.cssText = [
    'width:22px', 'height:9px',
    'background:radial-gradient(ellipse,rgba(0,0,0,0.75) 0%,transparent 70%)',
    'border-radius:50%',
    `filter:blur(${blurPx}px)`,
    `opacity:${opacity}`,
    'pointer-events:none',
    'z-index:1',
  ].join(';');
  return el;
}

export function FlightMap3D({ userLat, userLon, flight, flights, onSelectFlight, militaryMode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  type MarkerPair = { icon: maplibregl.Marker; shadow: maplibregl.Marker };
  const markersRef = useRef<Map<string, MarkerPair>>(new Map());
  const onSelectRef = useRef(onSelectFlight);
  onSelectRef.current = onSelectFlight;

  // Mount / unmount the map once
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [userLon, userLat],
      zoom: 9,
      pitch: 65,
      bearing: 0,
      maxPitch: 85,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Ensure pitch is applied after the style loads (some styles reset the camera)
    map.once('styledata', () => {
      map.setPitch(65);
    });

    map.on('load', () => {
      map.addSource('terrarium', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 14,
      });
      map.setTerrain({ source: 'terrarium', exaggeration: 2.0 });
    });

    return () => {
      markersRef.current.forEach(({ icon, shadow }) => { icon.remove(); shadow.remove(); });
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync markers whenever flights or selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const selectedIcao = flight?.icao24 ?? null;
    const incoming = new Map(flights.map(f => [f.icao24, f]));

    // Remove stale markers
    for (const [icao, { icon, shadow }] of markersRef.current) {
      if (!incoming.has(icao)) {
        icon.remove();
        shadow.remove();
        markersRef.current.delete(icao);
      }
    }

    // Add or update markers
    for (const f of flights) {
      const isSelected = f.icao24 === selectedIcao;
      const lngLat: [number, number] = [f.longitude, f.latitude];
      const existing = markersRef.current.get(f.icao24);

      if (existing) {
        // Update position
        existing.icon.setLngLat(lngLat);
        existing.shadow.setLngLat(lngLat);
        // Rebuild icon element to reflect selection change (color/glow)
        const newEl = buildAircraftElement(f, isSelected);
        newEl.addEventListener('click', () => onSelectRef.current(f.icao24));
        existing.icon.remove();
        const newIcon = new maplibregl.Marker({ element: newEl, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);
        markersRef.current.set(f.icao24, { icon: newIcon, shadow: existing.shadow });
      } else {
        // Create ground shadow first (renders below the icon)
        const shadowEl = buildGroundShadowElement(f.baroAltitude);
        const shadow = new maplibregl.Marker({ element: shadowEl, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);

        const iconEl = buildAircraftElement(f, isSelected);
        iconEl.addEventListener('click', () => onSelectRef.current(f.icao24));
        const icon = new maplibregl.Marker({ element: iconEl, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);

        markersRef.current.set(f.icao24, { icon, shadow });
      }
    }
  }, [flights, flight]);

  // Fly to selected flight when it changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flight) return;
    map.flyTo({ center: [flight.longitude, flight.latitude], speed: 0.8 });
  }, [flight?.icao24]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide user pin in military mode — non-military shows a home marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || militaryMode) return;

    const pinEl = document.createElement('div');
    pinEl.style.cssText = 'font-size:20px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5));pointer-events:none;';
    pinEl.textContent = '📍';
    const pin = new maplibregl.Marker({ element: pinEl, anchor: 'bottom' })
      .setLngLat([userLon, userLat])
      .addTo(map);
    return () => { pin.remove(); };
  }, [userLat, userLon, militaryMode]);

  return <div ref={containerRef} className="h-full w-full rounded-2xl overflow-hidden" />;
}
