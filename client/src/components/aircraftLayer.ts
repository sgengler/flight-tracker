import type { GeoJSONFeature, GeoJSONSource, Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { FlightState } from '../types';
import { categorizeAircraft } from './aircraft';
import { aircraftColor, decodedImage, iconId, ICON_PIXEL_RATIO, ICON_PX, shadowId } from './aircraftIcons';
import { AircraftMotion } from './aircraftMotion';

// 3D aircraft are drawn as a WebGL symbol layer so they can sit at altitude and take
// on the map's perspective. Each animation step is a GeoJSON setData(). (The 2D map
// draws aircraft on a canvas overlay instead — see aircraftCanvas.ts.)

export const AIRCRAFT_SOURCE = 'aircraft';
export const AIRCRAFT_LAYER = 'aircraft-icons';
const SHADOW_LAYER = 'aircraft-shadows';

// Every setData() makes Mapbox repaint the whole map, which is the dominant cost on
// the Pi. Positions are recomputed every CHECK_MS (cheap) but only pushed when some
// aircraft would visibly move or turn, and never more often than MIN_PUSH_MS.
const CHECK_MS = 100;
const MIN_PUSH_MS = 250;
const MIN_MOVE_PX = 1;
const MIN_TURN_DEG = 3;
const EARTH_CIRCUMFERENCE_M = 40_075_016;

// Returns the image id if it's registered on the map and ready to draw, else ''
// (draws nothing). Images not yet decoded appear on a later animation step.
// Checking every render also re-registers images after a tile style swap, which clears them.
function readyImage(map: MapboxMap, id: string): string {
  if (map.hasImage(id)) return id;
  const img = decodedImage(id);
  if (!img) return '';
  map.addImage(id, img, { pixelRatio: ICON_PIXEL_RATIO });
  return id;
}

// ── Layers ───────────────────────────────────────────────────────────────────

const SHARED_LAYOUT = {
  'icon-rotate': ['get', 'heading'],
  'icon-rotation-alignment': 'map',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
  'symbol-sort-key': ['get', 'sort'],
};

// Call from the map's style.load handler, after any layers that should sit beneath the aircraft.
export function addAircraftLayers(map: MapboxMap) {
  map.addSource(AIRCRAFT_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  // Flat soft shadow on the ground, icon raised to the aircraft's altitude.
  map.addLayer({
    id: SHADOW_LAYER,
    type: 'symbol',
    source: AIRCRAFT_SOURCE,
    layout: {
      ...SHARED_LAYOUT,
      'icon-image': ['get', 'shadow'],
      'icon-pitch-alignment': 'map',
      'icon-size': 56 / ICON_PX,
    },
    paint: { 'icon-opacity': 0.55 },
  } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  map.addLayer({
    id: AIRCRAFT_LAYER,
    type: 'symbol',
    source: AIRCRAFT_SOURCE,
    layout: {
      ...SHARED_LAYOUT,
      'icon-image': ['get', 'icon'],
      // Lie in the map plane so icons take on the 3D perspective (and the
      // map-aligned heading stays correct under pitch)
      'icon-pitch-alignment': 'map',
      'icon-size': 56 / ICON_PX,
      'symbol-z-elevate': true,
      'symbol-elevation-reference': 'sea',
    },
    paint: { 'symbol-z-offset': ['get', 'alt'] },
  } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ── Animation ────────────────────────────────────────────────────────────────

// Pushes frames from the shared motion model into the aircraft source.
export class AircraftRenderer {
  private motion = new AircraftMotion();
  private shown = new Map<string, [number, number, number]>(); // last pushed lat, lon, heading
  private selectedIcao: string | null = null;
  private frame: number | null = null;
  private lastCheck = 0;
  private lastPush = 0;
  private imagesPending = false; // some icon was still decoding at the last push

  constructor(private map: MapboxMap) {}

  // Call only when fresh data arrives — it restarts the dead-reckoning clock.
  sync(flights: FlightState[]) {
    this.motion.sync(flights);
    this.render();
  }

  setSelected(icao24: string | null) {
    if (icao24 === this.selectedIcao) return;
    this.selectedIcao = icao24;
    this.render();
  }

  start() {
    if (this.frame !== null) return;
    const loop = () => {
      const now = Date.now();
      if (now - this.lastCheck >= CHECK_MS) {
        this.lastCheck = now;
        if (now - this.lastPush >= MIN_PUSH_MS) this.update(false);
      }
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  // Push the current positions unconditionally (new data, selection, style reload).
  render() {
    this.update(true);
  }

  private update(force: boolean) {
    const source = this.map.getSource(AIRCRAFT_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;

    const poses = this.motion.poses();
    if (!force && !this.imagesPending && !this.visiblyChanged(poses)) return;

    this.lastPush = Date.now();
    this.imagesPending = false;
    this.shown.clear();
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const { flight: f, lat, lon, heading } of poses) {
      this.shown.set(f.icao24, [lat, lon, heading]);
      const isSelected = f.icao24 === this.selectedIcao;
      const cat = categorizeAircraft(f.aircraftType);
      const icon = readyImage(this.map, iconId('3d', cat, aircraftColor(f, isSelected)));
      const shadow = readyImage(this.map, shadowId('3d', cat));
      if (!icon || !shadow) this.imagesPending = true;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          icao24: f.icao24,
          icon,
          shadow,
          heading,
          alt: Math.max(0, f.baroAltitude ?? 0),
          sort: isSelected ? 1 : 0,
        },
      });
    }
    source.setData({ type: 'FeatureCollection', features });
  }

  private visiblyChanged(poses: ReturnType<AircraftMotion['poses']>): boolean {
    const metersPerPx = this.metersPerPixel();
    for (const { flight, lat, lon, heading } of poses) {
      const prev = this.shown.get(flight.icao24);
      if (!prev) return true;
      const [sLat, sLon, sHeading] = prev;
      const dy = (lat - sLat) * 111_320;
      const dx = (lon - sLon) * 111_320 * Math.cos((lat * Math.PI) / 180);
      const turn = Math.abs(((heading - sHeading + 540) % 360) - 180);
      if (Math.hypot(dx, dy) / metersPerPx >= MIN_MOVE_PX || turn >= MIN_TURN_DEG) return true;
    }
    return false;
  }

  // Ground resolution at the map center, halved because under 3D pitch areas near
  // the camera are magnified.
  private metersPerPixel(): number {
    const lat = this.map.getCenter().lat;
    return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** this.map.getZoom()) / 2;
  }
}

// Wires click + hover handling for the aircraft layer. Returns an unsubscribe fn.
export function bindAircraftClicks(map: MapboxMap, onSelect: (icao24: string) => void): () => void {
  const onClick = (e: MapMouseEvent & { features?: GeoJSONFeature[] }) => {
    const icao = e.features?.[0]?.properties?.icao24;
    if (typeof icao === 'string') onSelect(icao);
  };
  const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
  const onLeave = () => { map.getCanvas().style.cursor = ''; };
  map.on('click', AIRCRAFT_LAYER, onClick);
  map.on('mouseenter', AIRCRAFT_LAYER, onEnter);
  map.on('mouseleave', AIRCRAFT_LAYER, onLeave);
  return () => {
    map.off('click', AIRCRAFT_LAYER, onClick);
    map.off('mouseenter', AIRCRAFT_LAYER, onEnter);
    map.off('mouseleave', AIRCRAFT_LAYER, onLeave);
  };
}
