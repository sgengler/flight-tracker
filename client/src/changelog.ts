// Add a new entry to the top of `CHANGELOG` whenever you ship user-visible work.
// `APP_VERSION` is derived from the most recent entry, so version + log stay in sync.

export interface ChangelogEntry {
  version: string; // e.g. "0.2.0"
  date: string;    // ISO YYYY-MM-DD
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.5.2',
    date: '2026-05-14',
    changes: [
      'Route cache now uses SQLite — survives crashes without data loss and starts with all previously cached routes.',
    ],
  },
  {
    version: '0.5.1',
    date: '2026-05-13',
    changes: [
      'Stats tab now shows the number of unique cached routes instead of cumulative cache-hit count.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-05-12',
    changes: [
      'Stats tab now shows the fastest flight speed ever recorded, including aircraft type and flight number.',
    ],
  },
  {
    version: '0.4.9',
    date: '2026-05-12',
    changes: [
      'Top Gun alert now takes over the full screen with a CRT flicker entrance and radar lock-on sound when a fighter first appears.',
    ],
  },
  {
    version: '0.4.8',
    date: '2026-05-12',
    changes: [
      'Added ?topgun=1 URL param to force the Top Gun alert for testing and demos.',
    ],
  },
  {
    version: '0.4.7',
    date: '2026-05-12',
    changes: [
      'Added a Top Gun–style alert when a fighter or attack aircraft is detected nearby.',
    ],
  },
  {
    version: '0.4.6',
    date: '2026-05-12',
    changes: [
      'Added dev mode (?dev=1) — returns dummy FlightAware routes so local testing never hits the live API.',
    ],
  },
  {
    version: '0.4.5',
    date: '2026-05-12',
    changes: [
      'Network errors on FlightAware lookups are no longer cached — they retry like rate-limit responses.',
    ],
  },
  {
    version: '0.4.4',
    date: '2026-05-12',
    changes: [
      'Nearby tab now shows the 10 closest flights and attempts route lookups for all of them.',
    ],
  },
  {
    version: '0.4.3',
    date: '2026-05-12',
    changes: [
      'Rate-limited (429) and server-error FlightAware responses are no longer cached, so routes retry automatically.',
    ],
  },
  {
    version: '0.4.2',
    date: '2026-05-12',
    changes: [
      'Stats tab now breaks down FlightAware lookups by cached vs. fresh per day.',
    ],
  },
  {
    version: '0.4.1',
    date: '2026-05-12',
    changes: [
      'FlightAware route cache now lasts indefinitely — routes for known flights are never re-fetched.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-05-12',
    changes: [
      'Removed FlightAware daily request cap.',
      'Added Stats tab to monitor daily API usage.',
      'Update script no longer clears the route cache on deploy.',
    ],
  },
  {
    version: '0.3.1',
    date: '2026-05-12',
    changes: [
      'Increased FlightAware daily route-lookup cap from 30 to 100.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-05-08',
    changes: [
      'Fixed route cache returning the wrong direction for flights that run multiple legs per week — cache is now keyed by aircraft + date.',
      'Server now automatically checks for updates every hour and applies them if found.',
      'Added a "Check for Updates" button to the changelog tab for on-demand updates.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-05-06',
    changes: [
      'Cut FlightAware AeroAPI usage to fit the $5/mo free tier (closest-flight-only, 30/day cap, 30-day null-route cache).',
      'Selecting a non-closest flight now triggers an on-demand FlightAware lookup that bypasses the daily cap.',
      'Fixed missing aircraft photos when the type code wasn’t in the client’s lookup table — server now falls back to hexdb manufacturer/model.',
      'Fixed a race where photos didn’t load if the aircraft type arrived after selection.',
      'Added in-app version label and changelog tab.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-05-06',
    changes: [
      'Initial versioned baseline.',
    ],
  },
];

export const APP_VERSION = `v${CHANGELOG[0].version}`;
