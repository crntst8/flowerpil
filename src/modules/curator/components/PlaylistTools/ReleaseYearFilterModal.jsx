import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import { Input, Button, tokens, theme } from '../ui/index.jsx';
import { useAuth } from '@shared/contexts/AuthContext';
import SpotifyLibrarySelectionDropdown from './SpotifyLibrarySelectionDropdown.jsx';
import CuratorModalShell, {
  CuratorModalSection,
  CuratorModalSectionTitle,
  CuratorModalStatus,
} from '../ui/CuratorModalShell.jsx';

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
`;

const Label = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
`;

const ResultsSection = styled.div`
  margin: ${tokens.spacing[2]} 0;
  padding: ${tokens.spacing[3]};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: rgba(0, 0, 0, 0.02);
`;

const ResultsTitle = styled.h3`
  margin: 0 0 ${tokens.spacing[2]} 0;
  font-size: ${theme.fontSizes.small};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
`;

const TrackList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  max-height: 280px;
  overflow-y: auto;
`;

const TrackItem = styled.div`
  padding: ${tokens.spacing[2]};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};

  .track-title {
    font-weight: ${theme.fontWeights.bold};
    margin-bottom: ${tokens.spacing[1]};
  }

  .track-meta {
    opacity: 0.7;
  }
`;

const TrackCount = styled.p`
  margin: 0 0 ${tokens.spacing[2]} 0;
  font-size: ${theme.fontSizes.small};
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.darkgray};
`;

const LinkInline = styled.a`
  color: inherit;
  text-decoration: underline;
  font-weight: ${theme.fontWeights.bold};
`;

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${tokens.spacing[2]};
  justify-content: flex-end;
`;

