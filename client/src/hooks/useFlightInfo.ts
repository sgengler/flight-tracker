import { useEffect, useRef, useState } from 'react';

export function useFlightInfo(icao24: string | null, typeName?: string | null): { photoUrl: string | null } | null {
  const [info, setInfo] = useState<{ photoUrl: string | null } | null>(null);
  const typeNameRef = useRef(typeName);
  typeNameRef.current = typeName;

  useEffect(() => {
    setInfo(null);
    if (!icao24) return;

    let cancelled = false;
    const params = new URLSearchParams({ icao24 });
    if (typeNameRef.current) params.set('typeName', typeNameRef.current);
    fetch(`/api/flight-info?${params}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfo({ photoUrl: null }); });

    return () => { cancelled = true; };
  }, [icao24]);

  return info;
}
