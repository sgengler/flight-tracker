// Shared aircraft helpers used by both map components, the flight card and the dashboard.

// Top-down aircraft SVG paths, nose points UP (north) at heading=0, centered at (0,0).
const JET_PATH       = 'M0,-22 L2,-15 L2.5,-5 L20,5 L20,9 L2.5,4 L3,12 L8,14 L8,17 L1.5,16 L0,18 L-1.5,16 L-8,17 L-8,14 L-3,12 L-2.5,4 L-20,9 L-20,5 L-2.5,-5 L-2,-15 Z';
const PROP_PATH      = 'M0,-19 L2,-13 L2.5,-3 L16,0 L16,4 L2.5,2 L2.5,12 L7,14 L7,17 L1,16 L0,18 L-1,16 L-7,17 L-7,14 L-2.5,12 L-2.5,2 L-16,4 L-16,0 L-2.5,-3 L-2,-13 Z';
const SMALL_PATH     = 'M0,-16 L1.5,-11 L2,-2 L14,1 L14,4 L2,1 L2,11 L5,12 L5,15 L1,14 L0,16 L-1,14 L-5,15 L-5,12 L-2,11 L-2,1 L-14,4 L-14,1 L-2,-2 L-1.5,-11 Z';
const FIGHTER_PATH   = 'M0,-22 L1.5,-14 L2.5,-4 L21,10 L16,15 L2.5,9 L3,14 L6,17 L2,20 L0,21 L-2,20 L-6,17 L-3,14 L-2.5,9 L-16,15 L-21,10 L-2.5,-4 L-1.5,-14 Z';
const BOMBER_PATH    = 'M0,-14 L2,-8 L3,-1 L23,6 L22,10 L3,5 L3,13 L6,14 L6,17 L1,16 L0,18 L-1,16 L-6,17 L-6,14 L-3,13 L-3,5 L-22,10 L-23,6 L-3,-1 L-2,-8 Z';
const TRANSPORT_PATH = 'M0,-18 L3,-10 L5,-4 L20,2 L20,7 L5,2 L4,13 L8,15 L8,18 L1,17 L0,19 L-1,17 L-8,18 L-8,15 L-4,13 L-5,2 L-20,7 L-20,2 L-5,-4 L-3,-10 Z';
const ATTACK_PATH    = 'M0,-19 L2,-12 L2.5,-2 L20,2 L20,6 L2.5,4 L4,12 L8,13 L7,16 L0,15 L-7,16 L-8,13 L-4,12 L-2.5,4 L-20,6 L-20,2 L-2.5,-2 L-2,-12 Z';
const UAV_PATH       = 'M0,-11 L1,-6 L1.5,0 L25,4 L25,7 L1.5,3 L2,11 L5,13 L4,15 L0,14 L-4,15 L-5,13 L-2,11 L-1.5,3 L-25,7 L-25,4 L-1.5,0 L-1,-6 Z';
const WARBIRD_PATH   = 'M0,-22 L1.5,-14 L2.5,-5 L17,4 L15,8 L2.5,4 L3,12 L6,14 L5,17 L0,16 L-5,17 L-6,14 L-3,12 L-2.5,4 L-15,8 L-17,4 L-2.5,-5 L-1.5,-14 Z';
const HELI_ICON_PATH = 'M-22,-2.5 L22,-2.5 L22,2.5 L-22,2.5 Z M-2.5,-22 L2.5,-22 L2.5,22 L-2.5,22 Z';

export function heliInnerSvg(color: string, filterAttr: string): string {
  const s = `stroke="rgba(0,0,0,0.7)" stroke-width="0.8"`;
  return (
    `<rect x="-20" y="-2" width="40" height="4" rx="2" fill="${color}" ${s}/>` +
    `<rect x="-2" y="-20" width="4" height="40" rx="2" fill="${color}" ${s}/>` +
    `<circle cx="0" cy="0" r="3" fill="${color}" stroke="rgba(0,0,0,0.85)" stroke-width="1"/>` +
    `<path d="M0,-11 C5,-11 8,-5 8,1 C8,7 5,11 0,13 C-5,11 -8,7 -8,1 C-8,-5 -5,-11 0,-11 Z" ` +
    `fill="${color}" stroke="rgba(0,0,0,0.85)" stroke-width="1.5" ${filterAttr}/>` +
    `<rect x="-1.5" y="12" width="3" height="10" rx="1" fill="${color}" ${s}/>` +
    `<rect x="-8" y="19" width="16" height="3" rx="1.5" fill="${color}" ${s}/>`
  );
}

