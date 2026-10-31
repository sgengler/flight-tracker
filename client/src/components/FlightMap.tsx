import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import type { GeoJSONSource } from 'mapbox-gl';
import { FlightState } from '../types';
import { MAPBOX_TOKEN } from '../mapboxToken';
import { AIRPORT_COORDS } from '../utils';
import { haversineDist, trailColor } from './aircraft';
import { AircraftCanvas } from './aircraftCanvas';

mapboxgl.accessToken = MAPBOX_TOKEN;

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

// ── GeoJSON source helpers ────────────────────────────────────────────────────

const TRAIL_POLL_S = 15;

// The trail is one LineString colored by a speed gradient along its length.
// line-gradient can only read line-progress (not feature properties), so the
// color stops are recomputed from cumulative distance on every trail update.
function applyTrailData(map: mapboxgl.Map, trail: [number, number, number?, number?][]) {
  const source = map.getSource('trail-line') as GeoJSONSource | undefined;
  if (!source) return;
  if (trail.length < 2) {
    source.setData({ type: 'FeatureCollection', features: [] });
    return;
  }

  const segLen: number[] = [];
  const cumDist = [0];
  for (let i = 0; i < trail.length - 1; i++) {
    const d = haversineDist([trail[i][0], trail[i][1]], [trail[i + 1][0], trail[i + 1][1]]);
    segLen.push(d);
    cumDist.push(cumDist[i] + d);
  }
  const total = cumDist[cumDist.length - 1];

  const stops: (number | string)[] = [];
  let lastProgress = -1;
  for (let i = 0; i < trail.length; i++) {
    const seg = Math.min(i, trail.length - 2); // last vertex takes the final segment's color
    const speedMs = trail[seg][2] ?? segLen[seg] / TRAIL_POLL_S;
    const progress = total > 0 ? cumDist[i] / total : i / (trail.length - 1);
    if (progress <= lastProgress) continue; // stops must strictly increase (skips zero-length hops)
    lastProgress = progress;
    stops.push(progress, trailColor(speedMs));
  }

  map.setPaintProperty('trail-color', 'line-gradient', ['interpolate', ['linear'], ['line-progress'], ...stops]);
  source.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: trail.map(p => [p[1], p[0]]) },
  });
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
  const aircraftRef = useRef<AircraftCanvas | null>(null);
  const onSelectRef = useRef(onSelectFlight);
  onSelectRef.current = onSelectFlight;
  const trailRef = useRef(trail);
  trailRef.current = trail;
  const flightRef = useRef(flight);
  flightRef.current = flight;
  const fittedRef = useRef(false);
  const userDraggedRef = useRef(false);
  const prevFlightIcaoRef = useRef<string | null>(null);
  const sourcesReadyRef = useRef(false);

  // Mount / unmount the map once
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLES[tileId],
      center: [userLon, userLat],
      zoom: 8,
      pitch: 0,
      projection: 'mercator', // v11/v12 styles otherwise default to the costlier globe projection
      fadeDuration: 0,
      attributionControl: false,
    });
    mapRef.current = map;
    const aircraft = new AircraftCanvas(map, '2d', icao24 => onSelectRef.current(icao24));
    aircraftRef.current = aircraft;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('dragstart', () => { userDraggedRef.current = true; });

    map.on('style.load', () => {
      sourcesReadyRef.current = true;

      map.addSource('trail-line', { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } });
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
          'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#38bdf8', 1, '#38bdf8'],
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
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      aircraft.destroy();
      aircraftRef.current = null;
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      sourcesReadyRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Feed new server data to the aircraft animation (only on real data updates —
  // syncing restarts the dead-reckoning clock)
  useEffect(() => {
    aircraftRef.current?.sync(flights);
  }, [flights]);

  // Selection only changes the highlighted icon
  useEffect(() => {
    aircraftRef.current?.setSelected(flight?.icao24 ?? null);
  }, [flight?.icao24]);

  // AutoBounds + KeepFlightInView on every server update
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

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

  // Handle tile style changes. Skip the initial value: the map was constructed with
  // it, and a setStyle() while that style is still loading wipes our custom layers.
  const appliedTileRef = useRef(tileId);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedTileRef.current === tileId) return;
    appliedTileRef.current = tileId;
    sourcesReadyRef.current = false;
    // Full rebuild (no diff) so style.load always fires and re-adds our layers
    map.setStyle(MAPBOX_STYLES[tileId], { diff: false } as Parameters<mapboxgl.Map['setStyle']>[1]);
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
