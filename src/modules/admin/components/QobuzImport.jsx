import React, { useState } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button, Input } from '@shared/styles/GlobalStyles';
import { adminFetch, handleJsonResponse } from '../utils/adminApi';

const QOBUZ_URL_PATTERNS = [
  /^https?:\/\/(?:www\.)?qobuz\.com\/[a-z]{2}-[a-z]{2}\/playlists\/[^\/]+\/(\d+)(?:[/?].*)?$/i,
  /^https?:\/\/(?:www\.)?widget\.qobuz\.com\/playlist\/(\d+)(?:[/?].*)?$/i
];

const extractQobuzPlaylistId = (url) => {
  for (const pattern of QOBUZ_URL_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const QobuzImportContainer = styled(DashedBox)`
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

const WarningMessage = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.md};
  background: rgba(255, 193, 7, 0.1);
  border: ${theme.borders.solidAct} #ffc107;
  color: #ffc107;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.md};
`;

const ImportForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const UrlInputGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};

  input {
    flex: 1;
  }
`;

const SkippedTracksContainer = styled.div`
  margin-top: ${theme.spacing.md};
`;

const SkippedTracksHeader = styled.h4`
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.sm};
  font-size: ${theme.fontSizes.small};
`;

const SkippedTracksList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
  border: ${theme.borders.dashed} ${theme.colors.gray[200]};
  padding: ${theme.spacing.sm};
`;

const SkippedTrackItem = styled.li`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[700]};
  padding: ${theme.spacing.xs} 0;
  border-bottom: ${theme.borders.dashed} ${theme.colors.gray[100]};

  &:last-child {
    border-bottom: none;
  }

  .track-name {
    font-weight: ${theme.fontWeights.medium};
  }

  .track-reason {
    color: ${theme.colors.gray[600]};
    font-size: ${theme.fontSizes.tiny};
    margin-top: 2px;
  }
`;

const LoadingOverlay = styled.div`
  position: relative;
  min-height: 200px;
`;

const LoadingBackdrop = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingContent = styled.div`
  z-index: 11;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.md};
  text-align: center;
`;

const LoadingText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const ProgressBar = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$progress',
})`
  width: 200px;
  height: 4px;
  background: ${theme.colors.black[200]};
  border-radius: 2px;
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: ${props => props.$progress || 0}%;
    background: ${theme.colors.selected};
  }
`;

const ImportSummary = styled.div`
  padding: ${theme.spacing.md};
  background: rgba(76, 175, 80, 0.1);
  border: ${theme.borders.solidAct} #4caf50;
  color: #2e7d32;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.md};
`;

