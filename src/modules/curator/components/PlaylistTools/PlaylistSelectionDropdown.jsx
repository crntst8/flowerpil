import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useAuth } from '@shared/contexts/AuthContext';
import { tokens, theme } from '../ui/index.jsx';

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
`;

const Label = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: bold;
  color: ${theme.colors.black};
`;

const Select = styled.select`
  width: 100%;
  height: ${tokens.sizing.inputHeight};
  padding: ${tokens.componentSpacing.inputPadding};
  border: 2px solid ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
  }
`;

const HelperText = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${props => props.$error ? theme.colors.danger : theme.colors.darkgray};
`;

export default function PlaylistSelectionDropdown({
  selectedPlaylistId,
  onSelectPlaylist,
  label = "Select Playlist",
  helperText,
  required = true
}) {
  const { authenticatedFetch, user } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPlaylists = async () => {
      if (!user?.id) return;

      setLoading(true);
      setError(null);

      try {
        const res = await authenticatedFetch(
          `/api/v1/playlists?curator_id=${user.id}`,
          { method: 'GET' }
        );

        if (!res.ok) {
          throw new Error('Failed to fetch playlists');
        }

        const data = await res.json();

        // Filter to published playlists only
        const published = (data.data || []).filter(p => p.is_published);
        setPlaylists(published);
      } catch (err) {
        console.error('Failed to fetch playlists', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPlaylists();
  }, [user, authenticatedFetch]);

  return (
    <FormGroup>
      {label && (
        <Label>
          {label}{required && ' *'}
        </Label>
      )}

      <Select
        value={selectedPlaylistId || ''}
        onChange={(e) => onSelectPlaylist(e.target.value)}
        disabled={loading || playlists.length === 0}
      >
        <option value="">
          {loading ? 'Loading playlists...' : 'Choose a playlist'}
        </option>
        {playlists.map(playlist => (
          <option key={playlist.id} value={playlist.id}>
            {playlist.title} ({playlist.track_count || 0} tracks)
          </option>
        ))}
      </Select>

      {helperText && !error && (
        <HelperText>{helperText}</HelperText>
      )}

      {error && (
        <HelperText $error>
          Error loading playlists: {error}
        </HelperText>
      )}

      {!loading && !error && playlists.length === 0 && (
        <HelperText $error>
          No published playlists found. Publish a playlist to use this tool.
        </HelperText>
      )}
    </FormGroup>
  );
}
