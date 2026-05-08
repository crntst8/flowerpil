import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import { useAuth } from '@shared/contexts/AuthContext';
import {
  Button,
  Input,
  Select,
  tokens,
  theme,
  mediaQuery,
} from '../ui/index.jsx';

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

const HelperText = styled.p.withConfig({
  shouldForwardProp: (prop) => !['$error', '$success'].includes(prop),
})`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${props => props.$error ? theme.colors.danger : props.$success ? theme.colors.success : theme.colors.darkgray};
`;

const ModeToggle = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${tokens.spacing[2]};
`;

const UrlInputRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: ${tokens.spacing[2]};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

export default function SpotifyLibrarySelectionDropdown({
  selectedPlaylistId,
  onSelectPlaylist,
  onPlaylistLoaded,
  label = 'Select Spotify Playlist',
  helperText,
  required = true
}) {
  const { authenticatedFetch, user } = useAuth();
  const [mode, setMode] = useState('library');
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [spotifyConnected, setSpotifyConnected] = useState(null);

  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState(null);
  const [loadedPlaylist, setLoadedPlaylist] = useState(null);

  useEffect(() => {
    const fetchPlaylists = async () => {
      if (!user?.id) return;

      setLoading(true);
      setError(null);

      try {
        const res = await authenticatedFetch('/api/v1/curator/dsp/spotify/playlists', { method: 'GET' });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));

          if (
            data.code === 'AUTH_REQUIRED' ||
            data.code === 'AUTH_EXPIRED' ||
            data.code === 'AUTH_REFRESH_FAILED' ||
            data.code === 'DSP_AUTH_REQUIRED'
          ) {
            setSpotifyConnected(false);
            setMode('url');
            return;
          }

          throw new Error(data.message || 'Failed to fetch playlists');
        }

        const data = await res.json();
        const spotifyPlaylists = data.data?.items || [];

        setPlaylists(spotifyPlaylists);
        setSpotifyConnected(true);
      } catch (err) {
        console.error('Failed to fetch Spotify playlists', err);
        if (err.isDspAuth || err.code === 'DSP_AUTH_REQUIRED') {
          setSpotifyConnected(false);
          setMode('url');
        } else {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPlaylists();
  }, [user, authenticatedFetch]);

  const handleLoadFromUrl = useCallback(async () => {
    if (!urlInput.trim()) return;

    setUrlLoading(true);
    setUrlError(null);
    setLoadedPlaylist(null);

    try {
      const res = await authenticatedFetch('/api/v1/curator/dsp/spotify/playlist-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to load playlist');
      }

      setLoadedPlaylist(data.data);

      if (onSelectPlaylist) {
        onSelectPlaylist(data.data.playlist.id);
      }
      if (onPlaylistLoaded) {
        onPlaylistLoaded(data.data);
      }
    } catch (err) {
      console.error('Failed to load playlist from URL:', err);
      setUrlError(err.message || 'Failed to load playlist');
    } finally {
      setUrlLoading(false);
    }
  }, [urlInput, authenticatedFetch, onSelectPlaylist, onPlaylistLoaded]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setUrlError(null);
    setLoadedPlaylist(null);
    if (newMode === 'url') {
      onSelectPlaylist?.(null);
    }
  };

  return (
    <FormGroup>
      {label && (
        <Label>
          {label}{required && ' *'}
        </Label>
      )}

      <ModeToggle>
        <Button
          type="button"
          $variant={mode === 'library' ? 'primary' : 'default'}
          onClick={() => handleModeChange('library')}
          disabled={loading || spotifyConnected === false}
          title={spotifyConnected === false ? 'Connect Spotify in DSP Settings to use your library' : ''}
        >
          My library
        </Button>
        <Button
          type="button"
          $variant={mode === 'url' ? 'primary' : 'default'}
          onClick={() => handleModeChange('url')}
        >
          Paste URL
        </Button>
      </ModeToggle>

      {mode === 'library' && (
        <>
          <Select
            value={selectedPlaylistId || ''}
            onChange={(e) => onSelectPlaylist(e.target.value)}
            disabled={loading || playlists.length === 0}
          >
            <option value="">
              {loading ? 'Loading playlists...' : 'Choose a Spotify playlist from your library'}
            </option>
            {playlists.map(playlist => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name} ({playlist.tracks?.total || 0} tracks)
              </option>
            ))}
          </Select>

          {helperText && !error && (
            <HelperText>{helperText}</HelperText>
          )}

          {error && (
            <HelperText $error>
              {error}
            </HelperText>
          )}

          {!loading && !error && playlists.length === 0 && spotifyConnected !== false && (
            <HelperText $error>
              No Spotify playlists found. Create playlists in your Spotify library first.
            </HelperText>
          )}

          {spotifyConnected === false && (
            <HelperText>
              Spotify not connected. Use &quot;Paste URL&quot; for public playlists, or connect Spotify in DSP Settings.
            </HelperText>
          )}
        </>
      )}

      {mode === 'url' && (
        <>
          <UrlInputRow>
            <Input
              type="text"
              placeholder="https://open.spotify.com/playlist/..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              disabled={urlLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLoadFromUrl();
                }
              }}
            />
            <Button
              type="button"
              $variant="primary"
              onClick={handleLoadFromUrl}
              disabled={urlLoading || !urlInput.trim()}
            >
              {urlLoading ? 'Loading...' : 'Load'}
            </Button>
          </UrlInputRow>

          <HelperText>
            Paste any public Spotify playlist URL. Private playlists require a connected Spotify account.
          </HelperText>

          {urlError && (
            <HelperText $error>
              {urlError}
            </HelperText>
          )}

          {loadedPlaylist && (
            <HelperText $success>
              Loaded: {loadedPlaylist.playlist.name} ({loadedPlaylist.tracks.length} tracks)
            </HelperText>
          )}
        </>
      )}
    </FormGroup>
  );
}

SpotifyLibrarySelectionDropdown.propTypes = {
  selectedPlaylistId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelectPlaylist: PropTypes.func,
  onPlaylistLoaded: PropTypes.func,
  label: PropTypes.string,
  helperText: PropTypes.string,
  required: PropTypes.bool,
};
