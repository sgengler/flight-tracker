// Add a new entry to the top of `CHANGELOG` whenever you ship user-visible work.
// `APP_VERSION` is derived from the most recent entry, so version + log stay in sync.

export interface ChangelogEntry {
  version: string; // e.g. "0.2.0"
  date: string;    // ISO YYYY-MM-DD
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.3.3',
    date: '2026-05-09',
    changes: [
      'Test entry for update button git reset test.',
    ],
  },
  {
    version: '0.3.2',
    date: '2026-05-08',
    changes: [
      'Test entry to verify update button and log display.',
    ],
  },
  {
    version: '0.3.1',
    date: '2026-05-08',
    changes: [
      'This is a test for Gina.',
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
