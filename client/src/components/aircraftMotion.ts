import { FlightState } from '../types';
import { deadReckon, easeInOutQuad, haversineDist, lerpAngle } from './aircraft';

// Where each aircraft should be drawn at a given moment. Positions are dead-reckoned
// forward from the last report. When a new report arrives, the gap between where the
// aircraft was being drawn and where the report puts it is absorbed gradually rather
// than snapped or eased over a fixed time: a 250 m correction on a jet slows it
// slightly for a few seconds instead of visibly sliding it backwards.

const POLL_S = 16;                // stop extrapolating if reports stop arriving
const MOVING_MS = 0.5;            // below this, treat as stationary
const CORRECTION_SPEED_SHARE = 0.4; // spend at most this share of ground speed on corrections
const MIN_CORRECTION_S = 2;
const MAX_CORRECTION_S = 10;
const SNAP_M = 5_000;             // further off than this, jump instead of gliding
const TURN_S = 2;

interface Track {
  flight: FlightState;
  reportTime: number;
  offset?: [number, number];      // lat/lon still to absorb, decays to 0 over correctionMs
  correctionMs: number;
  headingFrom?: number;
}

export interface AircraftPose {
  flight: FlightState;
  lat: number;
  lon: number;
  heading: number;
}

export class AircraftMotion {
  private tracks = new Map<string, Track>();

  // Call only when fresh data arrives — it restarts the dead-reckoning clock.
  sync(flights: FlightState[], now = Date.now()) {
    const incoming = new Set(flights.map(f => f.icao24));
    for (const icao of this.tracks.keys()) {
      if (!incoming.has(icao)) this.tracks.delete(icao);
    }
    for (const f of flights) {
      const existing = this.tracks.get(f.icao24);
      const next: Track = { flight: f, reportTime: now, correctionMs: 0 };
      if (existing) {
        const was = poseAt(existing, now);
        const dist = haversineDist([was.lat, was.lon], [f.latitude, f.longitude]);
        if (dist < SNAP_M) {
          const v = f.velocity ?? 0;
          const seconds = v > MOVING_MS ? dist / (v * CORRECTION_SPEED_SHARE) : MAX_CORRECTION_S;
          next.offset = [was.lat - f.latitude, was.lon - f.longitude];
          next.correctionMs = Math.min(Math.max(seconds, MIN_CORRECTION_S), MAX_CORRECTION_S) * 1000;
        }
        next.headingFrom = was.heading;
      }
      this.tracks.set(f.icao24, next);
    }
  }

  poses(now = Date.now()): AircraftPose[] {
    const out: AircraftPose[] = [];
    for (const track of this.tracks.values()) out.push(poseAt(track, now));
    return out;
  }
}

function poseAt(track: Track, now: number): AircraftPose {
  const f = track.flight;
  const v = f.velocity ?? 0;
  const heading = f.trueTrack ?? 0;
  const t = Math.max(0, now - track.reportTime);
  let [lat, lon] = v > MOVING_MS
    ? deadReckon(f.latitude, f.longitude, heading, v, Math.min(t / 1000, POLL_S))
    : [f.latitude, f.longitude];
  if (track.offset && t < track.correctionMs) {
    const k = 1 - t / track.correctionMs;
    lat += track.offset[0] * k;
    lon += track.offset[1] * k;
  }
  let shownHeading = heading;
  if (track.headingFrom !== undefined && t < TURN_S * 1000) {
    shownHeading = lerpAngle(track.headingFrom, heading, easeInOutQuad(t / (TURN_S * 1000)));
  }
  return { flight: f, lat, lon, heading: shownHeading };
}
