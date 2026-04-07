import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response } from 'express';
import type { FlightState } from '../opensky';

// Mock the opensky module before importing poller
vi.mock('../opensky', () => ({
  fetchNearbyFlights: vi.fn(),
  findClosestFlight: vi.fn(),
  getCachedRoute: vi.fn().mockResolvedValue(null),
  getCachedAircraftType: vi.fn().mockResolvedValue({ typeCode: null, isPolice: false }),
}));

import { subscribe } from '../poller';
import * as opensky from '../opensky';

const mockFetch = vi.mocked(opensky.fetchNearbyFlights);
const mockClosest = vi.mocked(opensky.findClosestFlight);

const MOCK_FLIGHT: FlightState = {
  icao24: 'abc123',
  callsign: 'UAL123',
  originCountry: 'United States',
  latitude: 41.88,
  longitude: -87.63,
  baroAltitude: 10000,
  onGround: false,
  velocity: 200,
  trueTrack: 270,
  verticalRate: 0,
  geoAltitude: 10000,
  distanceMiles: 4.2,
  bearingDeg: 315,
  route: null,
  aircraftType: null,
  isPolice: false,
};

function makeRes(): Response {
  return { write: vi.fn() } as unknown as Response;
}

/** Flush enough microtask rounds to let poll()'s async chain settle.
 *  poll() awaits fetchNearbyFlights once per radius in the expansion loop;
 *  10 rounds covers the worst-case (5 sequential awaits × 2 ticks each). */
async function flushPromises() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('poller subscribe', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    // Default: return a flight on first call so the radius expansion loop stops early
    mockFetch.mockResolvedValue([MOCK_FLIGHT]);
    mockClosest.mockReturnValue(MOCK_FLIGHT);
  });

  afterEach(() => {
    // Unsubscribe any leftover clients to drain sessions Map
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('calls fetchNearbyFlights immediately on first subscribe', async () => {
    const res = makeRes();
    const unsub = subscribe(41.88, -87.63, res);
    cleanups.push(unsub);

    await flushPromises();

    expect(mockFetch).toHaveBeenCalledWith(41.88, -87.63, 75);
  });

  it('writes an SSE data event to the response after the initial poll', async () => {
    const res = makeRes();
    const unsub = subscribe(41.88, -87.63, res);
    cleanups.push(unsub);

    await flushPromises();

    expect(res.write).toHaveBeenCalledTimes(1);
    const written = (res.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(written).toMatch(/^data: /);
    const payload = JSON.parse(written.replace(/^data: /, '').trim());
    expect(payload.flight).toMatchObject({ icao24: 'abc123' });
    expect(typeof payload.timestamp).toBe('number');
  });

  it('expands search radius when 75mi returns no flights', async () => {
    mockFetch
      .mockResolvedValueOnce([])    // 75mi — empty
      .mockResolvedValueOnce([])    // 150mi — empty
      .mockResolvedValueOnce([MOCK_FLIGHT]); // 300mi — found

    const res = makeRes();
    const unsub = subscribe(41.88, -87.63, res);
    cleanups.push(unsub);

    await flushPromises();

    const radii = mockFetch.mock.calls.map((c) => c[2]);
    expect(radii).toContain(75);
    expect(radii).toContain(150);
    expect(radii).toContain(300);
    // Should not have gone further since 300mi found something
    expect(radii).not.toContain(600);
  });

  it('writes error payload when fetchNearbyFlights rejects', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    const res = makeRes();
    const unsub = subscribe(41.88, -87.63, res);
    cleanups.push(unsub);

    await flushPromises();

    const written = (res.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const payload = JSON.parse(written.replace(/^data: /, '').trim());
    expect(payload.error).toBe('Network timeout');
  });

  it('polls again after POLL_INTERVAL_MS', async () => {
    const res = makeRes();
    const unsub = subscribe(41.88, -87.63, res);
    cleanups.push(unsub);

    await flushPromises();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('two subscribers at the same lat/lon share one session (one poll per tick)', async () => {
    const res1 = makeRes();
    const res2 = makeRes();
    const unsub1 = subscribe(41.88, -87.63, res1);
    const unsub2 = subscribe(41.88, -87.63, res2);
    cleanups.push(unsub1, unsub2);

    await flushPromises();
    vi.advanceTimersByTime(10_000);
    await flushPromises();

    // 2 polls total (1 immediate + 1 interval), not 4
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Both clients receive each poll's result
    expect(res1.write).toHaveBeenCalledTimes(2);
    expect(res2.write).toHaveBeenCalledTimes(2);
  });

  it('sends cached flight immediately to a late-joining subscriber', async () => {
    const res1 = makeRes();
    const unsub1 = subscribe(41.88, -87.63, res1);
    cleanups.push(unsub1);
    await flushPromises(); // first poll completes, lastFlight is set

    const res2 = makeRes();
    const unsub2 = subscribe(41.88, -87.63, res2);
    cleanups.push(unsub2);
    // No extra poll needed — cached result is sent synchronously
    expect(res2.write).toHaveBeenCalledTimes(1);
  });

  it('stops writing to a client after it unsubscribes', async () => {
    const res = makeRes();
    const unsub = subscribe(41.88, -87.63, res);
    await flushPromises();

    unsub(); // unsubscribe before the next interval

    vi.advanceTimersByTime(10_000);
    await flushPromises();

    // Only the initial poll write; interval fires but client is gone
    expect(res.write).toHaveBeenCalledTimes(1);
  });

  it('clears the interval when the last client unsubscribes', async () => {
    const res = makeRes();
    const unsub = subscribe(41.88, -87.63, res);
    await flushPromises();

    mockFetch.mockClear();
    unsub();

    // Advance multiple intervals — fetchNearbyFlights should never be called again
    vi.advanceTimersByTime(30_000);
    await flushPromises();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('keeps the session alive while at least one client remains', async () => {
    const res1 = makeRes();
    const res2 = makeRes();
    const unsub1 = subscribe(41.88, -87.63, res1);
    const unsub2 = subscribe(41.88, -87.63, res2);
    cleanups.push(unsub2);
    await flushPromises();

    unsub1(); // remove only res1

    mockFetch.mockClear();
    vi.advanceTimersByTime(10_000);
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledTimes(1); // session still polling for res2
    expect(res2.write).toHaveBeenCalled();
  });

  it('sessions at different coordinates poll independently', async () => {
    const res1 = makeRes();
    const res2 = makeRes();
    const unsub1 = subscribe(41.88, -87.63, res1);
    const unsub2 = subscribe(34.05, -118.24, res2);
    cleanups.push(unsub1, unsub2);

    await flushPromises();

    const callArgs = mockFetch.mock.calls.map((c) => [c[0], c[1]]);
    expect(callArgs).toContainEqual([41.88, -87.63]);
    expect(callArgs).toContainEqual([34.05, -118.24]);
  });
});
