import type { GeoJSONFeature, GeoJSONSource, Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { FlightState } from '../types';
import {
  AircraftCategory, categorizeAircraft, deadReckon, easeInOutQuad, getAircraftSvgInfo,
  heliInnerSvg, lerpAngle, MILITARY_CATS, WARBIRD_CATS,
} from './aircraft';

// Aircraft are drawn as a WebGL symbol layer rather than DOM markers. Icons are
// rasterized once per (style, category, color) and registered with map.addImage;
// each animation step is then a single GeoJSON setData() instead of N DOM writes.

export const AIRCRAFT_SOURCE = 'aircraft';
export const AIRCRAFT_LAYER = 'aircraft-icons';
const SHADOW_LAYER = 'aircraft-shadows';

const POLL_S = 16;
const TRANSITION_S = 2;
// Positions only need a few updates per second: a 450 kt jet moves ~4 px/s even at
// zoom 11. Run faster only while a post-poll blend is in flight so it stays smooth.
const BLEND_FRAME_MS = 50;
const IDLE_FRAME_MS = 250;

const ICON_PX = 48;      // logical icon size; images are rendered at 2x for sharpness
const ICON_PIXEL_RATIO = 2;

export type AircraftMapMode = '2d' | '3d';

export function aircraftColor(flight: FlightState, isSelected: boolean): string {
  const cat = categorizeAircraft(flight.aircraftType);
  if (isSelected)             return '#ef4444';
  if (flight.isPolice)        return '#60a5fa';
  if (MILITARY_CATS.has(cat)) return '#4ade80';
  if (WARBIRD_CATS.has(cat))  return '#fb923c';
  return '#facc15';
}

// ── Icon images ──────────────────────────────────────────────────────────────

// outlined=false draws a fill-only silhouette (used for shadows).
function aircraftBodySvg(cat: AircraftCategory, color: string, outlined: boolean, highlight: boolean): string {
  const ns = outlined ? `stroke="rgba(0,0,0,0.7)" stroke-width="0.8"` : '';
  const st = outlined ? `stroke="rgba(0,0,0,0.85)" stroke-width="1.5"` : '';
  const pod = (cx: number, cy: number, rx: number, ry: number) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" ${ns}/>`;

  if (cat === 'airship') {
    return `<g>` +
      `<ellipse cx="0" cy="-3" rx="7" ry="18" fill="${color}" ${st}/>` +
      `<rect x="-3" y="8" width="6" height="5" rx="1.5" fill="${color}" ${st}/>` +
      `<path d="M-7,10 L-13,21 L-3,14 Z" fill="${color}" ${st}/>` +
      `<path d="M7,10 L13,21 L3,14 Z" fill="${color}" ${st}/>` +
      `</g>`;
  }
  if (cat === 'heli' || cat === 'mil-heli') return heliInnerSvg(color, '');

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
  const outline = outlined ? `${st} stroke-linejoin="round"` : '';
  return `<g><path d="${path}" fill="${color}" ${outline}/>${nacelles}</g>` +
    (highlight ? `<ellipse cx="-1" cy="-8" rx="4" ry="2.5" fill="rgba(255,255,255,0.32)"/>` : '');
}

function wrapSvg(body: string, blurPx = 0): string {
  const size = ICON_PX * ICON_PIXEL_RATIO;
  const filter = blurPx > 0
    ? `<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blurPx}"/></filter></defs>`
    : '';
  const g = blurPx > 0 ? `<g filter="url(#b)">${body}</g>` : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-26 -26 52 52">${filter}${g}</svg>`;
}

// Image id → SVG source. Filled lazily as ids are handed out, so the
// renderer can rasterize any id it hands to the layers.
const svgById = new Map<string, string>();
const decodedById = new Map<string, HTMLImageElement>();
const decodingById = new Map<string, Promise<HTMLImageElement>>();

function iconId(mode: AircraftMapMode, cat: AircraftCategory, color: string): string {
  const id = `ac-icon-${mode}-${cat}-${color}`;
  if (!svgById.has(id)) svgById.set(id, wrapSvg(aircraftBodySvg(cat, color, true, mode === '3d')));
  return id;
}

function shadowId(mode: AircraftMapMode, cat: AircraftCategory): string {
  const id = `ac-shadow-${mode}-${cat}`;
  // 3D ground shadows are soft; 2D drop shadows are near-sharp
  if (!svgById.has(id)) svgById.set(id, wrapSvg(aircraftBodySvg(cat, '#000000', false, false), mode === '3d' ? 1 : 0));
  return id;
}

function decode(id: string, svg: string): Promise<HTMLImageElement> {
  let p = decodingById.get(id);
  if (!p) {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    p = img.decode().then(() => { decodedById.set(id, img); return img; });
    p.catch(() => decodingById.delete(id)); // allow a retry
    decodingById.set(id, p);
  }
  return p;
}

// Returns the image id if it's registered on the map and ready to draw, else ''
// (draws nothing). Images not yet decoded are decoded in the background and
// appear on a later animation step. Checking every render also re-registers
// images after a tile style swap, which clears them.
function readyImage(map: MapboxMap, id: string): string {
  if (map.hasImage(id)) return id;
  const img = decodedById.get(id);
  if (img) {
    map.addImage(id, img, { pixelRatio: ICON_PIXEL_RATIO });
    return id;
  }
  const svg = svgById.get(id);
  if (svg) decode(id, svg).catch(() => {});
  return '';
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
export function addAircraftLayers(map: MapboxMap, mode: AircraftMapMode) {
  map.addSource(AIRCRAFT_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  if (mode === '2d') {
    map.addLayer({
      id: SHADOW_LAYER,
      type: 'symbol',
      source: AIRCRAFT_SOURCE,
      layout: { ...SHARED_LAYOUT, 'icon-image': ['get', 'shadow'] },
      paint: { 'icon-opacity': 0.28, 'icon-translate': [6, 6], 'icon-translate-anchor': 'viewport' },
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    map.addLayer({
      id: AIRCRAFT_LAYER,
      type: 'symbol',
      source: AIRCRAFT_SOURCE,
      layout: { ...SHARED_LAYOUT, 'icon-image': ['get', 'icon'] },
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    return;
  }

  // 3D: flat soft shadow on the ground, icon raised to the aircraft's altitude.
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

interface Track {
  flight: FlightState;
  shown: [number, number, number]; // last rendered lat, lon, heading
  blendFrom?: [number, number];
  blendStart?: number;
  headingFrom?: number;
}

// Owns per-aircraft animation state and pushes frames into the aircraft source.
// Dead-reckons each aircraft forward from its last report, and blends from the
// previously shown position over TRANSITION_S when a new report arrives.
export class AircraftRenderer {
  private tracks = new Map<string, Track>();
  private lastPollTime = Date.now();
  private selectedIcao: string | null = null;
  private frame: number | null = null;
  private lastRender = 0;

  constructor(private map: MapboxMap, private mode: AircraftMapMode) {}

  // Call only when fresh data arrives — it restarts the dead-reckoning clock.
  sync(flights: FlightState[]) {
    const now = Date.now();
    const incoming = new Set(flights.map(f => f.icao24));
    for (const icao of this.tracks.keys()) {
      if (!incoming.has(icao)) this.tracks.delete(icao);
    }
    for (const f of flights) {
      const existing = this.tracks.get(f.icao24);
      if (existing) {
        existing.flight = f;
        existing.blendFrom = [existing.shown[0], existing.shown[1]];
        existing.headingFrom = existing.shown[2];
        existing.blendStart = now;
      } else {
        this.tracks.set(f.icao24, { flight: f, shown: [f.latitude, f.longitude, f.trueTrack ?? 0] });
      }
    }
    this.lastPollTime = now;
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
      const interval = this.isBlending() ? BLEND_FRAME_MS : IDLE_FRAME_MS;
      if (now - this.lastRender >= interval) this.render();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  render() {
    const now = Date.now();
    this.lastRender = now;
    const source = this.map.getSource(AIRCRAFT_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;

    const elapsed = Math.min((now - this.lastPollTime) / 1000, POLL_S);
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const track of this.tracks.values()) {
      const f = track.flight;
      const v = f.velocity ?? 0;
      const heading = f.trueTrack ?? 0;
      let lat = f.latitude, lon = f.longitude, displayHeading = heading;
      if (v > 0.5) [lat, lon] = deadReckon(f.latitude, f.longitude, heading, v, elapsed);
      if (track.blendStart !== undefined) {
        const bt = Math.min((now - track.blendStart) / (TRANSITION_S * 1000), 1);
        const ease = easeInOutQuad(bt);
        if (track.blendFrom && v > 0.5) {
          lat = track.blendFrom[0] * (1 - ease) + lat * ease;
          lon = track.blendFrom[1] * (1 - ease) + lon * ease;
        }
        if (track.headingFrom !== undefined) displayHeading = lerpAngle(track.headingFrom, heading, ease);
        if (bt >= 1) {
          track.blendStart = undefined;
          track.blendFrom = undefined;
          track.headingFrom = undefined;
        }
      }
      track.shown = [lat, lon, displayHeading];

      const isSelected = f.icao24 === this.selectedIcao;
      const cat = categorizeAircraft(f.aircraftType);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          icao24: f.icao24,
          icon: readyImage(this.map, iconId(this.mode, cat, aircraftColor(f, isSelected))),
          shadow: readyImage(this.map, shadowId(this.mode, cat)),
          heading: displayHeading,
          alt: Math.max(0, f.baroAltitude ?? 0),
          sort: isSelected ? 1 : 0,
        },
      });
    }
    source.setData({ type: 'FeatureCollection', features });
  }

  private isBlending(): boolean {
    for (const t of this.tracks.values()) if (t.blendStart !== undefined) return true;
    return false;
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
