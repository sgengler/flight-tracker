import { Response } from 'express';
import { fetchNearbyFlights, fetchMilitaryFlights, findClosestFlight, getCachedRoute, getCachedAircraftType, FlightState } from './opensky';

const POLL_INTERVAL_MS = 10_000;

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
        if (f.callsign) f.route = await getCachedRoute(f.callsign, f.icao24);
        // aircraftType comes from adsb.fi; use hexdb.io as fallback and for police detection
        const { typeCode, isPolice } = await getCachedAircraftType(f.icao24);
        f.isPolice = isPolice;
        if (!f.aircraftType && typeCode) f.aircraftType = typeCode;
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
