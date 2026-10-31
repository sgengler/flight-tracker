import { useEffect, useState } from 'react';

// useState that's remembered in localStorage, so a choice survives reloads (the Pi
// kiosk reloads after every update and once a day). Falls back to plain state if
// storage is unavailable or holds something this version doesn't accept.
export function useStoredState<T>(key: string, initial: T, isValid: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (isValid(parsed)) return parsed;
      }
    } catch {
      // unavailable or corrupt — use the default
    }
    return initial;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked — the choice just won't persist
    }
  }, [key, value]);

  return [value, setValue] as const;
}
