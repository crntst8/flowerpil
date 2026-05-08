import appleMusicApiService from './appleMusicApiService.js';

const DEFAULT_STOREFRONT = normalizeStorefront(process.env.APPLE_MUSIC_STOREFRONT);

function normalizeStorefront(value) {
  if (!value) return 'us';
  const trimmed = String(value).trim().toLowerCase();
  return /^[a-z]{2}$/.test(trimmed) ? trimmed : 'us';
}

// Minimal Apple search wrapper for portable worker (API-first only)
export async function searchAppleMusicByTrack(track, options = {}) {
  const storefront = normalizeStorefront(options.storefront || DEFAULT_STOREFRONT);
  // Try ISRC first
  if (track?.isrc) {
    try {
      const viaIsrc = await appleMusicApiService.searchCatalogByISRC(track.isrc, storefront);
      if (viaIsrc && viaIsrc.url) {
        return { ...viaIsrc, storefront: viaIsrc.storefront || storefront };
      }
    } catch (e) {
      // fall back to metadata
    }
  }

  // Fallback to metadata
  if (track?.artist && track?.title) {
    try {
      const viaMeta = await appleMusicApiService.searchCatalogByMetadata({
        artist: track.artist,
        title: track.title,
        album: track.album,
        storefront,
        isrc: track.isrc,
        durationMs: track.duration_ms ?? track.durationMs ?? track.duration
      });
      if (viaMeta && viaMeta.url) {
        return { ...viaMeta, storefront: viaMeta.storefront || storefront };
      }
    } catch (e) {
      // ignore
    }
  }

  return null;
}

export default { searchAppleMusicByTrack };
