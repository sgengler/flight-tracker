import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { GeoJSONSource } from 'mapbox-gl';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string;
import { FlightState } from '../types';
import { haversineDist, trailColor } from './aircraft';
import { AircraftRenderer, addAircraftLayers, bindAircraftClicks } from './aircraftLayer';

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
const DEFAULT_PITCH = 62;

// ── Utilities ────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export function FlightMap3D({ userLat, userLon, flight, flights, trail, onSelectFlight, militaryMode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const rendererRef = useRef<AircraftRenderer | null>(null);
  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  const onSelectRef = useRef(onSelectFlight);
  onSelectRef.current = onSelectFlight;
  const trailRef = useRef<[number, number, number?, number?][]>([]);
  trailRef.current = trail;

  // Mount / unmount the map once
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [userLon, userLat],
      zoom: 9,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
      projection: 'mercator',
      fadeDuration: 0,
      attributionControl: { compact: true } as any,
    });
    mapRef.current = map;
    const renderer = new AircraftRenderer(map, '3d');
    rendererRef.current = renderer;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('pitchend', () => setPitch(Math.round(map.getPitch())));    const unbindClicks = bindAircraftClicks(map, icao24 => onSelectRef.current(icao24));

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

      addAircraftLayers(map, '3d');

      applyTrailData(map, trailRef.current);
      renderer.render();
      renderer.start();
      map.easeTo({ pitch: DEFAULT_PITCH, duration: 1800, easing: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t });
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      renderer.stop();
      rendererRef.current = null;
      resizeObserver.disconnect();
      unbindClicks();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Feed new server data to the aircraft animation (only on real data updates —
  // syncing restarts the dead-reckoning clock)
  useEffect(() => {
    rendererRef.current?.sync(flights);
  }, [flights]);

  // Selection only changes the highlighted icon
  useEffect(() => {
    rendererRef.current?.setSelected(flight?.icao24 ?? null);
  }, [flight?.icao24]);

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
