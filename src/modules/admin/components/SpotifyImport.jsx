import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button, Input } from '@shared/styles/GlobalStyles';
import { adminFetch, handleJsonResponse } from '../utils/adminApi';

const SpotifyImport = ({ onImportSuccess }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importingPlaylistId, setImportingPlaylistId] = useState(null);
  const [error, setError] = useState(null);


  const handleSpotifyAuth = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get authorization URL
      const response = await fetch('/api/v1/spotify/auth/url');
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      // Open Spotify authorization in new window
      const authWindow = window.open(
        data.data.authURL,
        'spotify-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      // Listen for the authorization code
      const handleMessage = async (event) => {
        if (event.origin !== window.location.origin) return;

        if (event.data.type === 'SPOTIFY_AUTH_SUCCESS') {
          authWindow.close();
          window.removeEventListener('message', handleMessage);

          try {
            // Exchange code for access token
            const tokenResponse = await fetch('/api/v1/spotify/auth/callback', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                code: event.data.code,
                state: event.data.state
              })
            });

            const tokenData = await tokenResponse.json();

            if (!tokenData.success) {
              throw new Error(tokenData.error);
            }

            setAccessToken(tokenData.data.access_token);
            setIsAuthenticated(true);
            await loadPlaylists(tokenData.data.access_token);

          } catch (error) {
            setError('Failed to authenticate with Spotify: ' + error.message);
          }
        } else if (event.data.type === 'SPOTIFY_AUTH_ERROR') {
          authWindow.close();
          window.removeEventListener('message', handleMessage);
          setError('Spotify authentication failed: ' + event.data.error);
        }
      };

      window.addEventListener('message', handleMessage);

      // Check if window was closed without completing auth
      const checkClosed = setInterval(() => {
        if (authWindow.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          setLoading(false);
        }
      }, 1000);

    } catch (error) {
      setError('Failed to initiate Spotify authentication: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPlaylists = async (token) => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/spotify/playlists', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setPlaylists(data.data.items || []);
    } catch (error) {
      setError('Failed to load playlists: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportPlaylist = async (playlistId, playlistName) => {
    try {
      setImportingPlaylistId(playlistId);
      setError(null);

      const response = await adminFetch(`/api/v1/spotify/import/${playlistId}`, {
        method: 'POST',
        headers: {
          'X-Spotify-Token': accessToken
        }
      });

      const data = await handleJsonResponse(response);

      if (onImportSuccess) {
        onImportSuccess(data.data);
      }

      // Reset form
      setIsAuthenticated(false);
      setAccessToken(null);
      setPlaylists([]);

    } catch (error) {
      setError('Failed to import playlist: ' + error.message);
    } finally {
      setImportingPlaylistId(null);
    }
  };

  const resetAuth = () => {
    setIsAuthenticated(false);
    setAccessToken(null);
    setPlaylists([]);
    setError(null);
  };

  return (
    <SpotifyImportContainer>
      <Header>
        <h3>Import from Spotify</h3>
        <p>Import tracks from Spotify playlists for playlist creation</p>
      </Header>

      {error && (
        <ErrorMessage>
          {error}
          <Button onClick={() => setError(null)} variant="text">×</Button>
        </ErrorMessage>
      )}

      {!isAuthenticated ? (
        <AuthSection>
          <Button 
            onClick={handleSpotifyAuth}
            disabled={loading}
            variant="primary"
          >
            {loading ? 'Connecting...' : 'Connect Spotify Account'}
          </Button>
          <AuthNote>
            You'll be redirected to Spotify to authorize access to your playlists
          </AuthNote>
        </AuthSection>
      ) : (
        <ImportSection>
          <AuthSection>
            <Button onClick={resetAuth} variant="text">
              Change Account
            </Button>
          </AuthSection>

          {loading ? (
            <LoadingMessage>Loading playlists...</LoadingMessage>
          ) : (
            <PlaylistsList>
              <PlaylistsHeader>
                <h4>Your Playlists ({playlists.length})</h4>
              </PlaylistsHeader>
              
              {playlists.length === 0 ? (
                <EmptyState>No playlists found</EmptyState>
              ) : (
                <PlaylistsGrid>
                  {playlists.map((playlist) => (
                    <PlaylistItem key={playlist.id}>
                      <PlaylistImage>
                        {playlist.images?.[0]?.url ? (
                          <img src={playlist.images[0].url} alt={playlist.name} />
                        ) : (
                          <NoImage>NO IMAGE</NoImage>
                        )}
                      </PlaylistImage>
                      
                      <PlaylistInfo>
                        <PlaylistName>{playlist.name}</PlaylistName>
                        <PlaylistMeta>
                          {playlist.tracks?.total || 0} tracks
                          {playlist.public ? ' • Public' : ' • Private'}
                        </PlaylistMeta>
                        {playlist.description && (
                          <PlaylistDescription>
                            {playlist.description.length > 100
                              ? playlist.description.substring(0, 100) + '...'
                              : playlist.description
                            }
                          </PlaylistDescription>
                        )}
                      </PlaylistInfo>

                      <PlaylistActions>
                        <Button
                          onClick={() => handleImportPlaylist(playlist.id, playlist.name)}
                          disabled={importingPlaylistId !== null}
                          variant="success"
                        >
                          {importingPlaylistId === playlist.id ? 'Importing...' : 'Import Tracks'}
                        </Button>
                      </PlaylistActions>
                    </PlaylistItem>
                  ))}
                </PlaylistsGrid>
              )}
            </PlaylistsList>
          )}
        </ImportSection>
      )}
    </SpotifyImportContainer>
  );
};

// Styled Components
const SpotifyImportContainer = styled(DashedBox)`
  margin-bottom: ${theme.spacing.lg};
`;

const Header = styled.div`
  margin-bottom: ${theme.spacing.lg};
  
  h3 {
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: black;
    margin-bottom: ${theme.spacing.xs};
  }
  
  p {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
  }
`;

const ErrorMessage = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.md};
  background: rgba(220, 38, 127, 0.1);
  border: ${theme.borders.solidAct} ${theme.colors.red};
  color: ${theme.colors.red};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.md};
`;

const AuthSection = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
`;

const AuthNote = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  margin-top: ${theme.spacing.md};
`;

const ImportSection = styled.div`
  /* Styles for import section */
`;


const LoadingMessage = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.gray[600]};
`;

const PlaylistsList = styled.div`
  /* Styles for playlists list */
`;

const PlaylistsHeader = styled.div`
  margin-bottom: ${theme.spacing.md};
  
  h4 {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.body};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.gray[500]};
  font-family: ${theme.fonts.mono};
`;

const PlaylistsGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  max-height: 400px;
  overflow-y: auto;
`;

const PlaylistItem = styled.div`
  display: grid;
  grid-template-columns: 60px 1fr auto;
  gap: ${theme.spacing.md};
  align-items: start;
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} ${theme.colors.gray[200]};
  background: rgba(255, 255, 255, 0.02);
`;

const PlaylistImage = styled.div`
  width: 60px;
  height: 60px;
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  overflow: hidden;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const NoImage = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  text-transform: uppercase;
`;

const PlaylistInfo = styled.div`
  min-width: 0;
`;

const PlaylistName = styled.h5`
  font-weight: ${theme.fontWeights.medium};
  margin-bottom: ${theme.spacing.xs};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PlaylistMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
  margin-bottom: ${theme.spacing.xs};
`;

const PlaylistDescription = styled.p`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[700]};
  line-height: 1.4;
`;

const PlaylistActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
`;

export default SpotifyImport;