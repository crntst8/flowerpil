import { useState } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { useAuthenticatedApi } from '../hooks/useAuthenticatedApi.js';
import { handleJsonResponse } from '../utils/adminApi.js';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const InputRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: flex-end;
`;

const UrlInput = styled(Input)`
  flex: 1;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const TestButton = styled(Button)`
  white-space: nowrap;
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  background: ${({ $success }) => $success ? 'rgba(40, 167, 69, 0.12)' : 'rgba(220, 53, 69, 0.12)'};
  color: ${({ $success }) => $success ? theme.colors.success : theme.colors.error};
  border: 1px solid ${({ $success }) => $success ? theme.colors.success : theme.colors.error};
`;

const PlatformBadge = styled.span`
  display: inline-flex;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  background: rgba(0, 0, 0, 0.08);
  color: ${theme.colors.black};
`;

const StatsRow = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
  padding: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.03);
  border-radius: 6px;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StatLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
  text-transform: uppercase;
`;

const StatValue = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.semibold};
`;

const PlaylistInfo = styled.div`
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
`;

const PlaylistTitle = styled.h4`
  margin: 0 0 ${theme.spacing.xs} 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
`;

const PlaylistMeta = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const TrackTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const TrackRow = styled.tr`
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);

  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }
`;

const TrackCell = styled.td`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  vertical-align: top;

  &:first-child {
    width: 40px;
    text-align: right;
    color: rgba(0, 0, 0, 0.4);
  }
`;

const TrackHeader = styled.th`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  text-align: left;
  font-weight: ${theme.fontWeights.semibold};
  border-bottom: 2px solid rgba(0, 0, 0, 0.1);
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.6);
`;

const IdBadge = styled.span`
  display: inline-block;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 9px;
  margin-right: 2px;
  background: ${({ $type }) => {
    if ($type === 'spotify') return 'rgba(30, 215, 96, 0.15)';
    if ($type === 'apple') return 'rgba(252, 60, 68, 0.15)';
    if ($type === 'tidal') return 'rgba(0, 0, 0, 0.1)';
    return 'rgba(0, 0, 0, 0.05)';
  }};
  color: ${({ $type }) => {
    if ($type === 'spotify') return '#1DB954';
    if ($type === 'apple') return '#FC3C44';
    if ($type === 'tidal') return '#000';
    return '#666';
  }};
`;

const MatchInfo = styled.span`
  font-size: 9px;
  color: rgba(0, 0, 0, 0.4);
  margin-left: ${theme.spacing.xs};
`;

const ErrorMessage = styled.div`
  padding: ${theme.spacing.md};
  background: rgba(220, 53, 69, 0.08);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 6px;
  color: ${theme.colors.error};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const LoadingText = styled.div`
  padding: ${theme.spacing.md};
  text-align: center;
  color: rgba(0, 0, 0, 0.5);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

export default function UrlImportTester() {
  const { authenticatedFetch } = useAuthenticatedApi();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleTest = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await authenticatedFetch('/api/v1/url-import/test-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      const data = await handleJsonResponse(response);
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || 'Unknown error');
      }
    } catch (err) {
      setError(err.message || 'Failed to test URL');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
      handleTest();
    }
  };

  return (
    <Container>
      <InputRow>
        <UrlInput
          type="text"
          placeholder="Paste playlist URL (Spotify, Apple Music, TIDAL, Qobuz, YouTube, SoundCloud)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <TestButton onClick={handleTest} disabled={loading || !url.trim()}>
          {loading ? 'Testing...' : 'Test Import'}
        </TestButton>
      </InputRow>

      {loading && (
        <LoadingText>Fetching playlist and enriching tracks with Spotify metadata...</LoadingText>
      )}

      {error && (
        <ErrorMessage>
          <strong>Error:</strong> {error}
        </ErrorMessage>
      )}

      {result && (
        <>
          <StatsRow>
            <StatItem>
              <StatLabel>Status</StatLabel>
              <StatusBadge $success={true}>Works</StatusBadge>
            </StatItem>
            <StatItem>
              <StatLabel>Platform</StatLabel>
              <PlatformBadge>{result.platform}</PlatformBadge>
            </StatItem>
            <StatItem>
              <StatLabel>Tracks</StatLabel>
              <StatValue>{result.playlist?.trackCount || 0}</StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Fetch Time</StatLabel>
              <StatValue>{result.stats?.fetchTimeMs}ms</StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Total Time</StatLabel>
              <StatValue>{result.stats?.totalTimeMs}ms</StatValue>
            </StatItem>
            {result.stats?.enrichment && (
              <StatItem>
                <StatLabel>Spotify Matches</StatLabel>
                <StatValue>
                  {result.stats.enrichment.enriched}/{result.stats.enrichment.total}
                </StatValue>
              </StatItem>
            )}
          </StatsRow>

          <PlaylistInfo>
            <PlaylistTitle>{result.playlist?.title}</PlaylistTitle>
            <PlaylistMeta>
              {result.playlist?.description?.slice(0, 200) || 'No description'}
            </PlaylistMeta>
          </PlaylistInfo>

          {result.tracks?.length > 0 && (
            <TrackTable>
              <thead>
                <tr>
                  <TrackHeader>#</TrackHeader>
                  <TrackHeader>Artist</TrackHeader>
                  <TrackHeader>Title</TrackHeader>
                  <TrackHeader>Album</TrackHeader>
                  <TrackHeader>Duration</TrackHeader>
                  <TrackHeader>IDs</TrackHeader>
                </tr>
              </thead>
              <tbody>
                {result.tracks.map((track) => (
                  <TrackRow key={track.position}>
                    <TrackCell>{track.position}</TrackCell>
                    <TrackCell>
                      {track.artist}
                      {track._spotify_artist && track._spotify_artist !== track.artist && (
                        <MatchInfo title="Spotify artist name">
                          ({track._spotify_artist})
                        </MatchInfo>
                      )}
                    </TrackCell>
                    <TrackCell>
                      {track.title}
                      {track._spotify_title && track._spotify_title !== track.title && (
                        <MatchInfo title="Spotify track name">
                          ({track._spotify_title})
                        </MatchInfo>
                      )}
                    </TrackCell>
                    <TrackCell>{track.album}</TrackCell>
                    <TrackCell>{track.duration}</TrackCell>
                    <TrackCell>
                      {track.spotify_id && <IdBadge $type="spotify">S</IdBadge>}
                      {track.apple_id && <IdBadge $type="apple">A</IdBadge>}
                      {track.tidal_id && <IdBadge $type="tidal">T</IdBadge>}
                      {track._match_confidence && (
                        <MatchInfo>
                          {track._match_confidence}% {track._match_source}
                        </MatchInfo>
                      )}
                    </TrackCell>
                  </TrackRow>
                ))}
              </tbody>
            </TrackTable>
          )}
        </>
      )}
    </Container>
  );
}
