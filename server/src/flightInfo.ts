// hexdb aircraft type/police detection + Wikipedia/Planespotters photo cascade

export type AircraftWikiInfo = Record<string, string>;

interface AircraftCacheEntry {
  typeCode: string | null;
  isPolice: boolean;
  manufacturer: string | null;
  model: string | null;
  fetchedAt: number;
}
const aircraftTypeCache = new Map<string, AircraftCacheEntry>();
const AIRCRAFT_TYPE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const POLICE_KEYWORDS = ['POLICE', 'SHERIFF', 'CONSTABULARY', 'TROOPER', 'STATE PATROL',
  'LAW ENFORCEMENT', 'DEPT OF PUBLIC SAFETY', 'DEPARTMENT OF PUBLIC SAFETY'];

function isPoliceOwner(owner: string | undefined): boolean {
  if (!owner) return false;
  const u = owner.toUpperCase();
  return POLICE_KEYWORDS.some(k => u.includes(k));
}

export async function getCachedAircraftType(icao24: string): Promise<{ typeCode: string | null; isPolice: boolean }> {
  const entry = await getCachedAircraftEntry(icao24);
  return { typeCode: entry.typeCode, isPolice: entry.isPolice };
}

async function getCachedAircraftEntry(icao24: string): Promise<AircraftCacheEntry> {
  const key = icao24.toLowerCase();
  const cached = aircraftTypeCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < AIRCRAFT_TYPE_CACHE_TTL_MS) {
    // Older entries may not have manufacturer/model — that's fine, they'll re-fetch on TTL
    return cached;
  }

  const empty: AircraftCacheEntry = {
    typeCode: null, isPolice: false, manufacturer: null, model: null, fetchedAt: Date.now(),
  };

  try {
    const res = await fetch(`https://hexdb.io/api/v1/aircraft/${key}`);
    if (!res.ok) {
      aircraftTypeCache.set(key, empty);
      return empty;
    }
    const data = await res.json() as { ICAOTypeCode?: string; RegisteredOwners?: string; Manufacturer?: string; Type?: string };
    const entry: AircraftCacheEntry = {
      typeCode: data.ICAOTypeCode?.trim() || null,
      isPolice: isPoliceOwner(data.RegisteredOwners),
      manufacturer: data.Manufacturer?.trim() || null,
      model: data.Type?.trim() || null,
      fetchedAt: Date.now(),
    };
    aircraftTypeCache.set(key, entry);
    return entry;
  } catch {
    aircraftTypeCache.set(key, empty);
    return empty;
  }
}

// Wikimedia CDN URLs embed the width: .../thumb/x/y/file.jpg/320px-file.jpg
// Replace the width segment to request a larger render.
function wikiThumbAtWidth(src: string, width: number): string {
  return src.replace(/\/\d+px-/, `/${width}px-`);
}

