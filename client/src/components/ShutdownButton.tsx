import { useState, useEffect } from 'react';

type Phase = 'idle' | 'confirm' | 'shutting-down' | 'error';

export function ShutdownButton() {
  const [phase, setPhase] = useState<Phase>('idle');

  // Auto-error if shutdown doesn't happen within 10s
  useEffect(() => {
    if (phase !== 'shutting-down') return;
    const t = setTimeout(() => setPhase('error'), 10_000);
    return () => clearTimeout(t);
  }, [phase]);

  async function handleConfirm() {
    setPhase('shutting-down');
    try {
      await fetch('/api/shutdown', { method: 'POST' });
    } catch {
      setPhase('error');
    }
  }

  if (phase === 'shutting-down') {
    return <span className="text-xs text-slate-500">Shutting down…</span>;
  }

  if (phase === 'error') {
    return (
      <span className="text-xs text-red-500 cursor-pointer" onClick={() => setPhase('idle')}>
        Shutdown failed — tap to dismiss
      </span>
    );
  }

  if (phase === 'confirm') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-400">Shut down Pi?</span>
        <button
          onClick={() => setPhase('idle')}
          className="text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          className="text-xs px-2 py-0.5 rounded border border-red-700 text-red-400 hover:bg-red-900/30 transition-colors"
        >
          Confirm
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setPhase('confirm')}
      title="Shutdown Pi"
      className="text-slate-600 hover:text-slate-400 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
        <line x1="12" y1="2" x2="12" y2="12"/>
      </svg>
    </button>
  );
}
