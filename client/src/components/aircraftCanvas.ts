import type { CustomLayerInterface, Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { FlightState } from '../types';
import { categorizeAircraft } from './aircraft';
import { AircraftMapMode, aircraftColor, decodedImage, iconId, ICON_PX, shadowId } from './aircraftIcons';
import { AircraftMotion, AircraftPose } from './aircraftMotion';

// Aircraft are drawn on a transparent canvas laid over the map rather than inside
// Mapbox. Updating a Mapbox source makes it repaint the whole map (and in 3D, rebuild
// every tile the tilted view covers), which on the Pi limited aircraft to a few
// updates a second. This canvas only redraws the icons, so they can move smoothly
// while the map itself repaints only when it pans, zooms or tilts.
// The canvas ignores pointer events — taps go to the map and are hit-tested here.
//
// In 3D, icons are placed at their altitude and laid flat in the map plane using the
// camera matrix Mapbox hands to a do-nothing custom layer; each icon is an affine
// approximation of the perspective at its position, with a ground shadow beneath.

const FRAME_MS = 50;        // ~20 fps animation
const HIT_RADIUS = 22;      // px from an icon's center that counts as tapping it
const MIN_HIT_RADIUS = 14;  // 3D icons far from the camera are small; keep them tappable

// 2D: sharp drop shadow, down-right like a light from the top-left
const SHADOW_OFFSET_2D = 6;
const SHADOW_ALPHA_2D = 0.28;

// 3D: matches the earlier symbol layer — 56 px icons at the map center, soft ground shadows
const ICON_PX_3D = 56;
const SHADOW_ALPHA_3D = 0.55;
const SPRITE_SCALE_3D = 1.5;      // rasterize larger, since icons near the camera are magnified
const CAMERA_LAYER = 'aircraft-camera';
const ELEVATION_REFRESH_MS = 1000;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

type Affine = [number, number, number, number]; // 2x2 linear part of a canvas transform

interface Item {
  icao24: string;
  x: number;
  y: number;
  t: Affine;
  shadowX: number;
  shadowY: number;
  shadowT: Affine;
  size: number;   // sprite size in its own units
  depth: number;  // larger draws first (further from the camera)
  hitRadius: number;
  icon?: HTMLCanvasElement;
  shadow?: HTMLCanvasElement;
}

export class AircraftCanvas {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private motion = new AircraftMotion();
  private selectedIcao: string | null = null;
  private drawn: Pick<Item, 'icao24' | 'x' | 'y' | 'hitRadius'>[] = [];
  private sprites = new Map<string, HTMLCanvasElement>(); // image id → pre-rasterized icon
  private dpr = 1;
  private frame: number | null = null;
  private lastDraw = 0;
  // 3D only
  private cameraMatrix: number[] | null = null;
  private groundElevation = new Map<string, { m: number; at: number }>();

  constructor(private map: MapboxMap, private mode: AircraftMapMode, private onSelect: (icao24: string) => void) {
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    // After the canvas container (map + markers), before the controls
    map.getCanvasContainer().after(this.canvas);
    map.on('render', this.onMapRender);
    map.on('resize', this.resize);
    map.on('click', this.onClick);
    map.on('mousemove', this.onMouseMove);
    this.resize();
    this.start();
  }

  // 3D: call from the map's style.load handler so the overlay gets the camera matrix.
  addCameraLayer() {
    if (this.map.getLayer(CAMERA_LAYER)) return;
    const layer: CustomLayerInterface = {
      id: CAMERA_LAYER,
      type: 'custom',
      renderingMode: '3d',
      render: (_gl, matrix) => { this.cameraMatrix = Array.from(matrix); },
    };
    this.map.addLayer(layer);
  }

  sync(flights: FlightState[]) {
    this.motion.sync(flights);
    this.draw();
  }

  setSelected(icao24: string | null) {
    if (icao24 === this.selectedIcao) return;
    this.selectedIcao = icao24;
    this.draw();
  }

  destroy() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.map.off('render', this.onMapRender);
    this.map.off('resize', this.resize);
    this.map.off('click', this.onClick);
    this.map.off('mousemove', this.onMouseMove);
    this.canvas.remove();
  }

  private start() {
    const loop = () => {
      if (performance.now() - this.lastDraw >= FRAME_MS) this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  // Redraw in the same frame as the map while it moves, so icons stay put on it
  private onMapRender = () => this.draw();

  private resize = () => {
    const { clientWidth, clientHeight } = this.map.getContainer();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(clientWidth * this.dpr);
    this.canvas.height = Math.round(clientHeight * this.dpr);
    this.sprites.clear(); // sprite resolution follows the device pixel ratio
    this.draw();
  };

  private draw() {
    this.lastDraw = performance.now();
    const { ctx, dpr } = this;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const items: Item[] = [];
    let selected: Item | undefined;
    for (const pose of this.motion.poses()) {
      const item = this.mode === '3d' ? this.place3d(pose, width, height) : this.place2d(pose, width, height);
      if (!item) continue;
      if (pose.flight.icao24 === this.selectedIcao) selected = item;
      else items.push(item);
    }
    items.sort((a, b) => b.depth - a.depth);
    if (selected) items.push(selected); // selected draws on top

    ctx.globalAlpha = this.mode === '3d' ? SHADOW_ALPHA_3D : SHADOW_ALPHA_2D;
    for (const it of items) if (it.shadow) this.drawSprite(it.shadow, it.shadowX, it.shadowY, it.shadowT, it.size);
    ctx.globalAlpha = 1;
    for (const it of items) if (it.icon) this.drawSprite(it.icon, it.x, it.y, it.t, it.size);

    this.drawn = items.map(({ icao24, x, y, hitRadius }) => ({ icao24, x, y, hitRadius }));
  }

  private place2d(pose: AircraftPose, width: number, height: number): Item | null {
    const { x, y } = this.map.project([pose.lon, pose.lat]);
    if (x < -ICON_PX || y < -ICON_PX || x > width + ICON_PX || y > height + ICON_PX) return null;
    const rad = ((pose.heading - this.map.getBearing()) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const t: Affine = [cos, sin, -sin, cos];
    return {
      ...this.sprites2(pose.flight),
      icao24: pose.flight.icao24, x, y, t,
      shadowX: x + SHADOW_OFFSET_2D, shadowY: y + SHADOW_OFFSET_2D, shadowT: t,
      size: ICON_PX, depth: 0, hitRadius: HIT_RADIUS,
    };
  }

  private place3d(pose: AircraftPose, width: number, height: number): Item | null {
    const m = this.cameraMatrix;
    if (!m) return null;
    const { lat, lon, heading, flight } = pose;
    const mx = (lon + 180) / 360;
    const my = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;
    const unitsPerMeter = 1 / (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180));

    // Icon world size: ICON_PX_3D screen pixels at the map center's ground resolution
    const center = this.map.getCenter();
    const metersPerPx = (EARTH_CIRCUMFERENCE_M * Math.cos((center.lat * Math.PI) / 180)) / (512 * 2 ** this.map.getZoom());
    const half = (ICON_PX_3D / 2) * metersPerPx * unitsPerMeter; // half icon, in mercator units

    const project = (x: number, y: number, z: number) => {
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw <= 0) return null; // behind the camera
      return { x: ((cx / cw + 1) / 2) * width, y: ((1 - cy / cw) / 2) * height, w: cw };
    };
    // Screen position plus the local map-plane basis at height z, as an affine transform
    // for a heading-rotated sprite of ICON_PX_3D units
    const placeAt = (z: number) => {
      const c = project(mx, my, z);
      const e = project(mx + half, my, z);
      const n = project(mx, my - half, z);
      if (!c || !e || !n) return null;
      const scale = ICON_PX_3D / 2;
      const ex = (e.x - c.x) / scale, ey = (e.y - c.y) / scale;
      const nx = (n.x - c.x) / scale, ny = (n.y - c.y) / scale;
      const rad = (heading * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      // sprite x → right wing, sprite +y → tail
      const t: Affine = [cos * ex - sin * nx, cos * ey - sin * ny, -(sin * ex + cos * nx), -(sin * ey + cos * ny)];
      return { x: c.x, y: c.y, w: c.w, t, px: Math.hypot(e.x - c.x, e.y - c.y) };
    };

    const air = placeAt(Math.max(0, flight.baroAltitude ?? 0) * unitsPerMeter);
    if (!air) return null;
    const margin = Math.max(ICON_PX_3D, air.px * 2);
    if (air.x < -margin || air.y < -margin || air.x > width + margin || air.y > height + margin) return null;
    const ground = placeAt(this.elevation(flight.icao24, lon, lat) * unitsPerMeter);

    const isSelected = flight.icao24 === this.selectedIcao;
    const cat = categorizeAircraft(flight.aircraftType);
    return {
      icao24: flight.icao24,
      x: air.x, y: air.y, t: air.t,
      shadowX: ground?.x ?? 0, shadowY: ground?.y ?? 0, shadowT: ground?.t ?? air.t,
      size: ICON_PX_3D, depth: air.w,
      hitRadius: Math.max(MIN_HIT_RADIUS, Math.min(HIT_RADIUS, air.px * 0.8)),
      icon: this.sprite(iconId('3d', cat, aircraftColor(flight, isSelected)), ICON_PX_3D * SPRITE_SCALE_3D),
      shadow: ground ? this.sprite(shadowId('3d', cat), ICON_PX_3D) : undefined,
    };
  }

  private sprites2(f: FlightState) {
    const cat = categorizeAircraft(f.aircraftType);
    return {
      icon: this.sprite(iconId('2d', cat, aircraftColor(f, f.icao24 === this.selectedIcao)), ICON_PX),
      shadow: this.sprite(shadowId('2d', cat), ICON_PX),
    };
  }

  // Ground height (with the map's terrain exaggeration) under an aircraft, for its
  // shadow. Looked up at most once a second per aircraft.
  private elevation(icao24: string, lon: number, lat: number): number {
    const now = performance.now();
    const cached = this.groundElevation.get(icao24);
    if (cached && now - cached.at < ELEVATION_REFRESH_MS) return cached.m;
    const m = this.map.queryTerrainElevation([lon, lat]) ?? 0;
    this.groundElevation.set(icao24, { m, at: now });
    if (this.groundElevation.size > 500) this.groundElevation.clear(); // aircraft come and go
    return m;
  }

  private drawSprite(sprite: HTMLCanvasElement, x: number, y: number, t: Affine, size: number) {
    const { dpr } = this;
    this.ctx.setTransform(t[0] * dpr, t[1] * dpr, t[2] * dpr, t[3] * dpr, x * dpr, y * dpr);
    this.ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
  }

  // Drawing an SVG image re-rasterizes it, so each icon is drawn once into a bitmap
  // at the screen's resolution and that bitmap is reused every frame.
  private sprite(id: string, cssPx: number): HTMLCanvasElement | undefined {
    const cached = this.sprites.get(id);
    if (cached) return cached;
    const img = decodedImage(id);
    if (!img) return undefined;
    const size = Math.round(cssPx * this.dpr);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d')!.drawImage(img, 0, 0, size, size);
    this.sprites.set(id, c);
    return c;
  }

  // The selected aircraft wins if it's under the tap; otherwise the nearest one.
  private hitTest(x: number, y: number): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const d of this.drawn) {
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist > d.hitRadius) continue;
      if (d.icao24 === this.selectedIcao) return d.icao24;
      if (dist <= bestDist) { best = d.icao24; bestDist = dist; }
    }
    return best;
  }

  private onClick = (e: MapMouseEvent) => {
    const icao = this.hitTest(e.point.x, e.point.y);
    if (icao) this.onSelect(icao);
  };

  private onMouseMove = (e: MapMouseEvent) => {
    this.map.getCanvas().style.cursor = this.hitTest(e.point.x, e.point.y) ? 'pointer' : '';
  };
}
