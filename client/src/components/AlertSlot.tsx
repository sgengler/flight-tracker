import { ReactNode, useEffect, useRef, useState } from 'react';

// Wraps a sidebar alert so it can get out of the flight card's way. An alert opens
// in full when a new aircraft sets it off, shrinks to a one-line banner after
// AUTO_MINIMIZE_MS (the kiosk is often unattended), and can be minimized or
// dismissed by hand. Dismissed alerts come back when a different aircraft triggers
// them. A quiet alert (for things that are around all the time, like military
// traffic) never opens by itself — it stays a banner until tapped. The alert stays mounted while minimized or dismissed so its own state (which
// aircraft it already announced, sounds) survives.

const AUTO_MINIMIZE_MS = 30_000;

type Tone = 'red' | 'amber' | 'violet' | 'orange' | 'blue' | 'green';

const TONES: Record<Tone, { border: string; dot: string; text: string; button: string }> = {
  red:    { border: 'border-red-500/70',    dot: 'bg-red-500',    text: 'text-red-200',    button: 'text-red-400 hover:text-red-200' },
  amber:  { border: 'border-amber-500/60',  dot: 'bg-amber-400',  text: 'text-amber-200',  button: 'text-amber-500 hover:text-amber-200' },
  violet: { border: 'border-violet-400/60', dot: 'bg-violet-400', text: 'text-violet-200', button: 'text-violet-400 hover:text-violet-200' },
  orange: { border: 'border-orange-400/60', dot: 'bg-orange-400', text: 'text-orange-200', button: 'text-orange-400 hover:text-orange-200' },
  blue:   { border: 'border-blue-400/50',   dot: 'bg-blue-400',   text: 'text-blue-200',   button: 'text-blue-400 hover:text-blue-200' },
  green:  { border: 'border-green-400/50',  dot: 'bg-green-400',  text: 'text-green-200',  button: 'text-green-400 hover:text-green-200' },
};

function IconButton({ label, onClick, className, children }: { label: string; onClick: () => void; className: string; children: ReactNode }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={label}
      aria-label={label}
      className={`w-[30px] h-[30px] -my-1.5 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/15 active:bg-white/20 transition-colors flex-shrink-0 ${className}`}
    >
      {children}
    </button>
  );
}

export function AlertSlot({ icaos, tone, summary, forceOpen = false, quiet = false, children }: {
  icaos: string[];                       // aircraft currently setting off this alert
  tone: Tone;
  quiet?: boolean;                       // start and stay minimized; new aircraft don't open it
  summary: ReactNode;                    // the one-line banner text
  forceOpen?: boolean;                   // e.g. while a full-screen takeover is showing
  children: (controls: ReactNode) => ReactNode; // the full alert; put `controls` in its header row
}) {
  const [mode, setMode] = useState<'open' | 'minimized' | 'dismissed'>(quiet ? 'minimized' : 'open');
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const seenRef = useRef(new Set<string>());

  // A new aircraft reopens the alert
  const key = [...icaos].sort().join(',');
  useEffect(() => {
    const fresh = icaos.some(i => !seenRef.current.has(i));
    icaos.forEach(i => seenRef.current.add(i));
    if (!fresh) return;
    if (quiet) setMode(m => (m === 'dismissed' ? 'minimized' : m));
    else { setMode('open'); setOpenedAt(Date.now()); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'open' || forceOpen) return;
    const t = setTimeout(() => setMode('minimized'), Math.max(0, openedAt + AUTO_MINIMIZE_MS - Date.now()));
    return () => clearTimeout(t);
  }, [mode, openedAt, forceOpen]);

  const t = TONES[tone];
  const open = forceOpen || mode === 'open';
  const controls = (
    <span className="flex items-center gap-1.5 ml-auto flex-shrink-0">
      <IconButton label="Minimize" onClick={() => setMode('minimized')} className={t.button}>
        <svg width="14" height="14" viewBox="0 0 10 10"><path d="M2 5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      </IconButton>
      <IconButton label="Dismiss" onClick={() => setMode('dismissed')} className={t.button}>
        <svg width="14" height="14" viewBox="0 0 10 10"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      </IconButton>
    </span>
  );

  return (
    <>
      <div className={open ? 'flex-shrink-0' : 'hidden'}>{children(controls)}</div>
      {!open && mode === 'minimized' && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => { setMode('open'); setOpenedAt(Date.now()); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setMode('open'); setOpenedAt(Date.now()); } }}
          className={`flex-shrink-0 w-full flex items-center gap-2 rounded-xl border ${t.border} bg-black pl-3 pr-1.5 py-2 text-left cursor-pointer hover:bg-white/5 transition-colors`}
          title="Show alert"
        >
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${t.dot}`} />
          <span className={`text-xs font-semibold truncate ${t.text}`}>{summary}</span>
          <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <span className={`w-[30px] h-[30px] -my-1.5 flex items-center justify-center ${t.button}`} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 10 10"><path d="M2.5 6.5L5 4l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <IconButton label="Dismiss" onClick={() => setMode('dismissed')} className={t.button}>
              <svg width="14" height="14" viewBox="0 0 10 10"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
            </IconButton>
          </span>
        </div>
      )}
    </>
  );
}
