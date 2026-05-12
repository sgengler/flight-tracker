import fs from 'fs';
import path from 'path';

// adsb.fi — primary source; adsb.lol is the fallback when adsb.fi rate-limits
const ADSBFI_BASE   = 'https://opendata.adsb.fi/api';
const ADSBFALLBACK_BASE = 'https://api.adsb.lol';
const MILES_TO_NM = 0.868976; // statute miles → nautical miles

// adsb.fi aircraft object (subset of fields we use)
interface AdsbFiAircraft {
  hex: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  alt_geom?: number | null;
  gs?: number | null;
  track?: number | null;
  baro_rate?: number | null;
  t?: string;        // ICAO type code — provided directly, no hexdb lookup needed
}

export interface FlightState {
  icao24: string;
  callsign: string | null;
  originCountry: string;
  latitude: number;
  longitude: number;
  baroAltitude: number | null; // metres
  onGround: boolean;
  velocity: number | null;     // m/s
  trueTrack: number | null;    // degrees
  verticalRate: number | null; // m/s
  geoAltitude: number | null;  // metres
  distanceMiles: number;
  bearingDeg: number;
  route: RouteInfo | null;
  aircraftType: string | null;
  isPolice: boolean;
}

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingTo(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

let adsbFiBackoffUntil = 0;
let adsbFiBackoffCount = 0;
const ADSBFI_BACKOFF_STEPS_MS = [5 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];
let adsbFiLastRequestAt = 0;
const ADSBFI_MIN_INTERVAL_MS = 2000; // stay well under 1 req/sec limit

let adsbLolBackoffUntil = 0;
let adsbLolLastRequestAt = 0;

// Returns true only when ALL sources are backed off (poller should skip entirely)
export function adsbFiIsRateLimited(): boolean {
  return Date.now() < adsbFiBackoffUntil && Date.now() < adsbLolBackoffUntil;
}

async function adsbFiThrottle() {
  const wait = ADSBFI_MIN_INTERVAL_MS - (Date.now() - adsbFiLastRequestAt);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  adsbFiLastRequestAt = Date.now();
}

async function adsbLolThrottle() {
  const wait = ADSBFI_MIN_INTERVAL_MS - (Date.now() - adsbLolLastRequestAt);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  adsbLolLastRequestAt = Date.now();
}

// Fetches ADS-B data from adsb.fi, falling back to adsb.lol.
// adsb.fi uses /v3/ for nearby and /v2/ for military; adsb.lol only has /v2/.
async function fetchAdsbData(path: string): Promise<{ ac?: AdsbFiAircraft[] }> {
  // Try adsb.fi if not backed off
  if (Date.now() >= adsbFiBackoffUntil) {
    await adsbFiThrottle();
    const res = await fetch(`${ADSBFI_BASE}${path}`);
    if (res.ok) {
      adsbFiBackoffCount = 0;
      return res.json() as Promise<{ ac?: AdsbFiAircraft[] }>;
    }
    if (res.status === 429 || res.status >= 500) {
      const stepMs = res.status === 429
        ? ADSBFI_BACKOFF_STEPS_MS[Math.min(adsbFiBackoffCount, ADSBFI_BACKOFF_STEPS_MS.length - 1)]
        : 2 * 60 * 1000;
      if (res.status === 429) adsbFiBackoffCount++;
      adsbFiBackoffUntil = Date.now() + stepMs;
      console.warn(`[adsb.fi] ${res.status} — pausing ${stepMs / 60000} min, trying adsb.lol`);
    } else if (res.status === 400) {
      // 400 often means the query exceeded adsb.fi's distance limit — try adsb.lol instead
      console.warn(`[adsb.fi] 400 Bad Request for ${path} — trying adsb.lol`);
    } else {
      throw new Error(`adsb.fi API error: ${res.status} ${res.statusText}`);
    }
  }

  // Fall back to adsb.lol — uses /v2/ for all endpoints (no /v3/)
  if (Date.now() >= adsbLolBackoffUntil) {
    await adsbLolThrottle();
    const lolPath = path.replace(/^\/v3\//, '/v2/');
    const res = await fetch(`${ADSBFALLBACK_BASE}${lolPath}`);
    if (res.ok) {
      return res.json() as Promise<{ ac?: AdsbFiAircraft[] }>;
    }
    if (res.status === 429 || res.status >= 500) {
      const pause = res.status === 429 ? 5 * 60 * 1000 : 2 * 60 * 1000;
      adsbLolBackoffUntil = Date.now() + pause;
      console.warn(`[adsb.lol] ${res.status} — pausing ${pause / 60000} min`);
    }
    throw new Error(`adsb.lol API error: ${res.status} ${res.statusText}`);
  }

  throw new Error('all ADS-B sources rate limited');
}

export async function fetchNearbyFlights(lat: number, lon: number, radiusMiles = 75): Promise<FlightState[]> {
  const radiusNm = Math.round(radiusMiles * MILES_TO_NM);
  const data = await fetchAdsbData(`/v3/lat/${lat}/lon/${lon}/dist/${radiusNm}`);
  const aircraft = data.ac ?? [];

  const flights: FlightState[] = [];
  for (const ac of aircraft) {
    if (ac.lat == null || ac.lon == null) continue;
    if (ac.alt_baro === 'ground') continue;

    const baroAltFt = typeof ac.alt_baro === 'number' ? ac.alt_baro : null;

    flights.push({
      icao24: ac.hex,
      callsign: ac.flight?.trim() || null,
      originCountry: '',
      latitude: ac.lat,
      longitude: ac.lon,
      baroAltitude: baroAltFt != null ? baroAltFt * 0.3048 : null,         // ft → m
      onGround: false,
      velocity: ac.gs != null ? ac.gs * 0.514444 : null,                    // knots → m/s
      trueTrack: ac.track ?? null,
      verticalRate: ac.baro_rate != null ? ac.baro_rate * 0.00508 : null,   // ft/min → m/s
      geoAltitude: ac.alt_geom != null ? ac.alt_geom * 0.3048 : null,       // ft → m
      distanceMiles: haversineDistance(lat, lon, ac.lat, ac.lon),
      bearingDeg: bearingTo(lat, lon, ac.lat, ac.lon),
      route: null,
      aircraftType: ac.t?.trim() || null,  // provided directly — no hexdb lookup needed
      isPolice: false,
    });
  }

  flights.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return flights;
}

export function findClosestFlight(flights: FlightState[]): FlightState | null {
  return flights[0] ?? null;
}

export async function fetchMilitaryFlights(refLat: number, refLon: number): Promise<FlightState[]> {
  const data = await fetchAdsbData('/v2/mil');
  const aircraft = data.ac ?? [];

  const flights: FlightState[] = [];
  for (const ac of aircraft) {
    if (ac.lat == null || ac.lon == null) continue;
    if (ac.alt_baro === 'ground') continue;

    const baroAltFt = typeof ac.alt_baro === 'number' ? ac.alt_baro : null;

    flights.push({
      icao24: ac.hex,
      callsign: ac.flight?.trim() || null,
      originCountry: '',
      latitude: ac.lat,
      longitude: ac.lon,
      baroAltitude: baroAltFt != null ? baroAltFt * 0.3048 : null,
      onGround: false,
      velocity: ac.gs != null ? ac.gs * 0.514444 : null,
      trueTrack: ac.track ?? null,
      verticalRate: ac.baro_rate != null ? ac.baro_rate * 0.00508 : null,
      geoAltitude: ac.alt_geom != null ? ac.alt_geom * 0.3048 : null,
      distanceMiles: haversineDistance(refLat, refLon, ac.lat, ac.lon),
      bearingDeg: bearingTo(refLat, refLon, ac.lat, ac.lon),
      route: null,
      aircraftType: ac.t?.trim() || null,
      isPolice: false,
    });
  }

  flights.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return flights;
}

const AIRPORT_CITIES: Record<string, string> = {
  KATL: 'Atlanta', KLAX: 'Los Angeles', KORD: "Chicago O'Hare", KDFW: 'Dallas/Ft Worth',
  KDEN: 'Denver', KJFK: 'New York JFK', KSFO: 'San Francisco', KLAS: 'Las Vegas',
  KMIA: 'Miami', KBOS: 'Boston', KPHL: 'Philadelphia', KSEA: 'Seattle',
  KEWR: 'Newark', KDTW: 'Detroit', KIAH: 'Houston Intl', KHOU: 'Houston Hobby',
  KMSP: 'Minneapolis', KPHX: 'Phoenix', KBWI: 'Baltimore', KDCA: 'Washington Reagan',
  KIAD: 'Washington Dulles', KMCO: 'Orlando', KTPA: 'Tampa', KFLL: 'Ft Lauderdale',
  KPDX: 'Portland', KSLC: 'Salt Lake City', KSTL: 'St Louis', KCLT: 'Charlotte',
  KMEM: 'Memphis', KBNA: 'Nashville', KAUS: 'Austin', KSAN: 'San Diego',
  KSJC: 'San Jose', KLGA: 'New York LGA', KMKE: 'Milwaukee', KMSY: 'New Orleans',
  KRDU: 'Raleigh-Durham', KCLE: 'Cleveland', KPIT: 'Pittsburgh', KBUF: 'Buffalo',
  KSAC: 'Sacramento', KOAK: 'Oakland', KBUR: 'Burbank', KSNA: 'Orange County',
  KABQ: 'Albuquerque', KOMA: 'Omaha', KOKC: 'Oklahoma City', KSAT: 'San Antonio',
  KELP: 'El Paso', KTUL: 'Tulsa', KRIC: 'Richmond', KCVG: 'Cincinnati',
  KIND: 'Indianapolis', KMCI: 'Kansas City', KROC: 'Rochester', KSYR: 'Syracuse',
  KBDL: 'Hartford', KPVD: 'Providence', KMHT: 'Manchester', KBGR: 'Bangor',
  KALB: 'Albany', KPWM: 'Portland ME', KORF: 'Norfolk', KGRR: 'Grand Rapids',
  KDAY: 'Dayton', KCMH: 'Columbus', KLEX: 'Lexington', KSDF: 'Louisville',
  KBHM: 'Birmingham', KMOB: 'Mobile', KJAX: 'Jacksonville', KTLH: 'Tallahassee',
  KRSW: 'Fort Myers', KPBI: 'West Palm Beach',
  KLIT: 'Little Rock', KTYS: 'Knoxville', KCHS: 'Charleston SC', KGSP: 'Greenville',
  KAVL: 'Asheville', KDSM: 'Des Moines', KFSD: 'Sioux Falls', KBTM: 'Butte',
  KBIL: 'Billings', KBZN: 'Bozeman', KFCA: 'Kalispell', KGEG: 'Spokane',
  KBOI: 'Boise', KRNO: 'Reno', KSMF: 'Sacramento',
  KLGB: 'Long Beach', KSBA: 'Santa Barbara', KSBP: 'San Luis Obispo',
  KFAT: 'Fresno', KMFR: 'Medford', KEUG: 'Eugene', KRDM: 'Bend',
  KMDT: 'Harrisburg', KABE: 'Allentown', KACY: 'Atlantic City', KTEB: 'Teterboro',
  KHPN: 'White Plains', KSWF: 'Newburgh', KISP: 'Long Island MacArthur',
  CYYZ: 'Toronto', CYVR: 'Vancouver', CYUL: 'Montreal', CYYC: 'Calgary', CYEG: 'Edmonton',
  CYOW: 'Ottawa', CYWG: 'Winnipeg', CYHZ: 'Halifax',
  EGLL: 'London Heathrow', EGCC: 'Manchester', EDDM: 'Munich', EDDF: 'Frankfurt',
  LFPG: 'Paris CDG', EHAM: 'Amsterdam', LEMD: 'Madrid', LIRF: 'Rome',
  LEBL: 'Barcelona', LSZH: 'Zurich', LOWW: 'Vienna', LIMC: 'Milan',
  OMDB: 'Dubai', OTHH: 'Doha', VHHH: 'Hong Kong', WSSS: 'Singapore',
  RJTT: 'Tokyo Haneda', RJAA: 'Tokyo Narita', YSSY: 'Sydney', YMML: 'Melbourne',
  MMMX: 'Mexico City', SBGR: 'São Paulo', FAOR: 'Johannesburg',
};

function airportCity(icao: string): string {
  return AIRPORT_CITIES[icao.toUpperCase()] ?? icao;
}

export interface RouteInfo {
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  airline: string | null;
}

// Route cache — keyed by "lowercase icao24 hex:callsign". The callsign encodes
// the flight number and direction, so a hit always means the same route.
interface RouteResult {
  departure: string | null; departureCity: string | null;
  arrival: string | null; arrivalCity: string | null;
  airline: string | null;
}
const routeCache = new Map<string, { route: RouteResult; fetchedAt: number }>();
const ROUTE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;     // 30 days — callsign key makes this safe
const NULL_ROUTE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — retry weekly for unknown callsigns

function ttlFor(route: RouteResult): number {
  return route.departure && route.arrival ? ROUTE_CACHE_TTL_MS : NULL_ROUTE_CACHE_TTL_MS;
}

// Persist route cache to disk so FlightAware calls survive server restarts
const CACHE_FILE = path.resolve(__dirname, '../../cache/routes.json');

function loadRouteCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const entries = JSON.parse(raw) as [string, { route: RouteResult; fetchedAt: number }][];
    const now = Date.now();
    for (const [key, value] of entries) {
      if (now - value.fetchedAt < ttlFor(value.route)) {
        routeCache.set(key, value);
      }
    }
    console.log(`[route cache] Loaded ${routeCache.size} entries from disk`);
  } catch {
    // File doesn't exist yet or is corrupt — start fresh
  }
}

function saveRouteCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify([...routeCache.entries()]));
  } catch (err) {
    console.error('[route cache] Failed to save:', err);
  }
}

// Load on startup, save every 5 minutes and on process exit
loadRouteCache();
setInterval(saveRouteCache, 5 * 60 * 1000);
process.on('SIGTERM', () => { saveRouteCache(); process.exit(0); });
process.on('SIGINT',  () => { saveRouteCache(); process.exit(0); });

type FAFlight = {
  origin?: { code?: string; code_icao?: string; code_iata?: string; city?: string };
  destination?: { code?: string; code_icao?: string; code_iata?: string; city?: string };
  operator?: string;
  status?: string;
};

const faBackoffUntil = new Map<string, number>();

// Daily call quota — FlightAware free tier is $5/mo at $0.005/result ≈ 1000/mo.
// Cap at 100/day to stay under the free tier with margin.
const FA_DAILY_CAP = 100;
const QUOTA_FILE = path.resolve(__dirname, '../../cache/fa-quota.json');
let faQuota: { date: string; count: number } = { date: '', count: 0 };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function loadQuota() {
  try {
    const raw = fs.readFileSync(QUOTA_FILE, 'utf8');
    faQuota = JSON.parse(raw);
  } catch {
    // first run — leave default
  }
  if (faQuota.date !== todayKey()) faQuota = { date: todayKey(), count: 0 };
}

