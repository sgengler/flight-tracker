import { useEffect, useState } from 'react';

export function useFlightInfo(icao24: string | null): { photoUrl: string | null } | null {
  const [info, setInfo] = useState<{ photoUrl: string | null } | null>(null);

  useEffect(() => {
    if (!icao24) { setInfo(null); return; }

    let cancelled = false;
    fetch(`/api/flight-info?icao24=${encodeURIComponent(icao24)}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfo({ photoUrl: null }); });

    return () => { cancelled = true; };
  }, [icao24]);

  return info;
}
