import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { haversineDistance, type FlightState } from './opensky';
import { airport } from './routeCache';

// Log of every aircraft seen from home, one row per aircraft per (UTC) day.
// Feeds the "Today" tab and decides which aircraft are notable: a hand-picked
// list of special types and callsigns, plus large aircraft that rarely pass by.

const DB_FILE = path.resolve(__dirname, '../../cache/sightings.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS sightings (
    day          TEXT,
    icao24       TEXT,
    callsign     TEXT,
    type         TEXT,
    registration TEXT,
    operator     TEXT,
    year         INTEGER,
    category     TEXT,
    origin       TEXT,
    destination  TEXT,
    notable      TEXT,
    first_seen   INTEGER,
    last_seen    INTEGER,
    min_dist     REAL,
    max_alt      REAL,
    max_speed    REAL,
    PRIMARY KEY (day, icao24)
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS sightings_last_seen ON sightings (last_seen)');

const KEEP_DAYS = 120;
const RARITY_WINDOW_DAYS = 90;
const MIN_HISTORY_DAYS = 14;       // don't call anything rare until we've watched this long
const RARE_MAX_DAYS = 2;           // seen on at most this many earlier days → rare
const RARE_CATEGORIES = new Set(['A3', 'A4', 'A5', 'A6']); // large, 757, heavy, high-performance
const RARITY_REFRESH_MS = 10 * 60 * 1000;

const NOTABLE_TYPES: Record<string, string> = {
  A388: 'Airbus A380 superjumbo',
  B741: 'Boeing 747', B742: 'Boeing 747', B743: 'Boeing 747', B744: 'Boeing 747', B748: 'Boeing 747-8', B74S: 'Boeing 747SP',
  B74R: 'Boeing 747', BLCF: 'Boeing Dreamlifter',
  A3ST: 'Airbus Beluga', A337: 'Airbus BelugaXL',
  A124: 'Antonov An-124', A225: 'Antonov An-225', IL76: 'Ilyushin Il-76',
  A342: 'Airbus A340', A343: 'Airbus A340', A345: 'Airbus A340', A346: 'Airbus A340',
  MD11: 'McDonnell Douglas MD-11', DC10: 'McDonnell Douglas DC-10', DC3: 'Douglas DC-3', DC6: 'Douglas DC-6',
  CONC: 'Concorde', E4: 'Boeing E-4 "Doomsday plane"', VC25: 'VC-25 (Air Force One aircraft)',
  B52: 'B-52 bomber', B1: 'B-1 bomber', B2: 'B-2 stealth bomber', U2: 'U-2 spy plane',
};

const NOTABLE_CALLSIGNS: Array<[RegExp, string]> = [
  [/^AF1$/, 'Air Force One'],
  [/^AF2$/, 'Air Force Two'],
  [/^SAM\d+/, 'Special Air Mission (VIP transport)'],
  [/^EXEC1F$/, 'Executive One Foxtrot (presidential family)'],
  [/^NASA\d+/, 'NASA flight'],
];

const stmtUpsert = db.prepare(`
  INSERT INTO sightings (day, icao24, callsign, type, registration, operator, year, category, origin, destination, notable, first_seen, last_seen, min_dist, max_alt, max_speed)
  VALUES (@day, @icao24, @callsign, @type, @registration, @operator, @year, @category, @origin, @destination, @notable, @now, @now, @dist, @alt, @speed)
  ON CONFLICT (day, icao24) DO UPDATE SET
    callsign     = COALESCE(excluded.callsign, callsign),
    type         = COALESCE(excluded.type, type),
    registration = COALESCE(excluded.registration, registration),
    operator     = COALESCE(excluded.operator, operator),
    year         = COALESCE(excluded.year, year),
    category     = COALESCE(excluded.category, category),
    origin       = COALESCE(excluded.origin, origin),
    destination  = COALESCE(excluded.destination, destination),
    notable      = COALESCE(notable, excluded.notable),
    last_seen    = excluded.last_seen,
    min_dist     = MIN(min_dist, excluded.min_dist),
    max_alt      = MAX(COALESCE(max_alt, 0), COALESCE(excluded.max_alt, 0)),
    max_speed    = MAX(COALESCE(max_speed, 0), COALESCE(excluded.max_speed, 0))
`);

function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// ── Rarity ────────────────────────────────────────────────────────────────────

let typeDays = new Map<string, number>(); // type → days seen before today, within the window
let historyDays = 0;
let rarityComputedAt = 0;

function refreshRarity(now: number) {
  if (now - rarityComputedAt < RARITY_REFRESH_MS) return;
  rarityComputedAt = now;
  const today = utcDay(now);
  const from = utcDay(now - RARITY_WINDOW_DAYS * 86_400_000);
  const rows = db.prepare<[string, string], { type: string; days: number }>(
    'SELECT type, COUNT(DISTINCT day) AS days FROM sightings WHERE day >= ? AND day < ? AND type IS NOT NULL GROUP BY type'
  ).all(from, today);
  typeDays = new Map(rows.map(r => [r.type, r.days]));
  historyDays = db.prepare<[string, string], { n: number }>(
    'SELECT COUNT(DISTINCT day) AS n FROM sightings WHERE day >= ? AND day < ?'
  ).get(from, today)!.n;
  db.prepare('DELETE FROM sightings WHERE day < ?').run(utcDay(now - KEEP_DAYS * 86_400_000));
}

function notableReason(f: FlightState): string | null {
  const callsign = f.callsign?.trim().toUpperCase() ?? '';
  for (const [re, label] of NOTABLE_CALLSIGNS) if (re.test(callsign)) return label;
  const type = f.aircraftType?.toUpperCase() ?? '';
  if (NOTABLE_TYPES[type]) return NOTABLE_TYPES[type];
  if (type && historyDays >= MIN_HISTORY_DAYS && f.category && RARE_CATEGORIES.has(f.category)) {
    const days = typeDays.get(type) ?? 0;
    if (days === 0) return 'First one seen here';
    if (days <= RARE_MAX_DAYS) return `Rare here: seen on ${days} of the last ${RARITY_WINDOW_DAYS} days`;
  }
  return null;
}

// Marks notable aircraft and logs everything. Called for the home location only.
export const recordSightings = db.transaction((flights: FlightState[], now: number = Date.now()) => {
  refreshRarity(now);
  const day = utcDay(now);
  for (const f of flights) {
    f.notable = notableReason(f);
    stmtUpsert.run({
      day,
      icao24: f.icao24,
      callsign: f.callsign?.trim() || null,
      type: f.aircraftType?.toUpperCase() ?? null,
      registration: f.registration,
      operator: f.operator,
      year: f.yearBuilt,
      category: f.category,
      origin: f.route?.origin ?? null,
      destination: f.route?.destination ?? null,
      notable: f.notable,
      now,
      dist: f.distanceMiles,
      alt: f.baroAltitude,
      speed: f.velocity,
    });
  }
});

// Notable flags for sessions that aren't logged (explore mode) — same rules, no logging.
export function markNotable(flights: FlightState[]) {
  for (const f of flights) f.notable = notableReason(f);
}

// ── Today summary ────────────────────────────────────────────────────────────

interface SightingRow {
  icao24: string; callsign: string | null; type: string | null; registration: string | null;
  operator: string | null; year: number | null; origin: string | null; destination: string | null;
  notable: string | null; first_seen: number; min_dist: number; max_alt: number | null; max_speed: number | null;
}

export interface SightingSummary {
  icao24: string; callsign: string | null; type: string | null; registration: string | null;
  operator: string | null; origin: string | null; destination: string | null; seenAt: number;
}

export interface TodaySummary {
  aircraft: number;
  types: number;
  airlines: Array<{ code: string; count: number }>;
  closest: (SightingSummary & { miles: number }) | null;
  highest: (SightingSummary & { altitude: number }) | null;
  fastest: (SightingSummary & { speed: number }) | null;
  oldest: (SightingSummary & { year: number }) | null;
  farthestOrigin: (SightingSummary & { miles: number }) | null;
  rarest: (SightingSummary & { daysSeen: number }) | null;
  notable: Array<SightingSummary & { reason: string }>;
  hourly: number[]; // aircraft first seen in each hour since `since` (local hours, client-relative)
}

function summary(r: SightingRow): SightingSummary {
  return { icao24: r.icao24, callsign: r.callsign, type: r.type, registration: r.registration,
    operator: r.operator, origin: r.origin, destination: r.destination, seenAt: r.first_seen };
}

function maxBy<T>(items: T[], score: (t: T) => number | null): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const t of items) {
    const s = score(t);
    if (s != null && s > bestScore) { best = t; bestScore = s; }
  }
  return best;
}

