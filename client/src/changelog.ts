// Add a new entry to the top of `CHANGELOG` whenever you ship user-visible work.
// `APP_VERSION` is derived from the most recent entry, so version + log stay in sync.

export interface ChangelogEntry {
  version: string; // e.g. "0.2.0"
  date: string;    // ISO YYYY-MM-DD
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.9.3',
    date: '2026-10-31',
    changes: [
      'After you pick a plane, a "Closest plane" button on the map (next to Key) takes you back; it used to sit below the card, off screen.',
      'The photographer credit on plane photos is smaller and fainter.',
    ],
  },
  {
    version: '0.9.2',
    date: '2026-10-31',
    changes: [
      'City names now show for airports that were appearing as codes, e.g. Lima instead of SPJC.',
    ],
  },
  {
    version: '0.9.1',
    date: '2026-10-31',
    changes: [
      'Alerts now appear above the flight card, then shrink to a one-line banner after 30 seconds; tap – to shrink, ✕ to hide, or the banner to open it again.',
      'The military alert stays a quiet one-line banner, since military planes are around most of the time.',
      '"Worth a look" alerts say why the plane is special, e.g. "Only four exist".',
      'Blimps, including the Goodyear Blimp, now count as worth a look.',
      'Bigger alert buttons for the touchscreen.',
      'The flight card shows the airline instead of a leasing bank as the plane\'s operator.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-10-31',
    changes: [
      'Flight card shows a photo of the actual plane, credited to its photographer, instead of a generic photo of the type.',
      'The map key is now a small Key button on the map; Military Mode moved to the tab bar, and the power button to the Changelog tab.',
      'The flight card fills the right side and its altitude and speed graph grows to use the space.',
      'Smaller, lighter zoom buttons that match the other map buttons.',
      'The Nearby list shows more planes, with climbing and descending arrows and easier-to-read altitudes.',
      'Home is marked with a blue house instead of a red pin, so it isn\'t mistaken for the selected plane.',
      'Explore shows cities in a compact grid.',
      'Fixed clipped numbers on the flight card and the distance overlapping long aircraft names.',
      'The Flightradar24 link is hidden on the Pi itself, where it opened a page with no way back.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-30',
    changes: [
      'Flight card shows the specific aircraft: registration, operator, and how old it is.',
      'Flight card shows what the plane is doing, e.g. "Climbing to FL340" or "Descending into Philadelphia".',
      'Route now has a progress bar with miles to go and an estimated landing time.',
      'Fullscreen flight card shows an altitude and speed graph for the flight so far.',
      'Fixed vertical speed showing feet per second labelled as feet per minute.',
      'Emergency alert: a plane squawking 7700, 7600 or 7500 takes over the screen with an alarm, then stays pinned in the sidebar.',
      '"Worth a look" alert for notable aircraft: A380s, 747s, Dreamlifters, VIP flights like Air Force One, and big jets that rarely pass by.',
      'New Today tab: how many aircraft and types flew by, busiest hour, closest pass, highest, fastest, oldest airframe, farthest origin, rarest type and top airlines.',
      'Airline logos on the flight card and in the Today tab.',
    ],
  },
  {
    version: '0.7.8',
    date: '2026-10-30',
    changes: [
      'Routes that no longer match where a plane is actually flying (after an airline reuses a flight number) are hidden and looked up again.',
      'Flights with no known route are re-checked after a week instead of never.',
      'The Stats tab now shows AirLabs route lookups alongside FlightAware.',
      'The T-6 Texan II trainer no longer sets off the fighter alert.',
    ],
  },
  {
    version: '0.7.7',
    date: '2026-10-30',
    changes: [
      'The map remembers whether it was in 3D and which map style was picked, including after updates and the daily refresh.',
    ],
  },
  {
    version: '0.7.6',
    date: '2026-10-30',
    changes: [
      'Planes in the 3D map now glide smoothly too, and 3D uses far less CPU on the Pi.',
    ],
  },
  {
    version: '0.7.5',
    date: '2026-10-30',
    changes: [
      'Planes on the map glide smoothly again instead of ticking forward about once a second.',
      'Planes no longer slide backwards briefly when fresh position data arrives.',
    ],
  },
  {
    version: '0.7.4',
    date: '2026-10-30',
    changes: [
      'Long-running stability: the app no longer keeps data for every aircraft it has ever seen, so memory stays flat when running 24/7.',
      'The display refreshes itself once a day at 4am to stay fresh during continuous use.',
      'Much quieter server logs, so they no longer slowly fill the SD card.',
    ],
  },
  {
    version: '0.7.3',
    date: '2026-10-30',
    changes: [
      'Updates now download a ready-made build instead of compiling on the Pi, so the display stays smooth while updating.',
      'If no ready-made build is available, the Pi builds at the lowest priority so the display keeps running smoothly.',
    ],
  },
  {
    version: '0.7.2',
    date: '2026-10-30',
    changes: [
      'The map now only redraws aircraft when they visibly move, cutting CPU use on the Raspberry Pi substantially.',
    ],
  },
  {
    version: '0.7.1',
    date: '2026-10-30',
    changes: [
      'The flight trail on the 2D map is now a single smooth line with a continuous speed-color gradient.',
      'Trails for newly selected flights load faster.',
      'Military mode lists the 50 closest aircraft, with the rest on the map and in the Hotspots and Regions tabs.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-30',
    changes: [
      'Aircraft are now drawn directly by the map engine, making the map much smoother on the Raspberry Pi, especially with many planes on screen.',
      'Selecting a plane no longer makes other aircraft briefly slide backwards.',
      'In 3D mode, aircraft now lie in the map\'s perspective and point the same way as their ground shadows.',
      'Fixed the flight trail and aircraft sometimes disappearing after the map first loads or when switching map styles.',
      'Faster startup: removed an unused external stylesheet.',
    ],
  },
  {
    version: '0.6.14',
    date: '2026-05-26',
    changes: [
      'FlightAware route lookups are now capped at 50 per day; AirLabs and cached routes are unaffected.',
    ],
  },
  {
    version: '0.6.13',
    date: '2026-05-25',
    changes: [
      'Initial flight search radius reduced from 75 miles to 50 miles for more relevant nearby results.',
    ],
  },
  {
    version: '0.6.12',
    date: '2026-05-21',
    changes: [
      'V-22 Osprey no longer triggers the Top Gun alert — it is now correctly classified as a transport aircraft.',
    ],
  },
  {
    version: '0.6.11',
    date: '2026-05-21',
    changes: [
      'Plane icons now ease smoothly into position and heading on each data refresh — speed changes, turns, and course corrections blend over 2 seconds instead of snapping.',
    ],
  },
  {
    version: '0.6.10',
    date: '2026-05-21',
    changes: [
      'Fixed plane animation stutter: planes no longer freeze mid-cycle and jump when new data arrives — dead reckoning now runs for the full 15-second poll interval.',
    ],
  },
  {
    version: '0.6.9',
    date: '2026-05-17',
    changes: [
      '2D map migrated from Leaflet to Mapbox GL JS — same rendering engine as 3D mode, rAF-based plane animation, and unified tile picker with Terrain, Light, Dark, Streets, and Satellite styles.',
      'Dark map style is now the default.',
    ],
  },
  {
    version: '0.6.8',
    date: '2026-05-17',
    changes: [
      'Plane movement switched from CSS transitions to a requestAnimationFrame loop — icons now track smoothly at all times with no artifacts during pan, zoom, rotate, or pitch.',
      'Map style changed to Outdoors (more terrain and road detail in 3D mode).',
      'Mapbox attribution logo hidden.',
      'Shadow icons now correctly rotate when the map pitch or bearing changes.',
    ],
  },
  {
    version: '0.6.7',
    date: '2026-05-17',
    changes: [
      'Planes no longer slide in the wrong direction during map pan, zoom, rotate, or pitch — transitions are now frozen for the duration of any map movement and resume cleanly once the map settles.',
    ],
  },
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
