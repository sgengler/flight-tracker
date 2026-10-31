import { FlightState, RouteInfo } from '../types';
import { metersToFeet, msToMph } from '../utils';

// Extra flight-card details derived from the live data: the specific airframe,
// what the aircraft is doing, how far along its route it is, and its profile.

const LEGAL_SUFFIX = /\b(INC|LLC|L\.?L\.?C|CORP|CORPORATION|CO|LTD|LP|TRUSTEE|TR)\b\.?/g;

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
}

// "N155UW · American Airlines · 13 yrs old"
export function airframeSummary(flight: FlightState): string | null {
  const parts: string[] = [];
  if (flight.registration) parts.push(flight.registration);
  if (flight.operator) {
    const op = titleCase(flight.operator.replace(LEGAL_SUFFIX, '').replace(/[,\s]+$/, '').replace(/\s{2,}/g, ' ').trim());
    if (op) parts.push(op);
  }
  if (flight.yearBuilt) {
    const age = new Date().getFullYear() - flight.yearBuilt;
    parts.push(age <= 0 ? 'brand new' : `${age} yr${age === 1 ? '' : 's'} old`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

const CLIMB_MS = 1.5;            // ~300 ft/min
const CRUISE_FT = 18000;
const NEAR_DEST_MI = 150;

function formatAltitude(m: number): string {
  const ft = Math.round(metersToFeet(m) / 100) * 100;
  return ft >= CRUISE_FT ? `FL${Math.round(ft / 100)}` : `${ft.toLocaleString()} ft`;
}

function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function milesToDestination(flight: FlightState, route: RouteInfo | null): number | null {
  if (route?.destinationLat == null || route.destinationLon == null) return null;
  return milesBetween(flight.latitude, flight.longitude, route.destinationLat, route.destinationLon);
}

// "Climbing to FL350", "Descending into Philadelphia", "Cruising at FL370"
export function flightPhase(flight: FlightState, route: RouteInfo | null): string | null {
  const alt = flight.baroAltitude;
  const vs = flight.verticalRate;
  if (alt == null || vs == null) return null;
  const target = flight.selectedAltitude;
  // Autopilot targets of 0 or wildly off are common noise; only trust ones in the direction of travel
  const targetAbove = target != null && target > alt + 90 ? target : null;
  const targetBelow = target != null && target > 0 && target < alt - 90 ? target : null;

  if (vs > CLIMB_MS) return targetAbove ? `Climbing to ${formatAltitude(targetAbove)}` : 'Climbing';
  if (vs < -CLIMB_MS) {
    const toDest = milesToDestination(flight, route);
    if (route && toDest != null && toDest < NEAR_DEST_MI) return `Descending into ${route.destinationCity}`;
    return targetBelow ? `Descending to ${formatAltitude(targetBelow)}` : 'Descending';
  }
  return metersToFeet(alt) >= CRUISE_FT ? `Cruising at ${formatAltitude(alt)}` : `Level at ${formatAltitude(alt)}`;
}

interface Progress { fraction: number; milesLeft: number; minutesLeft: number | null }

export function routeProgress(flight: FlightState, route: RouteInfo | null): Progress | null {
  if (!route || route.originLat == null || route.originLon == null) return null;
  const toDest = milesToDestination(flight, route);
  if (toDest == null) return null;
  const fromOrigin = milesBetween(route.originLat, route.originLon, flight.latitude, flight.longitude);
  const fraction = Math.min(1, Math.max(0, fromOrigin / (fromOrigin + toDest)));
  const mph = flight.velocity != null ? msToMph(flight.velocity) : 0;
  // Ground speed says nothing useful about arrival time on the ground or in a hold
  const minutesLeft = mph > 100 ? (toDest / mph) * 60 : null;
  return { fraction, milesLeft: toDest, minutesLeft };
}

function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function RouteProgressBar({ flight, route, large = false }: { flight: FlightState; route: RouteInfo | null; large?: boolean }) {
  const p = routeProgress(flight, route);
  if (!p) return null;
  const pct = Math.round(p.fraction * 100);
  const arrival = p.minutesLeft != null
    ? new Date(Date.now() + p.minutesLeft * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const text = large ? 'text-xs' : 'text-[10px]';
  return (
    <div className="w-full">
      <div className={`relative ${large ? 'h-1.5' : 'h-1'} rounded-full bg-white/10`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-sky-300 leading-none"
             style={{ left: `${pct}%`, fontSize: large ? 14 : 11 }}>✈</div>
      </div>
      <div className={`flex justify-between mt-1 ${text} font-mono text-slate-400`}>
        <span>{pct}% · {Math.round(p.milesLeft).toLocaleString()} mi to go</span>
        {p.minutesLeft != null && <span>~{formatDuration(p.minutesLeft)} · lands ~{arrival}</span>}
      </div>
    </div>
  );
}

export type TrailPoint = [number, number, number?, number?]; // lat, lon, speed m/s, alt m (alt may be null for 'ground')

// Altitude (filled) and speed (line) along the trail, oldest on the left.
export function FlightProfileChart({ trail }: { trail: TrailPoint[] }) {
  const pts = trail.filter(p => p[3] != null && p[2] != null);
  if (pts.length < 5) return null;
  const W = 300, H = 48;
  let dist = 0;
  const xs = pts.map((p, i) => (i === 0 ? 0 : (dist += milesBetween(pts[i - 1][0], pts[i - 1][1], p[0], p[1]))));
  const maxX = Math.max(dist, 1e-6);
  const alts = pts.map(p => p[3]!);
  const speeds = pts.map(p => p[2]!);
  const maxAlt = Math.max(...alts, 300);
  const maxSpeed = Math.max(...speeds, 1);
  const x = (i: number) => (xs[i] / maxX) * W;
  const altY = (i: number) => H - (alts[i] / maxAlt) * (H - 4);
  const speedY = (i: number) => H - (speeds[i] / maxSpeed) * (H - 4);
  const altLine = pts.map((_, i) => `${x(i).toFixed(1)},${altY(i).toFixed(1)}`).join(' ');
  const speedLine = pts.map((_, i) => `${x(i).toFixed(1)},${speedY(i).toFixed(1)}`).join(' ');
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
        <span><span className="text-sky-400">■</span> Altitude · max {formatAltitude(maxAlt)}</span>
        <span><span className="text-amber-400">━</span> Speed · max {Math.round(msToMph(maxSpeed))} mph</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-9 block">
        <polygon points={`0,${H} ${altLine} ${W},${H}`} fill="rgba(56,189,248,0.25)" stroke="none" />
        <polyline points={altLine} fill="none" stroke="rgb(56,189,248)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={speedLine} fill="none" stroke="rgb(251,191,36)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
