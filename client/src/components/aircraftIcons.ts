import { FlightState } from '../types';
import { AircraftCategory, categorizeAircraft, getAircraftSvgInfo, heliInnerSvg, MILITARY_CATS, WARBIRD_CATS } from './aircraft';

// Aircraft icon images for the map overlay (aircraftCanvas.ts). SVGs are built once
// per (mode, category, color) and decoded in the background.

export const ICON_PX = 48;      // logical icon size; images are rendered at 2x for sharpness
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

export function iconId(mode: AircraftMapMode, cat: AircraftCategory, color: string): string {
  const id = `ac-icon-${mode}-${cat}-${color}`;
  if (!svgById.has(id)) svgById.set(id, wrapSvg(aircraftBodySvg(cat, color, true, mode === '3d')));
  return id;
}

export function shadowId(mode: AircraftMapMode, cat: AircraftCategory): string {
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

// Returns the decoded image if it's ready, else undefined after starting to decode it
// (callers draw nothing for now and pick it up on a later frame).
export function decodedImage(id: string): HTMLImageElement | undefined {
  const img = decodedById.get(id);
  if (img) return img;
  const svg = svgById.get(id);
  if (svg) decode(id, svg).catch(() => {});
  return undefined;
}
