import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { listTransferJobs, getTransferJob } from '../../services/transferService.js';
import TransferJobCreate from '../transfer/TransferJobCreate.jsx';
import TransferJobList from '../transfer/TransferJobList.jsx';
import TransferJobDetails from '../transfer/TransferJobDetails.jsx';

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  gap: clamp(${theme.spacing.md}, 2vw, ${theme.spacing.xl});
  align-items: start;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.div`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  border-radius: 14px;
  padding: clamp(${theme.spacing.md}, 3vw, ${theme.spacing.xl});
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.06);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const Title = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.Primary};
  letter-spacing: -0.6px;
  text-transform: uppercase;
  font-size: clamp(1.2rem, 3vw, 1.6rem);
`;

const Subtle = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const EmptyState = styled.div`
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  color: rgba(0, 0, 0, 0.7);
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.04));
`;

const ErrorBanner = styled.div`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: rgba(255, 99, 71, 0.12);
  border: ${theme.borders.solidThin} rgba(255, 99, 71, 0.35);
  border-radius: 10px;
  color: #a52727;
  font-family: ${theme.fonts.mono};
`;

const TransferTab = () => {
  const [jobs, setJobs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchJobs = useCallback(async () => {
    setError(null);
    try {
      const data = await listTransferJobs({ limit: 50 });
      setJobs(Array.isArray(data) ? data : []);
      if (!selectedId && data?.length) {
        setSelectedId(data[0].id);
        setSelectedJob(data[0]);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load transfer jobs');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const refreshSelected = useCallback(async (idOverride = null) => {
    const idToFetch = idOverride ?? selectedId;
    if (!idToFetch) return;
    try {
      const job = await getTransferJob(idToFetch);
      setSelectedJob(job);
      setJobs((prev) => {
        const others = Array.isArray(prev) ? prev.filter((j) => j.id !== job.id) : [];
        return [job, ...others].slice(0, 50);
      });
    } catch (err) {
      setError(err?.message || 'Failed to refresh job');
    }
  }, [selectedId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const status = selectedJob?.status;
    const active = new Set(['pending', 'fetching', 'processing', 'auth_required']);
    if (!active.has(status)) return undefined;

    const interval = status === 'fetching' ? 2000 : 3000;
    const id = setInterval(() => {
      refreshSelected();
    }, interval);
    return () => clearInterval(id);
  }, [selectedId, selectedJob?.status, refreshSelected]);

  const handleCreated = async (jobId) => {
    await fetchJobs();
    setSelectedId(jobId);
    await refreshSelected(jobId);
  };

  const selectedSummary = useMemo(() => {
    if (!selectedJob) return null;
    const totals = selectedJob.totals || {};
    const percent = totals.total_tracks
      ? Math.round(((totals.tracks_processed || 0) / totals.total_tracks) * 100)
      : 0;
    return { ...selectedJob, progressPercent: percent };
  }, [selectedJob]);

  return (
    <Layout>
      <Panel>
        <Header>
          <div>
            <Title>Playlist Transfer</Title>
            <Subtle>Move large playlists from Spotify to Apple Music or TIDAL with enhanced matching.</Subtle>
          </div>
          <Button onClick={fetchJobs}>Refresh</Button>
        </Header>

        <TransferJobCreate onCreated={handleCreated} />

        {error && <ErrorBanner>{error}</ErrorBanner>}

      <TransferJobList
        jobs={jobs}
        loading={loading}
        selectedId={selectedId}
        onSelect={(id, job) => {
          setSelectedId(id);
          setSelectedJob(job);
          refreshSelected(id);
        }}
        onRefresh={fetchJobs}
      />
      </Panel>

      <Panel>
        {selectedSummary ? (
          <TransferJobDetails
            job={selectedSummary}
            onRefresh={refreshSelected}
            onDeleted={() => {
              setSelectedJob(null);
              setSelectedId(null);
              fetchJobs();
            }}
          />
        ) : (
          <EmptyState>
            Select a transfer job to view details.
          </EmptyState>
        )}
      </Panel>
    </Layout>
  );
};

export default TransferTab;
