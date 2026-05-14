import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { exec, spawn } from 'child_process';
import { subscribe, subscribeMilitary, broadcastTopGun, broadcastTopGunDismiss } from './poller';
import { fetchPlanePhoto, fetchAircraftTrace, getCachedRoute, getApiStats, getCacheSize, getSpeedRecord } from './opensky';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const SERVER_START = Date.now();
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

app.use(compression({
  filter: (req, res) => req.path.includes('/stream') ? false : compression.filter(req, res),
}));
app.use(cors());
app.use(express.json());

// Token-based access control — set ACCESS_TOKEN in .env to restrict access.
// Requests must include ?token=<value> or cookie token=<value>.
// If ACCESS_TOKEN is not set, the server is open (useful for local dev).
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
if (ACCESS_TOKEN) {
  app.use((req, res, next) => {
    const queryToken = req.query.token as string | undefined;
    const cookieToken = req.headers.cookie
      ?.split(';')
      .map(c => c.trim().split('='))
      .find(([k]) => k === 'token')?.[1];

    if (queryToken === ACCESS_TOKEN || cookieToken === ACCESS_TOKEN) {
      // Promote query token to cookie so subsequent requests don't need it in the URL
      if (queryToken === ACCESS_TOKEN) {
        res.setHeader('Set-Cookie', `token=${ACCESS_TOKEN}; Path=/; HttpOnly; SameSite=Strict`);
      }
      return next();
    }
    res.status(401).send('Unauthorized');
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), faUsage: getApiStats() });
});

app.get('/api/stats', (_req, res) => {
  res.json({ faHistory: getApiStats(), speedRecord: getSpeedRecord(), cacheSize: getCacheSize() });
});

app.get('/api/version', (_req, res) => {
  res.json({ startedAt: SERVER_START });
});

app.get('/api/trace/:icao24', async (req, res) => {
  const icao24 = req.params.icao24.toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(icao24)) {
    res.status(400).json({ error: 'Invalid icao24' });
    return;
  }
  try {
    const positions = await fetchAircraftTrace(icao24);
    res.json(positions);
  } catch (err) {
    res.status(502).json({ error: 'Trace fetch failed' });
  }
});

// On-demand route lookup for a user-selected flight. Cache-first; only spends
// FlightAware quota when the route isn't already cached (and is allowed by caps).
app.get('/api/route', async (req, res) => {
  const icao24 = ((req.query.icao24 as string) ?? '').trim().toLowerCase();
  const callsign = ((req.query.callsign as string) ?? '').trim();
  if (!/^[0-9a-f]{6}$/.test(icao24) || !callsign) {
    res.status(400).json({ error: 'Invalid icao24 or callsign' });
    return;
  }
  try {
    const route = await getCachedRoute(callsign, icao24, { interactive: true, dev: req.query.dev === '1' });
    res.json({ route });
  } catch {
    res.json({ route: null });
  }
});

// Force a fresh FlightAware lookup, bypassing the cache.
app.post('/api/route/refresh', async (req, res) => {
  const icao24 = ((req.query.icao24 as string) ?? '').trim().toLowerCase();
  const callsign = ((req.query.callsign as string) ?? '').trim();
  if (!/^[0-9a-f]{6}$/.test(icao24) || !callsign) {
    res.status(400).json({ error: 'Invalid icao24 or callsign' });
    return;
  }
  try {
    const route = await getCachedRoute(callsign, icao24, { interactive: true, force: true });
    res.json({ route });
  } catch {
    res.json({ route: null });
  }
});

app.get('/api/flight-info', async (req, res) => {
  const icao24 = ((req.query.icao24 as string) ?? '').trim() || null;
  const typeName = ((req.query.typeName as string) ?? '').trim() || null;
  const photoUrl = icao24 ? await fetchPlanePhoto(icao24, typeName).catch(() => null) : null;
  res.json({ photoUrl });
});

app.get('/api/flights/stream', (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Invalid lat/lon query params' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied
  res.flushHeaders();

  const unsubscribe = subscribe(lat, lon, res, req.query.dev === '1');

  req.on('close', () => {
    unsubscribe();
    res.end();
  });
});

app.post('/api/topgun', (req, res) => {
  const addr = req.socket.remoteAddress ?? '';
  const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  if (!isLocal) { res.status(403).json({ error: 'Forbidden' }); return; }
  broadcastTopGun();
  res.json({ ok: true });
});

app.delete('/api/topgun', (req, res) => {
  const addr = req.socket.remoteAddress ?? '';
  const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  if (!isLocal) { res.status(403).json({ error: 'Forbidden' }); return; }
  broadcastTopGunDismiss();
  res.json({ ok: true });
});

app.post('/api/shutdown', (req, res) => {
  const addr = req.socket.remoteAddress ?? '';
  const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  if (!isLocal) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json({ ok: true, message: 'Shutting down' });
  exec('sudo shutdown -h now', (err) => {
    if (err) console.error('[shutdown] failed:', err.message);
  });
});

app.get('/api/flights/stream/military', (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Invalid lat/lon query params' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const unsubscribe = subscribeMilitary(lat, lon, res);

  req.on('close', () => {
    unsubscribe();
    res.end();
  });
});

// Auto-update: check for new commits and run the update script if found.
const UPDATE_SCRIPT = path.resolve(__dirname, '../../scripts/update.sh');
const REPO_DIR = path.resolve(__dirname, '../..');
const UPDATE_LOG = path.resolve(__dirname, '../../cache/update.log');
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

// Returns true if an update was triggered, false if already up to date.
function checkForUpdates(): Promise<boolean> {
  return new Promise((resolve) => {
    console.log('[updater] Checking for updates...');
    exec('git fetch origin main --quiet && git rev-parse HEAD && git rev-parse origin/main',
      { cwd: REPO_DIR },
      (err, stdout) => {
        if (err) {
          console.error('[updater] git check failed:', err.message);
          return resolve(false);
        }
        const [local, remote] = stdout.trim().split('\n');
        if (local === remote) {
          console.log('[updater] Already up to date.');
          return resolve(false);
        }
        console.log('[updater] New commits found — running update script...');
        // Detach the update script so it survives pm2 killing this process mid-restart.
        // Redirect stdout/stderr to a log file for in-app debugging.
        fs.mkdirSync(path.dirname(UPDATE_LOG), { recursive: true });
        const logFd = fs.openSync(UPDATE_LOG, 'w');
        const child = spawn('bash', [UPDATE_SCRIPT], {
          detached: true,
          stdio: ['ignore', logFd, logFd],
          cwd: REPO_DIR,
        });
        child.unref();
        fs.closeSync(logFd);
        resolve(true);
      }
    );
  });
}

app.post('/api/check-update', async (_req, res) => {
  const updating = await checkForUpdates();
  res.json({ updating });
});

app.get('/api/update-log', (_req, res) => {
  try {
    const log = fs.readFileSync(UPDATE_LOG, 'utf8');
    res.type('text/plain').send(log);
  } catch {
    res.type('text/plain').send('No update log found.');
  }
});

// Serve built client in production
app.use(express.static(CLIENT_DIST));
app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

setInterval(() => checkForUpdates(), UPDATE_INTERVAL_MS);
