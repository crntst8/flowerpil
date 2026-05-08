import { adminGet, adminPost, adminFetch, handleJsonResponse } from '../utils/adminApi';

export const fetchConfig = async () => {
  const result = await adminGet('/api/v1/admin/site-admin/perfect-sundays');
  return result?.config || {};
};

export const saveConfig = async (config) => {
  const result = await adminPost('/api/v1/admin/site-admin/perfect-sundays', config);
  return result?.config || config;
};

export const importSpotifyByUrl = async (url) => {
  const response = await adminFetch('/api/v1/spotify/import-url', {
    method: 'POST',
    body: JSON.stringify({ url })
  });
  return handleJsonResponse(response);
};

export const fetchSpotifyLibraryPlaylists = async ({ limit = 50, offset = 0, all = false, max } = {}) => {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit);
  if (offset) params.append('offset', offset);
  if (all) params.append('all', 'true');
  if (Number.isFinite(max)) params.append('max', max);
  const query = params.toString() ? `?${params.toString()}` : '';
  const result = await adminGet(`/api/v1/spotify/library/playlists${query}`);
  return result?.data || result;
};

export const importSpotifyLibraryPlaylist = async (playlistId) => {
  const response = await adminFetch(`/api/v1/spotify/library/import/${encodeURIComponent(playlistId)}`, {
    method: 'POST'
  });
  return handleJsonResponse(response);
};

export const refreshSpotifyImport = async ({ playlistId, updateMetadata = false, refreshPublishDate = false }) => {
  return adminPost('/api/v1/playlist-actions/import-now', {
    playlist_id: playlistId,
    source: 'spotify',
    mode: 'replace',
    update_metadata: updateMetadata,
    refresh_publish_date: refreshPublishDate
  });
};

export const uploadPlaylistArtwork = async (playlistId, file) => {
  const formData = new FormData();
  formData.append('artwork', file);
  if (playlistId) {
    formData.append('playlistId', playlistId);
  }

  const response = await adminFetch('/api/v1/artwork/playlist-upload', {
    method: 'POST',
    body: formData
  });

  return handleJsonResponse(response);
};

export const triggerRecovery = async (action, playlistIds) => {
  return adminPost('/api/v1/admin/site-admin/perfect-sundays/recovery', {
    action,
    playlistIds
  });
};
