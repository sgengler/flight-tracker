import { FlightState } from '../types';
import { metersToFeet, msToKnots, bearingToCardinal, headingToCardinal, aircraftTypeName } from '../utils';

interface Props {
  flight: FlightState;
  info: { photoUrl: string | null } | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

function StatBox({ label, value, colorClass = 'text-white' }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="bg-slate-900/60 rounded-lg px-2 py-1.5">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-xs font-mono font-medium ${colorClass}`}>{value}</div>
    </div>
  );
}

function BigStatBox({ label, value, colorClass = 'text-white' }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="bg-slate-900/60 rounded-xl px-3 py-2.5">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-mono font-semibold ${colorClass}`}>{value}</div>
    </div>
  );
}

export function FlightCard({ flight, info, isFullscreen = false, onToggleFullscreen }: Props) {
  const alt = flight.baroAltitude != null
    ? `${metersToFeet(flight.baroAltitude).toLocaleString()} ft` : '—';
  const geoAlt = flight.geoAltitude != null
    ? `${metersToFeet(flight.geoAltitude).toLocaleString()} ft` : '—';
  const speed = flight.velocity != null
    ? `${msToKnots(flight.velocity).toLocaleString()} kts` : '—';
  const heading = flight.trueTrack != null
    ? `${Math.round(flight.trueTrack)}° ${headingToCardinal(flight.trueTrack)}` : '—';

  const isLevel = flight.verticalRate == null || Math.abs(flight.verticalRate) < 1;
  const isClimbing = !isLevel && flight.verticalRate! > 0;
  const vrate = isLevel
    ? 'Level'
    : `${isClimbing ? '+' : ''}${metersToFeet(flight.verticalRate!).toLocaleString()} ft/min`;
  const vrateIcon = isLevel ? '' : isClimbing ? ' ↑' : ' ↓';
  const vrateColor = isLevel ? 'text-slate-300' : isClimbing ? 'text-emerald-400' : 'text-rose-400';

  const direction = bearingToCardinal(flight.bearingDeg);
  const bearing = `${Math.round(flight.bearingDeg)}° ${direction}`;
  const coords = `${flight.latitude.toFixed(4)}°, ${flight.longitude.toFixed(4)}°`;
  const displayName = flight.callsign ?? flight.icao24.toUpperCase();

  if (isFullscreen) {
    return (
      <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10 h-full flex">

        {/* Left — all flight info */}
        <div className="flex flex-col justify-between px-4 py-3 bg-slate-800/80 w-[42%] flex-shrink-0 min-h-0">

          {/* Callsign + identifiers */}
          <div>
            {onToggleFullscreen && (
              <button onClick={onToggleFullscreen} className="p-1 mb-1 rounded text-slate-500 hover:text-slate-300 hover:bg-white/10 transition-colors self-start" title="Exit fullscreen">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M3.5 0H5v5H0V3.5h3.5V0zM7 0h1.5v3.5H12V5H7V0zM0 7h5v5H3.5V8.5H0V7zm7 0h5v1.5H8.5V12H7V7z"/>
                </svg>
              </button>
            )}
            <div className="flex items-baseline gap-2 mb-0.5">
              <div className="text-2xl font-bold text-white tracking-wide leading-tight">{displayName}</div>
              {flight.callsign && (
                <a href={`https://www.flightradar24.com/${flight.callsign.trim()}`} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:text-sky-300 underline underline-offset-2">FR24 ↗</a>
              )}
            </div>
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-xs text-slate-400 font-mono">{flight.icao24.toUpperCase()}</span>
              {flight.aircraftType && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                  {aircraftTypeName(flight.aircraftType) ?? flight.aircraftType}
                </span>
              )}
              {flight.isPolice && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">Police</span>
              )}
            </div>

            {/* Route */}
            {flight.route ? (
              <div className="mb-3">
                {flight.route.airline && (
                  <div className="text-xs text-slate-500 mb-1.5">{flight.route.airline}</div>
                )}
                <div className="flex items-center gap-2">
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-white font-mono tracking-wide">{flight.route.origin}</div>
                    <div className="text-xs text-slate-400 truncate">{flight.route.originCity}</div>
                  </div>
                  <div className="flex items-center gap-0.5 text-sky-500 flex-shrink-0 text-xs">
                    <div className="w-3 h-px bg-sky-500/40" />
                    <span>✈</span>
                    <div className="w-3 h-px bg-sky-500/40" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-white font-mono tracking-wide">{flight.route.destination}</div>
                    <div className="text-xs text-slate-400 truncate">{flight.route.destinationCity}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-600 italic mb-3">No route data</div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-1.5">
            <BigStatBox label="Baro Alt" value={alt} />
            <BigStatBox label="Speed" value={speed} />
            <BigStatBox label="Heading" value={heading} />
            <BigStatBox label="V/S" value={vrate + vrateIcon} colorClass={vrateColor} />
            <BigStatBox label="Geo Alt" value={geoAlt} />
            <BigStatBox label="Bearing" value={bearing} />
          </div>

          {/* Distance + position */}
          <div className="mt-2 space-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Dist</span>
              <span className="text-lg font-bold text-sky-300">{flight.distanceMiles.toFixed(1)} mi</span>
              <span className="text-sm text-sky-400/70">{direction}</span>
            </div>
            <div className="text-xs font-mono text-slate-500">{coords}</div>
          </div>
        </div>

        {/* Right — photo fills remaining space */}
        <div className="flex-1 min-w-0 bg-gradient-to-br from-slate-700 to-slate-900 relative overflow-hidden">
          {info?.photoUrl ? (
            <img src={info.photoUrl} alt="Aircraft" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-8xl opacity-20 select-none" style={{ transform: `rotate(${(flight.trueTrack ?? 45) - 90}deg)` }}>✈</span>
            </div>
          )}
          {flight.trueTrack != null && (
            <div className="absolute top-3 right-3 text-2xl select-none text-sky-300 drop-shadow" style={{ transform: `rotate(${flight.trueTrack - 90}deg)` }}>✈</div>
          )}
        </div>

      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10">

      {/* ── Photo / Header ── */}
      <div className="relative bg-gradient-to-br from-slate-700 to-slate-900 overflow-hidden">
        {info?.photoUrl ? (
          <img src={info.photoUrl} alt="Aircraft" className="w-full h-auto block" />
        ) : (
          <div className="w-full min-h-28 flex items-center justify-center">
            <span className="text-5xl opacity-20 select-none" style={{ transform: `rotate(${(flight.trueTrack ?? 45) - 90}deg)` }}>✈</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-2">
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-bold text-white tracking-wide leading-tight">{displayName}</div>
            {flight.callsign && (
              <a href={`https://www.flightradar24.com/${flight.callsign.trim()}`} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:text-sky-300 underline underline-offset-2">FR24 ↗</a>
            )}
            <div className="ml-auto text-xs font-semibold text-sky-300">{flight.distanceMiles.toFixed(1)} mi {direction}</div>
          </div>
          <div className="text-xs text-slate-400 font-mono">{flight.icao24.toUpperCase()} · {flight.originCountry}</div>
        </div>
        {flight.trueTrack != null && (
          <div className="absolute top-2 right-2 text-base select-none text-sky-300 drop-shadow" style={{ transform: `rotate(${flight.trueTrack - 90}deg)` }}>✈</div>
        )}
        {onToggleFullscreen && (
          <button onClick={onToggleFullscreen} className="absolute top-2 left-2 p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-white/10 transition-colors" title="Expand">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M0 0h4v1.5H1.5V4H0V0zm8 0h4v4h-1.5V1.5H8V0zM0 8h1.5v2.5H4V12H0V8zm10.5 2.5V8H12v4H8v-1.5h2.5z"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Route ── */}
      {flight.route && (
        <div className="px-3 py-1.5 bg-slate-900/80 border-t border-white/5 flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-xs font-bold text-white flex-shrink-0">{flight.route.origin}</span>
          <span className="text-xs text-slate-500 truncate">{flight.route.originCity}</span>
          <span className="text-sky-500 text-xs flex-shrink-0">→</span>
          <span className="font-mono text-xs font-bold text-white flex-shrink-0">{flight.route.destination}</span>
          <span className="text-xs text-slate-500 truncate">{flight.route.destinationCity}</span>
          {flight.route.airline && <span className="text-xs text-slate-600 flex-shrink-0 ml-auto">· {flight.route.airline}</span>}
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="p-2 bg-slate-800/70 grid grid-cols-4 gap-1.5">
        <StatBox label="Alt" value={alt} />
        <StatBox label="Speed" value={speed} />
        <StatBox label="Hdg" value={heading} />
        <StatBox label="V/S" value={vrate + vrateIcon} colorClass={vrateColor} />
      </div>

    </div>
  );
}
