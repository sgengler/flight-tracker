import { useEffect, useState } from 'react';
import { ConnectionStatus } from '../types';
import { formatSecondsAgo } from '../utils';

interface Props {
  status: ConnectionStatus;
  lastUpdated: number | null;
}

const statusColors: Record<ConnectionStatus, string> = {
  connected: 'bg-green-400',
  connecting: 'bg-yellow-400 animate-pulse',
  reconnecting: 'bg-orange-400 animate-pulse',
  error: 'bg-red-400',
};

const statusLabels: Record<ConnectionStatus, string> = {
  connected: 'Live',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  error: 'Error',
};

export function StatusBar({ status, lastUpdated }: Props) {
  const [, setTick] = useState(0);

  // Re-render every second to update "X seconds ago"
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/60 backdrop-blur text-xs text-slate-400">
      <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
      <span className="text-white">{statusLabels[status]}</span>
      {lastUpdated && status === 'connected' && (
        <span className="ml-auto">Updated {formatSecondsAgo(lastUpdated)}</span>
      )}
    </div>
  );
}
