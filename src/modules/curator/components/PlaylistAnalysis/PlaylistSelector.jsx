import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { tokens, theme, Button, Tab, TabList } from '../ui/index.jsx';

const Container = styled.div`
  padding: ${tokens.spacing[4]} 0;
`;

const TabsContainer = styled.div`
  margin-bottom: ${tokens.spacing[6]};
`;

const TabContent = styled.div`
  min-height: 300px;
`;

const PlaylistGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: ${tokens.spacing[4]};
  margin-bottom: ${tokens.spacing[4]};
`;

const PlaylistCard = styled.button`
  background: ${theme.colors.fpwhite};
  border: 2px solid ${theme.colors.black};
  padding: ${tokens.spacing[3]};
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 4px 4px 0 ${theme.colors.black};
  }

  &:active {
    transform: translateY(0);
    box-shadow: 2px 2px 0 ${theme.colors.black};
  }

  img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border: 1px solid ${theme.colors.black};
  }

  h4 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: bold;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  p {
    margin: 0;
    font-size: 0.8rem;
    color: ${theme.colors.darkgray};
  }
`;

const ManualInputContainer = styled.div`
  max-width: 600px;
  margin: 0 auto;
  padding: ${tokens.spacing[6]};
`;

const FormField = styled.div`
  margin-bottom: ${tokens.spacing[4]};

  label {
    display: block;
    font-weight: bold;
    margin-bottom: ${tokens.spacing[2]};
    font-size: 1rem;
  }

  input {
    width: 100%;
    padding: ${tokens.spacing[3]};
    border: 2px solid ${theme.colors.black};
    font-size: 1rem;
    font-family: inherit;

    &:focus {
      outline: none;
      box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
    }
  }

  .hint {
    margin-top: ${tokens.spacing[2]};
    font-size: 0.85rem;
    color: ${theme.colors.darkgray};
  }
`;

const ButtonContainer = styled.div`
  display: flex;
  justify-content: center;
  margin-top: ${tokens.spacing[6]};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${tokens.spacing[8]};
  color: ${theme.colors.darkgray};

  p {
    margin: 0;
    font-size: 1.1rem;
  }
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: ${tokens.spacing[6]};
  color: ${theme.colors.darkgray};
`;

export default function PlaylistSelector({ onAnalyze, authenticatedFetch }) {
  const [sourceTab, setSourceTab] = useState('library');
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [hasSpotifyConnection, setHasSpotifyConnection] = useState(null); // null = checking, false = not connected, true = connected
  const [checkingConnection, setCheckingConnection] = useState(true);

  // Check Spotify connection status first
  useEffect(() => {
    const checkConnection = async () => {
      setCheckingConnection(true);
      try {
        const response = await authenticatedFetch('/api/v1/export/auth/status', {
          method: 'GET'
        });
        if (response.ok) {
          const data = await response.json();
          const spotifyStatus = data.data?.spotify || {};
          // Check primary status (already filtered by curator context) or curator context specifically
          const connected = spotifyStatus.connected === true || spotifyStatus.contexts?.curator?.connected === true;
          setHasSpotifyConnection(connected);
          if (!connected) {
            console.log('Spotify connection check:', {
              primary: spotifyStatus.connected,
              curator: spotifyStatus.contexts?.curator?.connected,
              flowerpil: spotifyStatus.contexts?.flowerpil?.connected
            });
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error('Failed to check Spotify connection status:', errorData);
          setHasSpotifyConnection(false);
        }
      } catch (error) {
        console.error('Failed to check Spotify connection:', error);
        setHasSpotifyConnection(false);
      } finally {
        setCheckingConnection(false);
      }
    };

    checkConnection();
  }, [authenticatedFetch]);

  // Fetch user's playlists when library tab is active and connected
  useEffect(() => {
    if (sourceTab === 'library' && hasSpotifyConnection === true && userPlaylists.length === 0 && !loadingPlaylists && !checkingConnection) {
      fetchUserPlaylists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTab, hasSpotifyConnection, checkingConnection]);

  const fetchUserPlaylists = async () => {
    setLoadingPlaylists(true);
    try {
      const response = await authenticatedFetch('/api/v1/curator/dsp/spotify/playlists', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setUserPlaylists(data.data?.items || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch playlists:', errorData.error || 'Unknown error');
        // Don't change connection status here - it's already set from auth status check
      }
    } catch (error) {
      console.error('Failed to fetch playlists:', error);
      // Don't change connection status here - it's already set from auth status check
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handlePlaylistSelect = (playlist) => {
    onAnalyze(playlist.id);
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onAnalyze(manualInput.trim());
    }
  };

  return (
    <Container>
      <TabsContainer>
        <TabList>
          <Tab $active={sourceTab === 'library'} onClick={() => setSourceTab('library')}>
            Your Playlists
          </Tab>
          <Tab $active={sourceTab === 'manual'} onClick={() => setSourceTab('manual')}>
            URL / ID
          </Tab>
        </TabList>
      </TabsContainer>

      <TabContent>
        {sourceTab === 'library' && (
          <>
            {checkingConnection && (
              <LoadingMessage>
                <p>Checking Spotify connection...</p>
              </LoadingMessage>
            )}

            {!checkingConnection && hasSpotifyConnection === false && (
              <EmptyState>
                <p>Please connect your Spotify account in DSP Settings to view your playlists.</p>
              </EmptyState>
            )}

            {!checkingConnection && hasSpotifyConnection === true && loadingPlaylists && (
              <LoadingMessage>
                <p>Loading your playlists...</p>
              </LoadingMessage>
            )}

            {!checkingConnection && hasSpotifyConnection === true && !loadingPlaylists && userPlaylists.length === 0 && (
              <EmptyState>
                <p>No playlists found in your Spotify library.</p>
              </EmptyState>
            )}

            {!checkingConnection && hasSpotifyConnection === true && !loadingPlaylists && userPlaylists.length > 0 && (
              <PlaylistGrid>
                {userPlaylists.map(playlist => (
                  <PlaylistCard
                    key={playlist.id}
                    onClick={() => handlePlaylistSelect(playlist)}
                  >
                    {playlist.images?.[0]?.url && (
                      <img src={playlist.images[0].url} alt={playlist.name} />
                    )}
                    <h4>{playlist.name}</h4>
                    <p>{playlist.tracks.total} tracks</p>
                  </PlaylistCard>
                ))}
              </PlaylistGrid>
            )}
          </>
        )}

        {sourceTab === 'manual' && (
          <ManualInputContainer>
            <FormField>
              <label htmlFor="playlist-input">Spotify Playlist URL or ID</label>
              <input
                id="playlist-input"
                type="text"
                placeholder="https://open.spotify.com/playlist/... or playlist ID"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              />
              <div className="hint">
                Paste a Spotify playlist URL or enter the 22-character playlist ID
              </div>
            </FormField>

            <ButtonContainer>
              <Button
                $variant="primary"
                onClick={handleManualSubmit}
                disabled={!manualInput.trim()}
              >
                ANALYZE PLAYLIST
              </Button>
            </ButtonContainer>
          </ManualInputContainer>
        )}
      </TabContent>
    </Container>
  );
}
