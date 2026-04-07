import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { subscribe } from './poller';
import { fetchPlanePhoto } from './opensky';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
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
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/flight-info', async (req, res) => {
  const icao24 = ((req.query.icao24 as string) ?? '').trim() || null;
  const photoUrl = icao24 ? await fetchPlanePhoto(icao24).catch(() => null) : null;
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

  const unsubscribe = subscribe(lat, lon, res);

  req.on('close', () => {
    unsubscribe();
    res.end();
  });
});

// Serve built client in production
app.use(express.static(CLIENT_DIST));
app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
