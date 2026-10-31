import { describe, expect, it } from 'vitest';
import type { FlightState } from '../opensky';
import { markNotable } from '../sightings';

const flight = (over: Partial<FlightState>): FlightState => ({
  icao24: 'abc123', callsign: null, originCountry: '', latitude: 40, longitude: -75, baroAltitude: 3000,
  onGround: false, velocity: 100, trueTrack: 90, verticalRate: 0, geoAltitude: 3000, distanceMiles: 5,
  bearingDeg: 0, route: null, aircraftType: null, isPolice: false, registration: null, operator: null,
  yearBuilt: null, squawk: null, emergency: null, selectedAltitude: null, category: null,
  notable: null, notableWhy: null, ...over,
});

const mark = (over: Partial<FlightState>) => {
  const f = flight(over);
  markNotable([f]);
  return [f.notable, f.notableWhy];
};

describe('notable aircraft', () => {
  it('flags special types with a reason', () => {
    expect(mark({ aircraftType: 'B748' })).toEqual(['Boeing 747-8', expect.stringContaining('jumbo')]);
    expect(mark({ aircraftType: 'A388' })[0]).toBe('Airbus A380');
  });

  it('flags VIP callsigns', () => {
    expect(mark({ callsign: 'AF1' })).toEqual(['Air Force One', 'The President is on board']);
    expect(mark({ callsign: 'SAM44' })[0]).toBe('Special Air Mission');
  });

  it('flags blimps, and Goodyear blimps by name', () => {
    expect(mark({ registration: 'N1A', aircraftType: 'ZEPN' })[0]).toBe('Goodyear Blimp');
    expect(mark({ operator: 'GOODYEAR TIRE & RUBBER CO' })[0]).toBe('Goodyear Blimp');
    expect(mark({ category: 'B2' })[0]).toBe('Blimp');
    expect(mark({ aircraftType: 'SHIP' })[0]).toBe('Blimp');
  });

  it('leaves ordinary aircraft alone', () => {
    expect(mark({ aircraftType: 'B738', callsign: 'SWA123', category: 'A3' })).toEqual([null, null]);
  });
});
