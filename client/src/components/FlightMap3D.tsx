import { useEffect, useRef, useState } from 'react';
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

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="-26 -26 52 52">${body}</svg>`;

  // Outer div: MapLibre uses this for positioning (sets its own transform on it — don't touch).
  const el = document.createElement('div');
  el.style.cssText = 'cursor:pointer; z-index:2; line-height:0;';

  // Inner div: safe to apply our tilt transform without clobbering MapLibre's translate.
  const inner = document.createElement('div');
  inner.style.cssText = `filter:drop-shadow(0px 1px 2px rgba(0,0,0,0.5)); line-height:0;`;
  inner.innerHTML = svg;
  el.appendChild(inner);
  return el;
}

function buildGroundShadowElement(flight: FlightState): HTMLDivElement {
  const cat = categorizeAircraft(flight.aircraftType);
  const blurPx = 2;
  const opacity = 0.55;
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
      `<path d="${path}" fill="${fill}"/>` +
      nacelles +
      `</g>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="-26 -26 52 52">${body}</svg>`;

  // Outer div: MapLibre adds maplibregl-marker class and resets opacity to 1 on this element.
  // Keep it style-free so MapLibre doesn't clobber our opacity.
  const el = document.createElement('div');
  el.style.cssText = 'pointer-events:none;line-height:0;';

  // Inner div: MapLibre never touches this, so opacity and blur are stable here.
  const inner = document.createElement('div');
  inner.style.cssText = `opacity:${opacity};filter:blur(${blurPx}px);line-height:0;`;
  inner.innerHTML = svg;
  el.appendChild(inner);
  return el;
}

const DEFAULT_PITCH = 62;
const POLL_S = 10;

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

// Counter-rotation applied to the inner SVG div to soften the full map-alignment tilt.
// pitchAlignment:'map' rotates the marker 100% — this cancels ~50%, leaving a half-pitch lean.
function iconTiltTransform(pitchDeg: number): string {
  return `rotateX(${(-(pitchDeg * 0.5)).toFixed(1)}deg)`;
}

// Returns a screen-space [x, y] offset that lifts the icon above its shadow.
// sin(pitch) → 0 when overhead, ~1 when near-horizontal; altitude scales the gap.
function computeIconOffset(baroAltitudeM: number | null, pitchDeg: number): [number, number] {
  const altM = Math.max(0, baroAltitudeM ?? 0);
  const altFactor = Math.min(1, 0.18 + (altM / 12000) * 0.82);
  const pitchFactor = Math.sin(pitchDeg * Math.PI / 180);
  return [0, -Math.round(altFactor * pitchFactor * 56)];
}

export function FlightMap3D({ userLat, userLon, flight, flights, onSelectFlight, militaryMode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  const pitchRef = useRef(DEFAULT_PITCH);
  pitchRef.current = pitch;
  type MarkerPair = { icon: maplibregl.Marker; shadow: maplibregl.Marker; altM: number };
  const markersRef = useRef<Map<string, MarkerPair>>(new Map());
  const onSelectRef = useRef(onSelectFlight);
  onSelectRef.current = onSelectFlight;

  // Mount / unmount the map once
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
      center: [userLon, userLat],
      zoom: 9,
      pitch: DEFAULT_PITCH,
      bearing: 0,
      maxPitch: 85,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Keep React pitch state in sync when user tilts via navigation control
    map.on('pitchend', () => setPitch(Math.round(map.getPitch())));

    // Ensure pitch is applied after the style loads (some styles reset the camera)
    map.once('styledata', () => {
      map.setPitch(DEFAULT_PITCH);
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

    // Disable CSS position transitions while the map is moving so markers
    // track the viewport instantly instead of lagging behind the pan.
    const enableTransitions = () => {
      requestAnimationFrame(() => {
        for (const [, pair] of markersRef.current) {
          pair.icon.getElement().style.transition = `transform ${POLL_S * 1000}ms linear`;
          pair.shadow.getElement().style.transition = `transform ${POLL_S * 1000}ms linear`;
        }
      });
    };
    map.on('movestart', () => {
      for (const [, pair] of markersRef.current) {
        pair.icon.getElement().style.transition = 'none';
        pair.shadow.getElement().style.transition = 'none';
      }
    });
    map.on('moveend', enableTransitions);

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
      const altM = Math.max(0, f.baroAltitude ?? 0);
      const v = f.velocity ?? 0;
      const h = f.trueTrack ?? 0;

      // Dead-reckon one poll interval ahead — CSS transition animates the marker
      // from its current screen position to this future position over POLL_S seconds.
      const futureLngLat: [number, number] = v > 0.5
        ? (() => { const [la, lo] = deadReckon(f.latitude, f.longitude, h, v, POLL_S); return [lo, la]; })()
        : lngLat;

      const existing = markersRef.current.get(f.icao24);

      if (existing) {
        // Update icon appearance in-place — no remove/re-add, no flicker.
        const outerEl = existing.icon.getElement();
        const innerEl = outerEl.firstElementChild as HTMLElement;
        const tempEl = buildAircraftElement(f, isSelected);
        const tempInner = tempEl.firstElementChild as HTMLElement;
        innerEl.innerHTML = tempInner.innerHTML;
        innerEl.style.filter = tempInner.style.filter;
        innerEl.style.transform = iconTiltTransform(pitchRef.current);

        // Update shadow in-place
        const tempShadow = buildGroundShadowElement(f);
        const tempShadowInner = tempShadow.firstElementChild as HTMLElement;
        const shadowInner = existing.shadow.getElement().firstElementChild as HTMLElement;
        shadowInner.style.opacity = tempShadowInner.style.opacity;
        shadowInner.style.filter = tempShadowInner.style.filter;
        shadowInner.innerHTML = tempShadowInner.innerHTML;

        if (altM !== existing.altM) {
          existing.icon.setOffset(computeIconOffset(f.baroAltitude, pitchRef.current));
        }

        // CSS picks up from the current animated position — no visible snap.
        outerEl.style.transition = `transform ${POLL_S * 1000}ms linear`;
        existing.shadow.getElement().style.transition = `transform ${POLL_S * 1000}ms linear`;
        existing.icon.setLngLat(futureLngLat);
        existing.shadow.setLngLat(futureLngLat);

        markersRef.current.set(f.icao24, { icon: existing.icon, shadow: existing.shadow, altM });
      } else {
        // New flight — place at server position, then start transition next frame.
        const shadowEl = buildGroundShadowElement(f);
        const shadow = new maplibregl.Marker({ element: shadowEl, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'viewport' })
          .setLngLat(lngLat)
          .addTo(map);

        const iconEl = buildAircraftElement(f, isSelected);
        (iconEl.firstElementChild as HTMLElement).style.transform = iconTiltTransform(pitchRef.current);
        iconEl.addEventListener('click', () => onSelectRef.current(f.icao24));
        const icon = new maplibregl.Marker({ element: iconEl, anchor: 'center', pitchAlignment: 'map', rotationAlignment: 'viewport', offset: computeIconOffset(f.baroAltitude, pitchRef.current) })
          .setLngLat(lngLat)
          .addTo(map);

        markersRef.current.set(f.icao24, { icon, shadow, altM });

        // Snap committed — start transition toward future position next frame.
        if (v > 0.5) {
          requestAnimationFrame(() => {
            void iconEl.getBoundingClientRect();
            iconEl.style.transition = `transform ${POLL_S * 1000}ms linear`;
            shadowEl.style.transition = `transform ${POLL_S * 1000}ms linear`;
            icon.setLngLat(futureLngLat);
            shadow.setLngLat(futureLngLat);
          });
        }
      }
    }
  }, [flights, flight]);

  // Update icon offsets and tilt whenever pitch changes.
  // Disable position transition during the offset write so the new elevation
  // snaps instantly rather than animating over 10 seconds.
  useEffect(() => {
    const tilt = iconTiltTransform(pitch);
    for (const [, pair] of markersRef.current) {
      const iconEl = pair.icon.getElement();
      const shadowEl = pair.shadow.getElement();
      iconEl.style.transition = 'none';
      shadowEl.style.transition = 'none';
      pair.icon.setOffset(computeIconOffset(pair.altM, pitch));
      const inner = iconEl.firstElementChild as HTMLElement | null;
      if (inner) inner.style.transform = tilt;
    }
    requestAnimationFrame(() => {
      for (const [, pair] of markersRef.current) {
        pair.icon.getElement().style.transition = `transform ${POLL_S * 1000}ms linear`;
        pair.shadow.getElement().style.transition = `transform ${POLL_S * 1000}ms linear`;
      }
    });
  }, [pitch]);

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
