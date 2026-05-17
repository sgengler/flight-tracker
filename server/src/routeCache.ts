import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import type { RouteInfo } from './opensky';

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

let airportDb: Map<string, string> | null = null;

function buildAirportDb(): Map<string, string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require('airports-json') as { airports: Array<{ ident?: string; municipality?: string; name?: string }> };
  const map = new Map<string, string>();
  for (const a of raw.airports) {
    if (a.ident && /^[A-Z]{4}$/.test(a.ident)) {
      map.set(a.ident, a.municipality ?? a.name ?? a.ident);
    }
  }
  return map;
}

function airportCity(icao: string): string {
  const code = icao.toUpperCase();
  if (AIRPORT_CITIES[code]) return AIRPORT_CITIES[code];
  if (!airportDb) airportDb = buildAirportDb();
  return airportDb.get(code) ?? icao;
}

// Route cache — keyed by "lowercase icao24 hex:callsign". The callsign encodes
// the flight number and direction, so a hit always means the same route.
interface RouteResult {
  departure: string | null; departureCity: string | null;
  arrival: string | null; arrivalCity: string | null;
  airline: string | null;
}

const DB_FILE = path.resolve(__dirname, '../../cache/routes.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS routes (
    key        TEXT PRIMARY KEY,
    departure  TEXT,
    dep_city   TEXT,
    arrival    TEXT,
    arr_city   TEXT,
    airline    TEXT,
    fetched_at INTEGER
  )
`);

// Schema migrations — keyed by PRAGMA user_version so each runs exactly once.
const schemaVersion = db.pragma('user_version', { simple: true }) as number;
if (schemaVersion < 1) {
  db.exec('ALTER TABLE routes ADD COLUMN source TEXT');
  db.exec("UPDATE routes SET source = 'flightaware' WHERE source IS NULL");
  db.pragma('user_version = 1');
}

const stmtGet    = db.prepare<[string], { departure: string | null; dep_city: string | null; arrival: string | null; arr_city: string | null; airline: string | null; fetched_at: number; source: string | null }>
  ('SELECT departure, dep_city, arrival, arr_city, airline, fetched_at, source FROM routes WHERE key = ?');
const stmtUpsert = db.prepare(
  'INSERT OR REPLACE INTO routes (key, departure, dep_city, arrival, arr_city, airline, fetched_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const stmtDelete = db.prepare('DELETE FROM routes WHERE key = ?');
const stmtCount  = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM routes');

db.exec(`
  CREATE TABLE IF NOT EXISTS fa_misses (
    ts     INTEGER,
    key    TEXT,
    reason TEXT
  )
