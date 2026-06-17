/**
 * Simple Geocoding Service for Text-based GPS Locations
 *
 * Implements Level 2 text geocoding and caching.
 * Matches against a local dictionary first, then falls back to OpenStreetMap Nominatim
 * if enabled, caching results in localStorage.
 */

const LOCAL_GECODE_DICT: Record<string, { lat: number; lon: number }> = {
  holyhead: { lat: 53.309, lon: -4.633 },
  dublin: { lat: 53.349, lon: -6.260 },
  lyon: { lat: 45.764, lon: 4.835 },
  mions: { lat: 45.663, lon: 4.954 },
  weeford: { lat: 52.628, lon: -1.782 },
  wyrley: { lat: 52.664, lon: -2.012 },
  mosonmagyarovar: { lat: 47.867, lon: 17.270 },
  nantes: { lat: 47.218, lon: -1.553 },
  herblain: { lat: 47.227, lon: -1.644 },
  becsehely: { lat: 46.444, lon: 16.777 },
  veurne: { lat: 51.072, lon: 2.662 },
  lympne: { lat: 51.077, lon: 1.026 },
  london: { lat: 51.507, lon: -0.127 },
  calais: { lat: 50.951, lon: 1.858 },
  dover: { lat: 51.127, lon: 1.313 },
  belfast: { lat: 54.597, lon: -5.930 },
  veszprem: { lat: 47.093, lon: 17.911 },
  birmingham: { lat: 52.486, lon: -1.890 },
  paris: { lat: 48.856, lon: 2.352 },
};

// Local in-memory/localStorage cache
const CACHE_KEY = 'fuel-assurance-geocode-cache';

function getCache(): Record<string, { lat: number; lon: number }> {
  if (typeof window === 'undefined') return {};
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

function setCache(text: string, coords: { lat: number; lon: number }) {
  if (typeof window === 'undefined') return;
  try {
    const cache = getCache();
    cache[text.toLowerCase().trim()] = coords;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error('Failed to write geocode cache:', err);
  }
}

export async function geocodeText(
  text: string,
  enableExternal = true
): Promise<{ lat: number; lon: number; type: 'approximate' | 'exact'; source: string } | null> {
  const cleanText = (text || '').trim();
  if (!cleanText) return null;

  const lowerText = cleanText.toLowerCase();

  // 1. Try local dictionary (instant, offline)
  for (const [key, coords] of Object.entries(LOCAL_GECODE_DICT)) {
    if (lowerText.includes(key)) {
      return {
        lat: coords.lat,
        lon: coords.lon,
        type: 'approximate',
        source: 'local_dictionary',
      };
    }
  }

  // 2. Try localStorage cache
  const cache = getCache();
  if (cache[lowerText]) {
    const coords = cache[lowerText]!;
    return {
      lat: coords.lat,
      lon: coords.lon,
      type: 'approximate',
      source: 'local_cache',
    };
  }

  // 3. Optional OpenStreetMap Nominatim dynamic geocoding
  if (enableExternal) {
    try {
      // Clean query text
      const query = encodeURIComponent(cleanText);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'FuelAssuranceAuditWorkspace/1.0',
        },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        if (!isNaN(lat) && !isNaN(lon)) {
          const coords = { lat, lon };
          setCache(cleanText, coords);
          return {
            lat,
            lon,
            type: 'approximate',
            source: 'osm_nominatim',
          };
        }
      }
    } catch (err) {
      console.warn('OSM Nominatim Geocode failed:', err);
    }
  }

  return null;
}