function saveQuota() {
  try {
    fs.mkdirSync(path.dirname(QUOTA_FILE), { recursive: true });
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(faQuota));
  } catch (err) {
    console.error('[fa quota] Failed to save:', err);
  }
}

function quotaAllow(): boolean {
  if (faQuota.date !== todayKey()) faQuota = { date: todayKey(), count: 0 };
  return faQuota.count < FA_DAILY_CAP;
}

export function getQuotaStatus(): { used: number; cap: number; resetsAt: string } {
  if (faQuota.date !== todayKey()) faQuota = { date: todayKey(), count: 0 };
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return { used: faQuota.count, cap: FA_DAILY_CAP, resetsAt: tomorrow.toISOString() };
}

function quotaConsume() {
  if (faQuota.date !== todayKey()) faQuota = { date: todayKey(), count: 0 };
  faQuota.count++;
  saveQuota();
}

loadQuota();

// Callsigns that look like a registration/tail (e.g. "N12345", "G-ABCD") rarely
// resolve to a scheduled route on FlightAware — skip the lookup.
function looksLikeRegistration(callsign: string): boolean {
  const c = callsign.trim().toUpperCase();
  if (/^N\d/.test(c)) return true;                  // US tail (N-number)
  if (/^[A-Z]{1,2}-[A-Z0-9]{2,5}$/.test(c)) return true; // ICAO-style tail requires hyphen (G-ABCD, D-EXYZ)
  return false;
}

