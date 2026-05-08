import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme, Button, Input, TextArea, DashedBox } from '@shared/styles/GlobalStyles';
import { StatusMessage } from './shared';
import useAuthenticatedApi from '../hooks/useAuthenticatedApi';
import {
  getPlaylists,
  getPlaylistById as fetchPlaylist,
  savePlaylist,
  updatePlaylistMetadata
} from '../services/adminService';
import {
  fetchConfig,
  importSpotifyByUrl,
  fetchSpotifyLibraryPlaylists,
  importSpotifyLibraryPlaylist,
  refreshSpotifyImport,
  saveConfig,
  uploadPlaylistArtwork,
  triggerRecovery
} from '../services/perfectSundaysService';

const DEFAULT_CONFIG = {
  title: 'Perfect Sundays',
  description: '',
  playlist_ids: [],
  mega_playlist_links: {
    spotify: '',
    apple: '',
    tidal: ''
  },
  megaplaylist_title: 'megaplaylist',
  megaplaylist_image: '',
  default_curator_name: 'Perfect Sundays'
};

const PerfectSundaysAdmin = () => {
  const { isAuthenticated } = useAuthenticatedApi();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [playlists, setPlaylists] = useState([]);
  const [availablePlaylists, setAvailablePlaylists] = useState([]);
  const [existingSearch, setExistingSearch] = useState('');
  const [selectedExistingId, setSelectedExistingId] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importPreviews, setImportPreviews] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [creatingImports, setCreatingImports] = useState(false);
  const [libraryPlaylists, setLibraryPlaylists] = useState([]);
  const [librarySelection, setLibrarySelection] = useState(new Set());
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryPreviewLoading, setLibraryPreviewLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('');
  const [actionState, setActionState] = useState({});
  const [recoveryRunning, setRecoveryRunning] = useState(false);
  const [recoveryStats, setRecoveryStats] = useState(null);
  const [recoveryFailures, setRecoveryFailures] = useState([]);
  const [lastRecoveryAction, setLastRecoveryAction] = useState('');
  const [megaplaylistImageUploading, setMegaplaylistImageUploading] = useState(false);
  const fileInputsRef = useRef({});
  const megaplaylistFileInputRef = useRef(null);

  const playlistIds = useMemo(
    () => playlists.map((p) => p.id),
    [playlists]
  );

  const setActionFlag = useCallback((playlistId, flag, value) => {
    setActionState((prev) => ({
      ...prev,
      [playlistId]: { ...(prev[playlistId] || {}), [flag]: value }
    }));
  }, []);

  const normalizePlaylist = useCallback((data) => ({
    ...data,
    displayTitle: (data.custom_action_label || data.title || '').trim(),
    originalDisplayTitle: (data.custom_action_label || data.title || '').trim(),
    published: Boolean(data.published),
    publish_date: data.publish_date || '',
    curator_name: data.curator_name || config.default_curator_name || 'Perfect Sundays',
    apple_url: data.apple_url || '',
    originalAppleUrl: data.apple_url || ''
  }), [config.default_curator_name]);

  const loadPlaylistsByIds = useCallback(async (ids = []) => {
    const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(Number(id)))));
    const loaded = [];

    for (const id of uniqueIds) {
      try {
        const data = await fetchPlaylist(id);
        if (data?.id) {
          loaded.push(normalizePlaylist(data));
        }
      } catch (error) {
        console.warn('[PerfectSundaysAdmin] Failed to load playlist', id, error);
      }
    }

    return loaded;
  }, [normalizePlaylist]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const serverConfig = await fetchConfig();
      const merged = {
        ...DEFAULT_CONFIG,
        ...serverConfig,
        playlist_ids: Array.isArray(serverConfig?.playlist_ids) ? serverConfig.playlist_ids : []
      };
      setConfig(merged);

      if (merged.playlist_ids.length) {
        const loaded = await loadPlaylistsByIds(merged.playlist_ids);
        setPlaylists(loaded);
      } else {
        setPlaylists([]);
      }
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Failed to load config', error);
      setStatus({ type: 'error', message: 'Failed to load Perfect Sundays config' });
    } finally {
      setLoading(false);
    }
  }, [loadPlaylistsByIds]);

  const loadAvailable = useCallback(async () => {
    try {
      const list = await getPlaylists({ published: true });
      setAvailablePlaylists(Array.isArray(list) ? list : []);
    } catch (error) {
      console.warn('[PerfectSundaysAdmin] Failed to load existing playlists list', error);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadConfig();
    loadAvailable();
  }, [isAuthenticated, loadConfig, loadAvailable]);

  const loadSpotifyLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const data = await fetchSpotifyLibraryPlaylists({ all: true, max: 5000 });
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : data?.data?.items || [];
      setLibraryPlaylists(items);
      setLibrarySelection(new Set());
      if (items.length === 0) {
        setStatus({ type: 'warning', message: 'No playlists returned from Spotify library' });
      } else {
        const capped = data?.capped || data?.meta?.capped;
        const total = data?.total || items.length;
        const truncatedNote = capped ? ' (truncated — refine filter or raise max)' : '';
        setStatus({ type: 'success', message: `Loaded ${items.length}/${total} Spotify playlists${truncatedNote}` });
      }
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Failed to load Spotify library', error);
      const message = error?.details?.error || error?.message || 'Unable to load Spotify library playlists';
      setLibraryError(message);
      setStatus({ type: 'error', message });
    } finally {
      setLibraryLoading(false);
    }
  }, [fetchSpotifyLibraryPlaylists]);

  const toggleLibrarySelection = useCallback((playlistId, checked) => {
    const id = String(playlistId || '');
    if (!id) return;
    setLibrarySelection((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const updateConfigPlaylistIds = useCallback((ids) => {
    setConfig((prev) => ({ ...prev, playlist_ids: ids }));
  }, []);

  const handleLibraryCreate = useCallback(async () => {
    if (!librarySelection.size) {
      setStatus({ type: 'warning', message: 'Select at least one Spotify playlist' });
      return;
    }
    setLibraryPreviewLoading(true);
    setStatus({ type: '', message: '' });

    const createdPlaylists = [];
    let successCount = 0;
    let failCount = 0;

    for (const id of librarySelection) {
      try {
        const result = await importSpotifyLibraryPlaylist(id);
        const payload = result?.data || {};
        const spotifyPlaylist = payload.spotifyPlaylist || {};
        const tracks = payload.tracks || [];

        if (!tracks.length) {
          console.warn('[PerfectSundaysAdmin] Skipping playlist with no tracks', id);
          failCount++;
          continue;
        }

        // Directly create the playlist without preview
        // IMPORTANT: Create as UNPUBLISHED to prevent appearing on landing page
        // They will be published when "Publish / Update /perf" is clicked
        const playlistPayload = {
          title: spotifyPlaylist?.name || 'Perfect Sunday',
          curator_name: config.default_curator_name || 'Perfect Sundays',
          curator_type: 'curator',
          description: spotifyPlaylist?.description || '',
          description_short: spotifyPlaylist?.description || '',
          image: spotifyPlaylist?.image || '',
          published: true,
          publish_date: new Date().toISOString().split('T')[0],
          spotify_url: spotifyPlaylist?.spotify_url || `https://open.spotify.com/playlist/${id}`,
          tracks,
          custom_action_label: spotifyPlaylist?.name || 'Perfect Sunday'
        };

        const created = await savePlaylist(playlistPayload);
        if (created?.id) {
          const normalized = normalizePlaylist(created);
          createdPlaylists.push(normalized);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error('[PerfectSundaysAdmin] Failed to create playlist from library', id, error);
        failCount++;
      }
    }

    if (createdPlaylists.length) {
      setPlaylists((prev) => {
        const next = [...prev, ...createdPlaylists];
        updateConfigPlaylistIds(next.map((p) => p.id));
        return next;
      });
      setLibrarySelection(new Set());
      setStatus({
        type: 'success',
        message: `Created ${successCount} playlist(s)${failCount > 0 ? ` (${failCount} failed)` : ''}`
      });
    } else {
      setStatus({ type: 'error', message: 'Failed to create playlists' });
    }

    setLibraryPreviewLoading(false);
  }, [config.default_curator_name, librarySelection, normalizePlaylist, updateConfigPlaylistIds]);

  const handleImportPreview = useCallback(async () => {
    const urls = Array.from(
      new Set(
        importInput
          .split(/\s+/)
          .map((line) => line.trim())
          .filter(Boolean)
      )
    );

    if (!urls.length) {
      setStatus({ type: 'warning', message: 'Add Spotify playlist URLs first' });
      return;
    }

    setImportLoading(true);
    setImportPreviews([]);
    setStatus({ type: '', message: '' });

    const previews = [];
    for (const url of urls) {
      try {
        const result = await importSpotifyByUrl(url);
        const payload = result?.data || {};
        const spotifyPlaylist = payload.spotifyPlaylist || {};
        previews.push({
          url,
          selected: true,
          spotifyPlaylist,
          tracks: payload.tracks || [],
          name: spotifyPlaylist.name || url
        });
      } catch (error) {
        console.warn('[PerfectSundaysAdmin] Failed to import preview', url, error);
        previews.push({
          url,
          selected: false,
          error: error?.message || 'Import failed'
        });
      }
    }

    setImportPreviews(previews);
    setImportLoading(false);
  }, [importInput]);

  const handleCreateImports = useCallback(async () => {
    const selected = importPreviews.filter((preview) => preview.selected && preview.tracks);
    if (!selected.length) {
      setStatus({ type: 'warning', message: 'Select at least one playlist to import' });
      return;
    }

    setCreatingImports(true);
    const createdPlaylists = [];

    for (const preview of selected) {
      try {
        // IMPORTANT: Create as UNPUBLISHED to prevent appearing on landing page
        // They will be published when "Publish / Update /perf" is clicked
        const payload = {
          title: preview.spotifyPlaylist?.name || 'Perfect Sunday',
          curator_name: config.default_curator_name || 'Perfect Sundays',
          curator_type: 'curator',
          description: preview.spotifyPlaylist?.description || '',
          description_short: preview.spotifyPlaylist?.description || '',
          image: preview.spotifyPlaylist?.image || '',
          published: true,
          publish_date: new Date().toISOString().split('T')[0],
          spotify_url: preview.spotifyPlaylist?.spotify_url || preview.url,
          tracks: preview.tracks || [],
          custom_action_label: preview.spotifyPlaylist?.name || 'Perfect Sunday'
        };

        const created = await savePlaylist(payload);
        if (created?.id) {
          const normalized = normalizePlaylist(created);
          createdPlaylists.push(normalized);
        }
      } catch (error) {
        console.error('[PerfectSundaysAdmin] Failed to create playlist from import', preview.url, error);
        setStatus({ type: 'error', message: 'Some imports failed - check console for details' });
      }
    }

    if (createdPlaylists.length) {
      setPlaylists((prev) => {
        const next = [...prev, ...createdPlaylists];
        updateConfigPlaylistIds(next.map((p) => p.id));
        return next;
      });
      setStatus({ type: 'success', message: `Imported ${createdPlaylists.length} playlist(s)` });
      setImportPreviews([]);
      setImportInput('');
    }

    setCreatingImports(false);
  }, [config.default_curator_name, importPreviews, normalizePlaylist, updateConfigPlaylistIds]);

  const updatePlaylistField = useCallback(async (playlist, changes, retryOnConflict = true) => {
    const payload = {
      title: playlist.title,
      publish_date: playlist.publish_date,
      curator_name: playlist.curator_name || config.default_curator_name || 'Perfect Sundays',
      curator_type: playlist.curator_type || 'curator',
      description: playlist.description || '',
      description_short: playlist.description_short || '',
      tags: playlist.tags || '',
      image: playlist.image || '',
      published: playlist.published ?? true,
      spotify_url: playlist.spotify_url || '',
      apple_url: playlist.apple_url || '',
      tidal_url: playlist.tidal_url || '',
      soundcloud_url: playlist.soundcloud_url || '',
      custom_action_label: (playlist.displayTitle || playlist.title || '').trim(),
      custom_action_url: playlist.custom_action_url || '',
      custom_action_icon: playlist.custom_action_icon || '',
      custom_action_icon_source: playlist.custom_action_icon_source || '',
      ...changes
    };

    const result = await updatePlaylistMetadata(
      playlist.id,
      payload,
      playlist.updated_at
    );

    // Handle 409 conflict by retrying with fresh data
    if (result?.conflict && retryOnConflict && result.current) {
      console.log('[PerfectSundaysAdmin] Conflict detected, retrying with fresh data', playlist.id);
      const freshPlaylist = normalizePlaylist(result.current);
      return updatePlaylistField(freshPlaylist, changes, false);
    }

    if (result?.data) {
      const updated = normalizePlaylist(result.data);
      setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? updated : p)));
      return updated;
    }

    return null;
  }, [config.default_curator_name, normalizePlaylist]);

  const handleExistingAdd = useCallback(async () => {
    const id = Number.parseInt(selectedExistingId, 10);
    if (!Number.isFinite(id)) return;
    if (playlistIds.includes(id)) {
      setStatus({ type: 'warning', message: 'Playlist already added' });
      return;
    }

    try {
      const data = await fetchPlaylist(id);
      if (data?.id) {
        // Ensure playlist is published before adding to Perfect Sundays
        if (!data.published) {
          await updatePlaylistField(data, { published: true });
          data.published = true;
        }

        setPlaylists((prev) => {
          const next = [...prev, normalizePlaylist(data)];
          updateConfigPlaylistIds(next.map((p) => p.id));
          return next;
        });
        setStatus({ type: 'success', message: 'Playlist added' });
        setSelectedExistingId('');
      }
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Failed to add playlist', error);
      setStatus({ type: 'error', message: 'Unable to add playlist' });
    }
  }, [normalizePlaylist, playlistIds, selectedExistingId, updateConfigPlaylistIds, updatePlaylistField]);

  const handleRemovePlaylist = useCallback((playlistId) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    updateConfigPlaylistIds(playlistIds.filter((id) => id !== playlistId));
  }, [playlistIds, updateConfigPlaylistIds]);

  const persistDisplayTitleChanges = useCallback(async () => {
    const dirty = playlists.filter((playlist) => {
      const current = (playlist.displayTitle || '').trim();
      const original = (playlist.originalDisplayTitle || '').trim();
      return current && current !== original;
    });

    for (const playlist of dirty) {
      setActionFlag(playlist.id, 'savingTitle', true);
      try {
        await updatePlaylistField(playlist, {
          custom_action_label: (playlist.displayTitle || playlist.title || '').trim()
        });
      } finally {
        setActionFlag(playlist.id, 'savingTitle', false);
      }
    }

    return dirty.length;
  }, [playlists, setActionFlag, updatePlaylistField]);

  const handleSaveConfig = useCallback(async () => {
    setSavingConfig(true);
    setStatus({ type: '', message: '' });
    try {
      await persistDisplayTitleChanges();
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Failed to persist display titles before saving config', error);
      setStatus({ type: 'error', message: 'Could not save grid titles' });
      setSavingConfig(false);
      return;
    }
    const payload = {
      ...config,
      playlist_ids: playlists.map((p) => p.id)
    };
    try {
      const saved = await saveConfig(payload);
      setConfig({
        ...payload,
        ...saved,
        playlist_ids: Array.isArray(saved?.playlist_ids) ? saved.playlist_ids : payload.playlist_ids
      });

      setStatus({ type: 'success', message: 'Saved Perfect Sundays settings' });
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Failed to save config', error);
      setStatus({ type: 'error', message: 'Could not save Perfect Sundays settings' });
    } finally {
      setSavingConfig(false);
    }
  }, [config, persistDisplayTitleChanges, playlists, updatePlaylistField]);

  const handleDisplayTitleChange = useCallback(async (playlist, value) => {
    setActionFlag(playlist.id, 'savingTitle', true);
    try {
      await updatePlaylistField(playlist, { custom_action_label: value });
      setStatus({ type: 'success', message: 'Display title updated' });
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Failed to update display title', error);
      setStatus({ type: 'error', message: 'Could not update title' });
    } finally {
      setActionFlag(playlist.id, 'savingTitle', false);
    }
  }, [setActionFlag, updatePlaylistField]);

  const handleAppleUrlChange = useCallback(async (playlist, value) => {
    setActionFlag(playlist.id, 'savingAppleUrl', true);
    try {
      await updatePlaylistField(playlist, { apple_url: value });
      setStatus({ type: 'success', message: 'Apple Music URL updated' });
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Failed to update Apple Music URL', error);
      setStatus({ type: 'error', message: 'Could not update Apple Music URL' });
    } finally {
      setActionFlag(playlist.id, 'savingAppleUrl', false);
    }
  }, [setActionFlag, updatePlaylistField]);

  const handleArtworkUpload = useCallback(async (playlist, file) => {
    if (!file) return;
    setActionFlag(playlist.id, 'uploadingImage', true);
    try {
      const response = await uploadPlaylistArtwork(playlist.id, file);
      const image = response?.data?.image || playlist.image;

      // The upload endpoint already updates the database, so just update local state
      // and refetch the playlist to get the fresh updated_at timestamp
      const freshPlaylist = await fetchPlaylist(playlist.id);
      if (freshPlaylist?.id) {
        const normalized = normalizePlaylist(freshPlaylist);
        setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? normalized : p)));
      }

      setStatus({ type: 'success', message: 'Artwork updated' });
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Failed to upload artwork', error);
      setStatus({ type: 'error', message: 'Artwork upload failed' });
    } finally {
      setActionFlag(playlist.id, 'uploadingImage', false);
      if (fileInputsRef.current[playlist.id]) {
        fileInputsRef.current[playlist.id].value = '';
      }
    }
  }, [setActionFlag, normalizePlaylist]);

  const handleMegaplaylistArtworkUpload = useCallback(async (file) => {
    if (!file) return;
    setMegaplaylistImageUploading(true);
    try {
      const response = await uploadPlaylistArtwork(null, file);
      if (response?.data?.image) {
        setConfig((prev) => ({ ...prev, megaplaylist_image: response.data.image }));
        setStatus({ type: 'success', message: 'Megaplaylist artwork uploaded' });
      }
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Failed to upload megaplaylist artwork', error);
      setStatus({ type: 'error', message: 'Megaplaylist artwork upload failed' });
    } finally {
      setMegaplaylistImageUploading(false);
      if (megaplaylistFileInputRef.current) {
        megaplaylistFileInputRef.current.value = '';
      }
    }
  }, []);

  const handleRefreshImport = useCallback(async (playlist) => {
    setActionFlag(playlist.id, 'refreshing', true);
    try {
      await refreshSpotifyImport({
        playlistId: playlist.id,
        updateMetadata: false,
        refreshPublishDate: false
      });
      setStatus({ type: 'success', message: 'Refresh triggered (metadata preserved)' });
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Failed to refresh import', error);
      setStatus({ type: 'error', message: 'Refresh import failed' });
    } finally {
      setActionFlag(playlist.id, 'refreshing', false);
    }
  }, [setActionFlag]);

  const filteredAvailable = useMemo(() => {
    const needle = existingSearch.trim().toLowerCase();
    return availablePlaylists
      .filter((p) => !playlistIds.includes(p.id))
      .filter((p) => !needle || p.title.toLowerCase().includes(needle) || p.curator_name?.toLowerCase().includes(needle));
  }, [availablePlaylists, existingSearch, playlistIds]);

  const filteredLibrary = useMemo(() => {
    const needle = libraryFilter.trim().toLowerCase();
    return libraryPlaylists
      .filter((pl) => pl && (pl.name || pl.id))
      .filter((pl) => !needle || pl.name?.toLowerCase().includes(needle) || pl.owner?.display_name?.toLowerCase().includes(needle) || pl.owner?.id?.toLowerCase().includes(needle))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [libraryFilter, libraryPlaylists]);

  const handleRecovery = useCallback(async (action) => {
    if (playlistIds.length === 0) {
      setStatus({ type: 'error', message: 'No playlists to process' });
      return;
    }

    setLastRecoveryAction(action);
    setRecoveryStats(null);
    setRecoveryFailures([]);
    setRecoveryRunning(true);
    setStatus({ type: '', message: '' });

    try {
      const result = await triggerRecovery(action, playlistIds);

      const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0;
      const successCount = Array.isArray(result?.success) ? result.success.length : 0;
      let nextStatus = null;

      if (action === 'confirm-tracks') {
        const updatedCount = result?.updated || 0;
        const addedCount = result?.addedTracks || 0;
        const baseMessage = result?.message
          || `Confirm Tracks completed for ${successCount} playlist(s); ${updatedCount} updated, ${addedCount} track(s) added.`;
        setRecoveryStats({
          ...(result?.stats || {}),
          updated: updatedCount,
          addedTracks: addedCount,
          total: result?.total || playlistIds.length
        });
        setRecoveryFailures(Array.isArray(result?.failed) ? result.failed : []);
        nextStatus = {
          type: failedCount ? 'warning' : 'success',
          message: baseMessage
        };
      } else if (successCount > 0) {
        const actionLabel = action === 're-export' ? 'Re-export' : action === 're-link' ? 'Re-linking' : 'Recovery';
        nextStatus = {
          type: 'success',
          message: `${actionLabel} queued for ${successCount} playlist(s). Check logs for progress.`
        };
      }

      if (failedCount > 0) {
        console.error('[PerfectSundaysAdmin] Recovery failed for some playlists:', result.failed);
        setStatus({
          type: 'error',
          message: `${failedCount} playlist(s) failed. Check console for details.`
        });
      } else if (nextStatus) {
        setStatus(nextStatus);
      }
    } catch (error) {
      console.error('[PerfectSundaysAdmin] Recovery failed', error);
      setStatus({ type: 'error', message: 'Recovery operation failed' });
    } finally {
      setRecoveryRunning(false);
    }
  }, [playlistIds]);

  if (!isAuthenticated) {
    return <div>Authenticate to manage Perfect Sundays.</div>;
  }

  return (
    <Surface>
      <Header>
        <div>
          <Title>Perfect Sundays</Title>
          <Subtitle>Manage playlists and /perf settings</Subtitle>
        </div>
        <Button
          onClick={handleSaveConfig}
          disabled={savingConfig || loading}
          variant="primary"
        >
          {savingConfig ? 'Saving…' : 'Publish / Update /perf'}
        </Button>
      </Header>

      {status.message && <StatusMessage type={status.type} message={status.message} />}

        <Section>
          <SectionHeader>
          <SectionTitle>Page Settings</SectionTitle>
          <SectionHint>Title, description, megaplaylist, curator name</SectionHint>
        </SectionHeader>
        <FieldGrid>
          <div>
            <Label>Page title</Label>
            <Input
              value={config.title}
              onChange={(e) => setConfig((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Perfect Sundays"
            />
          </div>
          <div>
            <Label>Default curator name</Label>
            <Input
              value={config.default_curator_name}
              onChange={(e) => setConfig((prev) => ({ ...prev, default_curator_name: e.target.value }))}
              placeholder="Perfect Sundays"
            />
          </div>
        </FieldGrid>

        <div>
          <Label>Description</Label>
          <TextArea
            rows={3}
            value={config.description}
            onChange={(e) => setConfig((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Intro text for /perf…"
          />
        </div>

        <FieldGrid>
          <div>
            <Label>Megaplaylist Title</Label>
            <Input
              value={config.megaplaylist_title || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, megaplaylist_title: e.target.value }))}
              placeholder="megaplaylist"
            />
          </div>
          <div>
            <Label>Megaplaylist Artwork</Label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Button
                type="button"
                onClick={() => megaplaylistFileInputRef.current?.click()}
                disabled={megaplaylistImageUploading}
                variant="secondary"
              >
                {megaplaylistImageUploading ? 'Uploading...' : config.megaplaylist_image ? 'Change Image' : 'Upload Image'}
              </Button>
              {config.megaplaylist_image && (
                <Button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, megaplaylist_image: '' }))}
                  variant="danger"
                  disabled={megaplaylistImageUploading}
                >
                  Remove
                </Button>
              )}
            </div>
            <HiddenFileInput
              type="file"
              accept="image/*"
              ref={megaplaylistFileInputRef}
              onChange={(e) => handleMegaplaylistArtworkUpload(e.target.files?.[0])}
            />
            {config.megaplaylist_image && (
              <div style={{ marginTop: '8px' }}>
                <img
                  src={config.megaplaylist_image}
                  alt="Megaplaylist artwork"
                  style={{ maxWidth: '150px', maxHeight: '150px', borderRadius: '4px' }}
                />
              </div>
            )}
          </div>
        </FieldGrid>

        <FieldGrid>
          <div>
            <Label>Megaplaylist — Spotify</Label>
            <Input
              value={config.mega_playlist_links.spotify || ''}
              onChange={(e) => setConfig((prev) => ({
                ...prev,
                mega_playlist_links: { ...prev.mega_playlist_links, spotify: e.target.value }
              }))}
              placeholder="https://open.spotify.com/playlist/…"
            />
          </div>
          <div>
            <Label>Megaplaylist — Apple</Label>
            <Input
              value={config.mega_playlist_links.apple || ''}
              onChange={(e) => setConfig((prev) => ({
                ...prev,
                mega_playlist_links: { ...prev.mega_playlist_links, apple: e.target.value }
              }))}
              placeholder="https://music.apple.com/…"
            />
          </div>
          <div>
            <Label>Megaplaylist — Tidal</Label>
            <Input
              value={config.mega_playlist_links.tidal || ''}
              onChange={(e) => setConfig((prev) => ({
                ...prev,
                mega_playlist_links: { ...prev.mega_playlist_links, tidal: e.target.value }
              }))}
              placeholder="https://tidal.com/playlist/…"
            />
          </div>
        </FieldGrid>
      </Section>

        <Section>
          <SectionHeader>
          <SectionTitle>Recovery Tools</SectionTitle>
          <SectionHint>Advanced tools for exports, linking, track sync</SectionHint>
        </SectionHeader>
        <FieldGrid>
          <Button
            onClick={() => handleRecovery('confirm-tracks')}
            disabled={recoveryRunning || playlistIds.length === 0}
            variant="primary"
          >
            {recoveryRunning ? 'Running…' : 'Confirm Tracks'}
          </Button>
          <Button
            onClick={() => handleRecovery('re-export')}
            disabled={recoveryRunning || playlistIds.length === 0}
            variant="secondary"
          >
            {recoveryRunning ? 'Running…' : 'Re-trigger Exports'}
          </Button>
          <Button
            onClick={() => handleRecovery('re-link')}
            disabled={recoveryRunning || playlistIds.length === 0}
            variant="secondary"
          >
            {recoveryRunning ? 'Running…' : 'Re-trigger Cross-Linking'}
          </Button>
          <Button
            onClick={() => handleRecovery('both')}
            disabled={recoveryRunning || playlistIds.length === 0}
            variant="secondary"
          >
            {recoveryRunning ? 'Running…' : 'Re-trigger Both'}
          </Button>
        </FieldGrid>
        {lastRecoveryAction === 'confirm-tracks' && recoveryStats && (
          <RecoverySummary>
            <div className="header">
              <strong>Confirm Tracks summary</strong>
              <span>{recoveryStats.addedTracks || 0} track(s) added • {recoveryStats.updated || 0} playlist(s) updated</span>
            </div>
            <StatList>
              <li>Playlists processed: {recoveryStats.total || playlistIds.length}</li>
              <li>Failures: {recoveryStats.failed || 0}</li>
              <li>Fallbacks used: {recoveryStats.usedFallbacks || 0}</li>
              <li>Source unavailable: {recoveryStats.sourceUnavailable || 0}</li>
              <li>Linking failures: {recoveryStats.linkingFailures || 0}</li>
              <li>Export failures: {recoveryStats.exportFailures || 0}</li>
            </StatList>
            {!!recoveryStats.actions && Object.keys(recoveryStats.actions).length > 0 && (
              <BreakdownRow>
                <label>Actions</label>
                <div>
                  {Object.entries(recoveryStats.actions)
                    .sort((a, b) => b[1] - a[1])
                    .map(([actionKey, count]) => (
                      <span key={actionKey}>{actionKey}: {count}</span>
                    ))}
                </div>
              </BreakdownRow>
            )}
            {!!recoveryStats.tokenSources && Object.keys(recoveryStats.tokenSources).length > 0 && (
              <BreakdownRow>
                <label>Token sources</label>
                <div>
                  {Object.entries(recoveryStats.tokenSources)
                    .sort((a, b) => b[1] - a[1])
                    .map(([source, count]) => (
                      <span key={source}>{source}: {count}</span>
                    ))}
                </div>
              </BreakdownRow>
            )}
            {recoveryFailures.length > 0 && (
              <BreakdownRow>
                <label>Failures</label>
                <FailureList>
                  {recoveryFailures.slice(0, 3).map((fail) => (
                    <li key={fail.playlistId}>
                      #{fail.playlistId}: {fail.reason || 'Unknown error'}
                    </li>
                  ))}
                  {recoveryFailures.length > 3 && (
                    <li>+{recoveryFailures.length - 3} more (check logs)</li>
                  )}
                </FailureList>
              </BreakdownRow>
            )}
          </RecoverySummary>
        )}
      </Section>

        <Section>
          <SectionHeader>
          <SectionTitle>Bulk import from Spotify</SectionTitle>
          <SectionHint>Paste Spotify URLs to import</SectionHint>
        </SectionHeader>

        <ImportGrid>
          <div>
            <Label>Spotify playlist URLs</Label>
            <TextArea
              rows={4}
              placeholder="One URL per line…"
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
            />
            <Button
              onClick={handleImportPreview}
              disabled={importLoading}
              variant="secondary"
            >
              {importLoading ? 'Fetching…' : 'Preview imports'}
            </Button>
          </div>

          <PreviewColumn>
            {importPreviews.length === 0 && (
              <PlaceholderBox>
                <strong>No previews yet.</strong>
                <span>Paste URLs and preview.</span>
              </PlaceholderBox>
            )}

            {importPreviews.length > 0 && (
              <>
                <PreviewList>
                  {importPreviews.map((preview) => (
                    <PreviewRow key={preview.url} $error={!!preview.error}>
                      <input
                        type="checkbox"
                        checked={!!preview.selected}
                        disabled={!!preview.error}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setImportPreviews((prev) => prev.map((p) => p.url === preview.url ? { ...p, selected: checked } : p));
                        }}
                      />
                      <div className="info">
                        <div className="title">{preview.name || preview.url}</div>
                        <div className="meta">{preview.tracks?.length || 0} tracks</div>
                        {preview.error && <div className="error">Error: {preview.error}</div>}
                      </div>
                    </PreviewRow>
                  ))}
                </PreviewList>
                <Button
                  onClick={handleCreateImports}
                  disabled={creatingImports}
                  variant="primary"
                >
                  {creatingImports ? 'Creating…' : 'Create selected playlists'}
                </Button>
              </>
            )}
          </PreviewColumn>
        </ImportGrid>

        <LibraryBox>
          <LibraryHeader>
            <div>
              <Label>Use your Spotify library</Label>
              <LibraryHint>Load your library to pick playlists.</LibraryHint>
            </div>
            <LibraryActions>
              <Button
                onClick={loadSpotifyLibrary}
                disabled={libraryLoading}
                variant="secondary"
              >
                {libraryLoading ? 'Loading…' : 'Load library'}
              </Button>
              <Button
                onClick={handleLibraryCreate}
                disabled={librarySelection.size === 0 || libraryPreviewLoading || libraryLoading}
                variant="primary"
              >
                {libraryPreviewLoading ? 'Creating…' : 'Create selected playlists'}
              </Button>
            </LibraryActions>
          </LibraryHeader>

          {libraryError && <InlineError>{libraryError}</InlineError>}

          <LibraryFilters>
            <div>
              <Label>Filter library</Label>
              <Input
                value={libraryFilter}
                onChange={(e) => setLibraryFilter(e.target.value)}
                placeholder="Search by title or owner"
              />
            </div>
            <LibraryActions>
              <LibraryNote>{librarySelection.size} selected</LibraryNote>
              <Button
                variant="text"
                onClick={() => setLibrarySelection(new Set())}
                disabled={librarySelection.size === 0}
              >
                Clear
              </Button>
            </LibraryActions>
          </LibraryFilters>

          {libraryLoading ? (
            <PlaceholderBox>Loading Spotify library…</PlaceholderBox>
          ) : filteredLibrary.length === 0 ? (
            <PlaceholderBox>
              {libraryPlaylists.length === 0 ? 'Load your Spotify library to pick playlists.' : 'No playlists match this filter.'}
            </PlaceholderBox>
          ) : (
            <LibraryList>
              {filteredLibrary.map((pl) => {
                const id = pl?.id || pl?.uri;
                if (!id) return null;
                const checked = librarySelection.has(String(id));
                return (
                  <LibraryRow key={id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleLibrarySelection(id, e.target.checked)}
                    />
                    <div className="info">
                      <LibraryTitle>{pl.name || 'Untitled playlist'}</LibraryTitle>
                      <LibraryMeta>{(pl.owner?.display_name || pl.owner?.id || 'Unknown owner')} • {(pl.tracks?.total ?? 0)} tracks</LibraryMeta>
                    </div>
                    <LibraryMeta>{pl.public ? 'Public' : 'Private'}</LibraryMeta>
                  </LibraryRow>
                );
              })}
            </LibraryList>
          )}

          <LibraryHint>Creates Flowerpil playlists for selection.</LibraryHint>
        </LibraryBox>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>Add existing playlists</SectionTitle>
          <SectionHint>Add a published playlist</SectionHint>
        </SectionHeader>
        <ExistingGrid>
          <div>
            <Label>Search</Label>
            <Input
              value={existingSearch}
              onChange={(e) => setExistingSearch(e.target.value)}
              placeholder="Filter by title or curator"
            />
          </div>
          <div>
            <Label>Select</Label>
            <Select
              value={selectedExistingId}
              onChange={(e) => setSelectedExistingId(e.target.value)}
            >
              <option value="">Select a playlist</option>
              {filteredAvailable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} — {p.curator_name || 'Unknown'}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>&nbsp;</Label>
            <Button onClick={handleExistingAdd} disabled={!selectedExistingId} variant="secondary">
              Add to Perfect Sundays
            </Button>
          </div>
        </ExistingGrid>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>Included playlists</SectionTitle>
          <SectionHint>Edit grid titles, artwork, imports, remove</SectionHint>
        </SectionHeader>
        {loading ? (
          <PlaceholderBox>Loading playlists…</PlaceholderBox>
        ) : playlists.length === 0 ? (
          <PlaceholderBox>No playlists selected yet.</PlaceholderBox>
        ) : (
          <PlaylistGrid>
            {playlists
              .slice()
              .sort((a, b) => (a.displayTitle || '').localeCompare(b.displayTitle || ''))
              .map((playlist) => {
                const actions = actionState[playlist.id] || {};
                return (
                  <PlaylistRow key={playlist.id}>
                    <Thumb style={{ backgroundImage: playlist.image ? `url(${playlist.image})` : 'none' }}>
                      {!playlist.image && <span>No artwork</span>}
                    </Thumb>
                    <PlaylistMeta>
                      <div className="title">{playlist.title}</div>
                      <div className="meta">{playlist.curator_name || '—'} • {playlist.spotify_url ? 'Spotify linked' : 'No DSP link'}</div>
                      <FieldGroup>
                        <Label>Grid title</Label>
                        <Input
                          value={playlist.displayTitle}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPlaylists((prev) => prev.map((p) => p.id === playlist.id ? { ...p, displayTitle: value } : p));
                          }}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next && next !== playlist.displayTitle) {
                              handleDisplayTitleChange(playlist, next);
                            }
                          }}
                          disabled={actions.savingTitle}
                        />
                      </FieldGroup>
                      <FieldGroup>
                        <Label>Apple Music URL</Label>
                        <Input
                          value={playlist.apple_url}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPlaylists((prev) => prev.map((p) => p.id === playlist.id ? { ...p, apple_url: value } : p));
                          }}
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            if (next !== playlist.originalAppleUrl) {
                              handleAppleUrlChange(playlist, next);
                            }
                          }}
                          placeholder="https://music.apple.com/..."
                          disabled={actions.savingAppleUrl}
                        />
                      </FieldGroup>
                      <ActionRow>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (fileInputsRef.current[playlist.id]) {
                              fileInputsRef.current[playlist.id].click();
                            }
                          }}
                          disabled={actions.uploadingImage}
                        >
                          {actions.uploadingImage ? 'Uploading…' : 'Replace Image'}
                        </Button>
                        <HiddenFileInput
                          type="file"
                          accept="image/*"
                          ref={(el) => { fileInputsRef.current[playlist.id] = el; }}
                          onChange={(e) => handleArtworkUpload(playlist, e.target.files?.[0])}
                        />
                        <Button
                          variant="secondary"
                          onClick={() => handleRefreshImport(playlist)}
                          disabled={actions.refreshing}
                        >
                          {actions.refreshing ? 'Refreshing…' : 'Refresh Import'}
                        </Button>
                        <Button variant="danger" onClick={() => handleRemovePlaylist(playlist.id)}>
                          Remove
                        </Button>
                      </ActionRow>
                    </PlaylistMeta>
                  </PlaylistRow>
                );
              })}
          </PlaylistGrid>
        )}
      </Section>
    </Surface>
  );
};

