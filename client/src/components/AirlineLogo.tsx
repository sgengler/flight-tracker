import { useState } from 'react';
import { airlineLogoUrl, airlineName } from '../airlines';

// Airline wordmark on a white chip (logos are dark-on-transparent), falling back
// to the airline's name — or its code — when there's no logo.
export function AirlineLogo({ code, height = 16, className = '' }: { code: string | null; height?: number; className?: string }) {
  const url = airlineLogoUrl(code);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!code) return null;
  if (!url || failedUrl === url) {
    return <span className={`text-slate-400 truncate ${className}`}>{airlineName(code) ?? code}</span>;
  }
  return (
    <span className={`inline-flex items-center bg-white rounded px-1 flex-shrink-0 ${className}`} style={{ height: height + 4 }}>
      <img src={url} alt={airlineName(code) ?? code} style={{ height }} className="w-auto block" onError={() => setFailedUrl(url)} />
    </span>
  );
}