export function todaySummary(since: number, homeLat: number, homeLon: number, now = Date.now()): TodaySummary {
  refreshRarity(now);
  // An aircraft can span two UTC days within one local day; merge its rows
  const raw = db.prepare<[number], SightingRow>(
    `SELECT icao24, MAX(callsign) AS callsign, MAX(type) AS type, MAX(registration) AS registration,
            MAX(operator) AS operator, MAX(year) AS year, MAX(origin) AS origin, MAX(destination) AS destination,
            MAX(notable) AS notable, MIN(first_seen) AS first_seen, MIN(min_dist) AS min_dist,
            MAX(max_alt) AS max_alt, MAX(max_speed) AS max_speed
     FROM sightings WHERE last_seen >= ? GROUP BY icao24`
  ).all(since);

  const airlineCounts = new Map<string, number>();
  for (const r of raw) {
    const m = r.callsign?.match(/^([A-Z]{3})\d/);
    if (m) airlineCounts.set(m[1], (airlineCounts.get(m[1]) ?? 0) + 1);
  }
  const airlines = [...airlineCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([code, count]) => ({ code, count }));

  const closest = maxBy(raw, r => -r.min_dist);
  const highest = maxBy(raw, r => r.max_alt);
  const fastest = maxBy(raw, r => r.max_speed);
  const oldest = maxBy(raw.filter(r => r.year), r => -r.year!);
  const originMiles = (r: SightingRow) => {
    const a = r.origin ? airport(r.origin) : undefined;
    return a ? haversineDistance(homeLat, homeLon, a.lat, a.lon) : null;
  };
  const farthest = maxBy(raw, originMiles);
  const rarest = historyDays >= MIN_HISTORY_DAYS ? maxBy(raw.filter(r => r.type), r => -(typeDays.get(r.type!) ?? 0)) : null;

  const hourly = new Array(Math.max(1, Math.ceil((now - since) / 3_600_000))).fill(0);
  for (const r of raw) {
    const h = Math.floor((Math.max(r.first_seen, since) - since) / 3_600_000);
    if (h >= 0 && h < hourly.length) hourly[h]++;
  }

  return {
    aircraft: raw.length,
    types: new Set(raw.map(r => r.type).filter(Boolean)).size,
    airlines,
    closest: closest && { ...summary(closest), miles: closest.min_dist },
    highest: highest?.max_alt ? { ...summary(highest), altitude: highest.max_alt } : null,
    fastest: fastest?.max_speed ? { ...summary(fastest), speed: fastest.max_speed } : null,
    oldest: oldest && { ...summary(oldest), year: oldest.year! },
    farthestOrigin: farthest && originMiles(farthest) != null ? { ...summary(farthest), miles: originMiles(farthest)! } : null,
    rarest: rarest && { ...summary(rarest), daysSeen: typeDays.get(rarest.type!) ?? 0 },
    notable: raw.filter(r => r.notable).sort((a, b) => b.first_seen - a.first_seen).slice(0, 20)
      .map(r => ({ ...summary(r), reason: r.notable! })),
    hourly,
  };
}
