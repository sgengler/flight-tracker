import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { FlightState } from '../types';
import { aircraftTypeName, wellKnownAircraftName } from '../utils';

// Aircraft declaring an emergency: squawking 7700 / 7600 / 7500, or broadcasting
// an emergency status. Shows a full-screen alert when one first appears, then a
// sidebar widget for as long as it lasts.

const SQUAWK_MEANING: Record<string, string> = {
  '7700': 'General emergency',
  '7600': 'Lost radio contact',
  '7500': 'Hijack code',
};

const STATUS_MEANING: Record<string, string> = {
  general: 'General emergency',
  minfuel: 'Low fuel',
  nordo: 'Lost radio contact',
  unlawful: 'Hijack code',
  downed: 'Aircraft down',
  // 'lifeguard' (medical priority) and 'reserved' aren't emergencies
};

// A single report can carry a garbled squawk; require it on consecutive updates.
const CONFIRM_UPDATES = 2;
const TAKEOVER_S = 20;

export function emergencyReason(f: FlightState): string | null {
  if (f.squawk && SQUAWK_MEANING[f.squawk]) return SQUAWK_MEANING[f.squawk];
  if (f.emergency && STATUS_MEANING[f.emergency]) return STATUS_MEANING[f.emergency];
  return null;
}

// Flights whose emergency has been seen on CONFIRM_UPDATES consecutive updates.
export function useEmergencies(flights: FlightState[]): FlightState[] {
  const streaksRef = useRef(new Map<string, number>());
  return useMemo(() => {
    const next = new Map<string, number>();
    const confirmed: FlightState[] = [];
    for (const f of flights) {
      if (!emergencyReason(f)) continue;
      const streak = (streaksRef.current.get(f.icao24) ?? 0) + 1;
      next.set(f.icao24, streak);
      if (streak >= CONFIRM_UPDATES) confirmed.push(f);
    }
    streaksRef.current = next;
    return confirmed;
  }, [flights]);
}

function playAlarm() {
  try {
    const ctx = new AudioContext();
    // Two-tone hi-lo, three times
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = i % 2 === 0 ? 960 : 640;
      const t = ctx.currentTime + i * 0.32;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
      gain.gain.setValueAtTime(0.12, t + 0.26);
      gain.gain.linearRampToValueAtTime(0, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.32);
    }
  } catch { /* AudioContext blocked by browser */ }
}

function describe(f: FlightState) {
  const typeName = wellKnownAircraftName(f.icao24) ?? (f.aircraftType ? (aircraftTypeName(f.aircraftType) ?? f.aircraftType) : null);
  const route = f.route ? `${f.route.originCity} → ${f.route.destinationCity}` : null;
  return { typeName, route, ident: f.callsign ?? f.registration ?? f.icao24.toUpperCase() };
}

