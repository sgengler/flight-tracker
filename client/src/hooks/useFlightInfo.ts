import { useEffect, useState } from 'react';

export function useFlightInfo(icao24: string | null, typeName?: string | null): { photoUrl: string | null } | null {
  const [info, setInfo] = useState<{ photoUrl: string | null } | null>(null);

  useEffect(() => {
    if (!icao24) { setInfo(null); return; }

    let cancelled = false;
    const params = new URLSearchParams({ icao24 });
    if (typeName) params.set('typeName', typeName);
    fetch(`/api/flight-info?${params}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfo({ photoUrl: null }); });

    return () => { cancelled = true; };
  }, [icao24, typeName]);

  return info;
}