const Surface = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  padding: clamp(${theme.spacing.md}, 2vw, ${theme.spacing.xl});
  background: ${theme.colors.fpwhite};
  border-radius: 12px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const Title = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.4rem, 3vw, 2rem);
  letter-spacing: -0.4px;
`;

const Subtitle = styled.p`
  margin: 0;
  color: ${theme.colors.black[500]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const Section = styled(DashedBox)`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-size: clamp(1.1rem, 2vw, 1.4rem);
  letter-spacing: -0.3px;
`;

const SectionHint = styled.span`
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.black[500]};
  font-size: ${theme.fontSizes.small};
`;

const FieldGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
`;

const Label = styled.label`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.xs};
  letter-spacing: 0.03em;
  text-transform: uppercase;
`;

const ImportGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
`;

const PreviewColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const PreviewList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  max-height: 240px;
  overflow-y: auto;
`;

const PreviewRow = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$error' })`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: ${theme.spacing.sm};
  align-items: center;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solidThin} ${({ $error }) => $error ? theme.colors.error : 'rgba(0, 0, 0, 0.15)'};
  border-radius: 8px;

  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    font-weight: ${theme.fontWeights.bold};
  }
  .meta {
    font-family: ${theme.fonts.mono};
    color: ${theme.colors.black[500]};
    font-size: ${theme.fontSizes.tiny};
  }
  .error {
    color: ${theme.colors.error};
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
  }