export function EmergencyAlert({ flights, selectedFlight, onTrack, allowTakeover, controls }: {
  flights: FlightState[];
  selectedFlight: FlightState | null;
  onTrack: (icao24: string | null) => void;
  allowTakeover: boolean;
  controls?: ReactNode;
}) {
  const primary = flights[0];
  const [takeoverIcao, setTakeoverIcao] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(TAKEOVER_S);
  const announcedRef = useRef(new Set<string>());

  // Take over the screen once per aircraft, the first time it's confirmed
  useEffect(() => {
    const fresh = flights.find(f => !announcedRef.current.has(f.icao24));
    if (!fresh) return;
    announcedRef.current.add(fresh.icao24);
    if (!allowTakeover) return;
    setTakeoverIcao(fresh.icao24);
    setCountdown(TAKEOVER_S);
    playAlarm();
  }, [flights, allowTakeover]);

  useEffect(() => {
    if (!takeoverIcao) return;
    const id = setInterval(() => setCountdown(c => {
      if (c <= 1) { setTakeoverIcao(null); return 0; }
      return c - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [takeoverIcao]);

  const takeoverFlight = takeoverIcao ? flights.find(f => f.icao24 === takeoverIcao) : undefined;
  if (takeoverFlight) {
    const { typeName, route, ident } = describe(takeoverFlight);
    return (
      <div className="topgun-overlay fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center overflow-hidden select-none">
        <div className="absolute inset-0 pointer-events-none emergency-pulse" />
        <div className="relative flex flex-col items-center gap-3 px-8 py-6 max-w-md w-full text-center">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            <span className="topgun-blink text-xs font-black text-red-400 uppercase tracking-[0.35em] font-mono">Emergency</span>
          </div>
          {takeoverFlight.squawk && SQUAWK_MEANING[takeoverFlight.squawk] && (
            <div className="text-7xl font-black text-red-500 font-mono tracking-widest leading-none">{takeoverFlight.squawk}</div>
          )}
          <div className="text-xl font-bold text-red-300 uppercase tracking-wider">{emergencyReason(takeoverFlight)}</div>
          <div className="text-2xl font-bold text-white font-mono">{ident}</div>
          <div className="text-sm text-slate-300">
            {[typeName, route].filter(Boolean).join(' · ')}
          </div>
          <div className="text-sm text-red-400 font-mono">{takeoverFlight.distanceMiles.toFixed(1)} mi away</div>
          <div className="flex gap-3 w-full mt-2">
            <button
              onClick={() => { onTrack(takeoverFlight.icao24); setTakeoverIcao(null); }}
              className="flex-1 text-sm font-mono font-black px-4 py-3 rounded border border-red-400/70 bg-red-500/15 text-red-300 hover:bg-red-500/30 uppercase tracking-[0.2em]"
            >
              ⊕ Track
            </button>
            <button
              onClick={() => setTakeoverIcao(null)}
              className="flex-1 text-sm font-mono font-black px-4 py-3 rounded border border-red-900/60 text-red-700 hover:text-red-500 uppercase tracking-[0.2em]"
            >
              Dismiss
            </button>
          </div>
          <div className="w-full h-1 bg-red-950/60 rounded-full overflow-hidden">
            <div className="h-full bg-red-600/70 transition-all duration-1000 ease-linear" style={{ width: `${(countdown / TAKEOVER_S) * 100}%` }} />
          </div>
        </div>
      </div>
    );
  }

  const { typeName, ident } = describe(primary);
  const isTracking = primary.icao24 === selectedFlight?.icao24;
  return (
    <div className="flex-shrink-0 rounded-xl border border-red-500/70 bg-black overflow-hidden">
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-[0.2em] font-mono flex-1">
            Emergency{flights.length > 1 ? ` (${flights.length})` : ''}
          </span>
          {primary.squawk && SQUAWK_MEANING[primary.squawk] && (
            <span className="text-xs font-black text-red-500 font-mono">{primary.squawk}</span>
          )}
          {controls}
        </div>
        <div className="text-sm font-bold text-white font-mono truncate">{ident}{typeName && <span className="font-sans font-normal text-slate-400"> · {typeName}</span>}</div>
        <div className="text-xs text-red-300 mt-0.5">{emergencyReason(primary)} · {primary.distanceMiles.toFixed(1)} mi</div>
        {flights.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {flights.slice(1).map(f => (
              <button key={f.icao24} onClick={() => onTrack(f.icao24)} className="text-[10px] font-mono text-red-600 hover:text-red-400">
                {f.callsign ?? f.icao24.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => onTrack(isTracking ? null : primary.icao24)}
          className={`mt-2 w-full text-[11px] font-mono font-bold px-3 py-1.5 rounded border uppercase tracking-[0.15em] ${
            isTracking ? 'bg-red-500/20 border-red-400/60 text-red-300' : 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20 hover:text-red-300'
          }`}
        >
          {isTracking ? '✓  Tracking' : '⊕  Track'}
        </button>
      </div>
    </div>
  );
}
