declare global {
  interface Window { __MAPBOX_TOKEN__?: string }
}

// In production the server injects the token into index.html from its .env, so
// prebuilt bundles (built in CI and published publicly) never embed it. Under the
// Vite dev server nothing is injected, so fall back to the build-time env var.
export const MAPBOX_TOKEN: string = window.__MAPBOX_TOKEN__ || (import.meta.env.VITE_MAPBOX_TOKEN as string);
