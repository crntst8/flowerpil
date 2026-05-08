import { useState } from 'react';
import PropTypes from 'prop-types';
import styled, { keyframes } from 'styled-components';
import { Button, tokens, theme } from '../ui/index.jsx';
import { useAuth } from '@shared/contexts/AuthContext';
import SpotifyLibrarySelectionDropdown from './SpotifyLibrarySelectionDropdown.jsx';
import CuratorModalShell, {
  CuratorModalSection,
  CuratorModalSectionTitle,
  CuratorModalStatus,
} from '../ui/CuratorModalShell.jsx';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Spinner = styled.div`
  border: 4px solid ${theme.colors.lightgray};
  border-top: 4px solid ${theme.colors.black};
  border-radius: 50%;
  width: 48px;
  height: 48px;
  animation: ${spin} 1s linear infinite;
  margin: 0 auto;
`;

const LoadingOverlay = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${tokens.spacing[3]};
  padding: ${tokens.spacing[8]};
  text-align: center;

  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
  }

  .small {
    font-size: ${theme.fontSizes.tiny};
    opacity: 0.7;
  }
`;

const PreviewText = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const EstimatedSize = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.darkgray};
`;

export default function ArtworkDownloadModal({ isOpen, onClose }) {
  const { authenticatedFetch } = useAuth();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [trackCount, setTrackCount] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handlePlaylistChange = async (playlistId) => {
    setSelectedPlaylistId(playlistId);
    setError(null);
    setSuccess(false);

    if (!playlistId) {
      setSelectedPlaylist(null);
      setTrackCount(0);
      return;
    }

    try {
      const res = await authenticatedFetch(
        `/api/v1/curator/dsp/spotify/playlist/${playlistId}/tracks`,
        { method: 'GET' }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to load playlist');
      }

      const data = await res.json();
      const playlist = data.data?.playlist || {};
      const tracks = data.data?.tracks || [];

      setSelectedPlaylist({
        id: playlist.id,
        title: playlist.name,
        description: playlist.description,
        image: playlist.image
      });
      setTrackCount(tracks.length);
    } catch (err) {
      setError(err.message || 'Failed to load playlist details');
      console.error('Error loading playlist:', err);
    }
  };

  const handlePlaylistLoaded = (data) => {
    if (!data) return;

    setSelectedPlaylistId(data.playlist?.id || null);
    setSelectedPlaylist({
      id: data.playlist?.id,
      title: data.playlist?.name,
      description: data.playlist?.description,
      image: data.playlist?.image
    });
    setTrackCount(data.tracks?.length || 0);
    setError(null);
    setSuccess(false);
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);

    try {
      const response = await authenticatedFetch(
        '/api/v1/curator/dsp/spotify/playlist/artwork/download',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlistId: selectedPlaylistId })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Download failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;

      const filename = selectedPlaylist?.title
        ? `${selectedPlaylist.title.replace(/[^a-z0-9]/gi, '_')}_artwork.zip`
        : 'playlist_artwork.zip';
      a.download = filename;

      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);

      setSuccess(true);
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      console.error('Artwork download error:', err);
      setError(err.message || 'Failed to download artwork');
    } finally {
      setDownloading(false);
    }
  };

  const canDownload = selectedPlaylistId && trackCount > 0 && !downloading;

  return (
    <CuratorModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Download playlist artwork"
      size="lg"
      footer={!downloading && !success ? (
        <>
          <Button $variant="default" onClick={onClose}>Cancel</Button>
          <Button $variant="primary" onClick={handleDownload} disabled={!canDownload}>Download zip</Button>
        </>
      ) : null}
    >
      {downloading ? (
        <LoadingOverlay>
          <Spinner />
          <p>Creating artwork archive...</p>
          <p className="small">This may take a minute for large playlists.</p>
        </LoadingOverlay>
      ) : success ? (
        <CuratorModalStatus $variant="success">
          <p>Download complete.</p>
        </CuratorModalStatus>
      ) : (
        <>
          <SpotifyLibrarySelectionDropdown
            selectedPlaylistId={selectedPlaylistId}
            onSelectPlaylist={handlePlaylistChange}
            onPlaylistLoaded={handlePlaylistLoaded}
            label="Select Spotify Playlist"
            helperText="Artwork for all tracks will be downloaded as a ZIP file"
          />

          {error && (
            <CuratorModalStatus $variant="error">
              <p>{error}</p>
            </CuratorModalStatus>
          )}

          {selectedPlaylist && (
            <CuratorModalSection>
              <CuratorModalSectionTitle>Preview</CuratorModalSectionTitle>
              <PreviewText><strong>Playlist:</strong> {selectedPlaylist.title}</PreviewText>
              <PreviewText><strong>Tracks:</strong> {trackCount}</PreviewText>
              <EstimatedSize>Estimated size: ~{Math.round(trackCount * 0.3)}MB</EstimatedSize>
            </CuratorModalSection>
          )}
        </>
      )}
    </CuratorModalShell>
  );
}

ArtworkDownloadModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
};
