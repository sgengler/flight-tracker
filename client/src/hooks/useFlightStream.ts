import { useEffect, useRef, useState } from 'react';
import { FlightState, ConnectionStatus } from '../types';

interface UseFlightStreamResult {
  flight: FlightState | null;
  flights: FlightState[];
  lastUpdated: number | null;
  status: ConnectionStatus;
}

const MAX_BACKOFF_MS = 30_000;

export function useFlightStream(lat: number | null, lon: number | null, mode: 'normal' | 'military' = 'normal'): UseFlightStreamResult {
  const [flight, setFlight] = useState<FlightState | null>(null);
  const [flights, setFlights] = useState<FlightState[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const backoffRef = useRef(1000);
  const esRef = useRef<EventSource | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (lat == null || lon == null) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    backoffRef.current = 1000;

    function connect() {
      esRef.current?.close();
      setStatus('connecting');

      const url = mode === 'military'
        ? `/api/flights/stream/military?lat=${lat}&lon=${lon}`
        : `/api/flights/stream?lat=${lat}&lon=${lon}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        if (unmountedRef.current) return;
        backoffRef.current = 1000;
        setStatus('connected');
      };

      es.onmessage = (e) => {
        if (unmountedRef.current) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.error) {
            console.error('[SSE] server error:', msg.error);
            return;
          }
          setFlight(msg.flight);
          setFlights(msg.flights ?? []);
          setLastUpdated(msg.timestamp);
          setStatus('connected');
        } catch {
          console.error('[SSE] parse error', e.data);
        }
      };

      es.onerror = () => {
        if (unmountedRef.current) return;
        es.close();
        setStatus('reconnecting');
        timeoutId = setTimeout(() => {
          if (!unmountedRef.current) {
            backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
            connect();
          }
        }, backoffRef.current);
      };
    }

    connect();

    return () => {
      clearTimeout(timeoutId);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [lat, lon, mode]);

  return { flight, flights, lastUpdated, status };
}
