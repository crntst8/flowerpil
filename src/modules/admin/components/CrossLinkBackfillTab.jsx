import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost } from '../utils/adminApi';

const TabStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const SurfaceCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  padding: clamp(${theme.spacing.md}, 3vw, ${theme.spacing.xl});
  border-radius: 14px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.06);
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const HeadingGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.6rem);
  font-family: ${theme.fonts.primary};
  text-transform: uppercase;
  letter-spacing: -1px;
`;

const MetaText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.58);
  letter-spacing: 0.05em;
`;

const StatGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
`;

const StatTile = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.028);
`;

const StatLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.6);
`;

const StatValue = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: clamp(1.3rem, 2.2vw, 1.6rem);
  letter-spacing: 0.04em;
  font-weight: bold;
`;

const Select = styled.select`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.25);
  background: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border-radius: 6px;
  min-width: 280px;

  &:focus {
    border-color: ${theme.colors.black};
    outline: none;
  }
`;

const GhostButton = styled(Button)`
  background: transparent;
  border-color: rgba(0, 0, 0, 0.28);
  color: ${theme.colors.black};
  text-transform: none;
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.04em;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
    border-color: ${theme.colors.black};
  }
`;

const InfoBox = styled.div`
  padding: ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(100, 149, 237, 0.3);
  background: rgba(100, 149, 237, 0.08);
`;

const WarningBox = styled.div`
  padding: ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(255, 170, 0, 0.3);
  background: rgba(255, 170, 0, 0.08);
`;

const ProgressBox = styled.div`
  padding: ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.02);
`;

const ErrorBox = styled.div`
  padding: ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(220, 53, 69, 0.3);
  background: rgba(220, 53, 69, 0.08);
  color: ${theme.colors.danger || '#dc3545'};
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  align-items: center;
`;

const ServiceStatus = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const ServiceBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  background: ${({ $connected }) => $connected ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)'};
  color: ${({ $connected }) => $connected ? '#28a745' : '#dc3545'};
  border: 1px solid ${({ $connected }) => $connected ? 'rgba(40, 167, 69, 0.3)' : 'rgba(220, 53, 69, 0.3)'};
`;

const ScheduleStatus = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const StatusDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $active }) => $active ? '#28a745' : '#6c757d'};
`;

const SuccessBox = styled.div`
  padding: ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(40, 167, 69, 0.3);
  background: rgba(40, 167, 69, 0.08);
`;