// Returns null when the lookup was skipped (quota, no key, backoff) — caller must NOT cache null.
// Returns a RouteResult when FA was actually contacted — caller should cache it (even if empty).
async function fetchFlightAwareRoute(callsign: string, opts: { interactive?: boolean } = {}): Promise<RouteResult | null> {
  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  const empty: RouteResult = { departure: null, departureCity: null, arrival: null, arrivalCity: null, airline: null };
  if (!apiKey) return null;

  const key = callsign.trim().toUpperCase();

  if (looksLikeRegistration(key)) {
    console.log(`[route] FlightAware ${key}: skipped (looks like registration)`);
    return empty;
  }

  // Interactive (user-clicked) lookups bypass the daily cap and don't count toward it.
  if (!opts.interactive && !quotaAllow()) {
    console.log(`[route] FlightAware ${key}: skipped (daily cap ${FA_DAILY_CAP} reached, ${faQuota.count} used)`);
    return null;
  }

  const backoff = faBackoffUntil.get(key);
  if (backoff && Date.now() < backoff) return null;

  try {
    if (!opts.interactive) quotaConsume();
    const res = await fetch(
      `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(key)}?max_pages=1`,
      { headers: { 'x-apikey': apiKey } }
    );

    if (!res.ok) {
      if (res.status === 429) faBackoffUntil.set(key, Date.now() + 60 * 60 * 1000);
      console.log(`[route] FlightAware ${key}: HTTP ${res.status}${opts.interactive ? ' (interactive)' : ` (${faQuota.count}/${FA_DAILY_CAP} used today)`}`);
      return empty;
    }

    const data = await res.json() as { flights?: FAFlight[] };
    const flights = data.flights ?? [];

    const flight = flights.find(f => f.status?.toLowerCase().includes('en route')) ?? flights[0];

    const depCode = flight?.origin?.code_icao ?? flight?.origin?.code ?? null;
    const arrCode = flight?.destination?.code_icao ?? flight?.destination?.code ?? null;

    if (!depCode || !arrCode) {
      console.log(`[route] FlightAware ${key}: no origin/dest in ${flights.length} result(s)`, JSON.stringify(flight?.origin), JSON.stringify(flight?.destination));
      return empty;
    }

    const result: RouteResult = {
      departure: depCode,
      departureCity: flight!.origin!.city ?? null,
      arrival: arrCode,
      arrivalCity: flight!.destination!.city ?? null,
      airline: flight!.operator ?? null,
    };
    console.log(`[route] FlightAware ${key}: ${result.departure}(${result.departureCity}) → ${result.arrival}(${result.arrivalCity})${opts.interactive ? ' (interactive)' : ` (${faQuota.count}/${FA_DAILY_CAP} used today)`}`);
    return result;
  } catch (err) {
    console.log(`[route] FlightAware ${key}: exception – ${err}`);
    return empty;
  }
}

