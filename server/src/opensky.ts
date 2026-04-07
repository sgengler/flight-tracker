import fs from 'fs';
import path from 'path';

// adsb.fi — free, no auth required, includes military traffic (no FAA LADD filter)
const ADSBFI_BASE = 'https://opendata.adsb.fi/api';
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
let adsbFiLastRequestAt = 0;
const ADSBFI_MIN_INTERVAL_MS = 1100; // stay safely under 1 req/sec limit

async function adsbFiThrottle() {
  const wait = ADSBFI_MIN_INTERVAL_MS - (Date.now() - adsbFiLastRequestAt);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  adsbFiLastRequestAt = Date.now();
}

export async function fetchNearbyFlights(lat: number, lon: number, radiusMiles = 75): Promise<FlightState[]> {
  if (Date.now() < adsbFiBackoffUntil) {
    const remainingSec = Math.ceil((adsbFiBackoffUntil - Date.now()) / 1000);
    throw new Error(`adsb.fi rate limited — backing off for ${remainingSec}s`);
  }

  await adsbFiThrottle();

  const radiusNm = Math.round(radiusMiles * MILES_TO_NM);
  const res = await fetch(`${ADSBFI_BASE}/v3/lat/${lat}/lon/${lon}/dist/${radiusNm}`);

  if (!res.ok) {
    if (res.status === 429) {
      adsbFiBackoffUntil = Date.now() + 5 * 60 * 1000; // back off 5 minutes
      console.warn('[adsb.fi] 429 rate limit hit — pausing requests for 5 minutes');
    }
    throw new Error(`adsb.fi API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { ac?: AdsbFiAircraft[] };
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

// Route cache — keyed by lowercase icao24 hex
// Successful routes cached 12h (don't change mid-flight); failed lookups retried after 5 min
interface RouteResult {
  departure: string | null; departureCity: string | null;
  arrival: string | null; arrivalCity: string | null;
  airline: string | null;
}
const routeCache = new Map<string, { route: RouteResult; fetchedAt: number }>();
const ROUTE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

// Persist route cache to disk so FlightAware calls survive server restarts
const CACHE_FILE = path.resolve(__dirname, '../../cache/routes.json');

function loadRouteCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const entries = JSON.parse(raw) as [string, { route: RouteResult; fetchedAt: number }][];
    const now = Date.now();
    for (const [key, value] of entries) {
      // Skip expired entries so stale data doesn't carry over
      const ttl = ROUTE_CACHE_TTL_MS;
      if (now - value.fetchedAt < ttl) {
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

async function fetchFlightAwareRoute(callsign: string): Promise<RouteResult> {
  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  if (!apiKey) return { departure: null, departureCity: null, arrival: null, arrivalCity: null, airline: null };

  const empty: RouteResult = { departure: null, departureCity: null, arrival: null, arrivalCity: null, airline: null };
  const key = callsign.trim().toUpperCase();

  const backoff = faBackoffUntil.get(key);
  if (backoff && Date.now() < backoff) return empty;

  try {
    const res = await fetch(
      `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(key)}?max_pages=1`,
      { headers: { 'x-apikey': apiKey } }
    );

    if (!res.ok) {
      if (res.status === 429) faBackoffUntil.set(key, Date.now() + 60 * 60 * 1000);
      console.log(`[route] FlightAware ${key}: HTTP ${res.status}`);
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
    console.log(`[route] FlightAware ${key}: ${result.departure}(${result.departureCity}) → ${result.arrival}(${result.arrivalCity})`);
    return result;
  } catch (err) {
    console.log(`[route] FlightAware ${key}: exception – ${err}`);
    return empty;
  }
}

export async function getCachedRoute(callsign: string, icao24: string): Promise<RouteInfo | null> {
  const key = icao24.toLowerCase();
  const cached = routeCache.get(key);
  const ttl = ROUTE_CACHE_TTL_MS;
  if (cached && Date.now() - cached.fetchedAt < ttl) {
    const r = cached.route;
    if (!r.departure || !r.arrival) {
      console.log(`[route] cache hit (no route): ${callsign ?? icao24}`);
      return null;
    }
    console.log(`[route] cache hit: ${callsign ?? icao24} → ${r.departure}→${r.arrival}`);
    return {
      origin: r.departure, originCity: r.departureCity ?? airportCity(r.departure),
      destination: r.arrival, destinationCity: r.arrivalCity ?? airportCity(r.arrival),
      airline: r.airline,
    };
  }

  const route = callsign
    ? await fetchFlightAwareRoute(callsign)
    : { departure: null, departureCity: null, arrival: null, arrivalCity: null, airline: null };

  routeCache.set(key, { route, fetchedAt: Date.now() });
  saveRouteCache();
  if (!route.departure || !route.arrival) return null;

  return {
    origin: route.departure,
    originCity: route.departureCity ?? airportCity(route.departure),
    destination: route.arrival,
    destinationCity: route.arrivalCity ?? airportCity(route.arrival),
    airline: route.airline,
  };
}

// hexdb.io — used only for police detection (RegisteredOwners).
// Aircraft type code comes directly from adsb.fi now.
interface AircraftCacheEntry { typeCode: string | null; isPolice: boolean; fetchedAt: number }
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
  const key = icao24.toLowerCase();
  const cached = aircraftTypeCache.get(key);
  if (cached && 'isPolice' in cached && Date.now() - cached.fetchedAt < AIRCRAFT_TYPE_CACHE_TTL_MS) {
    return { typeCode: cached.typeCode, isPolice: cached.isPolice };
  }

  try {
    const res = await fetch(`https://hexdb.io/api/v1/aircraft/${key}`);
    if (!res.ok) {
      aircraftTypeCache.set(key, { typeCode: null, isPolice: false, fetchedAt: Date.now() });
      return { typeCode: null, isPolice: false };
    }
    const data = await res.json() as { ICAOTypeCode?: string; RegisteredOwners?: string };
    const typeCode = data.ICAOTypeCode?.trim() || null;
    const isPolice = isPoliceOwner(data.RegisteredOwners);
    aircraftTypeCache.set(key, { typeCode, isPolice, fetchedAt: Date.now() });
    return { typeCode, isPolice };
  } catch {
    aircraftTypeCache.set(key, { typeCode: null, isPolice: false, fetchedAt: Date.now() });
    return { typeCode: null, isPolice: false };
  }
}

export async function fetchPlanePhoto(icao24: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.planespotters.net/pub/photos/hex/${icao24.toLowerCase()}`);
    if (!res.ok) return null;

    const data = await res.json() as {
      photos: Array<{ thumbnail_large: { src: string } }>;
    };

    return data.photos?.[0]?.thumbnail_large?.src ?? null;
  } catch {
    return null;
  }
}
