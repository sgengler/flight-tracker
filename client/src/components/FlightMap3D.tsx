import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { GeoJSONSource } from 'mapbox-gl';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;
import { FlightState } from '../types';
import { categorizeAircraft, getAircraftSvgInfo, MILITARY_CATS, WARBIRD_CATS, heliInnerSvg } from './FlightMap';

interface Props {
  userLat: number;
  userLon: number;
  flight: FlightState | null;
  flights: FlightState[];
  trail: [number, number, number?, number?][];
  onSelectFlight: (icao24: string) => void;
  militaryMode?: boolean;
}

const TRAIL_POLL_S = 15;
const POLL_S = 10;
const DEFAULT_PITCH = 62;

// ── Utilities ────────────────────────────────────────────────────────────────

function haversineDist(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const φ1 = (a[0] * Math.PI) / 180, φ2 = (b[0] * Math.PI) / 180;
  const Δφ = ((b[0] - a[0]) * Math.PI) / 180;
  const Δλ = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

function trailColor(speedMs: number): string {
  const kts = speedMs * 1.94384;
  if (kts <= 30)  return '#a855f7';
  if (kts >= 550) return '#facc15';
  if (kts < 100)  return lerpColor('#a855f7', '#38bdf8', (kts - 30) / 70);
  if (kts < 350)  return lerpColor('#38bdf8', '#4ade80', (kts - 100) / 250);
  return lerpColor('#4ade80', '#facc15', (kts - 350) / 200);
}

function applyTrailData(map: mapboxgl.Map, trail: [number, number, number?, number?][]) {
  const source = map.getSource('trail-ground') as GeoJSONSource | undefined;
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
    const alt = ((trail[i][3] ?? 0) + (trail[i + 1][3] ?? 0)) / 2;
    features.push({
      type: 'Feature' as const,
      properties: { color: trailColor(speedMs), alt },
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

function iconColor(flight: FlightState, isSelected: boolean): string {
  const cat = categorizeAircraft(flight.aircraftType);
  if (isSelected)          return '#ef4444';
  if (flight.isPolice)     return '#60a5fa';
  if (MILITARY_CATS.has(cat)) return '#4ade80';
  if (WARBIRD_CATS.has(cat))  return '#fb923c';
  return '#facc15';
}

function buildAircraftElement(flight: FlightState, isSelected: boolean): HTMLDivElement {
  const cat = categorizeAircraft(flight.aircraftType);
  const color = iconColor(flight, isSelected);
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
    const highlight = `<ellipse cx="-1" cy="-8" rx="4" ry="2.5" fill="rgba(255,255,255,0.32)" transform="rotate(${heading})"/>`;
    body = `<g transform="rotate(${heading})">` +
      `<path d="${path}" fill="${color}" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" stroke-linejoin="round"/>` +
      nacelles +
      `</g>` + highlight;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="-26 -26 52 52">${body}</svg>`;
  const el = document.createElement('div');
  el.style.cssText = 'cursor:pointer; z-index:2; line-height:0;';
  const inner = document.createElement('div');
  inner.style.cssText = `filter:drop-shadow(0px 1px 2px rgba(0,0,0,0.5)); line-height:0;`;
  inner.innerHTML = svg;
  el.appendChild(inner);
  return el;
}

function buildGroundShadowElement(flight: FlightState): HTMLDivElement {
  const cat = categorizeAircraft(flight.aircraftType);
  const heading = (cat === 'heli' || cat === 'mil-heli') ? 0 : (flight.trueTrack ?? 0);
  const fill = 'rgba(0,0,0,0.9)';
  const pod = (cx: number, cy: number, rx: number, ry: number) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;

  let body: string;
  if (cat === 'airship') {
    body = `<g transform="rotate(${heading})">` +
      `<ellipse cx="0" cy="-3" rx="7" ry="18" fill="${fill}"/>` +
      `<rect x="-3" y="8" width="6" height="5" rx="1.5" fill="${fill}"/>` +
      `<path d="M-7,10 L-13,21 L-3,14 Z" fill="${fill}"/>` +
      `<path d="M7,10 L13,21 L3,14 Z" fill="${fill}"/>` +
      `</g>`;
  } else if (cat === 'heli' || cat === 'mil-heli') {
    body = heliInnerSvg(fill, '');
  } else {
    const { path } = getAircraftSvgInfo(cat);
    let nacelles = '';
    if (cat === 'jet') {
      nacelles = pod(13, 5, 1.5, 3) + pod(-13, 5, 1.5, 3);
    } else if (cat === 'prop') {
      nacelles = pod(10, 0.5, 1.5, 3) + pod(-10, 0.5, 1.5, 3) +
        `<ellipse cx="10" cy="-4" rx="5" ry="0.7" fill="${fill}"/>` +
        `<ellipse cx="-10" cy="-4" rx="5" ry="0.7" fill="${fill}"/>`;
    } else if (cat === 'transport') {
      nacelles = pod(10, 1, 1.5, 2.5) + pod(16, 3.5, 1.5, 2.5) +
                 pod(-10, 1, 1.5, 2.5) + pod(-16, 3.5, 1.5, 2.5);
    } else if (cat === 'bomber') {
      nacelles = pod(9, 4, 1.5, 2.5) + pod(16, 6.5, 1.5, 2.5) +
                 pod(-9, 4, 1.5, 2.5) + pod(-16, 6.5, 1.5, 2.5);
    } else if (cat === 'attack') {
      nacelles = pod(5, 9, 1.3, 3) + pod(-5, 9, 1.3, 3);
    } else if (cat === 'warbird') {
      nacelles = `<ellipse cx="0" cy="-23" rx="6.5" ry="0.8" fill="${fill}"/>`;
    }
    body = `<g transform="rotate(${heading})">` +
      `<path d="${path}" fill="${fill}"/>` + nacelles + `</g>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="-26 -26 52 52">${body}</svg>`;
  const el = document.createElement('div');
  el.style.cssText = 'pointer-events:none;line-height:0;';
  const inner = document.createElement('div');
  inner.style.cssText = `opacity:0.55;filter:blur(2px);line-height:0;`;
  inner.innerHTML = svg;
  el.appendChild(inner);
  return el;
}

// CSS transform for the inner SVG: counter-rotates bearing so the icon points in the
// correct compass direction regardless of map rotation, plus a partial pitch counter-tilt
// so the icon reads as upright rather than fully flat on the tilted map plane.
function iconTransform(pitchDeg: number, bearingDeg: number): string {
  return `rotate(${(-bearingDeg).toFixed(1)}deg) rotateX(${(-(pitchDeg * 0.5)).toFixed(1)}deg)`;
}

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

// ── Component ─────────────────────────────────────────────────────────────────

export function FlightMap3D({ userLat, userLon, flight, flights, trail, onSelectFlight, militaryMode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  const pitchRef = useRef(DEFAULT_PITCH);
  pitchRef.current = pitch;
  const bearingRef = useRef(0);
  const introCompleteRef = useRef(false);

  type MarkerPair = { icon: mapboxgl.Marker; shadow: mapboxgl.Marker; altM: number };
  const markersRef = useRef<Map<string, MarkerPair>>(new Map());
  const onSelectRef = useRef(onSelectFlight);
  onSelectRef.current = onSelectFlight;
  const trailRef = useRef<[number, number, number?, number?][]>([]);
  trailRef.current = trail;

  // Mount / unmount the map once
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/standard',
      center: [userLon, userLat],
      zoom: 9,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
      attributionControl: { compact: true } as any,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    // Update marker offsets every frame during pitch/zoom gestures so icons
    // track the trail altitude in real time. *end events still flush React state.
    map.on('pitch', () => {
      const p = map.getPitch();
      pitchRef.current = p;
      const t = iconTransform(p, bearingRef.current);
      for (const [, pair] of markersRef.current) {
        const inner = pair.icon.getElement().firstElementChild as HTMLElement | null;
        if (inner) inner.style.transform = t;
      }
    });
    map.on('pitchend', () => setPitch(Math.round(map.getPitch())));
    map.on('rotate', () => {
      const b = map.getBearing();
      bearingRef.current = b;
      const t = iconTransform(pitchRef.current, b);
      for (const [, pair] of markersRef.current) {
        const inner = pair.icon.getElement().firstElementChild as HTMLElement | null;
        if (inner) inner.style.transform = t;
      }
    });
    map.on('style.load', () => {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

      map.addSource('trail-ground', {
        type: 'geojson',
        lineMetrics: true,
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'trail-shadow-line',
        type: 'line',
        source: 'trail-ground',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#000000',
          'line-width': 6,
          'line-opacity': 0.3,
          'line-blur': 3,
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
      map.addLayer({
        id: 'trail-ground-line',
        type: 'line',
        source: 'trail-ground',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'line-z-offset': ['get', 'alt'],
          'line-elevation-reference': 'sea',
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        paint: {
          'line-color': ['get', 'color'] as unknown as string,
          'line-width': 4,
          'line-opacity': 0.9,
          'line-emissive-strength': 1.0,
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });

      applyTrailData(map, trailRef.current);
      map.easeTo({ pitch: DEFAULT_PITCH, duration: 1800, easing: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t });
      map.once('pitchend', () => { introCompleteRef.current = true; });
    });

    // Disable CSS transitions while the map is panning so markers track instantly.
    map.on('movestart', () => {
      for (const [, pair] of markersRef.current) {
        pair.icon.getElement().style.transition = 'none';
        pair.shadow.getElement().style.transition = 'none';
      }
    });
    map.on('moveend', () => {
      if (!introCompleteRef.current) return;
      requestAnimationFrame(() => {
        for (const [, pair] of markersRef.current) {
          pair.icon.getElement().style.transition = `transform ${POLL_S * 1000}ms linear`;
          pair.shadow.getElement().style.transition = `transform ${POLL_S * 1000}ms linear`;
        }
      });
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

    for (const [icao, { icon, shadow }] of markersRef.current) {
      if (!incoming.has(icao)) {
        icon.remove(); shadow.remove();
        markersRef.current.delete(icao);
      }
    }

    for (const f of flights) {
      const isSelected = f.icao24 === selectedIcao;
      const lngLat: [number, number] = [f.longitude, f.latitude];
      const altM = Math.max(0, f.baroAltitude ?? 0);
      const v = f.velocity ?? 0;
      const h = f.trueTrack ?? 0;
      const futureLngLat: [number, number] = v > 0.5
        ? (() => { const [la, lo] = deadReckon(f.latitude, f.longitude, h, v, POLL_S); return [lo, la]; })()
        : lngLat;

      const existing = markersRef.current.get(f.icao24);
      if (existing) {
        const outerEl = existing.icon.getElement();
        const innerEl = outerEl.firstElementChild as HTMLElement;
        const tempEl = buildAircraftElement(f, isSelected);
        const tempInner = tempEl.firstElementChild as HTMLElement;
        innerEl.innerHTML = tempInner.innerHTML;
        innerEl.style.filter = tempInner.style.filter;
        innerEl.style.transform = iconTransform(pitchRef.current, bearingRef.current);

        const tempShadow = buildGroundShadowElement(f);
        const tempShadowInner = tempShadow.firstElementChild as HTMLElement;
        const shadowInner = existing.shadow.getElement().firstElementChild as HTMLElement;
        shadowInner.style.opacity = tempShadowInner.style.opacity;
        shadowInner.style.filter = tempShadowInner.style.filter;
        shadowInner.innerHTML = tempShadowInner.innerHTML;

        if (altM !== existing.altM) {
          (existing.icon as any).setAltitude(altM); // eslint-disable-line @typescript-eslint/no-explicit-any
        }

        if (introCompleteRef.current) {
          outerEl.style.transition = `transform ${POLL_S * 1000}ms linear`;
          existing.shadow.getElement().style.transition = `transform ${POLL_S * 1000}ms linear`;
        }
        existing.icon.setLngLat(futureLngLat);
        existing.shadow.setLngLat(futureLngLat);

        markersRef.current.set(f.icao24, { icon: existing.icon, shadow: existing.shadow, altM });
      } else {
        const shadowEl = buildGroundShadowElement(f);
        const shadow = new mapboxgl.Marker({ element: shadowEl, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'viewport' })
          .setLngLat(lngLat).addTo(map);

        const iconEl = buildAircraftElement(f, isSelected);
        (iconEl.firstElementChild as HTMLElement).style.transform = iconTransform(pitchRef.current, bearingRef.current);
        iconEl.addEventListener('click', () => onSelectRef.current(f.icao24));
        const icon = new mapboxgl.Marker({
          element: iconEl,
          anchor: 'center',
          pitchAlignment: 'map',
          rotationAlignment: 'viewport',
        }).setLngLat(lngLat).addTo(map);
        (icon as any).setAltitude(altM); // eslint-disable-line @typescript-eslint/no-explicit-any

        markersRef.current.set(f.icao24, { icon, shadow, altM });

        if (v > 0.5) {
          if (introCompleteRef.current) {
            requestAnimationFrame(() => {
              void iconEl.getBoundingClientRect();
              iconEl.style.transition = `transform ${POLL_S * 1000}ms linear`;
              shadowEl.style.transition = `transform ${POLL_S * 1000}ms linear`;
              icon.setLngLat(futureLngLat);
              shadow.setLngLat(futureLngLat);
            });
          } else {
            icon.setLngLat(futureLngLat);
            shadow.setLngLat(futureLngLat);
          }
        }
      }
    }
  }, [flights, flight, userLat]);

  // Update icon transform when pitch changes (bearing is handled in real time via map.on('rotate')).
  useEffect(() => {
    const t = iconTransform(pitch, bearingRef.current);
    for (const [, pair] of markersRef.current) {
      const inner = pair.icon.getElement().firstElementChild as HTMLElement | null;
      if (inner) inner.style.transform = t;
    }
  }, [pitch]);

  // Sync trail
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyTrailData(map, trail);
    map.triggerRepaint();
  }, [trail]);

  // Fly to selected flight
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flight) return;
    map.flyTo({ center: [flight.longitude, flight.latitude], speed: 0.8 });
  }, [flight?.icao24]); // eslint-disable-line react-hooks/exhaustive-deps

  // Home pin (hidden in military mode)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || militaryMode) return;
    const pinEl = document.createElement('div');
    pinEl.style.cssText = 'font-size:20px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5));pointer-events:none;';
    pinEl.textContent = '📍';
    const pin = new mapboxgl.Marker({ element: pinEl, anchor: 'bottom' })
      .setLngLat([userLon, userLat]).addTo(map);
    return () => { pin.remove(); };
  }, [userLat, userLon, militaryMode]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full rounded-2xl overflow-hidden" />
      {/* Pitch slider — vertical, left side */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
        <span className="text-white text-xs font-bold tabular-nums bg-black/50 rounded px-1.5 py-0.5 select-none">
          {pitch}°
        </span>
        <input
          type="range"
          min="0"
          max="85"
          step="1"
          value={pitch}
          onChange={e => {
            const v = Number(e.target.value);
            setPitch(v);
            mapRef.current?.setPitch(v);
          }}
          className="accent-white cursor-pointer"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: '140px' }}
        />
      </div>
    </div>
  );
}
