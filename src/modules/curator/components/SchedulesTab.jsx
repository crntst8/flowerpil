import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import { Button, theme } from '@shared/styles/GlobalStyles';
import {
  fetchScheduleRuns,
  listSchedules,
  runScheduleNow,
  updateSchedule
} from '../services/scheduleService.js';
import ScheduleIndicator from './ScheduleIndicator.jsx';
import ScheduleModal from './ScheduleModal.jsx';

const Wrapper = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  max-width: 1400px;
`;

const PageHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  background: ${theme.colors.black};
  box-shadow: 0 24px 48px -30px rgba(15, 14, 23, 0.5);
  padding: ${theme.spacing.lg} ${theme.spacing.xl};
  max-width: 100%;
  margin-bottom: ${theme.spacing.xl};

  h1 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    color: ${theme.colors.fpwhite};
    text-transform: capitalize;
    letter-spacing: -0.9px;
  }

  p {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    color: ${theme.colors.fpwhite};
    opacity: 0.9;
  }

  @media (max-width: 600px) {
    padding: ${theme.spacing.md};
    margin-bottom: ${theme.spacing.md};
  }
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
`;

const StatsGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: repeat(3, minmax(0, 1fr));

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

const StatCard = styled.div`
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};
  background: ${theme.colors.fpwhite};
  padding: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: 2px;

  .label {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.75;
  }

  .value {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.h3};
    font-weight: ${theme.fontWeights.bold};
    line-height: 1;
  }
`;

const Title = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: ${theme.fontSizes.small};
`;

const Table = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
`;

const HeaderRow = styled.div`
  display: none; /* Using inline labels instead */
`;

const Row = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$expanded' })`
  display: grid;
  grid-template-columns: 2.5fr 1.5fr 1.5fr 1.2fr auto;
  gap: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};
  border-radius: 14px;
  padding: ${theme.spacing.md};
  align-items: start;
  box-shadow: 0 12px 24px -18px rgba(15, 14, 23, 0.35);

  @media (max-width: ${theme.breakpoints.desktop}) {
    grid-template-columns: 1fr;
    gap: 0;
    padding: ${theme.spacing.md};
    align-items: stretch;
  }
`;

const Label = styled.span`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
  opacity: 0.7;
  margin-bottom: 2px;
`;

const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  @media (max-width: ${theme.breakpoints.desktop}) {
    padding: ${theme.spacing.xs} 0;

    /* Add subtle divider between cells on mobile */
    &:not(:last-child) {
      border-bottom: 1px dashed rgba(20, 19, 29, 0.08);
      padding-bottom: ${theme.spacing.sm};
      margin-bottom: ${theme.spacing.xs};
    }
  }

  @media (min-width: ${theme.breakpoints.desktop}) {
    /* Subtle visual separation on desktop */
    padding-right: ${theme.spacing.sm};
  }
`;

const PlaylistTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  min-width: 0;
  flex-wrap: wrap;
`;

const PlaylistName = styled.span`
  font-family: ${theme.fonts.primary};
  font-weight: ${theme.fontWeights.bold};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.black};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
  flex: 1;
  min-width: 0;
`;

const Meta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
`;

const StatusChip = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$status' })`
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid
    ${({ $status }) => ($status === 'paused' ? '#b45309' : $status === 'failed' ? theme.colors.danger : '#1f7a3d')};
  background:
    ${({ $status }) => ($status === 'paused' ? 'rgba(245, 158, 11, 0.12)' : $status === 'failed' ? 'rgba(220, 38, 38, 0.12)' : 'rgba(34, 197, 94, 0.12)')};
