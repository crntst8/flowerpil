import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { authorizeMusicKit, getMusicKitInstance } from '@shared/utils/musicKitUtils';

const AppleImport = ({ onImportSuccess }) => {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [error, setError] = useState('');
  const [importingId, setImportingId] = useState(null);
  const [pasteUrl, setPasteUrl] = useState('');

  const refreshStatus = async () => {
    try {
      const res = await fetch('/api/v1/export/auth/status', { credentials: 'include' });
      const json = await res.json();
      if (res.ok && json.success) setConnected(!!json.data?.apple?.connected);
    } catch {}
  };

  const loadPlaylists = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/apple/import/playlists', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load Apple playlists');
      setPlaylists(json.data?.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus().then(() => { /* no-op */ });
  }, []);

  useEffect(() => {
    if (connected) loadPlaylists();
  }, [connected]);

  const handleConnect = async () => {
    try {
      setLoading(true);
      const dev = await fetch('/api/v1/apple/developer-token', { credentials: 'include' });
      const dj = await dev.json();
      if (!dev.ok || !dj.success) throw new Error(dj.error || 'Failed to get developer token');
      const music = await getMusicKitInstance(dj.data.token);
      const mut = await authorizeMusicKit(music);
      if (!mut) throw new Error('Authorization cancelled');
      const saveRes = await fetch('/api/v1/apple/auth/token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ musicUserToken: mut })
      });
      const saveJson = await saveRes.json();
      if (!saveRes.ok || !saveJson.success) throw new Error(saveJson.error || 'Failed to save token');
      await refreshStatus();
      await loadPlaylists();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (playlistId) => {
    try {
      setImportingId(playlistId);
      const res = await fetch(`/api/v1/apple/import/${encodeURIComponent(playlistId)}`, { method: 'POST', credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Import failed');
      onImportSuccess?.(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setImportingId(null);
    }
  };

  const parseApplePlaylistFromUrl = (url) => {
    try {
      const u = new URL(url);
      // Expect /{storefront}/playlist/{slug}/{id}
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex(p => p === 'playlist');
      if (idx > 0 && parts[idx+2]) {
        return { storefront: parts[0], id: parts[idx+2] };
      }
      // Fallback: /playlist/{slug}/{id}
      if (parts[0] === 'playlist' && parts[2]) {
        return { storefront: 'us', id: parts[2] };
      }
    } catch {}
    return null;
  };

  const importByUrl = async () => {
    setError('');
    const parsed = parseApplePlaylistFromUrl(pasteUrl.trim());
    if (!parsed) {
      setError('Invalid Apple Music playlist URL');
      return;
    }
    try {
      setImportingId(parsed.id);
      const qs = parsed.storefront ? `?storefront=${encodeURIComponent(parsed.storefront)}` : '';
      const res = await fetch(`/api/v1/apple/catalog/playlists/${encodeURIComponent(parsed.id)}${qs}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Import failed');
      onImportSuccess?.(json.data);
      setPasteUrl('');
    } catch (e) {
      setError(e.message);
    } finally {
      setImportingId(null);
    }
  };

  return (
    <DashedBox>
      <Header>
        <h3>Import from Apple Music</h3>
        <p>Import tracks from your Apple Music library playlists</p>
      </Header>
      {error && <ErrorText>{error}</ErrorText>}
      {!connected ? (
        <ConnectBox>
          <Button onClick={handleConnect} disabled={loading}>{loading ? 'Connecting…' : 'Connect Apple Music'}</Button>
        </ConnectBox>
      ) : (
        <List>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Button onClick={loadPlaylists} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
          </div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
            <label htmlFor="appleUrl" style={{ fontFamily: theme.fonts.mono, fontSize: 12 }}>Or paste Apple Music playlist URL</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <input id="appleUrl" value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} placeholder="https://music.apple.com/…/playlist/…/pl.u-…" style={{ padding: 8 }} />
              <Button onClick={importByUrl} disabled={!pasteUrl.trim() || !!importingId}>Import by URL</Button>
            </div>
          </div>
          {loading ? (
            <div>Loading playlists…</div>
          ) : playlists.length === 0 ? (
            <div>
              No playlists found. Apple’s API only returns playlists saved to your Library. 
              Open Apple Music, add a playlist to your Library, then click Refresh.
            </div>
          ) : (
            playlists.map(pl => (
              <Row key={pl.id}>
                <div className="name">{pl.attributes?.name || 'Untitled'}</div>
                <div className="meta">{Number.isFinite(pl?.attributes?.trackCount) ? `${pl.attributes.trackCount} tracks` : ''}</div>
                <div className="actions">
                  <Button onClick={() => handleImport(pl.id)} disabled={!!importingId} variant="success">
                    {importingId === pl.id ? 'Importing…' : 'Import Tracks'}
                  </Button>
                </div>
              </Row>
            ))
          )}
        </List>
      )}
    </DashedBox>
  );
};

const Header = styled.div`
  margin-bottom: ${theme.spacing.md};
`; 
const ErrorText = styled.div`
  color: ${theme.colors.error};
  font-family: ${theme.fonts.mono};
  margin-bottom: ${theme.spacing.sm};
`;
const ConnectBox = styled.div`
  display: flex; align-items: center; gap: ${theme.spacing.sm};
`;
const List = styled.div`
  display: grid; gap: ${theme.spacing.sm};
`;
const Row = styled.div`
  display: grid; grid-template-columns: 1fr auto auto; gap: ${theme.spacing.sm};
  align-items: center; border: ${theme.borders.dashed} ${theme.colors.gray[300]}; padding: ${theme.spacing.sm};
  .name { font-family: ${theme.fonts.mono}; }
  .meta { color: ${theme.colors.gray[500]}; font-size: 12px; }
`;

export default AppleImport;
