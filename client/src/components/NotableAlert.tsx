import { useEffect, useRef } from 'react';
import { FlightState } from '../types';
import { aircraftTypeName, wellKnownAircraftName } from '../utils';

// Sidebar alert for notable aircraft (server: sightings.ts decides what's notable —
// special types like the A380 or 747, VIP callsigns, and large types rarely seen here).

function playChime() {
  try {
    const ctx = new AudioContext();
    [[0, 660], [0.18, 880], [0.36, 1320]].forEach(([t, freq]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + t;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
      osc.start(start);
      osc.stop(start + 0.65);
    });
  } catch { /* AudioContext blocked by browser */ }
}

export function NotableAlert({ flights, selectedFlight, onTrack }: {
  flights: FlightState[];
  selectedFlight: FlightState | null;
  onTrack: (icao24: string | null) => void;
}) {
  const chimedRef = useRef(new Set<string>());
  useEffect(() => {
    const fresh = flights.filter(f => !chimedRef.current.has(f.icao24));
    if (fresh.length === 0) return;
    fresh.forEach(f => chimedRef.current.add(f.icao24));
    playChime();
  }, [flights]);

  const primary = flights[0];
  const typeName = wellKnownAircraftName(primary.icao24) ?? (primary.aircraftType ? (aircraftTypeName(primary.aircraftType) ?? primary.aircraftType) : null);
  const isTracking = primary.icao24 === selectedFlight?.icao24;

  return (
    <div className="flex-shrink-0 rounded-xl border border-violet-400/60 bg-black overflow-hidden">
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
          </span>
          <span className="text-[10px] font-bold text-violet-300 uppercase tracking-[0.2em] font-mono flex-1">
            Worth a look{flights.length > 1 ? ` (${flights.length})` : ''}
          </span>
        </div>
        <div className="text-sm font-semibold text-violet-200 truncate">{primary.notable}</div>
        <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">
          {primary.callsign ?? primary.icao24.toUpperCase()}{typeName && <span className="font-sans"> · {typeName}</span>} · {primary.distanceMiles.toFixed(1)} mi
        </div>
        {flights.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {flights.slice(1).map(f => (
              <button key={f.icao24} onClick={() => onTrack(f.icao24)} className="text-[10px] font-mono text-violet-500 hover:text-violet-300" title={f.notable ?? undefined}>
                {f.callsign ?? f.icao24.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => onTrack(isTracking ? null : primary.icao24)}
          className={`mt-2 w-full text-[11px] font-mono font-bold px-3 py-1.5 rounded border uppercase tracking-[0.15em] ${
            isTracking ? 'bg-violet-500/20 border-violet-400/60 text-violet-200' : 'bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20 hover:text-violet-200'
          }`}
        >
          {isTracking ? '✓  Tracking' : '⊕  Track'}
        </button>
      </div>
    </div>
  );
}
