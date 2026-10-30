import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { FlightState } from '../types';
import { categorizeAircraft } from './aircraft';
import { aircraftColor, decodedImage, iconId, ICON_PX, shadowId } from './aircraftIcons';
import { AircraftMotion } from './aircraftMotion';

// 2D aircraft are drawn on a transparent canvas laid over the map rather than inside
// Mapbox. Updating a Mapbox source makes it repaint the whole map, which on the Pi
// limited aircraft to ~1 update a second; this canvas only redraws the icons, so they
// can move smoothly while the map itself repaints only when it pans or zooms.
// The canvas ignores pointer events — taps go to the map and are hit-tested here.

const FRAME_MS = 50;        // ~20 fps animation
const SHADOW_OFFSET = 6;    // px, down-right like a light from the top-left
const SHADOW_ALPHA = 0.28;
const HIT_RADIUS = 22;      // px from an icon's center that counts as tapping it

interface Drawn { icao24: string; x: number; y: number }

export class AircraftCanvas {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private motion = new AircraftMotion();
  private selectedIcao: string | null = null;
  private drawn: Drawn[] = [];
  private sprites = new Map<string, HTMLCanvasElement>(); // image id → pre-rasterized icon
  private dpr = 1;
  private frame: number | null = null;
  private lastDraw = 0;

  constructor(private map: MapboxMap, private onSelect: (icao24: string) => void) {
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

  // Redraw in the same frame as the map while it pans or zooms, so icons stay put on it
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
    const { ctx, dpr, map } = this;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const bearing = map.getBearing();
    const margin = ICON_PX;
    const items: { icao24: string; x: number; y: number; rad: number; icon?: HTMLCanvasElement; shadow?: HTMLCanvasElement }[] = [];
    let selected: (typeof items)[number] | undefined;
    for (const pose of this.motion.poses()) {
      const { x, y } = map.project([pose.lon, pose.lat]);
      if (x < -margin || y < -margin || x > width + margin || y > height + margin) continue;
      const f = pose.flight;
      const isSelected = f.icao24 === this.selectedIcao;
      const cat = categorizeAircraft(f.aircraftType);
      const item = {
        icao24: f.icao24, x, y,
        rad: ((pose.heading - bearing) * Math.PI) / 180,
        icon: this.sprite(iconId('2d', cat, aircraftColor(f, isSelected))),
        shadow: this.sprite(shadowId('2d', cat)),
      };
      if (isSelected) selected = item;
      else items.push(item);
    }
    if (selected) items.push(selected); // selected draws on top

    ctx.globalAlpha = SHADOW_ALPHA;
    for (const it of items) if (it.shadow) this.drawSprite(it.shadow, it.x + SHADOW_OFFSET, it.y + SHADOW_OFFSET, it.rad);
    ctx.globalAlpha = 1;
    for (const it of items) if (it.icon) this.drawSprite(it.icon, it.x, it.y, it.rad);

    this.drawn = items.map(({ icao24, x, y }) => ({ icao24, x, y }));
  }

  private drawSprite(sprite: HTMLCanvasElement, x: number, y: number, rad: number) {
    const { dpr } = this;
    const cos = Math.cos(rad) * dpr, sin = Math.sin(rad) * dpr;
    this.ctx.setTransform(cos, sin, -sin, cos, x * dpr, y * dpr);
    this.ctx.drawImage(sprite, -ICON_PX / 2, -ICON_PX / 2, ICON_PX, ICON_PX);
  }

  // Drawing an SVG image re-rasterizes it, so each icon is drawn once into a bitmap
  // at the screen's resolution and that bitmap is reused every frame.
  private sprite(id: string): HTMLCanvasElement | undefined {
    const cached = this.sprites.get(id);
    if (cached) return cached;
    const img = decodedImage(id);
    if (!img) return undefined;
    const size = Math.round(ICON_PX * this.dpr);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d')!.drawImage(img, 0, 0, size, size);
    this.sprites.set(id, c);
    return c;
  }

  // The selected aircraft wins if it's under the tap; otherwise the nearest one.
  private hitTest(x: number, y: number): string | null {
    let best: string | null = null;
    let bestDist = HIT_RADIUS;
    for (const d of this.drawn) {
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist > HIT_RADIUS) continue;
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
