import { Response } from 'express';
import { fetchNearbyFlights, fetchMilitaryFlights, findClosestFlight, getCachedRoute, getCachedAircraftType, FlightState } from './opensky';

const POLL_INTERVAL_MS = 15_000;

// Military-only type codes — FlightAware has no commercial routes for these
const MILITARY_TYPE_CODES = new Set([
  'F14','F15','F16','F18','FA18','F22','F35','F117','F5',
  'B52','B1B','B2',
  'A10','AC13','AC130','TUCA',
  'C130','C30J','C17','C5A','C5M','SW4','CN35','A400','M28',
  'KC10','KC135','KC46','K35R',
  'E3','E3TF','E8','E6','E2','W135','R135',
  'U2','SR71','RQ4','Q4','MQ9','MQ1','X47B','RQ180','BTB2',
  'P3','P8','V22',
  'T38','T6','T45','TEX2','HAWK','G120','G12T','PC7',
  'H60','S70','UH60','HH60','MH60','SH60','CH47','H47','AH64',
  'UH1','UH1Y','HH1','AH1','CH53','H53S','OH58','HH65',
  'AS65','B212','B412','A119','A139','A169','H500','AS55',
]);

function isMilitaryType(typeCode: string | null): boolean {
  return typeCode != null && MILITARY_TYPE_CODES.has(typeCode.toUpperCase());
}

interface Session {
  lat: number;
  lon: number;
  clients: Set<Response>;
  interval: ReturnType<typeof setInterval>;
  lastFlight: FlightState | null;
  lastFlights: FlightState[];
}

// Key: "lat,lon" rounded to 4 decimal places (~11m precision — good enough to share sessions)
const sessions = new Map<string, Session>();
const militarySessions = new Map<string, Session>();

function sessionKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

async function poll(session: Session) {
  try {
    let flights = await fetchNearbyFlights(session.lat, session.lon, 75);
    console.log(`[poller] ${session.lat},${session.lon} → ${flights.length} flights at 75mi`);
    for (const radius of [150, 300, 600, 1200]) {
      if (flights.length > 0) break;
      flights = await fetchNearbyFlights(session.lat, session.lon, radius);
      console.log(`[poller] expanded to ${radius}mi → ${flights.length} flights`);
    }
    // Enrich top 20 flights with routes and aircraft types (both cached)
    const CONCURRENCY = 3;
    const queue = [...flights.slice(0, 20)];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const f = queue.shift()!;
        // Get police status and type fallback first so we can skip route for military/police
        const { typeCode, isPolice } = await getCachedAircraftType(f.icao24);
        f.isPolice = isPolice;
        if (!f.aircraftType && typeCode) f.aircraftType = typeCode;
        // Skip FlightAware route lookup for military and police — they don't have commercial routes
        if (f.callsign && !isPolice && !isMilitaryType(f.aircraftType)) {
          f.route = await getCachedRoute(f.callsign, f.icao24);
        }
      }
    }));

    const flight = findClosestFlight(flights);
    console.log(`[poller] closest: ${flight ? `${flight.callsign} @ ${flight.distanceMiles.toFixed(1)}mi` : 'none'}`);
    session.lastFlight = flight;
    session.lastFlights = flights;

    const payload = JSON.stringify({ flight, flights, timestamp: Date.now() });
    for (const res of session.clients) {
      res.write(`data: ${payload}\n\n`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[poller] Error for ${session.lat},${session.lon}: ${msg}`);
    const payload = JSON.stringify({ error: msg, timestamp: Date.now() });
    for (const res of session.clients) {
      res.write(`data: ${payload}\n\n`);
    }
  }
}

export function subscribe(lat: number, lon: number, res: Response): () => void {
  const key = sessionKey(lat, lon);

  let session = sessions.get(key);
  if (!session) {
    session = {
      lat,
      lon,
      clients: new Set(),
      interval: setInterval(() => poll(session!), POLL_INTERVAL_MS),
      lastFlight: null,
      lastFlights: [],
    };
    sessions.set(key, session);
    // Run immediately on first connect
    poll(session);
  } else if (session.lastFlight !== null) {
    // Send cached result immediately to new subscribers joining an existing session
    res.write(`data: ${JSON.stringify({ flight: session.lastFlight, flights: session.lastFlights, timestamp: Date.now() })}\n\n`);
  }

  session.clients.add(res);

  return () => {
    session!.clients.delete(res);
    if (session!.clients.size === 0) {
      clearInterval(session!.interval);
      sessions.delete(key);
    }
  };
}

async function pollMilitary(session: Session) {
  try {
    const flights = await fetchMilitaryFlights(session.lat, session.lon);
    console.log(`[military] ${flights.length} military aircraft globally`);
    // Enrich top 20 with aircraft type from hexdb (no route lookups in military mode)
    const CONCURRENCY = 3;
    const queue = [...flights.slice(0, 20)];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const f = queue.shift()!;
        const { typeCode, isPolice } = await getCachedAircraftType(f.icao24);
        f.isPolice = isPolice;
        if (!f.aircraftType && typeCode) f.aircraftType = typeCode;
      }
    }));

    const flight = findClosestFlight(flights);
    session.lastFlight = flight;
    session.lastFlights = flights;

    const payload = JSON.stringify({ flight, flights, timestamp: Date.now() });
    for (const res of session.clients) {
      res.write(`data: ${payload}\n\n`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[military poller] Error: ${msg}`);
    const payload = JSON.stringify({ error: msg, timestamp: Date.now() });
    for (const res of session.clients) {
      res.write(`data: ${payload}\n\n`);
    }
  }
}

export function subscribeMilitary(lat: number, lon: number, res: Response): () => void {
  const key = sessionKey(lat, lon);

  let session = militarySessions.get(key);
  if (!session) {
    session = {
      lat,
      lon,
      clients: new Set(),
      interval: setInterval(() => pollMilitary(session!), POLL_INTERVAL_MS),
      lastFlight: null,
      lastFlights: [],
    };
    militarySessions.set(key, session);
    pollMilitary(session);
  } else if (session.lastFlights.length > 0) {
    res.write(`data: ${JSON.stringify({ flight: session.lastFlight, flights: session.lastFlights, timestamp: Date.now() })}\n\n`);
  }

  session.clients.add(res);

  return () => {
    session!.clients.delete(res);
    if (session!.clients.size === 0) {
      clearInterval(session!.interval);
      militarySessions.delete(key);
    }
  };
}
