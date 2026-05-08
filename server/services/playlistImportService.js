import { getQueries, getDatabase } from '../database/db.js';
import SpotifyService from './spotifyService.js';
import sharp from 'sharp';
import { uploadToR2 } from '../utils/r2Storage.js';
import { v4 as uuidv4 } from 'uuid';

const spotifyService = new SpotifyService();

export const processSpotifyArtwork = async (artwork, type = 'track') => {
  if (!artwork?.buffer) return null;

  // For playlists, use UUID-based naming with multiple formats like other playlist images
  // For tracks, use timestamp-based naming (legacy format)
  if (type === 'playlist') {
    const uuid = uuidv4();
    const formats = ['jpg', 'webp', 'avif'];
    const sizes = {
      large: 1200,
      medium: 600,
      small: 300
    };

    const uploads = [];

    for (const format of formats) {
      for (const [sizeName, width] of Object.entries(sizes)) {
        const processed = await sharp(artwork.buffer)
          .resize(width, width, { fit: 'cover' })
          .toFormat(format)
          .toBuffer();

        const key = `playlists/${uuid}_${sizeName}.${format}`;
        const contentType = `image/${format === 'jpg' ? 'jpeg' : format}`;

        uploads.push(uploadToR2(processed, key, contentType));
      }
    }

    await Promise.all(uploads);

    // Return the large JPG as the primary URL
    return `https://images.flowerpil.io/playlists/${uuid}_large.jpg`;
  } else {
    // Track artwork: use legacy format
    const baseFilename = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const variants = [
      { suffix: '', width: 800, height: 800 },
      { suffix: '_md', width: 400, height: 400 },
      { suffix: '_sm', width: 200, height: 200 }
    ];

    let primaryUrl = null;

    for (const variant of variants) {
      const filename = `${baseFilename}${variant.suffix}.jpg`;
      const r2Key = `tracks/${filename}`;

      const processedBuffer = await sharp(artwork.buffer)
        .resize(variant.width, variant.height, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      const imageUrl = await uploadToR2(processedBuffer, r2Key, 'image/jpeg');

      // Use the default size (no suffix) as the primary URL
      if (variant.suffix === '') {
        primaryUrl = imageUrl;
      }
    }

    return primaryUrl;
  }
};

export async function importFromSpotify({
  playlistId,
  spotifyPlaylistId,
  mode = 'append',
  appendPosition = 'top',
  handleDeletions = false,
  curatorToken,
  artwork = false,
  returnDetails = false
}) {
  const queries = getQueries();
  const db = getDatabase();

  // Fetch Flowerpil playlist + existing tracks
  const playlist = queries.getPlaylistById.get(playlistId);
  if (!playlist) throw new Error('Playlist not found');
  const existingTracks = queries.getTracksByPlaylistId.all(playlistId);

  if (!curatorToken) throw new Error('Missing Spotify access token');

  // Fetch from Spotify
  const details = await spotifyService.getPlaylistDetails(curatorToken, spotifyPlaylistId);
  const spotifyTracks = spotifyService.transformTracksForFlowerpil(details.tracks);

  const normalizedMode = mode === 'replace' ? 'replace' : 'append';
  const normalizedAppendPosition = appendPosition === 'bottom' ? 'bottom' : 'top';

  const totalBefore = existingTracks.length;

  let finalList = [];
  let added = 0;
  let skippedDuplicates = 0;
  let deleted = 0;

  if (normalizedMode === 'replace') {
    const existingBySpotifyId = new Map();
    for (const track of existingTracks) {
      if (track.spotify_id) {
        existingBySpotifyId.set(String(track.spotify_id), track);
      }
    }

    const reusedIds = new Set();
    finalList = spotifyTracks.map((track) => {
      const key = track.spotify_id ? String(track.spotify_id) : null;
      if (key && existingBySpotifyId.has(key)) {
        const existing = existingBySpotifyId.get(key);
        if (existing?.id) {
          reusedIds.add(existing.id);
        }
        // Merge new artwork into existing track if it's missing
        // This ensures re-imports populate artwork for tracks that were added without it
        return {
          ...existing,
          artwork_url: existing.artwork_url || track.artwork_url || null,
          album_artwork_url: existing.album_artwork_url || track.album_artwork_url || null
        };
      }
      added += 1;
      return track;
    });

    skippedDuplicates = Math.max(spotifyTracks.length - added, 0);
    deleted = Math.max(totalBefore - reusedIds.size, 0);
  } else {
    const existingBySpotifyId = new Map();
    for (const track of existingTracks) {
      if (track.spotify_id) {
        existingBySpotifyId.set(String(track.spotify_id), track);
      }
    }

    const spotifyIdSet = new Set(spotifyTracks.map((t) => t.spotify_id).filter(Boolean).map(String));
    const newTracks = [];

    for (const track of spotifyTracks) {
      const key = track.spotify_id ? String(track.spotify_id) : null;
      if (key && existingBySpotifyId.has(key)) {
        continue;
      }
      newTracks.push(track);
    }

    added = newTracks.length;
    skippedDuplicates = Math.max(spotifyTracks.length - added, 0);

    let retainedExisting = existingTracks;
    if (handleDeletions) {
      const filtered = [];
      for (const track of retainedExisting) {
        if (track.spotify_id && !spotifyIdSet.has(String(track.spotify_id))) {
          deleted += 1;
          continue;
        }
        filtered.push(track);
      }
      retainedExisting = filtered;
    }

    finalList = normalizedAppendPosition === 'bottom'
      ? [...retainedExisting, ...newTracks]
      : [...newTracks, ...retainedExisting];
  }

  // Persist: rebuild positions sequentially; simplest is full replace for both modes
  if (artwork) {
    for (const track of finalList) {
      if (!track.artwork_url && track.album_artwork_url) {
        try {
          const downloaded = await spotifyService.downloadArtwork(track.album_artwork_url, `track-${track.spotify_id}-${Date.now()}.jpg`);
          const stored = await processSpotifyArtwork(downloaded);
          if (stored) {
            track.artwork_url = stored;
          }
        } catch (error) {
          // Log artwork failures for debugging, but continue import
          console.error(`⚠️  Failed to process artwork for track ${track.spotify_id}:`, error.message);
        }
      }
    }
  }

  const tx = db.transaction(() => {
    queries.deleteTracksByPlaylistId.run(playlistId);
    let pos = 1;
    for (const t of finalList) {
      // Determine linking status: skip auto-linking for non-DSP-only tracks
      const hasNoDSPIds = !t.spotify_id && !t.apple_id && !t.tidal_id;
      const hasNonDSPUrls = t.bandcamp_url; // allow SoundCloud-only tracks to attempt linking
      const linkingStatus = (hasNoDSPIds && hasNonDSPUrls) ? 'skipped' : 'pending';

      // Serialize custom_sources as JSON
      const customSourcesJson = t.custom_sources && Array.isArray(t.custom_sources)
        ? JSON.stringify(t.custom_sources)
        : null;

      queries.insertTrack.run(
        playlistId,
        pos++,
        t.title || '',
        t.artist || '',
        t.album || '',
        t.year || null,
        t.duration || '',
        t.spotify_id || null,
        t.apple_id || null,
        t.tidal_id || null,
        t.youtube_music_id || null,
        t.youtube_music_url || null,
        t.bandcamp_url || null,
        t.soundcloud_url || null,
        t.label || null,
        t.genre || null,
        t.artwork_url || null,
        t.album_artwork_url || null,
        t.isrc || null,
        t.explicit ? 1 : 0,
        t.popularity || null,
        t.preview_url || null,
        linkingStatus,
        customSourcesJson
      );
    }
  });
  tx();

  const totalAfter = finalList.length;
  const result = {
    added,
    skipped_duplicates: skippedDuplicates,
    deleted,
    total_before: totalBefore,
    total_after: totalAfter
  };

  if (returnDetails) {
    result.sourcePlaylist = {
      name: details?.name || '',
      description: details?.description || '',
      image: details?.images?.[0]?.url || '',
      externalUrl: details?.external_urls?.spotify || '',
      snapshotId: details?.snapshot_id || null,
      trackCount: Array.isArray(details?.tracks) ? details.tracks.length : spotifyTracks.length
    };
  }

  return result;
}

export default { importFromSpotify };
