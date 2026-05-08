import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme, Button, Input, Select } from '@shared/styles/GlobalStyles';
import { adminDelete, adminGet, adminPost, adminPut } from '../utils/adminApi';

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
`;

const TitleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Title = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${theme.colors.black};
`;

const Subtitle = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[600]};
`;

const Toolbar = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 2fr) minmax(140px, 1fr) max-content;
  gap: ${theme.spacing.sm};
  align-items: center;

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const Table = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
`;

const Card = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$attention' })`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  border-radius: 12px;
  border: ${theme.borders.solidThin} ${({ $attention }) => ($attention ? 'rgba(220, 38, 38, 0.45)' : 'rgba(0, 0, 0, 0.16)')};
  background: ${theme.colors.fpwhite};
  box-shadow: 0 8px 24px rgba(15, 14, 23, 0.08);
`;

const RowHeadline = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)) max-content;
  gap: ${theme.spacing.sm};
  align-items: center;

  @media (max-width: ${theme.breakpoints.desktop}) {
    grid-template-columns: 1fr;
    align-items: flex-start;
  }
`;

const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Label = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.black[500]};
`;

const Value = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const StatusPill = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$tone' })`
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: 4px 10px;
  border-radius: 999px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: ${({ $tone }) => {
    if ($tone === 'danger') return 'rgba(220, 38, 38, 0.12)';
    if ($tone === 'warning') return 'rgba(255, 193, 7, 0.16)';
    return 'rgba(16, 185, 129, 0.16)';
  }};
  color: ${({ $tone }) => {
    if ($tone === 'danger') return '#7f1d1d';
    if ($tone === 'warning') return '#7a4c03';
    return '#065f46';
  }};
  border: 1px solid ${({ $tone }) => {
    if ($tone === 'danger') return 'rgba(220, 38, 38, 0.35)';
    if ($tone === 'warning') return 'rgba(255, 193, 7, 0.3)';
    return 'rgba(16, 185, 129, 0.3)';
  }};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  justify-content: flex-end;
`;

const ExpandArea = styled.div`
  border-top: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.12);
  padding-top: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const RunLog = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.04em;
  color: ${theme.colors.black};
`;

const Banner = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$variant' })`
  border-radius: 10px;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  border: 1px solid ${({ $variant }) => ($variant === 'error' ? 'rgba(220, 38, 38, 0.45)' : 'rgba(16, 185, 129, 0.35)')};
  background: ${({ $variant }) => ($variant === 'error' ? 'rgba(220, 38, 38, 0.12)' : 'rgba(16, 185, 129, 0.12)')};
  color: ${({ $variant }) => ($variant === 'error' ? '#7f1d1d' : '#065f46')};
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.lg};
  border-radius: 12px;
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.18);
  font-family: ${theme.fonts.primary};
  text-align: center;
  color: ${theme.colors.black[600]};
  background: rgba(248, 248, 248, 0.75);