`;

const StatusText = styled(Meta)`
  @media (min-width: ${theme.breakpoints.desktop}) {
    display: none;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: flex-start;

  button {
    white-space: nowrap;
  }

  @media (max-width: ${theme.breakpoints.desktop}) {
    flex-direction: column;
    gap: ${theme.spacing.sm};
    margin-top: ${theme.spacing.sm};
    padding-top: ${theme.spacing.sm};
    border-top: 1px dashed rgba(20, 19, 29, 0.12);

    button {
      width: 100%;
      min-height: 44px;
      justify-content: center;
    }
  }
`;

const RunList = styled.ul`
  list-style: none;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  margin: ${theme.spacing.sm} 0 0;
  background: rgba(20, 19, 29, 0.04);
  border-radius: 12px;
  border: 1px dashed rgba(20, 19, 29, 0.15);
  display: grid;
  gap: ${theme.spacing.xs};
`;

const RunItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.04em;
  color: ${theme.colors.black};
`;

const RunStatus = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$status' })`
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  padding: 2px 6px;
  border: 1px solid ${({ $status }) => ($status === 'success' ? '#1f7a3d' : theme.colors.danger)};
  background: ${({ $status }) => ($status === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(220, 38, 38, 0.12)')};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const EmptyState = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  padding: ${theme.spacing.xl} ${theme.spacing.md};
  text-align: center;
  border: ${theme.borders.dashedThin} ${theme.colors.black};
  border-radius: 16px;
  background: rgba(248, 248, 248, 0.75);
`;

const formatDate = (value) => {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (err) {
    return value;
  }
};

const formatMode = (mode, appendPosition) => {
  if (mode === 'append') {
    return appendPosition === 'bottom' ? 'Append • add to bottom' : 'Append • add to top';
  }
  return 'Replace source';
};

export default function SchedulesTab({
  playlists,
  authenticatedFetch,
  onSchedulesChange,
  refreshSignal = 0
}) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [runs, setRuns] = useState({});

  const [modalSchedule, setModalSchedule] = useState(null);
  const [modalPlaylist, setModalPlaylist] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const playlistLookup = useMemo(() => {
    const map = new Map();
    (playlists || []).forEach((pl) => map.set(pl.id, pl));
    return map;
  }, [playlists]);

  const scheduleStats = useMemo(() => {
    const total = schedules.length;
    const active = schedules.filter((item) => item.status === 'active').length;
    const paused = schedules.filter((item) => item.status === 'paused').length;
    return { total, active, paused };
  }, [schedules]);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listSchedules(authenticatedFetch);
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Unable to load schedules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    if (onSchedulesChange) {
      onSchedulesChange(schedules);
    }
  }, [schedules, onSchedulesChange]);

  const handleExpand = async (scheduleId) => {
    if (expandedId === scheduleId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(scheduleId);
    if (runs[scheduleId]) return;
    try {
      const history = await fetchScheduleRuns(authenticatedFetch, scheduleId, { limit: 5 });
      setRuns((prev) => ({ ...prev, [scheduleId]: Array.isArray(history) ? history : [] }));
    } catch (err) {
      setRuns((prev) => ({ ...prev, [scheduleId]: [] }));
    }
  };

  const openModalFor = (scheduleRecord) => {
    const playlist = playlistLookup.get(scheduleRecord?.playlist_id) || null;
    setModalPlaylist(playlist);
    setModalSchedule(scheduleRecord);
    setModalOpen(true);
  };

  const openModalForPlaylist = (playlistId) => {
    const playlist = playlistLookup.get(playlistId) || null;
    setModalPlaylist(playlist);
    setModalSchedule(null);
    setModalOpen(true);
  };

  const handlePauseToggle = async (scheduleRecord) => {
    const nextStatus = scheduleRecord.status === 'paused' ? 'active' : 'paused';
    try {
      await updateSchedule(authenticatedFetch, scheduleRecord.id, { status: nextStatus });
      setSchedules((prev) => prev.map((item) => (item.id === scheduleRecord.id ? { ...item, status: nextStatus } : item)));
    } catch (err) {
      setError(err.message || 'Failed to update schedule status');
    }
  };

  const handleRunNow = async (scheduleRecord) => {
    try {
      await runScheduleNow(authenticatedFetch, scheduleRecord.id);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to start schedule');
    }
  };

  const handleModalSaved = (updatedSchedule) => {
    if (!updatedSchedule) return;
    setSchedules((prev) => {
      const exists = prev.some((item) => item.id === updatedSchedule.id);
      if (exists) {
        return prev.map((item) => (item.id === updatedSchedule.id ? { ...item, ...updatedSchedule } : item));
      }
      return [...prev, updatedSchedule];
    });
  };

  const handleModalDeleted = (deletedId) => {
    if (!deletedId) return;
    setSchedules((prev) => prev.filter((item) => item.id !== deletedId));
  };

  return (
    <Wrapper>
      <PageHeader>
        <h1>Scheduled Imports</h1>
        <p>Automate playlist refreshes and monitor import history from one place.</p>
      </PageHeader>

      <StatsGrid>
        <StatCard>
          <span className="label">Total Schedules</span>
          <span className="value">{scheduleStats.total}</span>
        </StatCard>
        <StatCard>
          <span className="label">Active</span>
          <span className="value">{scheduleStats.active}</span>
        </StatCard>
        <StatCard>
          <span className="label">Paused</span>
          <span className="value">{scheduleStats.paused}</span>
        </StatCard>
      </StatsGrid>

      <Toolbar>
        <Title>Schedules</Title>
        <Button onClick={() => openModalForPlaylist(playlists?.[0]?.id)} disabled={!playlists || playlists.length === 0}>
          New schedule
        </Button>
      </Toolbar>

      {error && <EmptyState style={{ color: '#7f1d1d', background: 'rgba(220,38,38,0.08)' }}>{error}</EmptyState>}

      {loading ? (
        <EmptyState>Loading schedules…</EmptyState>
      ) : schedules.length === 0 ? (
        <EmptyState>
          No schedules yet. Create one from the playlist list or click “New schedule” to get started.
        </EmptyState>
      ) : (
        <>
          <HeaderRow>
            <div>Playlist</div>
            <div>Next import</div>
            <div>Last import</div>
            <div>Mode</div>
            <div>Actions</div>
          </HeaderRow>
          <Table>
            {schedules.map((scheduleRecord) => {
              const playlist = playlistLookup.get(scheduleRecord.playlist_id);
              return (
                <div key={scheduleRecord.id}>
                  <Row>
                    <Cell>
                      <Label>Playlist</Label>
                      <PlaylistTitleRow>
                        <ScheduleIndicator schedule={scheduleRecord} />
                        <PlaylistName>{playlist?.title || `Playlist #${scheduleRecord.playlist_id}`}</PlaylistName>
                        <StatusChip $status={scheduleRecord.status || 'active'}>
                          {scheduleRecord.status === 'paused'
                            ? 'Paused'
                            : scheduleRecord.status === 'failed'
                              ? 'Attention'
                              : 'Active'}
                        </StatusChip>
                      </PlaylistTitleRow>
                      <Meta>Schedule ID • {scheduleRecord.id}</Meta>
                      <StatusText>{scheduleRecord.status || 'active'}</StatusText>
                    </Cell>
                    <Cell>
                      <Label>Next import</Label>
                      <Meta>{formatDate(scheduleRecord.next_run_at)}</Meta>
                    </Cell>
                    <Cell>
                      <Label>Last import</Label>
                      <Meta>{formatDate(scheduleRecord.last_run_at)}</Meta>
                    </Cell>
                    <Cell>
                      <Label>Mode</Label>
                      <Meta>{formatMode(scheduleRecord.mode, scheduleRecord.append_position)}</Meta>
                    </Cell>
                    <Actions>
                      <Button onClick={() => openModalFor(scheduleRecord)}>
                        Edit
                      </Button>
                      <Button variant="fpwhite" onClick={() => handleRunNow(scheduleRecord)}>
                        Run now
                      </Button>
                      <Button variant="secondary" onClick={() => handlePauseToggle(scheduleRecord)}>
                        {scheduleRecord.status === 'paused' ? 'Resume' : 'Pause'}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => handleExpand(scheduleRecord.id)}
                      >
                        {expandedId === scheduleRecord.id ? 'Hide run log' : 'Show run log'}
                      </Button>
                    </Actions>
                  </Row>
                  {expandedId === scheduleRecord.id && (
                    <RunList>
                      {(runs[scheduleRecord.id] || []).length === 0 ? (
                        <RunItem>No recent imports logged.</RunItem>
                      ) : (
                        runs[scheduleRecord.id].map((run) => (
                          <RunItem key={run.id}>
                            <RunStatus $status={run.status}>{run.status || 'unknown'}</RunStatus>
                            <span>
                              {formatDate(run.started_at)}
                            </span>
                            {run.stats?.added !== undefined && (
                              <span>
                                Δ {run.stats.added || 0} added · {run.stats.deleted || 0} removed · {run.stats.skipped_duplicates || 0} duplicates skipped
                              </span>
                            )}
                            {run.error && <span>Error: {run.error}</span>}
                          </RunItem>
                        ))
                      )}
                    </RunList>
                  )}
                </div>
              );
            })}
          </Table>
        </>
      )}

      {modalOpen && (
        <ScheduleModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          playlist={modalPlaylist}
          schedule={modalSchedule}
          authenticatedFetch={authenticatedFetch}
          onSaved={handleModalSaved}
          onDeleted={handleModalDeleted}
          onRequestConnectSpotify={() => {
            setModalOpen(false);
            window.location.href = '/curator-admin?tab=dsp';
          }}
        />
      )}
    </Wrapper>
  );
}

SchedulesTab.propTypes = {
  playlists: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number,
    title: PropTypes.string
  })),
  authenticatedFetch: PropTypes.func.isRequired,
  onSchedulesChange: PropTypes.func,
  refreshSignal: PropTypes.number
};