export type AircraftCategory = 'jet' | 'prop' | 'small' | 'heli' | 'fighter' | 'bomber' | 'transport' | 'attack' | 'uav' | 'mil-heli' | 'warbird' | 'airship';

export function getAircraftSvgInfo(category: AircraftCategory): { path: string; rotates: boolean } {
  switch (category) {
    case 'heli': case 'mil-heli': return { path: HELI_ICON_PATH, rotates: false };
    case 'prop':      return { path: PROP_PATH,      rotates: true };
    case 'small':     return { path: SMALL_PATH,     rotates: true };
    case 'fighter':   return { path: FIGHTER_PATH,   rotates: true };
    case 'bomber':    return { path: BOMBER_PATH,    rotates: true };
    case 'transport': return { path: TRANSPORT_PATH, rotates: true };
    case 'attack':    return { path: ATTACK_PATH,    rotates: true };
    case 'uav':       return { path: UAV_PATH,       rotates: true };
    case 'warbird':   return { path: WARBIRD_PATH,   rotates: true };
    default:          return { path: JET_PATH,       rotates: true };
  }
}

export const MILITARY_CATS: ReadonlySet<AircraftCategory> = new Set(['fighter', 'bomber', 'transport', 'attack', 'uav', 'mil-heli']);
export const WARBIRD_CATS: ReadonlySet<AircraftCategory> = new Set(['warbird']);

// ── Categorization ───────────────────────────────────────────────────────────
// Lookup tables live at module scope and results are memoized: categorizeAircraft
// runs several times per flight on every poll, so it must not allocate.

const AIRSHIP_CODES = new Set(['SHIP', 'ZNTH']);

const WARBIRD_CODES = new Set([
  'P51','P51D','P38','P38L','P40','P40N','P47','P47D',
  'F4U','F4U1','F6F','FM2','ZERO',
  'ME09','FW19','SPIT','HURI','YAK3','YAK9',
  'AT6','SNJ','PT17','B17','B25','SBD','TBF','A26',
  'DC3','C47','BE18',
  'F86','F86D','F86F','MIG15',
  'T28','T28A','T34',
]);

const MILITARY_CODES = new Set([
  'F14','F15','F16','F18','FA18','F22','F35','F117','F5',
  'B52','B1B','B2',
  'A10','AC13','AC130','TUCA',
  'C130','C30J','C17','C5A','C5M','SW4',
  'CN35','A400','DHC6','M28','IL76',
  'KC10','KC135','KC46','K35R',
  'E3','E3TF','E8','E6','E2',
  'U2','SR71','RQ4','Q4','MQ9','MQ1','X47B','RQ180','BTB2',
  'P3','P8',
  'W135','R135','GLF3','GLF5',
  'V22',
  'T38','T6','T45','TEX2','HAWK','G120','G12T','PC7',
  'EF2000','EUFI',
  'RFAL',
  'JAS3',
  'TORA',
  'AV8B',
  'AJET',
  'L39',
  'MIG29','MIG21',
  'SU27','SU30','SU35',
  'F2',
  'T50',
  'H60','S70','UH60','HH60','MH60','SH60',
  'CH47','H47',
  'AH64',
  'UH1','UH1Y','HH1',
  'AH1',
  'CH53','H53S',
  'OH58',
  'HH65',
  'AS65',
  'B212','B412',
  'A119','A139','A169',
  'H500','AS55',
]);