`;

const PlaceholderBox = styled.div`
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.03);
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  display: grid;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.black[600]};
`;

const LibraryBox = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.02);
`;

const LibraryHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const LibraryHint = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[500]};
`;

const RecoverySummary = styled(DashedBox)`
  display: grid;
  gap: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.02);

  .header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header strong {
    font-size: ${theme.fontSizes.medium};
  }

  .header span {
    font-family: ${theme.fonts.mono};
    color: ${theme.colors.black[600]};
    font-size: ${theme.fontSizes.small};
  }
`;

const StatList = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${theme.spacing.xs};
  margin: 0;
  padding-left: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.black[700]};
  font-size: ${theme.fontSizes.small};
`;

const BreakdownRow = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: ${theme.spacing.sm};
  align-items: baseline;

  label {
    font-family: ${theme.fonts.mono};
    color: ${theme.colors.black[600]};
    font-size: ${theme.fontSizes.tiny};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  div {
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing.xs};
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black[800]};
  }

  span {
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.04);
  }
`;

const FailureList = styled.ul`
  margin: 0;
  padding-left: ${theme.spacing.md};
  display: grid;
  gap: 4px;
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.error};
  font-size: ${theme.fontSizes.small};
`;

const LibraryActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  justify-content: flex-end;
`;