`;

const formatDateTime = (value) => {
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
  } catch {
    return value;
  }
};

const formatRelative = (value) => {
  if (!value) return '';
  try {
    const target = new Date(value);
    if (Number.isNaN(target.getTime())) return '';
    const now = Date.now();
    const diffMs = target.getTime() - now;
    const diffMinutes = Math.round(diffMs / 60000);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (Math.abs(diffMinutes) < 60) {
      return formatter.format(diffMinutes, 'minute');
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 48) {
      return formatter.format(diffHours, 'hour');
    }
    const diffDays = Math.round(diffHours / 24);
    return formatter.format(diffDays, 'day');
  } catch {
    return '';
  }
};

const formatCadence = (schedule) => {
  if (!schedule) return '—';
  const { frequency, frequency_value: value, time_utc: timeUtc } = schedule;
  const timeLabel = timeUtc ? `@ ${timeUtc} UTC` : '';

  switch (frequency) {
    case 'daily':
      return `Daily ${timeLabel}`.trim();
    case 'monthly':
      return `Monthly ${timeLabel}`.trim();
    case 'every_x_date':
      return `Monthly on ${value || 'day 1'} ${timeLabel}`.trim();
    case 'every_x_dow':
      return `Weekly on ${value ? value.replace(/,/g, ', ') : 'selected days'} ${timeLabel}`.trim();
    default:
      return `Custom ${timeLabel}`.trim();
  }
};

const resolveStatusTone = (schedule) => {
  if (!schedule) return { tone: 'neutral', label: 'Unknown' };
  if (schedule.status === 'paused') {
    return { tone: 'warning', label: 'Paused' };
  }
  if (schedule.status === 'failed' || (schedule.failures_since_success ?? 0) > 0 || schedule.last_run_status === 'failed') {
    return { tone: 'danger', label: 'Attention' };
  }
  return { tone: 'success', label: 'Active' };
};

export default function ScheduledImportsPanel() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, limit: 50, offset: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [runLogs, setRunLogs] = useState({});
  const [runErrors, setRunErrors] = useState({});
  const [runLoading, setRunLoading] = useState({});
  const [mutating, setMutating] = useState({});

  const fetchData = useCallback(async ({ showSpinner = true } = {}) => {
    try {
      if (showSpinner) setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      params.set('limit', String(meta.limit || 50));
      params.set('offset', '0');

      const response = await adminGet(`/api/v1/admin/scheduled-imports?${params.toString()}`);
      const data = response?.data ?? {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setMeta({
        total: data.total ?? 0,
        limit: data.limit ?? 50,
        offset: data.offset ?? 0
      });
    } catch (err) {
      setError(err?.message || 'Failed to load scheduled imports');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [statusFilter, searchTerm, meta.limit]);

  useEffect(() => {
    let cancelled = false;
    const delay = searchTerm ? 300 : 0;
    const timer = setTimeout(() => {
      if (!cancelled) {
        fetchData();
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchData, statusFilter, searchTerm]);

  const setMutatingFlag = useCallback((id, value) => {
    setMutating((prev) => ({ ...prev, [id]: value }));
  }, []);

  const refreshQuietly = useCallback(async () => {
    await fetchData({ showSpinner: false });
  }, [fetchData]);

  const handleRunNow = useCallback(async (scheduleId) => {
    try {
      setMutatingFlag(scheduleId, 'run');
      setFeedback('');
      await adminPost(`/api/v1/playlist-actions/schedules/${scheduleId}/run-now`, {});
      setFeedback('Import started. Check run history for progress.');
      await refreshQuietly();
    } catch (err) {
      setError(err?.message || 'Failed to start scheduled import');
    } finally {
      setMutatingFlag(scheduleId, null);
    }
  }, [refreshQuietly, setMutatingFlag]);

  const handleToggleStatus = useCallback(async (schedule) => {
    if (!schedule) return;
    const nextStatus = schedule.status === 'paused' ? 'active' : 'paused';
    try {
      setMutatingFlag(schedule.id, 'status');
      setFeedback('');
      await adminPut(`/api/v1/playlist-actions/schedules/${schedule.id}`, { status: nextStatus });
      setFeedback(`Schedule ${nextStatus === 'active' ? 'resumed' : 'paused'}.`);
      await refreshQuietly();
    } catch (err) {
      setError(err?.message || 'Failed to update schedule status');
    } finally {
      setMutatingFlag(schedule.id, null);
    }
  }, [refreshQuietly, setMutatingFlag]);

  const handleDelete = useCallback(async (scheduleId) => {
    if (!scheduleId) return;
    if (!window.confirm('Delete this scheduled import? This action cannot be undone.')) return;
    try {
      setMutatingFlag(scheduleId, 'delete');
      setFeedback('');
      await adminDelete(`/api/v1/playlist-actions/schedules/${scheduleId}`);
      setFeedback('Scheduled import removed.');
      setRunLogs((prev) => {
        const next = { ...prev };
        delete next[scheduleId];
        return next;
      });
      await refreshQuietly();
    } catch (err) {
      setError(err?.message || 'Failed to delete scheduled import');
    } finally {
      setMutatingFlag(scheduleId, null);
    }
  }, [refreshQuietly, setMutatingFlag]);

  const toggleRuns = useCallback(async (scheduleId) => {
    if (!scheduleId) return;
    if (expandedId === scheduleId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(scheduleId);
    if (runLogs[scheduleId] || runLoading[scheduleId]) return;
    try {
      setRunLoading((prev) => ({ ...prev, [scheduleId]: true }));
      setRunErrors((prev) => ({ ...prev, [scheduleId]: '' }));
      const response = await adminGet(`/api/v1/playlist-actions/schedules/${scheduleId}/runs?limit=10`);
      const rows = Array.isArray(response?.data) ? response.data : [];
      setRunLogs((prev) => ({ ...prev, [scheduleId]: rows }));
    } catch (err) {
      setRunErrors((prev) => ({ ...prev, [scheduleId]: err?.message || 'Failed to load run history' }));
    } finally {
      setRunLoading((prev) => ({ ...prev, [scheduleId]: false }));
    }
  }, [expandedId, runLoading, runLogs]);

  const totalSchedulesLabel = useMemo(() => {
    if (!meta.total) return '0 schedules';
    if (meta.total === 1) return '1 schedule';
    return `${meta.total} schedules`;
  }, [meta.total]);

  return (
    <Panel>
      <Header>
        <TitleGroup>
          <Title>Scheduled Imports</Title>
          <Subtitle>Monitor curator automations and intervene when something stalls</Subtitle>
        </TitleGroup>
        <Button variant="secondary" onClick={() => fetchData()} disabled={loading}>
          Refresh
        </Button>
      </Header>

      <Toolbar>
        <Input
          placeholder="Search playlists, curators, or playlist ID"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="failed">Marked as failed</option>
        </Select>
        <Value style={{ justifySelf: 'flex-end' }}>{totalSchedulesLabel}</Value>
      </Toolbar>

      {error && <Banner $variant="error">{error}</Banner>}
      {feedback && !error && <Banner>{feedback}</Banner>}

      {loading ? (
        <EmptyState>Loading scheduled imports…</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>No scheduled imports discovered. They will appear here as curators enable automation.</EmptyState>
      ) : (
        <Table>
          {items.map((schedule) => {
            const tone = resolveStatusTone(schedule);
            const isMutating = Boolean(mutating[schedule.id]);
            const runs = runLogs[schedule.id] || [];
            const runsBusy = runLoading[schedule.id];
            const runError = runErrors[schedule.id];

            return (
              <Card key={schedule.id} $attention={tone.tone === 'danger'}>
                <RowHeadline>
                  <Cell>
                    <Label>Playlist</Label>
                    <Value>{schedule.playlist_title || `Playlist #${schedule.playlist_id}`}</Value>
                    <Subtitle>{schedule.curator_name ? `Curator: ${schedule.curator_name}` : 'Unknown curator'}</Subtitle>
                  </Cell>
                  <Cell>
                    <Label>Cadence</Label>
                    <Value>{formatCadence(schedule)}</Value>
                  </Cell>
                  <Cell>
                    <Label>Next run</Label>
                    <Value>
                      {formatDateTime(schedule.next_run_at)}
                      <br />
                      <span style={{ fontSize: theme.fontSizes.tiny, color: theme.colors.black[500] }}>
                        {formatRelative(schedule.next_run_at)}
                      </span>
                    </Value>
                  </Cell>
                  <Cell>
                    <Label>Last run</Label>
                    <Value>
                      {schedule.last_run_status
                        ? `${schedule.last_run_status === 'success' ? '✅' : '⚠️'} ${formatDateTime(schedule.last_run_started_at)}`
                        : '—'}
                    </Value>
                  </Cell>
                  <Cell>
                    <StatusPill $tone={tone.tone}>{tone.label}</StatusPill>
                  </Cell>
                </RowHeadline>

                <Actions>
                  <Button
                    variant="fpwhite"
                    onClick={() => handleRunNow(schedule.id)}
                    disabled={isMutating}
                  >
                    Run now
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleToggleStatus(schedule)}
                    disabled={isMutating}
                  >
                    {schedule.status === 'paused' ? 'Resume' : 'Pause'}
                  </Button>
                  <Button
                    onClick={() => toggleRuns(schedule.id)}
                    variant="ghost"
                    disabled={isMutating}
                  >
                    {expandedId === schedule.id ? 'Hide runs' : 'View runs'}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleDelete(schedule.id)}
                    disabled={isMutating}
                  >
                    Delete
                  </Button>
                </Actions>

                {expandedId === schedule.id && (
                  <ExpandArea>
                    {runsBusy && <Value>Loading run history…</Value>}
                    {runError && <Banner $variant="error">{runError}</Banner>}
                    {!runsBusy && !runError && (
                      <RunLog>
                        {runs.length === 0 ? (
                          <span>No run history captured yet.</span>
                        ) : (
                          runs.map((run) => (
                            <span key={run.id}>
                              {run.status === 'success' ? '✅' : '⚠️'} {formatDateTime(run.started_at)} →
                              {formatDateTime(run.finished_at)} • {run.status}
                              {run.stats ? ` • Δ ${run.stats.added || 0} added / ${run.stats.deleted || 0} removed` : ''}
                              {run.error ? ` • ${run.error}` : ''}
                            </span>
                          ))
                        )}
                      </RunLog>
                    )}
                  </ExpandArea>
                )}
              </Card>
            );
          })}
        </Table>
      )}
    </Panel>
  );
}

