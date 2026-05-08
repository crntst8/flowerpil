import { useState } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import { Button, tokens, theme } from '../ui/index.jsx';
import { useAuth } from '@shared/contexts/AuthContext';
import SpotifyLibrarySelectionDropdown from './SpotifyLibrarySelectionDropdown.jsx';
import CuratorModalShell, {
  CuratorModalHint,
  CuratorModalSection,
  CuratorModalSectionTitle,
  CuratorModalStack,
  CuratorModalStatus,
} from '../ui/CuratorModalShell.jsx';

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};
  cursor: pointer;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    margin: 0;
  }
`;

const TrackCount = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

export default function TextExportModal({ isOpen, onClose }) {
  const { authenticatedFetch } = useAuth();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [exportOptions, setExportOptions] = useState({
    artistTitle: true,
    albumYear: true,
    platformUrls: true,
    includeNotes: false
  });

  const handlePlaylistChange = async (playlistId) => {
    setSelectedPlaylistId(playlistId);
    setError(null);

    if (!playlistId) {
      setTracks([]);
      return;
    }

    setLoading(true);
    try {
      const res = await authenticatedFetch(
        `/api/v1/curator/dsp/spotify/playlist/${playlistId}/tracks`,
        { method: 'GET' }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to load tracks');
      }

      const data = await res.json();
      setTracks(data.data?.tracks || []);
    } catch (err) {
      setError(err.message || 'Failed to load tracks. Please try again.');
      setTracks([]);
      console.error('Error loading tracks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlaylistLoaded = (data) => {
    if (!data) return;

    setSelectedPlaylistId(data.playlist?.id || null);
    setTracks(data.tracks || []);
    setError(null);
  };

  const buildPlatformUrls = (track) => {
    const urls = {};

    if (track.spotify_id) {
      urls.spotify = `https://open.spotify.com/track/${track.spotify_id}`;
    }

    if (track.apple_music_url) {
      urls.apple = track.apple_music_url;
    } else if (track.apple_music_id) {
      urls.apple = `https://music.apple.com/us/song/${track.apple_music_id}`;
    }

    if (track.tidal_url) {
      urls.tidal = track.tidal_url;
    } else if (track.tidal_id) {
      urls.tidal = `https://tidal.com/browse/track/${track.tidal_id}`;
    }

    if (track.soundcloud_url) {
      urls.soundcloud = track.soundcloud_url;
    }

    if (track.bandcamp_url) {
      urls.bandcamp = track.bandcamp_url;
    }

    if (track.qobuz_url) {
      urls.qobuz = track.qobuz_url;
    }

    return urls;
  };

  const handleExport = () => {
    let exportText = '';

    tracks.forEach((track, index) => {
      if (exportOptions.artistTitle) {
        const artist = track.artist || 'Unknown Artist';
        const title = track.title || 'Unknown Title';
        exportText += `${artist} - ${title}\n`;
      }

      if (exportOptions.albumYear && (track.album || track.year)) {
        const parts = [];
        if (track.album) parts.push(track.album);
        if (track.year) parts.push(track.year);
        if (parts.length > 0) {
          exportText += `${parts.join(' - ')}\n`;
        }
      }

      if (exportOptions.platformUrls) {
        const urls = buildPlatformUrls(track);
        if (urls.spotify) exportText += `Spotify: ${urls.spotify}\n`;
        if (urls.apple) exportText += `Apple Music: ${urls.apple}\n`;
        if (urls.tidal) exportText += `TIDAL: ${urls.tidal}\n`;
        if (urls.qobuz) exportText += `Qobuz: ${urls.qobuz}\n`;
        if (urls.soundcloud) exportText += `SoundCloud: ${urls.soundcloud}\n`;
        if (urls.bandcamp) exportText += `Bandcamp: ${urls.bandcamp}\n`;
      }

      if (exportOptions.includeNotes && track.quote) {
        exportText += `Note: ${track.quote}\n`;
      }

      if (index < tracks.length - 1) {
        exportText += '\n';
      }
    });

    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `playlist_export_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      onClose();
    }, 100);
  };

  const toggleOption = (key) => {
    setExportOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const canExport = selectedPlaylistId && tracks.length > 0 && !loading;

  return (
    <CuratorModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Export playlist text"
      size="lg"
      footer={(
        <>
          <Button $variant="default" onClick={onClose}>Cancel</Button>
          <Button $variant="primary" onClick={handleExport} disabled={!canExport}>Export</Button>
        </>
      )}
    >
      <CuratorModalStack>
        <SpotifyLibrarySelectionDropdown
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={handlePlaylistChange}
          onPlaylistLoaded={handlePlaylistLoaded}
          label="Select Spotify Playlist to Export"
          helperText="Choose a playlist from your Spotify library or paste a URL"
        />

        {loading && (
          <CuratorModalStatus>
            <p>Loading tracks...</p>
          </CuratorModalStatus>
        )}

        {error && (
          <CuratorModalStatus $variant="error">
            <p>{error}</p>
          </CuratorModalStatus>
        )}

        {tracks.length > 0 && (
          <CuratorModalSection>
            <CuratorModalSectionTitle>Export options</CuratorModalSectionTitle>
            <CheckboxGroup>
              <CheckboxLabel>
                <input
                  type="checkbox"
                  checked={exportOptions.artistTitle}
                  onChange={() => toggleOption('artistTitle')}
                />
                Artist - title
              </CheckboxLabel>
              <CheckboxLabel>
                <input
                  type="checkbox"
                  checked={exportOptions.albumYear}
                  onChange={() => toggleOption('albumYear')}
                />
                Album and year
              </CheckboxLabel>
              <CheckboxLabel>
                <input
                  type="checkbox"
                  checked={exportOptions.platformUrls}
                  onChange={() => toggleOption('platformUrls')}
                />
                Platform URLs
              </CheckboxLabel>
              <CheckboxLabel>
                <input
                  type="checkbox"
                  checked={exportOptions.includeNotes}
                  onChange={() => toggleOption('includeNotes')}
                />
                Include track notes
              </CheckboxLabel>
            </CheckboxGroup>
            <CuratorModalHint>
              Choose the metadata to include in your downloadable `.txt` export.
            </CuratorModalHint>
          </CuratorModalSection>
        )}

        {tracks.length > 0 && (
          <TrackCount>
            {tracks.length} track{tracks.length !== 1 ? 's' : ''} ready to export.
          </TrackCount>
        )}
      </CuratorModalStack>
    </CuratorModalShell>
  );
}

TextExportModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
};
