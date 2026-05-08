import { getQueries } from '../database/db.js';

const queries = getQueries();

const safeParse = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const formatCsvValue = (value) => {
  if (value === null || typeof value === 'undefined') return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const buildCsvRow = (fields) => fields.map(formatCsvValue).join(',');

export const exportTransferResultsAsJSON = (jobId) => {
  const job = queries.getTransferJobById.get(jobId);
  if (!job) {
    const error = new Error('Transfer job not found');
    error.statusCode = 404;
    throw error;
  }

  const results = safeParse(job.results, {});
  const trackResults = safeParse(job.track_results, []);

  return JSON.stringify(
    {
      id: job.id,
      source_playlist_id: job.source_playlist_id,
      source_playlist_name: job.source_playlist_name,
      destinations: safeParse(job.destinations, []),
      status: job.status,
      totals: {
        total_tracks: job.total_tracks,
        tracks_processed: job.tracks_processed,
        tracks_matched: job.tracks_matched,
        tracks_failed: job.tracks_failed
      },
      results,
      track_results: trackResults
    },
    null,
    2
  );
};

export const exportTransferResultsAsCSV = (jobId) => {
  const job = queries.getTransferJobById.get(jobId);
  if (!job) {
    const error = new Error('Transfer job not found');
    error.statusCode = 404;
    throw error;
  }

  const trackResults = safeParse(job.track_results, []);

  const header = buildCsvRow([
    'Track Title',
    'Artist',
    'Album',
    'Spotify ISRC',
    'Spotify ID',
    'Apple Matched',
    'Apple Confidence',
    'Apple URL',
    'Apple Strategy',
    'TIDAL Matched',
    'TIDAL Confidence',
    'TIDAL URL',
    'TIDAL Strategy'
  ]);

  const lines = trackResults.map((track) => {
    const apple = track.apple || {};
    const tidal = track.tidal || {};

    return buildCsvRow([
      track.title || '',
      track.artist || '',
      track.album || '',
      track.isrc || '',
      track.spotify_id || '',
      apple.matched ? 'Y' : 'N',
      apple.confidence ?? '',
      apple.url || '',
      apple.strategy || '',
      tidal.matched ? 'Y' : 'N',
      tidal.confidence ?? '',
      tidal.url || '',
      tidal.strategy || ''
    ]);
  });

  return [header, ...lines].join('\n');
};

export default {
  exportTransferResultsAsJSON,
  exportTransferResultsAsCSV
};