const BOMBER_CODES = new Set(['B52','B1B','B2']);
const MIL_TRANSPORT_CODES = new Set([
  'C130','C30J','C17','C5A','C5M','SW4','CN35','A400','DHC6','M28','IL76',
  'KC10','KC135','KC46','K35R',
  'E3','E3TF','E8','E6','E2','P3','P8','W135','R135','GLF3','GLF5',
  'V22',
]);
const ATTACK_CODES = new Set(['A10','AC13','AC130','TUCA']);
const UAV_CODES = new Set(['U2','SR71','RQ4','Q4','MQ9','MQ1','X47B','RQ180','BTB2']);
const MIL_HELI_CODES = new Set([
  'H60','S70','UH60','HH60','MH60','SH60','CH47','H47','AH64','UH1','UH1Y','AH1',
  'CH53','H53S','OH58','HH65','HH1','AS65','B212','B412','A119','A139','A169',
  'H500','AS55',
]);

const HELI_CODES = new Set(['EC35','EC45','EC55','EC75','AS50','AS32','AS35','S76','S92',
  'B06','B07','R22','R44','R66','B505','AW13','AW16','AW17','AW18','AW19']);

const SMALL_PREFIXES = [
  'C15','C17','C18','C19',
  'PA2','PA3','PA4',
  'SR2','SR3',
  'DA4','DA5','DA6',
  'M20',
  'BE33','BE35','BE36',
  'RV','C42','C72','CT4',
  'P28','P32','P46','GA',
  'C5',
  'LJ',
  'E50','E55',
  'BE40',
  'HDJT',
  'EA50',
  'FA1','FA2',
  'CRJ',
  'E13','E14',
];

const PROP_PREFIXES = ['AT4','AT7','DH8','SB2','SB3','SF3','JS4','JS3','C208','C212',
  'BE20','BE30','PA31','PA42','TBM','PC12','PC24','L18','L4','PL2'];

function categorizeMilitary(t: string): 'fighter' | 'bomber' | 'transport' | 'attack' | 'uav' | 'mil-heli' {
  if (BOMBER_CODES.has(t)) return 'bomber';
  if (MIL_TRANSPORT_CODES.has(t)) return 'transport';
  if (ATTACK_CODES.has(t)) return 'attack';
  if (UAV_CODES.has(t)) return 'uav';
  if (MIL_HELI_CODES.has(t)) return 'mil-heli';
  return 'fighter';
}

function categorizeUncached(t: string): AircraftCategory {
  if (AIRSHIP_CODES.has(t)) return 'airship';
  if (WARBIRD_CODES.has(t)) return 'warbird';
  if (MILITARY_CODES.has(t)) return categorizeMilitary(t);
  if (t.startsWith('H') || HELI_CODES.has(t)) return 'heli';
  if (SMALL_PREFIXES.some(p => t.startsWith(p))) return 'small';
  if (PROP_PREFIXES.some(p => t.startsWith(p))) return 'prop';
  return 'jet';
}

const categoryCache = new Map<string, AircraftCategory>();

export function categorizeAircraft(typeCode: string | null): AircraftCategory {
  if (!typeCode) return 'jet';
  let cat = categoryCache.get(typeCode);
  if (cat === undefined) {
    cat = categorizeUncached(typeCode.toUpperCase());
    categoryCache.set(typeCode, cat);
  }
  return cat;
}

// ── Geometry / animation helpers ─────────────────────────────────────────────

export function haversineDist(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const φ1 = (a[0] * Math.PI) / 180, φ2 = (b[0] * Math.PI) / 180;
  const Δφ = ((b[0] - a[0]) * Math.PI) / 180;
  const Δλ = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

export function trailColor(speedMs: number): string {
  const kts = speedMs * 1.94384;
  if (kts <= 30)  return '#a855f7';
  if (kts >= 550) return '#facc15';
  if (kts < 100)  return lerpColor('#a855f7', '#38bdf8', (kts - 30) / 70);
  if (kts < 350)  return lerpColor('#38bdf8', '#4ade80', (kts - 100) / 250);
  return lerpColor('#4ade80', '#facc15', (kts - 350) / 200);
}

export function deadReckon(
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

export function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
