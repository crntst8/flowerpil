import React, { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';

const TidalImport = ({ onImportSuccess }) => {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [error, setError] = useState('');
  const [importingId, setImportingId] = useState(null);
  const pendingStateRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'TIDAL_EXPORT_AUTH_SUCCESS') {
        setTimeout(async () => { await refreshStatus(); await loadPlaylists(); }, 400);
      } else if (event.data?.type === 'TIDAL_EXPORT_AUTH_ERROR') {
        setError(event.data.error || 'Tidal authentication failed');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const refreshStatus = async () => {
    try {
      const res = await fetch('/api/v1/export/auth/status', { credentials: 'include' });
      const json = await res.json();
      if (res.ok && json.success) setConnected(!!json.data?.tidal?.connected);
    } catch {}
  };

  const loadPlaylists = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/tidal/playlists', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load Tidal playlists');
      const items = json.data?.data || [];
      setPlaylists(items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshStatus(); }, []);
  useEffect(() => { if (connected) loadPlaylists(); }, [connected]);

  const connectTidal = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/export/auth/tidal/url', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to start Tidal auth');
      pendingStateRef.current = json.data?.state || null;
      const popup = window.open(json.data.authUrl, 'tidal-oauth', 'width=600,height=700,scrollbars=yes,resizable=yes');
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = json.data.authUrl;
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (playlistId) => {
    try {
      setImportingId(playlistId);
      const res = await fetch(`/api/v1/tidal/import/${encodeURIComponent(playlistId)}`, { method: 'POST', credentials: 'include' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Import failed');
      onImportSuccess?.(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setImportingId(null);
    }
  };

  return (
    <DashedBox>
      <Header>
        <h3>Import from TIDAL</h3>
        <p>Import tracks from your TIDAL playlists</p>
      </Header>
      {error && <ErrorText>{error}</ErrorText>}
      {!connected ? (
        <ConnectBox>
          <Button onClick={connectTidal} disabled={loading}>{loading ? 'Connecting…' : 'Connect TIDAL'}</Button>
        </ConnectBox>
      ) : (
        <List>
          {loading ? (
            <div>Loading playlists…</div>
          ) : playlists.length === 0 ? (
            <div>No playlists found</div>
          ) : (
            playlists.map(pl => (
              <Row key={pl.id}>
                <div className="name">{pl.attributes?.name || pl.attributes?.title || 'Untitled'}</div>
                <div className="meta">{pl.attributes?.numberOfTracks || pl.attributes?.trackCount || pl.attributes?.numberOfItems || 0} tracks</div>
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

const Header = styled.div` margin-bottom: ${theme.spacing.md}; `;
const ErrorText = styled.div` color: ${theme.colors.error}; font-family: ${theme.fonts.mono}; margin-bottom: ${theme.spacing.sm}; `;
const ConnectBox = styled.div` display: flex; align-items: center; gap: ${theme.spacing.sm}; `;
const List = styled.div` display: grid; gap: ${theme.spacing.sm}; `;
const Row = styled.div`
  display: grid; grid-template-columns: 1fr auto auto; gap: ${theme.spacing.sm};
  align-items: center; border: ${theme.borders.dashed} ${theme.colors.gray[300]}; padding: ${theme.spacing.sm};
  .name { font-family: ${theme.fonts.mono}; }
  .meta { color: ${theme.colors.gray[500]}; font-size: 12px; }
`;

export default TidalImport;
