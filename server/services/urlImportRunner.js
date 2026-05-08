import { getDatabase, getQueries } from '../database/db.js';
import logger from '../utils/logger.js';
import { resolveUrlImport } from './urlImportService.js';
import { triggerBackup } from './backupService.js';

const RUNNING = new Set();

const safeJsonParse = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const serialize = (value) => JSON.stringify(value ?? null);

const normalizeMode = (value) => (String(value || '').toLowerCase() === 'replace' ? 'replace' : 'append');
const normalizeAppendPosition = (value) => (String(value || '').toLowerCase() === 'top' ? 'top' : 'bottom');
const normalizeBoolean = (value, fallback = true) => {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return fallback;
};

const normalizeTrackRowToDraft = (row) => {
  const customSources = safeJsonParse(row?.custom_sources, []);
  return {
    title: row?.title || '',
    artist: row?.artist || '',
    album: row?.album || '',
    year: row?.year ?? null,
    duration: row?.duration || '',
    spotify_id: row?.spotify_id || null,
    apple_id: row?.apple_id || null,
    tidal_id: row?.tidal_id || null,
    bandcamp_url: row?.bandcamp_url || null,
    soundcloud_url: row?.soundcloud_url || null,
    artwork_url: row?.artwork_url || null,
    album_artwork_url: row?.album_artwork_url || null,
    isrc: row?.isrc || null,
    explicit: Boolean(row?.explicit),
    popularity: row?.popularity ?? null,
    preview_url: row?.preview_url || null,
    custom_sources: Array.isArray(customSources) ? customSources : []
  };
};

const trackDedupeKey = (track) => {
  if (track?.spotify_id) return `spotify:${track.spotify_id}`;
  if (track?.apple_id) return `apple:${track.apple_id}`;
  if (track?.tidal_id) return `tidal:${track.tidal_id}`;
  const title = String(track?.title || '').toLowerCase().trim();
  const artist = String(track?.artist || '').toLowerCase().trim();
  if (!title && !artist) return null;
  return `meta:${artist}:${title}`;
};

const mergeTracks = ({ existing, incoming, mode, appendPosition }) => {
  if (mode === 'replace') {
    return incoming;
  }

  const existingKeys = new Set();
  for (const track of existing) {
    const key = trackDedupeKey(track);
    if (key) existingKeys.add(key);
  }

  const newTracks = [];
  for (const track of incoming) {
    const key = trackDedupeKey(track);
    if (key && existingKeys.has(key)) continue;
    if (key) existingKeys.add(key);
    newTracks.push(track);
  }

  return appendPosition === 'top'
    ? [...newTracks, ...existing]
    : [...existing, ...newTracks];
};