// Planespotters CDN URLs (t.plnspttrs.net) embed the size in the filename: ..._280.jpg
// Replace it to request a larger render.
function planespottersThumbAtWidth(src: string, width: number): string {
  if (!src.includes('plnspttrs.net')) return src;
  return src.replace(/_\d+(\.jpe?g)$/i, `_${width}$1`);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')                            // style blocks (content + tag)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')                           // script blocks
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')                                 // footnote refs
    .replace(/<span[^>]*class="[^"]*flagicon[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '') // flag icons
    .replace(/<\/li>/gi, ', ')                                                     // list items → comma-separated
    .replace(/<br\s*\/?>/gi, ', ')                                                 // line breaks
    .replace(/<[^>]+>/g, '')                                                      // all remaining tags
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ')
    .replace(/&#[0-9]+;/g, ' ').replace(/&[a-z]+;/g, ' ')                        // remaining entities
    .replace(/,\s*,/g, ',').replace(/,\s*$/, '')                                  // clean up trailing/double commas
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInfoboxFromHtml(html: string): AircraftWikiInfo {
  const result: AircraftWikiInfo = {};
  // Split on <tr> boundaries so we never match across rows.
  for (const block of html.split(/<tr[^>]*>/i)) {
    const thMatch = block.match(/<th[^>]*class="[^"]*infobox-label[^"]*"[^>]*>([\s\S]*?)<\/th>/i);
    const tdMatch = block.match(/<td[^>]*class="[^"]*infobox-data[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    if (!thMatch || !tdMatch) continue;
    const key = stripHtml(thMatch[1]);
    const value = stripHtml(tdMatch[1]);
    if (key && value) result[key] = value;
  }
  return result;
}

const wikiDataCache = new Map<string, { thumb: { normal: string; large: string }; infobox: AircraftWikiInfo; articleTitle: string; extract: string } | null>();

async function fetchWikipediaData(title: string): Promise<{ thumb: { normal: string; large: string }; infobox: AircraftWikiInfo; articleTitle: string; extract: string } | null> {
  const t = title.trim().replace(/\s+/g, '_');
  if (!t) return null;
  if (wikiDataCache.has(t)) return wikiDataCache.get(t)!;
  try {
    const [summaryRes, parseRes] = await Promise.all([
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`),
      fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(t)}&prop=text&format=json&section=0&redirects`),
    ]);
    if (!summaryRes.ok) { wikiDataCache.set(t, null); return null; }
    const summary = await summaryRes.json() as { type?: string; thumbnail?: { source: string }; extract?: string };
    if (summary.type && summary.type !== 'standard') { wikiDataCache.set(t, null); return null; }
    const src = summary.thumbnail?.source ?? null;
    if (!src) { wikiDataCache.set(t, null); return null; }
    const extract = summary.extract ?? '';
    let infobox: AircraftWikiInfo = {};
    let articleTitle = title;
    if (parseRes.ok) {
      const parsed = await parseRes.json() as { parse?: { title?: string; text?: { '*': string } } };
      articleTitle = parsed.parse?.title ?? title;
      const html = parsed.parse?.text?.['*'] ?? '';
      if (html) infobox = parseInfoboxFromHtml(html);
    }
    const result = { thumb: { normal: src, large: wikiThumbAtWidth(src, 1920) }, infobox, articleTitle, extract };
    wikiDataCache.set(t, result);
    return result;
  } catch {
    wikiDataCache.set(t, null);
    return null;
  }
}

// Well-known individual aircraft: icao24 hex → Wikipedia article title for photo lookup.
// The display name lives client-side in utils.ts; this table drives the photo.
const WELL_KNOWN_AIRCRAFT_WIKI: Record<string, string> = {
  'a00002': 'Goodyear Blimp',   // N1A  — Wingfoot One
  'adfdf9': 'Air Force One',    // 92-9000 VC-25A
};

export async function fetchPlanePhoto(icao24: string, typeName?: string | null, registration?: string | null): Promise<{ normal: string; large: string; wikiInfo?: AircraftWikiInfo; wikiTitle?: string; wikiExtract?: string } | null> {
  // Wikipedia first — scales to 1920px for fullscreen and provides infobox data. Priority order:
  //   1. Well-known individual aircraft title (e.g. "Goodyear Blimp", "Air Force One")
  //   2. Client-supplied typeName (mapped from ICAO type code on the client)
  //   3. hexdb's "{Manufacturer} {Type}" — handles type codes the client doesn't map
  //   4. Same with the trailing variant suffix stripped — e.g. "Beech 1900 D" → "Beech 1900"
  const candidates: string[] = [];
  const wellKnownWiki = WELL_KNOWN_AIRCRAFT_WIKI[icao24.toLowerCase()];
  if (wellKnownWiki) candidates.push(wellKnownWiki);
  if (typeName) {
    candidates.push(typeName);
    // Also try with the trailing variant word stripped — e.g. "Beechcraft Bonanza 36" → "Beechcraft Bonanza"
    const typeWords = typeName.trim().split(/\s+/);
    if (typeWords.length >= 3) candidates.push(typeWords.slice(0, -1).join(' '));
  }

  const entry = await getCachedAircraftEntry(icao24);
  if (entry.manufacturer && entry.model) {
    const full = `${entry.manufacturer} ${entry.model}`;
    candidates.push(full);
    const stripped = `${entry.manufacturer} ${entry.model.split(/\s+/)[0]}`;
    if (stripped !== full) candidates.push(stripped);
  }

  for (const title of candidates) {
    const data = await fetchWikipediaData(title);
    if (data) return { normal: data.thumb.normal, large: data.thumb.large, wikiInfo: data.infobox, wikiTitle: data.articleTitle, wikiExtract: data.extract };
  }

  // Planespotters fallback — specific aircraft photos by hex/registration.
  const planespottersTargets = [
    `https://api.planespotters.net/pub/photos/hex/${icao24.toLowerCase()}`,
    ...(registration ? [`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(registration)}`] : []),
  ];
  for (const url of planespottersTargets) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'gina-flights/1.0 (+https://github.com/stevegengler/gina-flights)' } });
      if (res.ok) {
        const data = await res.json() as { photos: Array<{ thumbnail_large: { src: string } }> };
        const src = data.photos?.[0]?.thumbnail_large?.src ?? null;
        if (src) return { normal: src, large: planespottersThumbAtWidth(src, 1200) };
      }
    } catch {
      // fall through
    }
  }

  return null;
}
