import { useEffect, useState } from 'react';
import { aircraftTypeName, metersToFeet, msToMph } from '../utils';
import { airlineName } from '../airlines';
import { AirlineLogo } from './AirlineLogo';

// Highlights of everything seen from home today (server: sightings.ts).

interface Sighting {
  icao24: string; callsign: string | null; type: string | null; registration: string | null;
  operator: string | null; origin: string | null; destination: string | null; seenAt: number;
}

interface TodaySummary {
  aircraft: number;
  types: number;
  airlines: Array<{ code: string; count: number }>;
  closest: (Sighting & { miles: number }) | null;
  highest: (Sighting & { altitude: number }) | null;
  fastest: (Sighting & { speed: number }) | null;
  oldest: (Sighting & { year: number }) | null;
  farthestOrigin: (Sighting & { miles: number }) | null;
  rarest: (Sighting & { daysSeen: number }) | null;
  notable: Array<Sighting & { reason: string }>;
  hourly: number[];
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}


function label(s: Sighting): string {
  const type = s.type ? (aircraftTypeName(s.type) ?? s.type) : null;
  return [s.callsign ?? s.registration ?? s.icao24.toUpperCase(), type].filter(Boolean).join(' · ');
}

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function Highlight({ title, value, sighting, onSelect }: { title: string; value: string; sighting: Sighting; onSelect: (icao24: string) => void }) {
  return (
    <button onClick={() => onSelect(sighting.icao24)} className="text-left rounded-lg bg-slate-900/60 border border-white/5 px-2.5 py-1.5 hover:bg-slate-800/80 min-w-0">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{title}</div>
      <div className="text-sm font-mono font-semibold text-white truncate">{value}</div>
      <div className="text-[11px] text-slate-400 truncate">{label(sighting)}</div>
    </button>
  );
}

export function TodayTab({ lat, lon, onSelect }: { lat: number; lon: number; onSelect: (icao24: string) => void }) {
  const [data, setData] = useState<TodaySummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch(`/api/sightings/today?since=${startOfToday()}&lat=${lat}&lon=${lon}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: TodaySummary | null) => { if (!cancelled && d) setData(d); })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [lat, lon]);

  if (!data) return <div className="px-3 py-3 text-xs text-slate-500">Loading…</div>;
  if (data.aircraft === 0) return <div className="px-3 py-3 text-xs text-slate-500">Nothing logged yet today.</div>;

  const maxHour = Math.max(...data.hourly, 1);
  const busiest = data.hourly.indexOf(Math.max(...data.hourly));

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-slate-900/60 border border-white/5 px-2.5 py-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Aircraft</div>
          <div className="text-xl font-mono font-semibold text-white">{data.aircraft.toLocaleString()}</div>
        </div>
        <div className="rounded-lg bg-slate-900/60 border border-white/5 px-2.5 py-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Types</div>
          <div className="text-xl font-mono font-semibold text-white">{data.types}</div>
        </div>
        <div className="rounded-lg bg-slate-900/60 border border-white/5 px-2.5 py-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Busiest hour</div>
          <div className="text-xl font-mono font-semibold text-white">
            {new Date(startOfToday() + busiest * 3_600_000).toLocaleTimeString([], { hour: 'numeric' })}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-end gap-px h-10">
          {data.hourly.map((n, i) => (
            <div key={i} className="flex-1 bg-sky-500/60 rounded-t-sm" style={{ height: `${Math.max(4, (n / maxHour) * 100)}%` }} title={`${n} aircraft`} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
          <span>12am</span><span>now</span>
        </div>
      </div>

      {data.notable.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notable today</div>
          <div className="flex flex-col gap-1">
            {data.notable.map(n => (
              <button key={n.icao24} onClick={() => onSelect(n.icao24)} className="text-left flex items-baseline gap-2 text-xs rounded-md px-2 py-1 bg-violet-500/10 border border-violet-400/20 hover:bg-violet-500/20 min-w-0">
                <span className="text-violet-300 font-semibold flex-shrink-0">{n.reason}</span>
                <span className="text-slate-400 truncate">{label(n)}</span>
                <span className="text-slate-500 font-mono ml-auto flex-shrink-0">{time(n.seenAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {data.closest && <Highlight title="Closest pass" value={`${data.closest.miles.toFixed(1)} mi`} sighting={data.closest} onSelect={onSelect} />}
        {data.highest && <Highlight title="Highest" value={`${metersToFeet(data.highest.altitude).toLocaleString()} ft`} sighting={data.highest} onSelect={onSelect} />}
        {data.fastest && <Highlight title="Fastest" value={`${Math.round(msToMph(data.fastest.speed))} mph`} sighting={data.fastest} onSelect={onSelect} />}
        {data.oldest && <Highlight title="Oldest airframe" value={`Built ${data.oldest.year}`} sighting={data.oldest} onSelect={onSelect} />}
        {data.farthestOrigin && <Highlight title="Came farthest" value={`${data.farthestOrigin.origin} · ${Math.round(data.farthestOrigin.miles).toLocaleString()} mi`} sighting={data.farthestOrigin} onSelect={onSelect} />}
        {data.rarest && <Highlight title="Rarest type" value={data.rarest.daysSeen === 0 ? 'First seen here' : `Seen ${data.rarest.daysSeen} day${data.rarest.daysSeen === 1 ? '' : 's'}`} sighting={data.rarest} onSelect={onSelect} />}
      </div>

      {data.airlines.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Top airlines</div>
          {data.airlines.map(a => (
            <div key={a.code} className="flex items-center gap-2 text-xs py-0.5">
              <span className="w-24 flex-shrink-0 flex"><AirlineLogo code={a.code} height={14} /></span>
              <span className="text-slate-400 truncate flex-1">{airlineName(a.code) ?? a.code}</span>
              <span className="font-mono text-white">{a.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
