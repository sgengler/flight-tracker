import fs from 'fs';
import path from 'path';
import type { FlightState } from './opensky';

export interface SpeedRecord {
  velocityMs: number;
  callsign: string | null;
  icao24: string;
  aircraftType: string | null;
  seenAt: number; // unix ms
}

const SPEED_FILE = path.resolve(__dirname, '../../cache/speed-record.json');
let speedRecord: SpeedRecord | null = null;

function loadSpeedRecord() {
  try {
    const raw = fs.readFileSync(SPEED_FILE, 'utf8');
    speedRecord = JSON.parse(raw) as SpeedRecord;
    console.log(`[speed record] Loaded: ${speedRecord.velocityMs.toFixed(1)} m/s (${speedRecord.callsign ?? speedRecord.icao24})`);
  } catch {
    // No record yet
  }
}

function saveSpeedRecord() {
  try {
    fs.mkdirSync(path.dirname(SPEED_FILE), { recursive: true });
    fs.writeFileSync(SPEED_FILE, JSON.stringify(speedRecord));
  } catch (err) {
    console.error('[speed record] Failed to save:', err);
  }
}

loadSpeedRecord();

export function getSpeedRecord(): SpeedRecord | null {
  return speedRecord;
}

// 1,000 kts in m/s — filters transponder glitches while allowing any real aircraft
const MAX_PLAUSIBLE_SPEED_MS = 1000 * 0.514444;

// Rolling buffer of the last 3 velocity readings per icao24
const speedHistory = new Map<string, number[]>();

export function maybeUpdateSpeedRecord(flight: FlightState) {
  if (flight.velocity == null) return;
  if (flight.velocity > MAX_PLAUSIBLE_SPEED_MS) return;

  const buf = speedHistory.get(flight.icao24) ?? [];
  buf.push(flight.velocity);
  if (buf.length > 3) buf.shift();
  speedHistory.set(flight.icao24, buf);

  if (buf.length < 3) return;

  // Reject if any reading deviates >25% from the median — catches transponder glitches
  // without penalising real acceleration. With 3 values the median is always the middle one.
  const sorted = [...buf].sort((a, b) => a - b);
  const median = sorted[1];
  if (sorted.some(v => Math.abs(v - median) / median > 0.25)) return;

  const avg = (buf[0] + buf[1] + buf[2]) / 3;
  if (speedRecord && avg <= speedRecord.velocityMs) return;

  speedRecord = {
    velocityMs: avg,
    callsign: flight.callsign,
    icao24: flight.icao24,
    aircraftType: flight.aircraftType,
    seenAt: Date.now(),
  };
  console.log(`[speed record] New record: ${speedRecord.velocityMs.toFixed(1)} m/s avg (${speedRecord.callsign ?? speedRecord.icao24})`);
  saveSpeedRecord();
}
