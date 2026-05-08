// src/modules/admin/components/PreviewBackfillTab.jsx
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

const SuccessBox = styled.div`
  padding: ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(40, 167, 69, 0.3);
  background: rgba(40, 167, 69, 0.08);
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

const PreviewBackfillTab = () => {
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const pollingRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [statsRes, statusRes] = await Promise.all([
        adminGet('/api/v1/backfill/previews/stats'),
        adminGet('/api/v1/backfill/status')
      ]);

      if (statsRes.success) {
        setStats(statsRes.data);
      }
      if (statusRes.success) {
        setStatus(statusRes.data);
        setIsRunning(statusRes.data.previews?.running || false);
      }
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [loadData]);

  useEffect(() => {
    if (isRunning) {
      pollingRef.current = setInterval(loadData, 3000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [isRunning, loadData]);

  const handleRunBackfill = async () => {
    try {
      setError(null);
      setMessage(null);
      const res = await adminPost('/api/v1/backfill/previews/run');
      if (res.success) {
        setIsRunning(true);
        setMessage('Preview backfill started');
      } else {
        setError(res.error || 'Failed to start backfill');
      }
    } catch (err) {
      setError(err.message || 'Failed to start backfill');
    }
  };

  const handleResetAttempts = async () => {
    try {
      setError(null);
      setMessage(null);
      const res = await adminPost('/api/v1/backfill/reset-attempts', { type: 'previews' });
      if (res.success) {
        setMessage('Preview attempt counters reset');
        loadData();
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

  if (isLoading) {
    return <TabStack><MetaText>Loading...</MetaText></TabStack>;
  }

  return (
    <TabStack>
      {/* Scheduler Status */}
      <SurfaceCard>
        <HeaderRow>
          <HeadingGroup>
            <SectionTitle>Audio Previews</SectionTitle>
            <MetaText>
              Manage audio preview backfill for published playlists (via Deezer)
            </MetaText>
          </HeadingGroup>
          <GhostButton onClick={loadData}>Refresh</GhostButton>
        </HeaderRow>

        <ScheduleStatus>
          <StatusDot $active={status?.previews?.running} />
          <span>
            {status?.previews?.running ? 'Running' : 'Idle'} |
            Scheduled: {status?.previews?.scheduled || 'Unknown'}
          </span>
        </ScheduleStatus>

        {status?.previews?.lastRun && (
          <MetaText>
            Last run: {formatDate(status.previews.lastRun)}
            {status.previews.lastStats && (
              <> | Processed: {status.previews.lastStats.processed},
              Success: {status.previews.lastStats.success},
              Failed: {status.previews.lastStats.failed}</>
            )}
          </MetaText>
        )}
      </SurfaceCard>

      {/* Global Statistics */}
      {stats && (
        <SurfaceCard>
          <HeaderRow>
            <HeadingGroup>
              <SectionTitle>Preview Coverage</SectionTitle>
              <MetaText>Across all published playlists</MetaText>
            </HeadingGroup>
          </HeaderRow>

          <StatGrid>
            <StatTile>
              <StatLabel>Total Tracks</StatLabel>
              <StatValue>{stats.total_tracks}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>With Deezer Preview</StatLabel>
              <StatValue>{stats.with_deezer_preview}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>With SoundCloud</StatLabel>
              <StatValue>{stats.with_soundcloud}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Missing Preview</StatLabel>
              <StatValue>{stats.missing_preview}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Max Attempts Reached</StatLabel>
              <StatValue>{stats.max_attempts_reached}</StatValue>
            </StatTile>
            <StatTile>
              <StatLabel>Coverage</StatLabel>
              <StatValue>{stats.preview_coverage}%</StatValue>
            </StatTile>
          </StatGrid>
        </SurfaceCard>
      )}

      {/* Actions */}
      <SurfaceCard>
        <HeadingGroup>
          <SectionTitle>Manual Actions</SectionTitle>
          <MetaText>
            Trigger backfill manually or reset failure counters
          </MetaText>
        </HeadingGroup>

        <ActionRow>
          <Button
            onClick={handleRunBackfill}
            disabled={isRunning}
            variant="primary"
          >
            {isRunning ? 'Running...' : 'Run Preview Backfill'}
          </Button>
          <GhostButton onClick={handleResetAttempts} disabled={isRunning}>
            Reset Attempt Counters
          </GhostButton>
        </ActionRow>

        {message && (
          <SuccessBox>
            <MetaText>{message}</MetaText>
          </SuccessBox>
        )}

        {error && (
          <ErrorBox>
            <MetaText>Error: {error}</MetaText>
          </ErrorBox>
        )}

        <InfoBox>
          <MetaText>
            The scheduler runs automatically every hour at :30.
            Tracks are skipped after 2 failed attempts.
            Use &quot;Reset Attempt Counters&quot; to retry previously failed tracks.
          </MetaText>
        </InfoBox>
      </SurfaceCard>
    </TabStack>
  );
};

export default PreviewBackfillTab;
