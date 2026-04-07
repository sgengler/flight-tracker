import { useEffect, useRef } from 'react';

const POLL_INTERVAL_MS = 30_000;

export function useAutoReload() {
  const initialVersion = useRef<number | null>(null);

  useEffect(() => {
    async function check() {
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