function routeResultToInfo(r: RouteResult): RouteInfo | null {
  if (!r.departure || !r.arrival) return null;
  return {
    origin: r.departure,
    originCity: r.departureCity ?? airportCity(r.departure),
    destination: r.arrival,
    destinationCity: r.arrivalCity ?? airportCity(r.arrival),
    airline: r.airline,
  };
}

function routeCacheKey(icao24: string, callsign: string): string {
  return `${icao24.toLowerCase()}:${callsign.trim().toUpperCase()}`;
}

// Returns a cached route if present and fresh, else null. Never makes a
// network call — used for non-closest flights where we don't want to spend
// FlightAware quota.
export function getRouteFromCacheOnly(icao24: string, callsign: string): RouteInfo | null {
  const key = routeCacheKey(icao24, callsign);
  const cached = routeCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt >= ttlFor(cached.route)) return null;
  return routeResultToInfo(cached.route);
}

export async function getCachedRoute(callsign: string, icao24: string, opts: { interactive?: boolean } = {}): Promise<RouteInfo | null> {
  const key = routeCacheKey(icao24, callsign);
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ttlFor(cached.route)) {
    const r = cached.route;
    if (!r.departure || !r.arrival) {
      console.log(`[route] cache hit (no route): ${callsign ?? icao24}`);
      return null;
    }
    console.log(`[route] cache hit: ${callsign ?? icao24} → ${r.departure}→${r.arrival}`);
    return routeResultToInfo(r);
  }

  const route = callsign ? await fetchFlightAwareRoute(callsign, opts) : null;

  // Only cache when FA was actually contacted. null means lookup was skipped
  // (quota hit, no API key, backoff) — don't poison the cache in that case.
  if (route !== null) {
    routeCache.set(key, { route, fetchedAt: Date.now() });
    saveRouteCache();
  }
  return route !== null ? routeResultToInfo(route) : null;
}