const InlineError = styled.div`
  color: ${theme.colors.error};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const LibraryFilters = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: minmax(220px, 1fr) auto;
  align-items: end;

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const LibraryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  max-height: 260px;
  overflow-y: auto;
`;

const LibraryRow = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: ${theme.spacing.sm};
  align-items: center;
  padding: ${theme.spacing.sm};
  border-radius: 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.1);
  background: ${theme.colors.fpwhite};

  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
`;

const LibraryTitle = styled.div`
  font-weight: ${theme.fontWeights.bold};
`;

const LibraryMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[500]};
`;

const LibraryNote = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[600]};
`;

const ExistingGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  align-items: end;
`;

const Select = styled.select`
  width: 100%;
  padding: ${theme.spacing.sm};
  border-radius: 6px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const PlaylistGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const PlaylistRow = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.sm};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
  background: ${theme.colors.fpwhite};

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const Thumb = styled.div`
  width: 100%;
  aspect-ratio: 1 / 1;
  background-size: cover;
  background-position: center;
  border-radius: 8px;
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.15);
  display: grid;
  place-items: center;
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.black[400]};
  text-align: center;
  padding: ${theme.spacing.xs};
`;

const PlaylistMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};

  .title {
    font-weight: ${theme.fontWeights.bold};
    font-size: ${theme.fontSizes.h5};
  }

  .meta {
    font-family: ${theme.fonts.mono};
    color: ${theme.colors.black[500]};
    font-size: ${theme.fontSizes.small};
  }
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const HiddenFileInput = styled.input`
  display: none;
`;

export default PerfectSundaysAdmin;
