import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { haversineDistance, bearingTo, findClosestFlight } from '../opensky';
import type { FlightState } from '../opensky';

// ─── Pure math (no module state) ────────────────────────────────────────────

describe('haversineDistance', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistance(40.7128, -74.006, 40.7128, -74.006)).toBeCloseTo(0, 1);
  });

  it('returns ~2,450 miles for NYC → LAX', () => {
    const d = haversineDistance(40.7128, -74.006, 33.9425, -118.4081);
    expect(d).toBeGreaterThan(2440);
    expect(d).toBeLessThan(2460);
  });

  it('returns ~69 miles for 1 degree of latitude', () => {
    expect(haversineDistance(0, 0, 1, 0)).toBeCloseTo(69.0, 0);
  });

  it('is symmetric — distance(A→B) equals distance(B→A)', () => {
    const ab = haversineDistance(51.5, -0.1, 48.8, 2.35);
    const ba = haversineDistance(48.8, 2.35, 51.5, -0.1);
    expect(ab).toBeCloseTo(ba, 5);
  });
});

describe('bearingTo', () => {
  it('due north (0°)', () => {
    expect(bearingTo(0, 0, 1, 0)).toBeCloseTo(0, 0);
  });

  it('due east (90°)', () => {
    expect(bearingTo(0, 0, 0, 1)).toBeCloseTo(90, 0);
  });

  it('due south (180°)', () => {
    expect(bearingTo(0, 0, -1, 0)).toBeCloseTo(180, 0);
  });

  it('due west (270°)', () => {
    expect(bearingTo(0, 0, 0, -1)).toBeCloseTo(270, 0);
  });

  it('always returns a value in [0, 360)', () => {
    const result = bearingTo(40, -74, 34, -118);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(360);
  });
});

describe('findClosestFlight', () => {
  const makeFlight = (distanceMiles: number): FlightState => ({
    icao24: 'abc',
    callsign: null,
    originCountry: '',
    latitude: 0,
    longitude: 0,
    baroAltitude: 10000,
    onGround: false,
    velocity: 200,
    trueTrack: 90,
    verticalRate: 0,
    geoAltitude: 10000,
    distanceMiles,
    bearingDeg: 90,
    route: null,
    aircraftType: null,
    isPolice: false,
  });

  it('returns null for an empty array', () => {
    expect(findClosestFlight([])).toBeNull();
  });

  it('returns the single element of a one-element array', () => {
    const f = makeFlight(5);
    expect(findClosestFlight([f])).toBe(f);
  });

  it('returns the first element (pre-sorted by caller)', () => {
    const a = makeFlight(1);
    const b = makeFlight(10);
    expect(findClosestFlight([a, b])).toBe(a);
  });
});

// ─── fetchNearbyFlights (adsb.fi) ────────────────────────────────────────────

function makeAircraft(overrides: {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  t?: string;
} = {}) {
  return {
    hex: overrides.hex ?? 'abc123',
    flight: overrides.flight ?? 'UAL123  ',
    lat: overrides.lat ?? 41.88,
    lon: overrides.lon ?? -87.63,
    alt_baro: overrides.alt_baro ?? 32808,  // 10000 m in feet
    alt_geom: overrides.alt_geom ?? 33000,
    gs: overrides.gs ?? 389,                // ~200 m/s in knots
    track: overrides.track ?? 270,
    baro_rate: overrides.baro_rate ?? 0,
    t: overrides.t ?? 'B738',
  };
}

function mockAdsbResponse(aircraft: ReturnType<typeof makeAircraft>[]) {
  return { ok: true, json: async () => ({ ac: aircraft }) } as unknown as Response;
}

describe('fetchNearbyFlights', () => {
  let fetchNearbyFlights: (lat: number, lon: number, radiusMiles?: number) => Promise<FlightState[]>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
    ({ fetchNearbyFlights } = await import('../opensky'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('makes a single unauthenticated request to adsb.fi', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(mockAdsbResponse([makeAircraft()]));

    await fetchNearbyFlights(41.88, -87.63);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('opendata.adsb.fi');
    expect(url).toContain('41.88');
    expect(url).toContain('-87.63');
  });

  it('converts radius from statute miles to nautical miles in the URL', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(mockAdsbResponse([]));

    await fetchNearbyFlights(41.88, -87.63, 75);

    const url = mockFetch.mock.calls[0][0] as string;
    // 75 statute miles ≈ 65 NM
    expect(url).toContain('/dist/65');
  });

  it('returns an empty array when ac is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockAdsbResponse([]));
    const result = await fetchNearbyFlights(41.88, -87.63);
    expect(result).toEqual([]);
  });

  it('filters out on-ground aircraft (alt_baro === "ground")', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockAdsbResponse([makeAircraft({ alt_baro: 'ground' })])
    );
    const result = await fetchNearbyFlights(41.88, -87.63);
    expect(result).toHaveLength(0);
  });

  it('filters out aircraft with null lat or lon', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      { ok: true, json: async () => ({ ac: [{ hex: 'null01', alt_baro: 10000 }] }) } as unknown as Response
    );
    const result = await fetchNearbyFlights(41.88, -87.63);
    expect(result).toHaveLength(0);
  });

  it('returns flights sorted by distanceMiles ascending', async () => {
    const close = makeAircraft({ hex: 'close1', lat: 41.90, lon: -87.63 });
    const far   = makeAircraft({ hex: 'far001', lat: 43.00, lon: -87.63 });
    vi.mocked(fetch).mockResolvedValueOnce(mockAdsbResponse([far, close]));

    const result = await fetchNearbyFlights(41.88, -87.63);
    expect(result).toHaveLength(2);
    expect(result[0].icao24).toBe('close1');
    expect(result[0].distanceMiles).toBeLessThan(result[1].distanceMiles);
  });

  it('attaches distanceMiles and bearingDeg', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockAdsbResponse([makeAircraft({ lat: 41.88, lon: -87.63 })])
    );
    const [flight] = await fetchNearbyFlights(41.88, -87.00);
    expect(typeof flight.distanceMiles).toBe('number');
    expect(flight.bearingDeg).toBeGreaterThanOrEqual(0);
    expect(flight.bearingDeg).toBeLessThan(360);
  });

  it('sets aircraftType directly from the t field', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockAdsbResponse([makeAircraft({ t: 'C17' })])
    );
    const [flight] = await fetchNearbyFlights(41.88, -87.63);
    expect(flight.aircraftType).toBe('C17');
  });

  it('converts altitude from feet to metres', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockAdsbResponse([makeAircraft({ alt_baro: 10000 })])
    );
    const [flight] = await fetchNearbyFlights(41.88, -87.63);
    // 10000 ft * 0.3048 = 3048 m
    expect(flight.baroAltitude).toBeCloseTo(3048, 0);
  });

  it('converts ground speed from knots to m/s', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockAdsbResponse([makeAircraft({ gs: 100 })])
    );
    const [flight] = await fetchNearbyFlights(41.88, -87.63);
    // 100 knots * 0.514444 ≈ 51.4 m/s
    expect(flight.velocity).toBeCloseTo(51.4, 0);
  });

  it('trims trailing whitespace from callsign', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockAdsbResponse([makeAircraft({ flight: 'UAL123  ' })])
    );
    const [flight] = await fetchNearbyFlights(41.88, -87.63);
    expect(flight.callsign).toBe('UAL123');
  });

  it('throws when the adsb.fi API returns a non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      { ok: false, status: 429, statusText: 'Too Many Requests' } as Response
    );
    await expect(fetchNearbyFlights(41.88, -87.63)).rejects.toThrow('429');
  });
});