// hexdb.io — used for police detection (RegisteredOwners) and as a Wikipedia-photo
// fallback (Manufacturer + Type) when the client doesn't recognize the type code.
// Aircraft type code comes directly from adsb.fi.
interface AircraftCacheEntry {
  typeCode: string | null;
  isPolice: boolean;
  manufacturer: string | null;
  model: string | null;
  fetchedAt: number;
}
const aircraftTypeCache = new Map<string, AircraftCacheEntry>();
const AIRCRAFT_TYPE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const POLICE_KEYWORDS = ['POLICE', 'SHERIFF', 'CONSTABULARY', 'TROOPER', 'STATE PATROL',
  'LAW ENFORCEMENT', 'DEPT OF PUBLIC SAFETY', 'DEPARTMENT OF PUBLIC SAFETY'];

function isPoliceOwner(owner: string | undefined): boolean {
  if (!owner) return false;
  const u = owner.toUpperCase();
  return POLICE_KEYWORDS.some(k => u.includes(k));
}

export async function getCachedAircraftType(icao24: string): Promise<{ typeCode: string | null; isPolice: boolean }> {
  const entry = await getCachedAircraftEntry(icao24);
  return { typeCode: entry.typeCode, isPolice: entry.isPolice };
}

async function getCachedAircraftEntry(icao24: string): Promise<AircraftCacheEntry> {
  const key = icao24.toLowerCase();
  const cached = aircraftTypeCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < AIRCRAFT_TYPE_CACHE_TTL_MS) {
    // Older entries may not have manufacturer/model — that's fine, they'll re-fetch on TTL
    return cached;
  }

  const empty: AircraftCacheEntry = {
    typeCode: null, isPolice: false, manufacturer: null, model: null, fetchedAt: Date.now(),
  };

  try {
    const res = await fetch(`https://hexdb.io/api/v1/aircraft/${key}`);
    if (!res.ok) {
      aircraftTypeCache.set(key, empty);
      return empty;
    }
    const data = await res.json() as { ICAOTypeCode?: string; RegisteredOwners?: string; Manufacturer?: string; Type?: string };
    const entry: AircraftCacheEntry = {
      typeCode: data.ICAOTypeCode?.trim() || null,
      isPolice: isPoliceOwner(data.RegisteredOwners),
      manufacturer: data.Manufacturer?.trim() || null,
      model: data.Type?.trim() || null,
      fetchedAt: Date.now(),
    };
    aircraftTypeCache.set(key, entry);
    return entry;
  } catch {
    aircraftTypeCache.set(key, empty);
    return empty;
  }
}