export default function ReleaseYearFilterModal({ isOpen, onClose }) {
  const { authenticatedFetch } = useAuth();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [releaseYear, setReleaseYear] = useState('');
  const [allTracks, setAllTracks] = useState([]);
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playlistName, setPlaylistName] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [creationError, setCreationError] = useState(null);
  const [creationResult, setCreationResult] = useState(null);

  const filterTracksByYear = (tracks, year) => {
    if (!year) {
      setFilteredTracks([]);
      return;
    }

    const filtered = tracks.filter(track => track.year && String(track.year) === String(year));

    setFilteredTracks(filtered);
    setCreationResult(null);
    setCreationError(null);
  };

  const handlePlaylistChange = async (playlistId) => {
    setSelectedPlaylistId(playlistId);
    setSelectedPlaylist(null);
    setError(null);
    setFilteredTracks([]);
    setPlaylistName('');
    setCreationError(null);
    setCreationResult(null);

    if (!playlistId) {
      setAllTracks([]);
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
      const tracks = data.data?.tracks || [];
      setSelectedPlaylist(data.data?.playlist || null);
      setAllTracks(tracks);

      if (releaseYear) {
        filterTracksByYear(tracks, releaseYear);
      }
    } catch (err) {
      setError(err.message || 'Failed to load tracks. Please try again.');
      setAllTracks([]);
      console.error('Error loading tracks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlaylistLoaded = (data) => {
    if (!data) return;

    setSelectedPlaylistId(data.playlist?.id || null);
    setSelectedPlaylist(data.playlist || null);
    setAllTracks(data.tracks || []);
    setError(null);
    setFilteredTracks([]);
    setPlaylistName('');
    setCreationError(null);
    setCreationResult(null);

    if (releaseYear && data.tracks?.length > 0) {
      filterTracksByYear(data.tracks, releaseYear);
    }
  };

  const handleYearChange = (e) => {
    const year = e.target.value;
    setReleaseYear(year);

    if (allTracks.length > 0) {
      filterTracksByYear(allTracks, year);
    }
  };

  const handleFilter = () => {
    if (allTracks.length > 0 && releaseYear) {
      filterTracksByYear(allTracks, releaseYear);
    }
  };

  const handleExport = () => {
    let exportText = `Tracks from ${releaseYear}\n\n`;

    filteredTracks.forEach((track, index) => {
      const artist = track.artist || 'Unknown Artist';
      const title = track.title || 'Unknown Title';
      const album = track.album || '';

      exportText += `${index + 1}. ${artist} - ${title}\n`;
      if (album) {
        exportText += `   Album: ${album}\n`;
      }
      if (track.spotify_id) {
        exportText += `   Spotify: https://open.spotify.com/track/${track.spotify_id}\n`;
      }
      exportText += '\n';
    });

    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `tracks_${releaseYear}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
  };

  const filteredTrackIds = useMemo(
    () => filteredTracks.map((track) => track.spotify_id).filter(Boolean),
    [filteredTracks]
  );

  const defaultPlaylistName = useMemo(() => {
    const parts = [];
    if (selectedPlaylist?.name) {
      parts.push(selectedPlaylist.name);
    }
    if (releaseYear) {
      parts.push(`${releaseYear} Filter`);
    }
    return parts.join(' • ');
  }, [selectedPlaylist, releaseYear]);

  useEffect(() => {
    if (defaultPlaylistName && !playlistName) {
      setPlaylistName(defaultPlaylistName);
    }
  }, [defaultPlaylistName, playlistName]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedPlaylistId(null);
      setSelectedPlaylist(null);
      setReleaseYear('');
      setAllTracks([]);
      setFilteredTracks([]);
      setPlaylistName('');
      setCreationError(null);
      setCreationResult(null);
      setError(null);
      setLoading(false);
      setCreatingPlaylist(false);
    }
  }, [isOpen]);

  const handleCreateSpotifyPlaylist = async () => {
    if (filteredTrackIds.length === 0) {
      setCreationError('No Spotify track IDs found in the filtered results.');
      return;
    }

    const nameToUse = (playlistName && playlistName.trim()) || defaultPlaylistName || 'Flowerpil Filtered Tracks';

    setCreatingPlaylist(true);
    setCreationError(null);
    setCreationResult(null);

    try {
      const res = await authenticatedFetch(
        '/api/v1/curator/dsp/spotify/playlist/create-from-tracks',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackIds: filteredTrackIds,
            playlistName: nameToUse,
            releaseYear: releaseYear || null,
            sourcePlaylistId: selectedPlaylistId,
            sourcePlaylistName: selectedPlaylist?.name || null
          })
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to create Spotify playlist');
      }

      setCreationResult(data.data || null);
    } catch (err) {
      setCreationError(err.message || 'Failed to create Spotify playlist. Please try again.');
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const canFilter = selectedPlaylistId && allTracks.length > 0 && releaseYear && !loading;
  const canExport = filteredTracks.length > 0;
  const canCreatePlaylist = Boolean(
    releaseYear &&
    filteredTrackIds.length > 0 &&
    !loading &&
    !creatingPlaylist
  );

  return (
    <CuratorModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Filter by release year"
      size="xl"
      mobileAlign="top"
      footer={(
        <ActionRow>
          <Button $variant="default" onClick={onClose}>Cancel</Button>
          {canCreatePlaylist && (
            <Button $variant="primary" onClick={handleCreateSpotifyPlaylist} disabled={!canCreatePlaylist}>
              {creatingPlaylist ? 'Creating...' : `Save ${filteredTrackIds.length} to Spotify`}
            </Button>
          )}
          {canExport && (
            <Button onClick={handleExport}>Export to file</Button>
          )}
          <Button $variant="primary" onClick={handleFilter} disabled={!canFilter}>Filter</Button>
        </ActionRow>
      )}
    >
      <SpotifyLibrarySelectionDropdown
        selectedPlaylistId={selectedPlaylistId}
        onSelectPlaylist={handlePlaylistChange}
        onPlaylistLoaded={handlePlaylistLoaded}
        label="Select Spotify Playlist"
        helperText="Choose a playlist from your Spotify library to filter"
      />

      <FormGroup>
        <Label>Release year</Label>
        <Input
          type="number"
          placeholder="e.g., 2025"
          value={releaseYear}
          onChange={handleYearChange}
          min="1900"
          max={new Date().getFullYear() + 1}
          disabled={!selectedPlaylistId || loading}
        />
      </FormGroup>

      {(filteredTracks.length > 0 || playlistName) && (
        <FormGroup>
          <Label>New Spotify playlist name</Label>
          <Input
            type="text"
            placeholder={defaultPlaylistName || 'e.g., Filtered Picks'}
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            disabled={!selectedPlaylistId || !releaseYear || loading}
          />
        </FormGroup>
      )}

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

      {filteredTracks.length > 0 && (
        <ResultsSection>
          <ResultsTitle>Filtered results</ResultsTitle>
          <TrackCount>
            Found {filteredTracks.length} track{filteredTracks.length !== 1 ? 's' : ''} from {releaseYear}
          </TrackCount>
          <TrackList>
            {filteredTracks.map((track, index) => (
              <TrackItem key={`${track.spotify_id || track.title || 'track'}-${index}`}>
                <div className="track-title">
                  {track.artist} - {track.title}
                </div>
                <div className="track-meta">
                  {track.album && `${track.album} • `}{track.year}
                </div>
              </TrackItem>
            ))}
          </TrackList>
        </ResultsSection>
      )}

      {allTracks.length > 0 && filteredTracks.length === 0 && releaseYear && !loading && (
        <CuratorModalStatus>
          <p>No tracks found from {releaseYear}. Total tracks in playlist: {allTracks.length}.</p>
        </CuratorModalStatus>
      )}

      {creationError && (
        <CuratorModalStatus $variant="error">
          <p>{creationError}</p>
        </CuratorModalStatus>
      )}

      {creationResult && (
        <CuratorModalStatus $variant="success">
          <p>
            Created &quot;{creationResult.playlistName}&quot; with {creationResult.tracksAdded} track{creationResult.tracksAdded === 1 ? '' : 's'}.
            {creationResult.playlistUrl ? (
              <>
                {' '}
                <LinkInline href={creationResult.playlistUrl} target="_blank" rel="noreferrer">Open in Spotify</LinkInline>
              </>
            ) : null}
          </p>
        </CuratorModalStatus>
      )}

      {filteredTracks.length > 0 && filteredTrackIds.length === 0 && (
        <CuratorModalStatus $variant="error">
          <p>Filtered tracks are missing Spotify IDs, so a playlist cannot be created.</p>
        </CuratorModalStatus>
      )}

      {filteredTracks.length > 0 && (
        <CuratorModalSection>
          <CuratorModalSectionTitle>Next step</CuratorModalSectionTitle>
          <p style={{ margin: 0, fontFamily: theme.fonts.primary, fontSize: theme.fontSizes.small }}>
            Export the list to text, or save the filtered set directly to Spotify.
          </p>
        </CuratorModalSection>
      )}
    </CuratorModalShell>
  );
}

ReleaseYearFilterModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
};