const QobuzImport = ({ onImportSuccess }) => {
  const [qobuzUrl, setQobuzUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Importing tracks...');
  const [validating, setValidating] = useState(false);
  const [urlValid, setUrlValid] = useState(null);
  const [error, setError] = useState(null);
  const [skippedTracks, setSkippedTracks] = useState([]);
  const [confidenceWarnings, setConfidenceWarnings] = useState([]);
  const [importSummary, setImportSummary] = useState(null);
  const [estimatedTime, setEstimatedTime] = useState(null);

  const validateUrl = async (url) => {
    if (!url.trim()) {
      setUrlValid(null);
      return;
    }

    try {
      setValidating(true);
      setError(null);

      const response = await adminFetch(
        `/api/v1/qobuz/validate-url?url=${encodeURIComponent(url)}`,
        { method: 'GET' }
      );

      const data = await handleJsonResponse(response);
      setUrlValid(data.data?.valid || false);

      if (!data.data?.valid) {
        setError('Invalid Qobuz URL. Expected: https://www.qobuz.com/{region}/playlists/{name}/{id} or https://widget.qobuz.com/playlist/{id}');
      }
    } catch (err) {
      setUrlValid(false);
      setError('Failed to validate URL: ' + err.message);
    } finally {
      setValidating(false);
    }
  };

  // Calculate estimated import time based on cached playlist data
  const calculateEstimatedTime = async (url) => {
    if (!url.trim()) {
      setEstimatedTime(null);
      return;
    }

    try {
      const playlistId = extractQobuzPlaylistId(url);
      if (!playlistId) {
        setEstimatedTime(null);
        return;
      }

      // Try to fetch track count from our API
      const response = await adminFetch(
        `/api/v1/qobuz/playlist-info/${playlistId}`,
        { method: 'GET' }
      );

      if (response.ok) {
        const data = await handleJsonResponse(response);
        if (data.data?.trackCount) {
          const secondsPerTrack = 3.15;
          const totalSeconds = data.data.trackCount * secondsPerTrack;
          setEstimatedTime(totalSeconds);
        }
      }
    } catch (err) {
      // Silently fail - time estimate is not critical
      setEstimatedTime(null);
    }
  };

  // Format time display (round up, show minutes/seconds appropriately)
  const formatEstimatedTime = (seconds) => {
    if (!seconds) return null;

    const roundedSeconds = Math.ceil(seconds * 10) / 10; // Round up to 1 decimal place

    if (roundedSeconds < 60) {
      return `${roundedSeconds.toFixed(1)}s`;
    } else {
      const minutes = Math.floor(roundedSeconds / 60);
      const remainingSeconds = Math.ceil(roundedSeconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    }
  };

  const handleImportPlaylist = async () => {
    if (!qobuzUrl.trim()) {
      setError('Please enter a Qobuz playlist URL');
      return;
    }

    if (!urlValid) {
      setError('Please enter a valid Qobuz URL');
      return;
    }

    try {
      setLoading(true);
      setLoadingProgress(10);
      setLoadingMessage('Scraping Qobuz playlist...');
      setError(null);
      setSkippedTracks([]);
      setConfidenceWarnings([]);
      setImportSummary(null);
      setEstimatedTime(null); // Hide estimate during import

      setLoadingProgress(30);
      setLoadingMessage('Matching tracks across platforms...');

      // Check for test mode (dev only)
      const isTestMode = window.location.search.includes('qobuz_test=true') || 
                         (typeof window !== 'undefined' && window.__QOBUZ_TEST_MODE__);
      
      let response;
      if (isTestMode) {
        // Simulate API response in test mode
        console.log('[QOBUZ TEST] Simulating import for:', qobuzUrl);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
        
        const mockTracks = [
          {
            id: 'test_1',
            position: 1,
            title: 'Test Track 1',
            artist: 'Test Artist',
            album: 'Test Album',
            year: 2024,
            duration: '3:45',
            spotify_id: 'spotify_test_1',
            apple_id: 'apple_test_1',
            qobuz_url: 'https://www.qobuz.com/test/track1',
            label: 'Test Label',
            genre: 'Electronic',
            artwork_url: null,
            album_artwork_url: null,
            isrc: 'TEST123456789',
            explicit: false,
            preview_url: null
          },
          {
            id: 'test_2',
            position: 2,
            title: 'Test Track 2',
            artist: 'Test Artist 2',
            album: 'Test Album 2',
            year: 2023,
            duration: '4:12',
            spotify_id: 'spotify_test_2',
            qobuz_url: 'https://www.qobuz.com/test/track2',
            label: 'Test Label 2',
            genre: 'Rock',
            artwork_url: null,
            album_artwork_url: null,
            isrc: 'TEST987654321',
            explicit: true,
            preview_url: null
          }
        ];
        
        response = new Response(JSON.stringify({
          success: true,
          data: {
            tracks: mockTracks,
            skipped: [
              {
                title: 'Skipped Track',
                artist: 'Skipped Artist',
                reason: 'Could not match across platforms'
              }
            ],
            warnings: [],
            summary: {
              total: 3,
              matched: 2,
              successRate: 0.67
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        response = await adminFetch('/api/v1/qobuz/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: qobuzUrl.trim()
          })
        });
      }

      setLoadingProgress(70);
      setLoadingMessage('Processing results...');

      const data = await handleJsonResponse(response);
      const result = data.data || {};

      // Handle skipped tracks
      if (result.skipped && result.skipped.length > 0) {
        setSkippedTracks(result.skipped);
      }

      // Handle confidence warnings
      if (result.warnings && result.warnings.length > 0) {
        setConfidenceWarnings(result.warnings);
      }

      // Set summary
      if (result.summary) {
        setImportSummary(result.summary);
      }

      if (onImportSuccess && result.tracks && Array.isArray(result.tracks) && result.tracks.length > 0) {
        try {
          onImportSuccess({
            tracks: result.tracks,
            skipped: result.skipped || [],
            summary: result.summary
          });
        } catch (callbackError) {
          console.error('Error in onImportSuccess callback:', callbackError);
          setError('Import completed but failed to process tracks: ' + callbackError.message);
        }
      }

      setLoadingProgress(100);
      setLoadingMessage('Import complete!');

      // Clear input on success
      setTimeout(() => {
        setQobuzUrl('');
        setUrlValid(null);
        setLoading(false);
        setLoadingProgress(0);
        setLoadingMessage('Importing tracks...');
      }, 500);

    } catch (err) {
      setError('Failed to import playlist: ' + err.message);
      setLoading(false);
      setLoadingProgress(0);
      setLoadingMessage('Importing tracks...');
      setEstimatedTime(null);
    }
  };

  return (
    <QobuzImportContainer>
      <Header>
        <h3>Import from Qobuz</h3>
        <p>Paste a Qobuz public playlist URL to import tracks with Spotify metadata</p>
      </Header>

      {error && (
        <ErrorMessage>
          {error}
          <Button onClick={() => setError(null)} variant="text">×</Button>
        </ErrorMessage>
      )}

      {skippedTracks.length > 0 && (
        <WarningMessage>
          <div>
            {skippedTracks.length} track{skippedTracks.length > 1 ? 's' : ''} could not be matched
          </div>
          <Button onClick={() => setSkippedTracks([])} variant="text">×</Button>
        </WarningMessage>
      )}

      {confidenceWarnings.length > 0 && (
        <WarningMessage>
          <div>
            {confidenceWarnings.length} track{confidenceWarnings.length > 1 ? 's' : ''} imported with low confidence validation. These tracks may need manual verification.
          </div>
          <Button onClick={() => setConfidenceWarnings([])} variant="text">×</Button>
        </WarningMessage>
      )}

      {importSummary && (
        <ImportSummary>
          Imported {importSummary.matched} of {importSummary.total} tracks
          ({(importSummary.successRate * 100).toFixed(0)}% success rate)
        </ImportSummary>
      )}

      <LoadingOverlay>
        {loading && (
          <LoadingBackdrop>
            <LoadingContent>
              <LoadingText>{loadingMessage}</LoadingText>
              <ProgressBar $progress={loadingProgress} />
            </LoadingContent>
          </LoadingBackdrop>
        )}
        <ImportForm>
          <UrlInputGroup>
            <Input
              type="text"
              placeholder="Paste Qobuz playlist URL (e.g., https://www.qobuz.com/us-en/playlists/... or https://widget.qobuz.com/playlist/12345)"
              value={qobuzUrl}
              onChange={(e) => {
                setQobuzUrl(e.target.value);
                validateUrl(e.target.value);
                calculateEstimatedTime(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading && urlValid) {
                  handleImportPlaylist();
                }
              }}
              disabled={loading}
            />
            <Button
              onClick={handleImportPlaylist}
              disabled={loading || !urlValid}
              variant="primary"
            >
              {loading ? 'Importing...' : 'Import'}
            </Button>
          </UrlInputGroup>

          {estimatedTime && urlValid && !loading && (
            <div style={{
              fontFamily: theme.fonts.mono,
              fontSize: theme.fontSizes.tiny,
              color: theme.colors.gray[600],
              textAlign: 'center',
              marginTop: theme.spacing.xs,
              opacity: 0.8
            }}>
              ~{formatEstimatedTime(estimatedTime)} estimated
            </div>
          )}

        {skippedTracks.length > 0 && (
          <SkippedTracksContainer>
            <SkippedTracksHeader>Skipped Tracks</SkippedTracksHeader>
            <SkippedTracksList>
              {skippedTracks.map((track, idx) => (
                <SkippedTrackItem key={idx}>
                  <div className="track-name">
                    {track.title} – {track.artist}
                  </div>
                  <div className="track-reason">
                    {track.reason}
                  </div>
                </SkippedTrackItem>
              ))}
            </SkippedTracksList>
          </SkippedTracksContainer>
        )}
        </ImportForm>
      </LoadingOverlay>
    </QobuzImportContainer>
  );
};

export default QobuzImport;