async function fetchWikipediaThumbnail(title: string): Promise<string | null> {
  try {
    const t = title.trim().replace(/\s+/g, '_');
    if (!t) return null;
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`);
    if (!res.ok) return null;
    const data = await res.json() as { type?: string; thumbnail?: { source: string } };
    if (data.type && data.type !== 'standard') return null; // disambiguation, error, etc.
    return data.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

export async function fetchPlanePhoto(icao24: string, typeName?: string | null): Promise<string | null> {
  // Try planespotters.net first (specific photo of this aircraft)
  try {
    const res = await fetch(`https://api.planespotters.net/pub/photos/hex/${icao24.toLowerCase()}`);
    if (res.ok) {
      const data = await res.json() as { photos: Array<{ thumbnail_large: { src: string } }> };
      const url = data.photos?.[0]?.thumbnail_large?.src ?? null;
      if (url) return url;
    }
  } catch {
    // fall through to next source
  }

  // Wikipedia type-photo fallback. Try in order:
  //   1. Client-supplied typeName (mapped from ICAO type code on the client)
  //   2. hexdb's "{Manufacturer} {Type}" — handles type codes the client doesn't map
  //   3. Same with the trailing variant suffix stripped — e.g. "Beech 1900 D" → "Beech 1900"
  const candidates: string[] = [];
  if (typeName) candidates.push(typeName);

  const entry = await getCachedAircraftEntry(icao24);
  if (entry.manufacturer && entry.model) {
    const full = `${entry.manufacturer} ${entry.model}`;
    candidates.push(full);
    const stripped = `${entry.manufacturer} ${entry.model.split(/\s+/)[0]}`;
    if (stripped !== full) candidates.push(stripped);
  }

  for (const title of candidates) {
    const thumb = await fetchWikipediaThumbnail(title);
    if (thumb) return thumb;
  }

  return null;
}

// ── Globe.adsbexchange.com trace proxy ───────────────────────────────────────

// Returns [lat, lon, speedMs][] for the current-day trace of an aircraft.
// Proxies globe.adsbexchange.com which requires a Referer header.
export async function fetchAircraftTrace(icao24: string): Promise<Array<[number, number, number]>> {
  const hex = icao24.toLowerCase();

  const suffix = hex.slice(-2);
  const url = `https://globe.adsbexchange.com/data/traces/${suffix}/trace_full_${hex}.json`;
  const res = await fetch(url, {
    headers: {
      'Referer': 'https://globe.adsbexchange.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`trace fetch failed: ${res.status}`);

  const data = await res.json() as {
    trace: Array<[number, number, number, string | number, number, ...unknown[]]>;
  };

  // Each entry: [timeOffset, lat, lon, alt_or_"ground", groundspeedKts, ...]
  const positions: Array<[number, number, number]> = data.trace.map(entry => [
    entry[1],              // lat
    entry[2],              // lon
    (entry[4] ?? 0) / 1.94384, // knots → m/s
  ]);

  return positions;
}
