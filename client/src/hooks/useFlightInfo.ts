import { useEffect, useRef, useState } from 'react';
import { AircraftWikiInfo } from '../types';

export function useFlightInfo(icao24: string | null, typeName?: string | null, registration?: string | null): { photoUrl: string | null; photoUrlLarge: string | null; wikiInfo: AircraftWikiInfo | null; wikiTitle: string | null; wikiExtract: string | null } | null {
  const [info, setInfo] = useState<{ photoUrl: string | null; photoUrlLarge: string | null; wikiInfo: AircraftWikiInfo | null; wikiTitle: string | null; wikiExtract: string | null } | null>(null);
  const prevIcaoRef = useRef<string | null>(null);

  useEffect(() => {
    // Only blank the photo when the selected aircraft itself changes, so a
    // late-arriving typeName doesn't cause a flash of "no image".
    if (prevIcaoRef.current !== icao24) {
      setInfo(null);
      prevIcaoRef.current = icao24;
    }
    if (!icao24) return;

    let cancelled = false;
    const params = new URLSearchParams({ icao24 });
    if (typeName) params.set('typeName', typeName);
    if (registration) params.set('registration', registration);
    fetch(`/api/flight-info?${params}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfo({ photoUrl: null, photoUrlLarge: null, wikiInfo: null, wikiTitle: null, wikiExtract: null }); });

    return () => { cancelled = true; };
  }, [icao24, typeName]);

  return info;
}
