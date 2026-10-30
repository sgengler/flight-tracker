import { useEffect, useRef } from 'react';

const POLL_INTERVAL_MS = 30_000;

// The Pi runs this page 24/7. A daily reload in the small hours clears anything the
// browser or Mapbox accumulates over days that the app itself can't release.
const DAILY_RELOAD_HOUR = 4; // local time
const MIN_UPTIME_FOR_DAILY_RELOAD_MS = 2 * 60 * 60 * 1000; // don't reload a page that just loaded

export function useAutoReload() {
  const initialVersion = useRef<number | null>(null);

  useEffect(() => {
    const loadedAt = Date.now();

    async function check() {
      if (new Date().getHours() === DAILY_RELOAD_HOUR && Date.now() - loadedAt > MIN_UPTIME_FOR_DAILY_RELOAD_MS) {
        window.location.reload();
        return;
      }
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const { startedAt } = await res.json() as { startedAt: number };
        if (initialVersion.current === null) {
          initialVersion.current = startedAt;
        } else if (startedAt !== initialVersion.current) {
          window.location.reload();
        }
      } catch {
        // network error — ignore, try again next interval
      }
    }

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