`);
const stmtMiss = db.prepare('INSERT INTO fa_misses (ts, key, reason) VALUES (?, ?, ?)');

function logMiss(key: string, reason: string) {
  stmtMiss.run(Date.now(), key, reason);
}

function dbGet(key: string): { route: RouteResult; fetchedAt: number; source: string | null } | undefined {
  const row = stmtGet.get(key);
  if (!row) return undefined;
  return {
    route: { departure: row.departure, departureCity: row.dep_city, arrival: row.arrival, arrivalCity: row.arr_city, airline: row.airline },
    fetchedAt: row.fetched_at,
    source: row.source,
  };
}

function dbSet(key: string, route: RouteResult, fetchedAt: number, source: 'flightaware' | 'airlabs') {
  stmtUpsert.run(key, route.departure, route.departureCity, route.arrival, route.arrivalCity, route.airline, fetchedAt, source);
}

console.log(`[route cache] SQLite DB open, ${stmtCount.get()!.n} entries`);

export function getCacheSize(): number {
  return stmtCount.get()!.n;
}

type FAFlight = {
  origin?: { code?: string; code_icao?: string; code_iata?: string; city?: string };
  destination?: { code?: string; code_icao?: string; code_iata?: string; city?: string };
  operator?: string;
  status?: string;
};

const faBackoffUntil = new Map<string, number>();

interface DailyCount { date: string; fresh: number; cached: number }

const QUOTA_FILE = path.resolve(__dirname, '../../cache/fa-quota.json');
let faHistory: DailyCount[] = [];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function quotaCutoff(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

function loadQuota() {
  try {
    const raw = fs.readFileSync(QUOTA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.history)) {
      faHistory = parsed.history.map((h: { date: string; fresh?: number; cached?: number; count?: number }) => ({
        date: h.date,
        fresh: h.fresh ?? h.count ?? 0,
        cached: h.cached ?? 0,
      }));
    } else if (parsed.date && parsed.count !== undefined) {
      faHistory = [{ date: parsed.date, fresh: parsed.count, cached: 0 }];
    }
  } catch {
    // first run — leave default
  }
  faHistory = faHistory.filter(h => h.date >= quotaCutoff());
}

function saveQuota() {
  try {
    fs.mkdirSync(path.dirname(QUOTA_FILE), { recursive: true });
    fs.writeFileSync(QUOTA_FILE, JSON.stringify({ history: faHistory }));
  } catch (err) {
    console.error('[fa quota] Failed to save:', err);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveQuota(); }, 60_000);
}

function todayEntry(): DailyCount {
  const today = todayKey();
  let entry = faHistory.find(h => h.date === today);
  if (!entry) {
    entry = { date: today, fresh: 0, cached: 0 };
    faHistory.push(entry);
    faHistory = faHistory.filter(h => h.date >= quotaCutoff());
  }
  return entry;
}

function todayCount(): number {
  return faHistory.find(h => h.date === todayKey())?.fresh ?? 0;
}

export function getApiStats(): DailyCount[] {
  return [...faHistory].sort((a, b) => b.date.localeCompare(a.date));
}

function quotaConsume() {
  todayEntry().fresh++;
  faHistory = faHistory.filter(h => h.date >= quotaCutoff());
  saveQuota();
}

function cacheHitConsume() {
  todayEntry().cached++;
  scheduleSave();
}

loadQuota();

// AirLabs rate-limit state — driven entirely by error responses from the API.
// minute_limit_exceeded / hour_limit_exceeded → backoff until the window resets.
// month_limit_exceeded → skip AirLabs until the calendar month rolls over.
let airlabsBackoffUntil = 0;        // epoch ms; 0 = not backed off
let airlabsMonthExhausted = '';     // 'YYYY-MM' of the month when limit was hit; '' = not exhausted

// Returns the start date of the current AirLabs billing cycle (resets on the 4th of each month).
function billingCycleKey(): string {
  const now = new Date();
  const day = now.getUTCDate();
  const cycleStart = day >= 4
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 4))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 4));
  return cycleStart.toISOString().slice(0, 10); // YYYY-MM-04
}

function airlabsIsAvailable(): boolean {
  if (Date.now() < airlabsBackoffUntil) return false;
  if (airlabsMonthExhausted && airlabsMonthExhausted === billingCycleKey()) return false;
  return true;
}

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
    logMiss(key, 'registration');
    return empty;
  }

  const backoff = faBackoffUntil.get(key);
  if (backoff && Date.now() < backoff) return null;

  try {
    quotaConsume();
    const res = await fetch(
      `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(key)}?max_pages=1`,
      { headers: { 'x-apikey': apiKey } }
    );

    if (!res.ok) {
      if (res.status === 429) faBackoffUntil.set(key, Date.now() + 60 * 60 * 1000);
      console.log(`[route] FlightAware ${key}: HTTP ${res.status} (${todayCount()} used today)`);
      // Don't cache transient errors — return null so the caller skips caching and retries later.
      if (res.status === 429 || res.status >= 500) return null;
      logMiss(key, `http_${res.status}`);
      return empty;
    }

    const data = await res.json() as { flights?: FAFlight[] };
    const flights = data.flights ?? [];

    const flight = flights.find(f => f.status?.toLowerCase().includes('en route')) ?? flights[0];

    const depCode = flight?.origin?.code_icao ?? flight?.origin?.code ?? null;
    const arrCode = flight?.destination?.code_icao ?? flight?.destination?.code ?? null;

    if (!depCode || !arrCode) {
      console.log(`[route] FlightAware ${key}: no origin/dest in ${flights.length} result(s)`, JSON.stringify(flight?.origin), JSON.stringify(flight?.destination));
      logMiss(key, flights.length === 0 ? 'no_flights' : 'no_route');
      return empty;
    }

    const result: RouteResult = {
      departure: depCode,
      departureCity: flight!.origin!.city ?? null,
      arrival: arrCode,
      arrivalCity: flight!.destination!.city ?? null,
      airline: flight!.operator ?? null,
    };
    console.log(`[route] FlightAware ${key}: ${result.departure}(${result.departureCity}) → ${result.arrival}(${result.arrivalCity}) (${todayCount()} used today)`);
    return result;
  } catch (err) {
    console.log(`[route] FlightAware ${key}: exception – ${err}`);
    return null; // don't cache network/parse failures — retry next time
  }
}

// AirLabs API response shape
interface AirlabsResponse {
  response?: {
    dep_icao?: string | null; dep_iata?: string | null;
    arr_icao?: string | null; arr_iata?: string | null;
    airline_icao?: string | null; airline_iata?: string | null;
    status?: string;
  };
  error?: { message: string; code: string };
}

// Returns null when the lookup was skipped or should be retried — caller must NOT cache null.
// Returns a RouteResult when AirLabs was actually contacted — caller should cache it.
async function lookupAirlabsRoute(callsign: string): Promise<RouteResult | null> {
  const apiKey = process.env.AIRLABS_API_KEY;
  if (!apiKey || !airlabsIsAvailable() || looksLikeRegistration(callsign)) return null;

  try {
    const res = await fetch(
      `https://airlabs.co/api/v9/flight?flight_icao=${encodeURIComponent(callsign)}&api_key=${apiKey}`
    );

    if (!res.ok) {
      if (res.status >= 500) return null; // transient — retry next time
      // Other HTTP errors: fall through to parse the JSON error body below
    }

    const data = await res.json() as AirlabsResponse;

    if (data.error) {
      const code = data.error.code;
      if (code === 'not_found') {
        console.log(`[route] AirLabs ${callsign}: not found`);
        return null; // FA may know it — don't cache
      }
      if (code === 'minute_limit_exceeded') {
        airlabsBackoffUntil = Date.now() + 60_000;
        console.warn('[route] AirLabs: minute limit hit — pausing 60s, falling back to FlightAware');
        return null;
      }
      if (code === 'hour_limit_exceeded') {
        airlabsBackoffUntil = Date.now() + 60 * 60_000;
        console.warn('[route] AirLabs: hour limit hit — pausing 1h, falling back to FlightAware');
        return null;
      }
      if (code === 'month_limit_exceeded') {
        airlabsMonthExhausted = billingCycleKey();
        console.warn(`[route] AirLabs: monthly limit hit — falling back to FlightAware until ${billingCycleKey()} ends`);
        return null;
      }
      // unknown_api_key, expired_api_key, internal_error, etc. — skip silently, FA handles it
      console.log(`[route] AirLabs ${callsign}: error ${code} — ${data.error.message}`);
      return null;
    }

    const r = data.response;
    if (!r) return null;

    const dep = (r.dep_icao ?? r.dep_iata ?? null)?.toUpperCase() ?? null;
    const arr = (r.arr_icao ?? r.arr_iata ?? null)?.toUpperCase() ?? null;
    const airline = (r.airline_icao ?? r.airline_iata ?? null)?.toUpperCase() ?? null;

    const result: RouteResult = {
      departure: dep,
      departureCity: dep ? airportCity(dep) : null,
      arrival: arr,
      arrivalCity: arr ? airportCity(arr) : null,
      airline,
    };
    console.log(`[route] AirLabs ${callsign}: ${dep ?? 'null'}(${result.departureCity}) → ${arr ?? 'null'}(${result.arrivalCity})`);
    return result;
  } catch (err) {
    console.log(`[route] AirLabs ${callsign}: exception – ${err}`);
    return null; // network/parse failure — retry next time
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

function routeCacheKey(callsign: string): string {
  return callsign.trim().toUpperCase();
}

// Returns a cached route if present, else null. Never makes a network call —
// used for non-closest flights where we don't want to spend any API quota.
export function getRouteFromCacheOnly(_icao24: string, callsign: string): RouteInfo | null {
  const key = routeCacheKey(callsign);
  const cached = dbGet(key);
  if (!cached) return null;
  return routeResultToInfo(cached.route);
}

const DEV_DUMMY_ROUTES: RouteInfo[] = [
  { origin: 'KEWR', originCity: 'Newark',        destination: 'KLAX', destinationCity: 'Los Angeles',   airline: 'AAL' },
  { origin: 'KATL', originCity: 'Atlanta',        destination: 'KORD', destinationCity: 'Chicago',       airline: 'DAL' },
  { origin: 'KBOS', originCity: 'Boston',         destination: 'KMIA', destinationCity: 'Miami',         airline: 'JBU' },
  { origin: 'KSFO', originCity: 'San Francisco',  destination: 'KJFK', destinationCity: 'New York',      airline: 'UAL' },
  { origin: 'KPHL', originCity: 'Philadelphia',   destination: 'KDFW', destinationCity: 'Dallas',        airline: 'SWA' },
  { origin: 'KDEN', originCity: 'Denver',         destination: 'KSEA', destinationCity: 'Seattle',       airline: 'SWA' },
  { origin: 'KDFW', originCity: 'Dallas',         destination: 'KBOS', destinationCity: 'Boston',        airline: 'AAL' },
  { origin: 'KMSP', originCity: 'Minneapolis',    destination: 'KLGA', destinationCity: 'New York',      airline: 'DAL' },
];

function devDummyRoute(callsign: string): RouteInfo {
  const idx = callsign.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % DEV_DUMMY_ROUTES.length;
  return DEV_DUMMY_ROUTES[idx];
}

export async function getCachedRoute(callsign: string, _icao24: string, opts: { interactive?: boolean; dev?: boolean; force?: boolean } = {}): Promise<RouteInfo | null> {
  if (opts.dev) return devDummyRoute(callsign);
  const key = routeCacheKey(callsign);
  if (opts.force) {
    stmtDelete.run(key);
    console.log(`[route] cache busted: ${callsign}`);
  } else {
    const cached = dbGet(key);
    if (cached) {
      cacheHitConsume();
      const r = cached.route;
      if (!r.departure || !r.arrival) {
        console.log(`[route] cache hit (no route): ${callsign}`);
        return null;
      }
      console.log(`[route] cache hit [${cached.source ?? 'legacy'}]: ${callsign} → ${r.departure}→${r.arrival}`);
      return routeResultToInfo(r);
    }
  }

  // Try AirLabs first (free, callsign-based, schedule data)
  if (callsign) {
    const alRoute = await lookupAirlabsRoute(callsign);
    if (alRoute !== null) {
      // AirLabs was contacted — cache the result to prevent future calls
      dbSet(key, alRoute, Date.now(), 'airlabs');
      if (alRoute.departure && alRoute.arrival) {
        return routeResultToInfo(alRoute);
      }
      // AirLabs returned a definitive empty — fall through to FA
      console.log(`[route] AirLabs ${callsign}: no route, trying FlightAware`);
    }
  }

  // Fall back to FlightAware — always works when AirLabs quota is exhausted or flight not found
  const faRoute = callsign ? await fetchFlightAwareRoute(callsign, opts) : null;
  if (faRoute !== null) {
    dbSet(key, faRoute, Date.now(), 'flightaware');
  }
  return faRoute !== null ? routeResultToInfo(faRoute) : null;
}