const CrossLinkBackfillTab = () => {
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [stats, setStats] = useState(null);
  const [backfillPreview, setBackfillPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [apiStatus, setApiStatus] = useState({ apple: 'unknown', tidal: 'unknown', spotify: 'unknown' });
  const [error, setError] = useState(null);
  const [jobProgress, setJobProgress] = useState(null);
  const pollingRef = useRef(null);

  // Global backfill state
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [globalStats, setGlobalStats] = useState(null);
  const [isGlobalBackfillRunning, setIsGlobalBackfillRunning] = useState(false);
  const [globalMessage, setGlobalMessage] = useState(null);
  const globalPollingRef = useRef(null);

  const loadSchedulerStatus = useCallback(async () => {
    try {
      const [statusRes, globalRes] = await Promise.all([
        adminGet('/api/v1/backfill/status'),
        adminGet('/api/v1/backfill/cross-links/stats')
      ]);
      if (statusRes.success) {
        setSchedulerStatus(statusRes.data);
        setIsGlobalBackfillRunning(statusRes.data.crossLinks?.running || false);
      }
      if (globalRes.success) {
        setGlobalStats(globalRes.data);
      }
    } catch (err) {
      console.error('Failed to load scheduler status:', err);
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
    testApiConnections();
    loadSchedulerStatus();
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
      if (globalPollingRef.current) {
        clearInterval(globalPollingRef.current);
      }
    };
  }, [loadSchedulerStatus]);

  useEffect(() => {
    if (isGlobalBackfillRunning) {
      globalPollingRef.current = setInterval(loadSchedulerStatus, 3000);
    } else if (globalPollingRef.current) {
      clearInterval(globalPollingRef.current);
      globalPollingRef.current = null;
    }
  }, [isGlobalBackfillRunning, loadSchedulerStatus]);

  useEffect(() => {
    if (selectedPlaylistId) {
      loadPlaylistStats();
      loadBackfillPreview();
    } else {
      setStats(null);
      setBackfillPreview(null);
    }
  }, [selectedPlaylistId]);

  const loadPlaylists = async () => {
    try {
      const response = await fetch('/api/v1/playlists');
      const data = await response.json();
      if (data.success) {
        setPlaylists(data.data);
      }
    } catch (err) {
      console.error('Failed to load playlists:', err);
      setError('Failed to load playlists');
    }
  };

  const loadPlaylistStats = async () => {
    try {
      const data = await adminGet(`/api/v1/cross-platform/stats/${selectedPlaylistId}`);
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadBackfillPreview = async () => {
    try {
      const data = await adminGet(`/api/v1/cross-platform/backfill-preview/${selectedPlaylistId}`);
      if (data.success) {
        setBackfillPreview(data.data);
      }
    } catch (err) {
      console.error('Failed to load backfill preview:', err);
      setBackfillPreview(null);
    }
  };

  const testApiConnections = async () => {
    try {
      const data = await adminGet('/api/v1/cross-platform/test-connections');
      if (data.success) {
        setApiStatus(data.data);
      }
    } catch (err) {
      console.error('Failed to test API connections:', err);
    }
  };

  const pollJobStatus = useCallback(async (jobId, isBackfillJob = false) => {
    try {
      const data = await adminGet(`/api/v1/cross-platform/job-status/${jobId}`);
      if (data.success) {
        const job = data.data;
        setJobProgress(job.progress);

        if (job.status === 'completed' || job.status === 'failed') {
          if (isBackfillJob) {
            setIsBackfilling(false);
          } else {
            setIsProcessing(false);
          }
          setJobProgress(null);
          loadPlaylistStats();
          loadBackfillPreview();
          return;
        }
        // Continue polling
        pollingRef.current = setTimeout(() => pollJobStatus(jobId, isBackfillJob), 2000);
      }
    } catch (err) {
      console.error('Failed to poll job status:', err);
      if (isBackfillJob) {
        setIsBackfilling(false);
      } else {
        setIsProcessing(false);
      }
      setJobProgress(null);
    }
  }, []);

  const startPlaylistLinking = async (forceRefresh = false) => {
    if (!selectedPlaylistId) {
      setError('Please select a playlist');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      setJobProgress(null);

      const data = await adminPost('/api/v1/cross-platform/link-playlist', {
        playlistId: selectedPlaylistId,
        forceRefresh
      });

      if (data.success) {
        if (data.data.jobId) {
          pollingRef.current = setTimeout(() => pollJobStatus(data.data.jobId, false), 2000);
        } else {
          setIsProcessing(false);
          loadPlaylistStats();
          loadBackfillPreview();
        }
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('Failed to start linking:', err);
      setError(err.message);
      setIsProcessing(false);
    }
  };

  const startBackfill = async () => {
    if (!selectedPlaylistId) {
      setError('Please select a playlist');
      return;
    }

    try {
      setIsBackfilling(true);
      setError(null);
      setJobProgress(null);

      const data = await adminPost('/api/v1/cross-platform/backfill-playlist', {
        playlistId: selectedPlaylistId
      });

      if (data.success) {
        if (data.data.jobId) {
          pollingRef.current = setTimeout(() => pollJobStatus(data.data.jobId, true), 2000);
        } else {
          setIsBackfilling(false);
          loadPlaylistStats();
          loadBackfillPreview();
        }
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('Failed to start backfill:', err);
      setError(err.message);
      setIsBackfilling(false);
    }
  };

  const selectedPlaylist = playlists.find(p => p.id.toString() === selectedPlaylistId);

  const handleRunGlobalBackfill = async () => {
    try {
      setGlobalMessage(null);
      setError(null);
      const res = await adminPost('/api/v1/backfill/cross-links/run');
      if (res.success) {
        setIsGlobalBackfillRunning(true);
        setGlobalMessage('Cross-link backfill started');
      } else {
        setError(res.error || 'Failed to start backfill');
      }
    } catch (err) {
      setError(err.message || 'Failed to start backfill');
    }
  };

  const handleResetAttempts = async () => {
    try {
      setGlobalMessage(null);
      setError(null);
      const res = await adminPost('/api/v1/backfill/reset-attempts', { type: 'crosslinks' });
      if (res.success) {
        setGlobalMessage('Cross-link attempt counters reset');
        loadSchedulerStatus();
      } else {
        setError(res.error || 'Failed to reset attempts');
      }
    } catch (err) {
      setError(err.message || 'Failed to reset attempts');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <TabStack>
      {/* Global Scheduler Status & Stats */}
      <SurfaceCard>
        <HeaderRow>
          <HeadingGroup>
            <SectionTitle>Global Cross-Link Coverage</SectionTitle>
            <MetaText>
              Across all published playlists
            </MetaText>
          </HeadingGroup>
          <GhostButton onClick={loadSchedulerStatus}>Refresh</GhostButton>
        </HeaderRow>

        <ScheduleStatus>
          <StatusDot $active={schedulerStatus?.crossLinks?.running} />
          <span>
            {schedulerStatus?.crossLinks?.running ? 'Running' : 'Idle'} |
            Scheduled: {schedulerStatus?.crossLinks?.scheduled || 'Unknown'}
          </span>
        </ScheduleStatus>

        {schedulerStatus?.crossLinks?.lastRun && (
          <MetaText>
            Last run: {formatDate(schedulerStatus.crossLinks.lastRun)}
            {schedulerStatus.crossLinks.lastStats && (
              <> | Processed: {schedulerStatus.crossLinks.lastStats.processed},
              Success: {schedulerStatus.crossLinks.lastStats.success},
              Failed: {schedulerStatus.crossLinks.lastStats.failed}</>
            )}
          </MetaText>
        )}

        {globalStats && (
          <StatGrid>
            <StatTile>
              <StatLabel>Total Tracks</StatLabel>
              <StatValue>{globalStats.total_tracks}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Spotify</StatLabel>
              <StatValue>{globalStats.spotify_coverage}%</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Apple Music</StatLabel>
              <StatValue>{globalStats.apple_coverage}%</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Tidal</StatLabel>
              <StatValue>{globalStats.tidal_coverage}%</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>YouTube Music</StatLabel>
              <StatValue>{globalStats.youtube_coverage}%</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Max Attempts Reached</StatLabel>
              <StatValue>{globalStats.max_attempts_reached}</StatValue>
            </StatTile>
          </StatGrid>
        )}

        <ActionRow>
          <Button
            onClick={handleRunGlobalBackfill}
            disabled={isGlobalBackfillRunning}
            variant="primary"
          >
            {isGlobalBackfillRunning ? 'Running...' : 'Run Global Backfill'}
          </Button>
          <GhostButton onClick={handleResetAttempts} disabled={isGlobalBackfillRunning}>
            Reset Attempt Counters
          </GhostButton>
        </ActionRow>

        {globalMessage && (
          <SuccessBox>
            <MetaText>{globalMessage}</MetaText>
          </SuccessBox>
        )}

        <InfoBox>
          <MetaText>
            The scheduler runs automatically every hour at :00.
            Tracks are skipped after 2 failed attempts.
            Use &quot;Reset Attempt Counters&quot; to retry previously failed tracks.
          </MetaText>
        </InfoBox>
      </SurfaceCard>

      {/* Service Status */}
      <SurfaceCard>
        <HeaderRow>
          <HeadingGroup>
            <SectionTitle>Per-Playlist Linking</SectionTitle>
            <MetaText>
              Manage cross-platform linking for Spotify, Apple Music, and Tidal
            </MetaText>
          </HeadingGroup>
          <GhostButton onClick={testApiConnections}>
            Test Connections
          </GhostButton>
        </HeaderRow>

        <ServiceStatus>
          <ServiceBadge $connected>
            Apple Music
          </ServiceBadge>
          <ServiceBadge $connected={apiStatus.tidal?.status === 'connected'}>
            Tidal API {apiStatus.tidal?.status === 'connected' ? '' : '(Disconnected)'}
          </ServiceBadge>
          <ServiceBadge $connected={apiStatus.spotify?.status === 'connected'}>
            Spotify API {apiStatus.spotify?.status === 'connected' ? '' : '(Disconnected)'}
          </ServiceBadge>
        </ServiceStatus>
      </SurfaceCard>

      {/* Playlist Selection */}
      <SurfaceCard>
        <HeadingGroup>
          <SectionTitle>Select Playlist</SectionTitle>
        </HeadingGroup>

        <Select
          value={selectedPlaylistId}
          onChange={(e) => setSelectedPlaylistId(e.target.value)}
        >
          <option value="">Choose a playlist...</option>
          {playlists.map(playlist => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.title}
            </option>
          ))}
        </Select>

        <ActionRow>
          <GhostButton
            onClick={() => startPlaylistLinking(false)}
            disabled={!selectedPlaylistId || isProcessing || isBackfilling}
          >
            {isProcessing ? 'Processing...' : 'Link Missing Tracks'}
          </GhostButton>
          <GhostButton
            onClick={() => startPlaylistLinking(true)}
            disabled={!selectedPlaylistId || isProcessing || isBackfilling}
          >
            Force Refresh All
          </GhostButton>
        </ActionRow>

        {jobProgress && !isBackfilling && (
          <ProgressBox>
            <MetaText style={{ display: 'block', marginBottom: '8px' }}>
              Progress: {jobProgress.processed} / {jobProgress.total} tracks processed
            </MetaText>
            <MetaText>
              Found: {jobProgress.found} matches | Errors: {jobProgress.errors?.length || 0}
            </MetaText>
          </ProgressBox>
        )}

        {error && (
          <ErrorBox>
            Error: {error}
          </ErrorBox>
        )}
      </SurfaceCard>

      {/* Statistics */}
      {stats && selectedPlaylist && (
        <SurfaceCard>
          <HeaderRow>
            <HeadingGroup>
              <SectionTitle>{selectedPlaylist.title}</SectionTitle>
              <MetaText>Cross-link coverage statistics</MetaText>
            </HeadingGroup>
          </HeaderRow>

          <StatGrid>
            <StatTile>
              <StatLabel>Total Tracks</StatLabel>
              <StatValue>{stats.total_tracks}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Have ISRC</StatLabel>
              <StatValue>{stats.isrc_count || 0}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Spotify</StatLabel>
              <StatValue>{stats.spotify_links}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Apple Music</StatLabel>
              <StatValue>{stats.apple_links}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Tidal</StatLabel>
              <StatValue>{stats.tidal_links}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>YouTube Music</StatLabel>
              <StatValue>{stats.youtube_links}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Coverage</StatLabel>
              <StatValue>{Math.round((stats.coverage || 0) * 100)}%</StatValue>
            </StatTile>
          </StatGrid>

          {stats.isrc_count < stats.total_tracks && stats.tidal_links < stats.total_tracks && (
            <WarningBox>
              <MetaText>
                {stats.total_tracks - (stats.isrc_count || 0)} tracks missing ISRC.
                Use &quot;Force Refresh All&quot; to fetch ISRCs from Spotify and enable Tidal matching.
              </MetaText>
            </WarningBox>
          )}
        </SurfaceCard>
      )}

      {/* Backfill Missing Links */}
      {backfillPreview && backfillPreview.totalPartial > 0 && selectedPlaylist && (
        <SurfaceCard>
          <HeaderRow>
            <HeadingGroup>
              <SectionTitle>Backfill Missing Links</SectionTitle>
              <MetaText>
                Fill in missing platform links for tracks with partial coverage
              </MetaText>
            </HeadingGroup>
          </HeaderRow>

          <InfoBox>
            <MetaText style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              {backfillPreview.totalPartial} tracks have partial coverage:
            </MetaText>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {backfillPreview.missingApple > 0 && (
                <li><MetaText>{backfillPreview.missingApple} missing Apple Music</MetaText></li>
              )}
              {backfillPreview.missingTidal > 0 && (
                <li><MetaText>{backfillPreview.missingTidal} missing Tidal</MetaText></li>
              )}
              {backfillPreview.missingSpotify > 0 && (
                <li><MetaText>{backfillPreview.missingSpotify} missing Spotify</MetaText></li>
              )}
              {backfillPreview.missingYouTube > 0 && (
                <li><MetaText>{backfillPreview.missingYouTube} missing YouTube Music</MetaText></li>
              )}
            </ul>
          </InfoBox>

          <ActionRow>
            <Button
              onClick={startBackfill}
              disabled={isBackfilling || isProcessing}
              variant="primary"
            >
              {isBackfilling ? 'Backfilling...' : 'Backfill Missing Links'}
            </Button>
          </ActionRow>

          {isBackfilling && jobProgress && (
            <ProgressBox>
              <MetaText style={{ display: 'block', marginBottom: '8px' }}>
                Backfill Progress: {jobProgress.processed} / {jobProgress.total} tracks
              </MetaText>
              <MetaText>
                Links found: {jobProgress.found} | Errors: {jobProgress.errors?.length || 0}
              </MetaText>
            </ProgressBox>
          )}
        </SurfaceCard>
      )}
    </TabStack>
  );
};

export default CrossLinkBackfillTab;
