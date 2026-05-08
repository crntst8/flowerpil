import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { exportTransferResults, deleteTransferJob } from '../../services/transferService.js';
import TrackResultsTable from './TrackResultsTable.jsx';

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const Title = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.Primary};
  letter-spacing: -0.4px;
  text-transform: uppercase;
`;

const Badge = styled.span`
  padding: 6px 10px;
  border-radius: 999px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: ${({ $variant }) => ({
    pending: 'rgba(0,0,0,0.06)',
    fetching: 'rgba(0,0,0,0.08)',
    processing: 'rgba(45, 110, 255, 0.12)',
    completed: 'rgba(14, 159, 110, 0.14)',
    failed: 'rgba(226, 74, 91, 0.14)',
    cancelled: 'rgba(0,0,0,0.05)',
    auth_required: 'rgba(226, 180, 74, 0.16)'
  }[$variant] || 'rgba(0,0,0,0.06)')};
  color: ${({ $variant }) => ({
    completed: '#0f7b5f',
    failed: '#a52727',
    processing: '#1b57d1',
    auth_required: '#8a5a00'
  }[$variant] || 'rgba(0,0,0,0.75)')};
`;

const ProgressWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 10px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.08);
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  width: ${({ $percent }) => `${Math.min(100, Math.max(0, $percent))}%`};
  background: linear-gradient(90deg, #000, #666);
`;

const Meta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.65);
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  align-items: center;
`;

const DestinationGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${theme.spacing.sm};
`;

const DestinationCard = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  border-radius: 12px;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const DestinationTitle = styled.div`
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: flex;
  justify-content: space-between;
`;

const Link = styled.a`
  color: ${theme.colors.black};
  text-decoration: underline;
`;

const ErrorBanner = styled.div`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 10px;
  background: rgba(226, 74, 91, 0.12);
  border: ${theme.borders.solidThin} rgba(226, 74, 91, 0.35);
  color: #a52727;
  font-family: ${theme.fonts.mono};
`;

const Actions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  align-items: center;
`;

const TransferJobDetails = ({ job, onRefresh, onDeleted }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const totals = job?.totals || {};
  const progressPercent = job?.progressPercent ?? (totals.total_tracks
    ? Math.round(((totals.tracks_processed || 0) / totals.total_tracks) * 100)
    : 0);

  const destinationCards = useMemo(() => {
    const results = job?.results || {};
    const destinations = job?.destinations || Object.keys(results) || [];
    return destinations.map((dest) => ({
      id: dest,
      status: results[dest]?.status || 'pending',
      playlistUrl: results[dest]?.playlistUrl || null,
      tracksAdded: results[dest]?.tracksAdded ?? 0
    }));
  }, [job]);

  const download = (response, filename) => {
    response.blob().then((blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleExport = async (format) => {
    if (!job?.id) return;
    setBusy(true);
    setError(null);
    try {
      const response = await exportTransferResults(job.id, format);
      download(response, `transfer-${job.id}.${format === 'json' ? 'json' : 'csv'}`);
    } catch (err) {
      setError(err?.message || 'Failed to export results');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!job?.id) return;
    if (!window.confirm('Cancel this transfer?')) return;
    setBusy(true);
    try {
      await deleteTransferJob(job.id);
      if (typeof onDeleted === 'function') onDeleted(job.id);
    } catch (err) {
      setError(err?.message || 'Failed to cancel transfer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header>
        <div>
          <Title>{job?.source_playlist_name || 'Spotify playlist'}</Title>
          <Meta>
            <Badge $variant={job?.status}>{job?.status}</Badge>
            <span>{(job?.destinations || []).join(', ')}</span>
            {job?.created_at && <span>Started {new Date(job.created_at).toLocaleString()}</span>}
          </Meta>
        </div>
        <Actions>
          <Button type="button" onClick={onRefresh} disabled={busy}>Refresh</Button>
          <Button type="button" onClick={() => handleExport('csv')} disabled={busy}>Export CSV</Button>
          <Button type="button" onClick={() => handleExport('json')} disabled={busy}>Export JSON</Button>
          {['completed', 'failed', 'auth_required', 'cancelled'].includes(job?.status) ? (
            <Button type="button" variant="danger" onClick={handleDelete} disabled={busy}>Delete</Button>
          ) : null}
        </Actions>
      </Header>

      <ProgressWrapper>
        <ProgressTrack>
          <ProgressFill $percent={progressPercent} />
        </ProgressTrack>
        <Meta>
          <span>{totals.tracks_processed || 0} / {totals.total_tracks || 0} processed</span>
          <span>Matched {totals.tracks_matched || 0}</span>
          <span>Failed {totals.tracks_failed || 0}</span>
        </Meta>
      </ProgressWrapper>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {job?.last_error && <ErrorBanner>{job.last_error}</ErrorBanner>}

      <DestinationGrid>
        {destinationCards.map((dest) => (
          <DestinationCard key={dest.id}>
            <DestinationTitle>
              <span>{dest.id.toUpperCase()}</span>
              <Badge $variant={dest.status}>{dest.status}</Badge>
            </DestinationTitle>
            <div>Tracks added: {dest.tracksAdded}</div>
            {dest.playlistUrl && (
              <Link href={dest.playlistUrl} target="_blank" rel="noreferrer">
                Open playlist
              </Link>
            )}
          </DestinationCard>
        ))}
      </DestinationGrid>

      <TrackResultsTable tracks={job?.track_results || []} />
    </div>
  );
};

export default TransferJobDetails;