const persistTracks = ({ playlistId, finalTracks }) => {
  const db = getDatabase();
  const queries = getQueries();

  const tx = db.transaction(() => {
    queries.deleteTracksByPlaylistId.run(playlistId);
    let position = 1;
    for (const t of finalTracks) {
      const hasNoDSPIds = !t.spotify_id && !t.apple_id && !t.tidal_id;
      const hasNonDSPUrls = t.bandcamp_url;
      const linkingStatus = (hasNoDSPIds && hasNonDSPUrls) ? 'skipped' : 'pending';

      const customSourcesJson = t.custom_sources && Array.isArray(t.custom_sources)
        ? JSON.stringify(t.custom_sources)
        : null;

      queries.insertTrack.run(
        playlistId,
        position,
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
      position += 1;
    }
  });
  tx();
};

const updatePlaylistMetadata = ({ playlistId, playlistRow, resolvedPlaylist, platform, updateMetadata }) => {
  if (!updateMetadata) return;
  if (!resolvedPlaylist) return;

  const queries = getQueries();

  const next = { ...playlistRow };
  next.title = resolvedPlaylist.title ? resolvedPlaylist.title : next.title;
  next.description_short = resolvedPlaylist.description ? resolvedPlaylist.description : next.description_short;
  next.description = resolvedPlaylist.description ? resolvedPlaylist.description : next.description;
  next.image = resolvedPlaylist.image ? resolvedPlaylist.image : next.image;

  if (platform === 'spotify' && resolvedPlaylist.spotify_url) {
    next.spotify_url = resolvedPlaylist.spotify_url;
  }
  if (platform === 'apple' && resolvedPlaylist.apple_url) {
    next.apple_url = resolvedPlaylist.apple_url;
  }
  if (platform === 'tidal' && resolvedPlaylist.tidal_url) {
    next.tidal_url = resolvedPlaylist.tidal_url;
  }
  if (platform === 'soundcloud' && resolvedPlaylist.soundcloud_url) {
    next.soundcloud_url = resolvedPlaylist.soundcloud_url;
  }

  // Maintain required fields and custom action fields as-is.
  queries.updatePlaylist.run(
    next.title,
    next.publish_date,
    next.curator_id,
    next.curator_name,
    next.curator_type,
    next.description,
    next.description_short,
    next.tags,
    next.image,
    next.published ? 1 : 0,
    next.spotify_url,
    next.apple_url,
    next.tidal_url,
    next.soundcloud_url,
    next.youtube_music_url,
    next.custom_action_label,
    next.custom_action_url,
    next.custom_action_icon,
    next.custom_action_icon_source,
    next.auto_referral_enabled ? 1 : 0,
    playlistId
  );
};

const createPlaylistForCurator = ({ curator, resolvedPlaylist, platform }) => {
  const queries = getQueries();
  const title = resolvedPlaylist?.title || 'Imported playlist';
  const description = resolvedPlaylist?.description || '';
  const image = resolvedPlaylist?.image || '';

  const payload = {
    title,
    publish_date: new Date().toISOString().split('T')[0],
    curator_id: curator.id,
    curator_name: curator.name,
    curator_type: curator.profile_type || curator.type || 'artist',
    description,
    description_short: description,
    tags: '',
    image,
    published: 0,
    spotify_url: platform === 'spotify' ? (resolvedPlaylist?.spotify_url || '') : '',
    apple_url: platform === 'apple' ? (resolvedPlaylist?.apple_url || '') : '',
    tidal_url: platform === 'tidal' ? (resolvedPlaylist?.tidal_url || '') : '',
    soundcloud_url: platform === 'soundcloud' ? (resolvedPlaylist?.soundcloud_url || '') : '',
    youtube_music_url: platform === 'youtube_music' ? (resolvedPlaylist?.youtube_music_url || '') : '',
    custom_action_label: null,
    custom_action_url: null,
    custom_action_icon: null,
    custom_action_icon_source: null,
    auto_referral_enabled: 0
  };

  const result = queries.insertPlaylist.run(
    payload.title,
    payload.publish_date,
    payload.curator_id,
    payload.curator_name,
    payload.curator_type,
    payload.description,
    payload.description_short,
    payload.tags,
    payload.image,
    payload.published,
    payload.spotify_url,
    payload.apple_url,
    payload.tidal_url,
    payload.soundcloud_url,
    payload.youtube_music_url,
    payload.custom_action_label,
    payload.custom_action_url,
    payload.custom_action_icon,
    payload.custom_action_icon_source,
    payload.auto_referral_enabled
  );

  return result.lastInsertRowid;
};

export const runUrlImportJob = async (jobId) => {
  if (!jobId) return;
  if (RUNNING.has(jobId)) return;
  RUNNING.add(jobId);

  const queries = getQueries();

  try {
    const job = queries.getUrlImportJobById.get(jobId);
    if (!job) return;

    if (!['pending', 'resolving', 'matching', 'saving'].includes(job.status)) {
      return;
    }

    queries.updateUrlImportJobStatus.run('resolving', 'resolving', 'resolving', jobId);

    logger.info('URL_IMPORT', 'Job started', {
      jobId,
      curatorId: job.owner_curator_id,
      platform: job.source_platform,
      sourceUrl: job.source_url,
      mode: job.mode
    });

    const mode = normalizeMode(job.mode);
    const appendPosition = normalizeAppendPosition(job.append_position);
    const updateMetadata = normalizeBoolean(job.update_metadata, true);

    const resolved = await resolveUrlImport(job.source_url, { kind: job.kind, match: true });
    if (resolved.kind !== 'playlist') {
      throw new Error('Only playlist URL imports can be run as jobs right now');
    }

    queries.updateUrlImportJobStatus.run('matching', 'matching', 'matching', jobId);

    const curator = queries.getCuratorById.get(job.owner_curator_id);
    if (!curator) {
      throw new Error('Curator not found for URL import job');
    }

    let existingPlaylistId = job.target_playlist_id ? Number(job.target_playlist_id) : null;

    // Reuse draft from same session if available
    if (!existingPlaylistId && job.draft_session_id) {
      const siblingDraft = queries.findDraftBySessionId.get(job.draft_session_id, job.owner_curator_id);
      if (siblingDraft?.created_playlist_id) {
        existingPlaylistId = Number(siblingDraft.created_playlist_id);
        logger.info('URL_IMPORT', 'Reusing draft from same session', {
          jobId,
          draftSessionId: job.draft_session_id,
          reusingPlaylistId: existingPlaylistId,
          fromJobId: siblingDraft.id
        });
      }
    }

    const playlistId = existingPlaylistId || createPlaylistForCurator({
      curator,
      resolvedPlaylist: resolved.playlist,
      platform: resolved.platform
    });

    const playlistRow = queries.getPlaylistById.get(playlistId);
    if (!playlistRow) {
      throw new Error('Target playlist not found');
    }
    if (playlistRow.curator_id !== curator.id) {
      throw new Error('Access denied: playlist not owned by curator');
    }

    const tracks = Array.isArray(resolved.tracks) ? resolved.tracks : [];
    queries.updateUrlImportJobProgress.run(tracks.length, 0, jobId);

    // Log track resolution details for debugging
    const tracksWithArtwork = tracks.filter(t => t.artwork_url || t.album_artwork_url).length;
    logger.info('URL_IMPORT', 'Tracks resolved', {
      jobId,
      playlistId,
      platform: resolved.platform,
      trackCount: tracks.length,
      tracksWithArtwork,
      tracksWithoutArtwork: tracks.length - tracksWithArtwork
    });

    if (tracksWithArtwork === 0 && tracks.length > 0) {
      logger.warn('URL_IMPORT', 'No track artwork found during import', {
        jobId,
        playlistId,
        platform: resolved.platform,
        trackCount: tracks.length
      });
    }

    // Ensure the source playlist URL surfaces as a custom source for imported tracks
    const normalizedTracks = tracks.map((t) => ({
      ...t,
      custom_sources: Array.isArray(t.custom_sources) ? t.custom_sources : []
    }));

    // Matching already happens in resolveUrlImport; this loop is used to report progress.
    let processed = 0;
    for (const _ of normalizedTracks) {
      processed += 1;
      if (processed === 1 || processed % 10 === 0 || processed === normalizedTracks.length) {
        queries.updateUrlImportJobProgress.run(normalizedTracks.length, processed, jobId);
      }
    }

    queries.updateUrlImportJobStatus.run('saving', 'saving', 'saving', jobId);

    const existingTracksRows = queries.getTracksByPlaylistId.all(playlistId) || [];
    const existingTracks = existingTracksRows.map(normalizeTrackRowToDraft);

    const finalTracks = mergeTracks({
      existing: existingTracks,
      incoming: normalizedTracks,
      mode,
      appendPosition
    });

    updatePlaylistMetadata({
      playlistId,
      playlistRow,
      resolvedPlaylist: resolved.playlist,
      platform: resolved.platform,
      updateMetadata
    });

    persistTracks({ playlistId, finalTracks });
    triggerBackup();

    queries.updateUrlImportJobResult.run(serialize({
      playlist_id: playlistId,
      platform: resolved.platform,
      source_url: job.source_url,
      imported_tracks: normalizedTracks.length,
      total_tracks: finalTracks.length,
      mode,
      append_position: appendPosition
    }), jobId);

    queries.updateUrlImportJobStatus.run('completed', 'completed', 'completed', jobId);

    logger.info('URL_IMPORT', 'Job completed', {
      jobId,
      playlistId,
      platform: resolved.platform,
      importedTracks: normalizedTracks.length,
      totalTracks: finalTracks.length,
      mode,
      appendPosition
    });
  } catch (error) {
    logger.error('URL_IMPORT_JOB', 'URL import job failed', {
      jobId,
      error: error.message
    });
    try {
      queries.updateUrlImportJobError.run(error.message || 'URL import failed', jobId);
      queries.updateUrlImportJobStatus.run('failed', 'failed', 'failed', jobId);
    } catch (_) {}
  } finally {
    RUNNING.delete(jobId);
  }
};

export const startUrlImportJob = (jobId) => {
  setImmediate(() => {
    runUrlImportJob(jobId).catch((err) => {
      logger.error('URL_IMPORT_JOB', 'Unhandled URL import job error', { jobId, error: err.message });
    });
  });
};

export default {
  startUrlImportJob,
  runUrlImportJob
};
