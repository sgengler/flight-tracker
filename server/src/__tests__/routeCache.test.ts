import { describe, expect, it } from 'vitest';
import { routeFits } from '../routeCache';

// Positions and cached routes taken from a live snapshot near Philadelphia.
const route = (departure: string, arrival: string) =>
  ({ departure, departureCity: null, arrival, arrivalCity: null, airline: null });
const at = (latitude: number, longitude: number, trueTrack: number | null, onGround = false) =>
  ({ latitude, longitude, trueTrack, onGround });

describe('routeFits', () => {
  it('accepts aircraft flying their route', () => {
    expect(routeFits(route('KBOS', 'KBWI'), at(39.983, -75.581, 226.8))).toBe(true);
    expect(routeFits(route('KJFK', 'KDFW'), at(40.190, -75.334, 260.2))).toBe(true);
  });

  it('accepts aircraft manoeuvring near the destination', () => {
    // 9 miles from PHL on a downwind leg, heading away from the airport
    expect(routeFits(route('KBOS', 'KPHL'), at(39.994, -75.225, 43.0))).toBe(true);
  });

  it('rejects a route flown in the opposite direction', () => {
    expect(routeFits(route('KBWI', 'KBOS'), at(39.812, -75.342, 231.2))).toBe(false);
    expect(routeFits(route('KLGA', 'KCLT'), at(39.779, -74.998, 40.8))).toBe(false);
  });

  it('rejects an aircraft well off the line between the airports', () => {
    // BOS→BWI but over Pittsburgh
    expect(routeFits(route('KBOS', 'KBWI'), at(40.49, -80.23, 120))).toBe(false);
  });

  it('accepts any heading near the origin, where departures turn', () => {
    // 30 miles west of PHL heading west, on a PHL→BDL route
    expect(routeFits(route('KPHL', 'KBDL'), at(39.912, -75.992, 268.4))).toBe(true);
  });

  it('assumes routes it cannot check are fine', () => {
    expect(routeFits(route('KBWI', 'KBOS'), undefined)).toBe(true);
    expect(routeFits(route('KBWI', 'KBOS'), at(39.812, -75.342, 231.2, true))).toBe(true);
    expect(routeFits(route('BWI', 'BOS'), at(39.812, -75.342, 231.2))).toBe(true);
    expect(routeFits(route('KLGA', 'KDFW'), at(39.623, -75.162, null))).toBe(true);
  });
});
