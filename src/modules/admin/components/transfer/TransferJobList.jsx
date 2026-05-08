import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const Row = styled.button.withConfig({ shouldForwardProp: (prop) => prop !== '$active' })`
  width: 100%;
  text-align: left;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 12px;
  border: ${theme.borders.solidThin} ${({ $active }) => ($active ? theme.colors.black : 'rgba(0, 0, 0, 0.12)')};
  background: ${({ $active }) => ($active ? 'rgba(0, 0, 0, 0.02)' : 'transparent')};
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
`;

const Title = styled.div`
  font-family: ${theme.fonts.Primary};
  font-size: ${theme.fontSizes.medium};
  letter-spacing: -0.3px;
`;

const Meta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  align-items: center;
`;

const Status = styled.span`
  padding: 4px 8px;
  border-radius: 999px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
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

const ProgressBar = styled.div`
  position: relative;
  width: 120px;
  height: 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.08);
  overflow: hidden;
`;

const ProgressFill = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: ${({ $percent }) => `${Math.min(100, Math.max(0, $percent))}%`};
  background: linear-gradient(90deg, #111, #555);
`;

const Placeholder = styled.div`
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  text-align: center;
  font-family: ${theme.fonts.mono};
  color: rgba(0, 0, 0, 0.65);
`;

const TransferJobList = ({ jobs = [], loading = false, selectedId = null, onSelect, onRefresh }) => {
  return (
    <Wrapper>
      <Meta>
        Recent transfers
        <Button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Loading…' : 'Reload'}
        </Button>
      </Meta>
      {loading ? (
        <Placeholder>Loading transfers…</Placeholder>
      ) : jobs.length === 0 ? (
        <Placeholder>No transfer jobs yet</Placeholder>
      ) : (
        jobs.map((job) => {
          const totals = job.totals || {};
          const percent = totals.total_tracks
            ? Math.round(((totals.tracks_processed || 0) / totals.total_tracks) * 100)
            : 0;

          return (
            <Row
              key={job.id}
              $active={job.id === selectedId}
              onClick={() => onSelect?.(job.id, job)}
            >
              <div>
                <Title>{job.source_playlist_name || 'Spotify playlist'}</Title>
                <Meta>
                  <Status $variant={job.status}>{job.status}</Status>
                  <span>{(job.destinations || []).join(', ') || 'No destinations'}</span>
                  <span>{job.created_at ? new Date(job.created_at).toLocaleString() : ''}</span>
                </Meta>
              </div>
              <ProgressBar>
                <ProgressFill $percent={percent} />
              </ProgressBar>
            </Row>
          );
        })
      )}
    </Wrapper>
  );
};

export default TransferJobList;
