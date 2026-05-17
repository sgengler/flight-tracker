import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FlightState, RouteInfo, AircraftWikiInfo } from '../types';
import { metersToFeet, msToMph, bearingToCardinal, headingToCardinal, aircraftTypeName, wellKnownAircraftName, getCountryFromIcao } from '../utils';
import { categorizeAircraft, getAircraftSvgInfo } from './FlightMap';

interface Props {
  flight: FlightState;
  info: { photoUrl: string | null; photoUrlLarge?: string | null; wikiInfo?: AircraftWikiInfo | null; wikiTitle?: string | null; wikiExtract?: string | null } | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  militaryMode?: boolean;
}

function StatBox({ label, value, colorClass = 'text-white' }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="bg-slate-900/60 rounded-lg px-2 py-1.5 overflow-hidden">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-xs font-mono font-medium whitespace-nowrap ${colorClass}`}>{value}</div>
    </div>
  );
}


function CompactStat({ label, value, colorClass = 'text-white' }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="px-3 py-2">
      <div className="text-xs text-slate-500 uppercase tracking-wider leading-none mb-1">{label}</div>
      <div className={`text-sm font-mono font-medium truncate ${colorClass}`}>{value}</div>
    </div>
  );
}

export function FlightCard({ flight, info, isFullscreen = false, onToggleFullscreen, militaryMode = false }: Props) {
  const [loadedPhotoUrl, setLoadedPhotoUrl] = useState<string | null>(null);
  const [refreshedRoute, setRefreshedRoute] = useState<RouteInfo | null | undefined>(undefined); // undefined = not yet refreshed
  const [routeRefreshing, setRouteRefreshing] = useState(false);
  const [showWikiInfo, setShowWikiInfo] = useState(false);
  // Reset local route override whenever the flight changes
  const flightKey = `${flight.icao24}:${flight.callsign ?? ''}`;
  const prevFlightKeyRef = useRef(flightKey);
  if (prevFlightKeyRef.current !== flightKey) {
    prevFlightKeyRef.current = flightKey;
    setRefreshedRoute(undefined);
    setShowWikiInfo(false);
  }

  async function refreshRoute() {
    if (!flight.callsign || routeRefreshing) return;
    setRouteRefreshing(true);
    try {
      const res = await fetch(`/api/route/refresh?icao24=${flight.icao24}&callsign=${encodeURIComponent(flight.callsign)}`, { method: 'POST' });
      const data = await res.json() as { route: RouteInfo | null };
      setRefreshedRoute(data.route);
    } catch {
      // leave existing route intact on error
    } finally {
      setRouteRefreshing(false);
    }
  }

  const displayRoute = refreshedRoute !== undefined ? refreshedRoute : flight.route;
  const photoUrl = (isFullscreen ? (info?.photoUrlLarge ?? info?.photoUrl) : info?.photoUrl) ?? null;
  const imgRef = useRef<HTMLImageElement>(null);
  // Handle cached images that fire onLoad before React renders
  useEffect(() => {
    if (photoUrl && imgRef.current?.complete) setLoadedPhotoUrl(photoUrl);
  });
  const photoVisible = loadedPhotoUrl === photoUrl && photoUrl !== null;
  // Keep old image in DOM while new one loads so the container height doesn't collapse
  const renderUrl = photoUrl ?? loadedPhotoUrl;
  const alt = flight.baroAltitude != null
    ? `${metersToFeet(flight.baroAltitude).toLocaleString()} ft` : '—';
  const geoAlt = flight.geoAltitude != null
    ? `${metersToFeet(flight.geoAltitude).toLocaleString()} ft` : '—';
  const speed = flight.velocity != null
    ? `${msToMph(flight.velocity).toLocaleString()} mph` : '—';
  const heading = flight.trueTrack != null
    ? `${Math.round(flight.trueTrack)}° ${headingToCardinal(flight.trueTrack)}` : '—';

  const isLevel = flight.verticalRate == null || Math.abs(flight.verticalRate) < 1;
  const isClimbing = !isLevel && flight.verticalRate! > 0;
  const vrate = isLevel
    ? 'Level'
    : `${isClimbing ? '+' : ''}${metersToFeet(flight.verticalRate!).toLocaleString()} fpm`;
  const vrateIcon = isLevel ? '' : isClimbing ? ' ↑' : ' ↓';
  const vrateColor = isLevel ? 'text-slate-300' : isClimbing ? 'text-emerald-400' : 'text-rose-400';

  const direction = bearingToCardinal(flight.bearingDeg);
  const bearing = `${Math.round(flight.bearingDeg)}° ${direction}`;
  const svgInfo = getAircraftSvgInfo(categorizeAircraft(flight.aircraftType));
  const displayName = flight.callsign ?? flight.icao24.toUpperCase();
  const country = militaryMode ? getCountryFromIcao(flight.icao24) : null;

  const wikiEntries = info?.wikiInfo ? Object.entries(info.wikiInfo) : [];
  const hasWikiContent = wikiEntries.length > 0 || !!info?.wikiExtract;
  const wikiModal = showWikiInfo && hasWikiContent ? createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6" onClick={() => setShowWikiInfo(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <div className="text-sm font-bold text-white">{info?.wikiTitle ?? displayName}</div>
            {info?.wikiTitle && <div className="text-xs text-slate-400">{displayName}</div>}
          </div>
          <button onClick={() => setShowWikiInfo(false)} className="text-slate-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>
        {info?.wikiExtract && (
          <p className="px-4 py-3 text-xs text-slate-300 leading-relaxed border-b border-white/10">{info.wikiExtract}</p>
        )}
        <div className="p-3 grid grid-cols-3 gap-1.5">
          {wikiEntries.map(([key, value]) => (
            <div key={key} className="bg-slate-800/60 rounded-lg px-2 py-1.5">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider leading-none mb-0.5">{key}</div>
              <div className="text-xs font-mono text-white">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  if (isFullscreen) {
    return (
      <>
      <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10 h-full relative bg-gradient-to-br from-slate-700 to-slate-900">

        {/* Photo — fills entire card */}
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${photoVisible ? 'opacity-0' : 'opacity-100'}`}>
          <span className="text-8xl opacity-20 select-none" style={{ transform: `rotate(${(flight.trueTrack ?? 45) - 90}deg)` }}>✈</span>
        </div>
        {renderUrl && (
          <img
            ref={imgRef}
            src={renderUrl}
            alt="Aircraft"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${photoVisible ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoadedPhotoUrl(renderUrl)}
          />
        )}

        {/* Gradient — deepened to cover all bottom content */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/70 via-[35%] to-transparent to-[65%]" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-transparent to-[12%]" />

        {/* Top-left buttons */}
        <div className="absolute top-3 left-3 flex items-center gap-1">
          {onToggleFullscreen && (
            <button onClick={onToggleFullscreen} className="p-1.5 rounded text-white hover:bg-white/10 transition-colors" title="Exit fullscreen">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M3.5 0H5v5H0V3.5h3.5V0zM7 0h1.5v3.5H12V5H7V0zM0 7h5v5H3.5V8.5H0V7zm7 0h5v1.5H8.5V12H7V7z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Top-right: info button */}
        {hasWikiContent && (
          <button onClick={() => setShowWikiInfo(v => !v)} className={`absolute top-3 right-3 p-1.5 rounded transition-colors ${showWikiInfo ? 'text-white bg-white/20' : 'text-white hover:bg-white/10'}`} title="Aircraft info">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm0 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zM5 5h2v4H5V5z"/>
            </svg>
          </button>
        )}


        {/* Bottom overlay — all flight data */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">

          {/* Identity row */}
          <div className="flex items-center gap-2.5 mb-1">
            <div className="text-3xl font-bold text-white tracking-wide leading-tight">{displayName}</div>
            {flight.callsign && (
              <a href={`https://www.flightradar24.com/${flight.callsign.trim()}`} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-400 hover:text-sky-300 underline underline-offset-2">FR24 ↗</a>
            )}
            <div className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-sky-300 flex-shrink-0">
              {flight.trueTrack != null && (
                <svg width="22" height="22" viewBox="-28 -28 56 56" fill="currentColor" className="flex-shrink-0 drop-shadow"
                     style={{ transform: `rotate(${svgInfo.rotates ? flight.trueTrack : 0}deg)`, transformOrigin: 'center' }}>
                  <path d={svgInfo.path} />
                </svg>
              )}
              {flight.distanceMiles.toFixed(1)} mi {direction}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-200 font-mono flex-wrap mb-3">
            {country && <><span className="text-base leading-none not-italic">{country.flag}</span><span className="font-sans not-italic text-slate-200">{country.name}</span><span className="text-slate-500">·</span></>}
            <span>{flight.icao24.toUpperCase()}</span>
            {flight.aircraftType && <span className="not-italic font-sans text-slate-200"> · {wellKnownAircraftName(flight.icao24) ?? aircraftTypeName(flight.aircraftType) ?? flight.aircraftType}</span>}
            {flight.isPolice && <span className="not-italic font-sans text-blue-300"> · Police</span>}
          </div>

          {/* Route */}
          {displayRoute && (
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-sm font-bold text-white">{displayRoute.origin}</span>
              <span className="text-sm text-slate-200 truncate">{displayRoute.originCity}</span>
              <div className="flex items-center gap-0.5 text-sky-500 flex-shrink-0 text-sm">
                <div className="w-4 h-px bg-sky-500/40" />
                <span>✈</span>
                <div className="w-4 h-px bg-sky-500/40" />
              </div>
              <span className="font-mono text-sm font-bold text-white">{displayRoute.destination}</span>
              <span className="text-sm text-slate-200 truncate">{displayRoute.destinationCity}</span>
              {displayRoute.airline && <span className="text-sm text-slate-400 flex-shrink-0 ml-auto">· {displayRoute.airline}</span>}
              {flight.callsign && (
                <button onClick={refreshRoute} disabled={routeRefreshing} className="text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-40 flex-shrink-0" title="Refresh route">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={routeRefreshing ? 'animate-spin' : ''}>
                    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Unified stats card */}
          <div className="bg-slate-900/75 rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-white/5">
              <CompactStat label="Baro Alt" value={alt} />
              <CompactStat label="Speed" value={speed} />
              <CompactStat label="Heading" value={heading} />
              <CompactStat label="V/S" value={vrate + vrateIcon} colorClass={vrateColor} />
              <CompactStat label="Geo Alt" value={geoAlt} />
              <CompactStat label="Bearing" value={bearing} />
            </div>
          </div>
        </div>

      </div>
      {wikiModal}
      </>
    );
  }

  return (
    <>
    <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10">

      {/* ── Photo / Header ── */}
      <div className="relative bg-gradient-to-br from-slate-700 to-slate-900 overflow-hidden">
        {/* Placeholder — fades out once image is ready, provides height when no image */}
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${photoVisible ? 'opacity-0' : 'opacity-100'}`}>
          <span className="text-5xl opacity-20 select-none" style={{ transform: `rotate(${(flight.trueTrack ?? 45) - 90}deg)` }}>✈</span>
        </div>
        {renderUrl ? (
          <img
            ref={imgRef}
            src={renderUrl}
            alt="Aircraft"
            className={`w-full h-auto block transition-opacity duration-500 ${photoVisible ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoadedPhotoUrl(renderUrl)}
          />
        ) : (
          <div className="w-full min-h-28" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 via-[20%] to-transparent to-[50%]" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-transparent to-[12%]" />
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-2">
          <div className="flex items-baseline gap-2">
            <div className="text-lg font-bold text-white tracking-wide leading-tight">{displayName}</div>
            {flight.callsign && (
              <a href={`https://www.flightradar24.com/${flight.callsign.trim()}`} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-400 hover:text-sky-300 underline underline-offset-2">FR24 ↗</a>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono flex-wrap">
            {country && <><span className="text-base leading-none not-italic">{country.flag}</span><span className="font-sans not-italic text-slate-400">{country.name}</span><span className="text-slate-600">·</span></>}
            <span>{flight.icao24.toUpperCase()}</span>
            {flight.aircraftType && <span className="not-italic font-sans text-slate-300"> · {wellKnownAircraftName(flight.icao24) ?? aircraftTypeName(flight.aircraftType) ?? flight.aircraftType}</span>}
          </div>
        </div>
        {/* Bottom-right: aircraft icon + distance/direction */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs font-semibold text-sky-300 drop-shadow">
          {flight.trueTrack != null && (
            <svg width="22" height="22" viewBox="-28 -28 56 56" fill="currentColor" className="flex-shrink-0"
                 style={{ transform: `rotate(${svgInfo.rotates ? flight.trueTrack : 0}deg)`, transformOrigin: 'center' }}>
              <path d={svgInfo.path} />
            </svg>
          )}
          {flight.distanceMiles.toFixed(1)} mi {direction}
        </div>

        <div className="absolute top-2 left-2 flex items-center gap-1">
          {onToggleFullscreen && (
            <button onClick={onToggleFullscreen} className="p-1 rounded text-white hover:bg-white/10 transition-colors" title="Expand">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M0 0h4v1.5H1.5V4H0V0zm8 0h4v4h-1.5V1.5H8V0zM0 8h1.5v2.5H4V12H0V8zm10.5 2.5V8H12v4H8v-1.5h2.5z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Top-right: info button */}
        {hasWikiContent && (
          <button onClick={() => setShowWikiInfo(v => !v)} className={`absolute top-2 right-2 p-1 rounded transition-colors ${showWikiInfo ? 'text-white bg-white/20' : 'text-white hover:bg-white/10'}`} title="Aircraft info">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm0 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zM5 5h2v4H5V5z"/>
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
    {wikiModal}
    </>
  );
}
