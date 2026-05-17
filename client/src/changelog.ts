// Add a new entry to the top of `CHANGELOG` whenever you ship user-visible work.
// `APP_VERSION` is derived from the most recent entry, so version + log stay in sync.

export interface ChangelogEntry {
  version: string; // e.g. "0.2.0"
  date: string;    // ISO YYYY-MM-DD
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.6.6',
    date: '2026-05-17',
    changes: [
      'Map style picker no longer gets clipped at the top — it now scrolls when there are more options than fit on screen.',
    ],
  },
  {
    version: '0.6.5',
    date: '2026-05-17',
    changes: [
      '3D map: aircraft icons now rotate correctly when the map is rotated.',
      '3D map: aircraft altitude uses Mapbox setAltitude() to match the trail line exactly.',
      '3D map: trail shadow line hugs the terrain below the elevated trail.',
      '3D map: 3D mode is now selected from the map style picker instead of a separate button.',
      '3D map: map animates from flat to 62° pitch on load; plane transitions wait until the animation finishes.',
    ],
  },
  {
    version: '0.6.4',
    date: '2026-05-17',
    changes: [
      '3D map: aircraft now move smoothly using CSS transitions (same dead-reckoning approach as 2D map).',
      '3D map: ground shadows now match the aircraft silhouette shape instead of a generic disc.',
      '3D map: shadow opacity is now correctly controllable (was being silently overridden by MapLibre).',
      '3D map: default pitch lowered to 62°, icons enlarged, minimum altitude separation raised.',
    ],
  },
  {
    version: '0.6.3',
    date: '2026-05-17',
    changes: [
      'Added 3D terrain map mode — press the "3D" button to switch to a tilted perspective view with real elevation.',
      'Aircraft in 3D mode cast altitude-scaled shadows and have a subtle 3D sheen on their icons.',
    ],
  },
  {
    version: '0.6.2',
    date: '2026-05-16',
    changes: [
      'Aircraft photos now use srcSet so retina and high-DPI displays automatically load the full-resolution image.',
    ],
  },
  {
    version: '0.6.1',
    date: '2026-05-16',
    changes: [
      'Map now uses Stamen Terrain tiles (via Stadia Maps) with retina support for sharper rendering.',
      'Added a map style picker button (bottom-right, matching the fullscreen button) to switch between Stadia tile styles.',
      'Slightly reduced map tile darkening to better suit the new terrain style.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-05-16',
    changes: [
      'Flight card now shows a Wikipedia info modal (ⓘ button) with article summary and structured stats.',
      'Aircraft photos now use Wikipedia as the primary source at full resolution; Planespotters is the fallback.',
      'Fullscreen flight card redesigned: photo fills the entire card with a gradient overlay and all data at the bottom.',
      'Flight card now shows a type-specific aircraft silhouette icon (jet, prop, small, fighter, helicopter, etc.) that rotates with the aircraft\'s heading.',
      'Icon and distance/direction indicator repositioned to the bottom-right of the photo; info button moved to top-right.',
      'Fixed photos not loading for aircraft type variants (e.g. "Beechcraft Bonanza 36") by also trying the base model name.',
      'Gray sub-identity text and route city names made brighter in fullscreen mode.',
    ],
  },
  {
    version: '0.5.5',
    date: '2026-05-16',
    changes: [
      'Fixed aircraft photos not loading — Planespotters was rejecting requests with 403 due to a missing User-Agent header.',
    ],
  },
  {
    version: '0.5.4',
    date: '2026-05-16',
    changes: [
      'Aircraft photos now fall back to a registration-based lookup on Planespotters, improving coverage for military and other aircraft not indexed by hex code.',
      'Added Cessna 206 / T206 Stationair to the type name table so it resolves a Wikipedia photo.',
    ],
  },
  {
    version: '0.5.3',
    date: '2026-05-16',
    changes: [
      'Warbird / vintage aircraft are now identified and shown in orange with a WWII fighter silhouette — P-51, B-17, Corsair, Spitfire, and 30+ others.',
      'A "Warbird Spotted" sidebar alert appears when a vintage aircraft enters the area.',
      'Warbirds have their own filter toggle and legend entry.',
      'Speed record now requires 3 consistent readings before updating — filters out transponder glitches.',
    ],
  },
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
