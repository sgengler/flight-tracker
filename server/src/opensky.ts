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

export interface RouteInfo {
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  airline: string | null;
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

// ── Globe.adsbexchange.com trace proxy ───────────────────────────────────────

// Returns [lat, lon, speedMs, altM][] for the current-day trace of an aircraft.
// Proxies globe.adsbexchange.com which requires a Referer header.
export async function fetchAircraftTrace(icao24: string): Promise<Array<[number, number, number, number | null]>> {
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

  // Each entry: [timeOffset, lat, lon, alt_baro_ft_or_"ground", groundspeedKts, ...]
  const positions: Array<[number, number, number, number | null]> = data.trace.map(entry => [
    entry[1],                                                // lat
    entry[2],                                                // lon
    (entry[4] ?? 0) / 1.94384,                              // knots → m/s
    typeof entry[3] === 'number' ? entry[3] * 0.3048 : null, // ft → m (null if "ground")
  ]);

  return positions;
}
