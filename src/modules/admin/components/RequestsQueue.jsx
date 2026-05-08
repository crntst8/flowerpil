import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { DashedBox, Button, Input, theme } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost } from '../utils/adminApi';

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'failed'];

const Container = styled(DashedBox)`
  padding: ${theme.spacing.sm};
`;

const MetricsSection = styled.div`
  margin-bottom: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: ${theme.spacing.sm};
`;

const MetricCard = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
  background: rgba(0, 0, 0, 0.02);
  padding: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const MetricLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
`;

const MetricValue = styled.span`
  font-size: 2.2rem;
  line-height: 1;
  font-weight: ${theme.fontWeights.bold};
`;

const MetricSubtext = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[600]};
`;

const TelemetryRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: ${theme.spacing.sm};
`;

const Panel = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.sm};
  background: rgba(255, 255, 255, 0.8);
`;

const PanelTitle = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: ${theme.spacing.xs};
`;

const WorkerRow = styled.div`
  border-top: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
  padding: ${theme.spacing.xs} 0;
  &:first-of-type {
    border-top: none;
  }
`;

const WorkerHeadline = styled.div`
  display: flex;
  justify-content: space-between;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  gap: ${theme.spacing.xs};
`;

const WorkerMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[600]};
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  margin-top: 2px;
`;

const StatusDot = styled.span`
  display: inline-flex;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $status }) => {
    if ($status === 'error') return theme.colors.danger;
    if ($status === 'active') return theme.colors.primary;
    if ($status === 'idle') return theme.colors.gray[500];
    if ($status === 'dormant') return theme.colors.gray[400];
    if ($status === 'offline') return theme.colors.gray[300];
    return theme.colors.black;
  }};
  margin-right: ${theme.spacing.xs};
`;

const EventRow = styled.div`
  border-top: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
  padding: ${theme.spacing.xs} 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  &:first-of-type {
    border-top: none;
  }
`;

const EmptyNote = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const Controls = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
  flex-wrap: wrap;
`;

const FilterGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  align-items: center;
`;

const Label = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
`;

const Select = styled.select`
  padding: 4px px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
`;

const Actions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
`;

const Feedback = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.sm};
  border: ${theme.borders.solid} ${({ $variant }) =>
    $variant === 'error' ? theme.colors.danger : theme.colors.success};
  background: ${({ $variant }) =>
    $variant === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.1)'};
  color: ${({ $variant }) =>
    $variant === 'error' ? theme.colors.danger : theme.colors.success};
`;

const Table = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 40px 2fr 1.5fr 1fr 80px;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  align-items: center;
  border-bottom: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
  background: ${({ $header, $selected }) => {
    if ($header) return theme.colors.black;
    if ($selected) return 'rgba(0, 0, 0, 0.05)';
    return 'transparent';
  }};
  color: ${({ $header }) => ($header ? theme.colors.fpwhite : theme.colors.black)};
  font-family: ${theme.fonts.mono};
  font-size: ${({ $header }) => ($header ? theme.fontSizes.tiny : theme.fontSizes.small)};
  text-transform: ${({ $header }) => ($header ? 'uppercase' : 'none')};

  &:hover {
    background: ${({ $header, $selected }) => {
      if ($header) return theme.colors.black;
      if ($selected) return 'rgba(0, 0, 0, 0.08)';
      return 'rgba(0, 0, 0, 0.03)';
    }};
  }

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 40px 1fr;
    gap: ${theme.spacing.xs};

    > span:nth-child(n+3) {
      grid-column: 1 / -1;
      padding-left: 40px;
    }
  }
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
  cursor: pointer;
`;

const PlaylistInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const PlaylistTitle = styled.div`
  font-weight: ${theme.fontWeights.bold};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PlaylistId = styled.div`
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const Badge = styled.span`
  display: inline-block;
  padding: 2px 6px;
  border: ${theme.borders.dashed} ${theme.colors.blackAct};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: ${theme.spacing.xs};

  &:last-child {
    margin-right: 0;
  }
`;

const StatusBadge = styled(Badge)`
  background: ${({ $status }) => {
    switch ($status) {
      case 'pending': return 'rgba(0, 0, 0, 0.04)';
      case 'in_progress': return 'rgba(59, 130, 246, 0.15)';
      case 'completed': return 'rgba(34, 197, 94, 0.15)';
      case 'failed': return 'rgba(220, 38, 38, 0.15)';
      default: return 'transparent';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'in_progress': return '#3b82f6';
      case 'completed': return '#22c55e';
      case 'failed': return '#dc2626';
      default: return theme.colors.black;
    }
  }};
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
`;

const SelectedCount = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
`;

export default function RequestsQueue() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [working, setWorking] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState('');
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsUpdatedAt, setMetricsUpdatedAt] = useState(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search && search.trim()) params.set('search', search.trim());
      const query = params.toString();
      const response = await adminGet(`/api/v1/admin/requests${query ? `?${query}` : ''}`);
      setRequests(response.data || []);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const loadMetrics = useCallback(async () => {
    setMetricsError('');
    setMetricsLoading(true);
    try {
      const response = await adminGet('/api/v1/admin/dsp/metrics');
      setMetrics(response.data || null);
      setMetricsUpdatedAt(new Date().toISOString());
    } catch (err) {
      setMetricsError(err?.message || 'Failed to load queue metrics');
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 15000);
    return () => clearInterval(interval);
  }, [loadMetrics]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === requests.length) {
        return new Set();
      }
      return new Set(requests.map((r) => r.id));
    });
  };

  const handleExport = async () => {
    if (selectedIds.size === 0) return;

    setWorking(true);
    setError('');
    setSuccess('');

    try {
      const payload = { request_ids: Array.from(selectedIds) };
      const response = await adminPost('/api/v1/admin/requests/bulk-export', payload);

      const updated = response?.data?.updated?.length || 0;
      const skipped = response?.data?.skipped?.length || 0;

      // Reload requests to reflect updated state
      await loadRequests();

      // Set feedback messages after reload to ensure they persist
      if (updated > 0) {
        setSuccess(`Successfully initiated ${updated} export${updated > 1 ? 's' : ''}. List refreshed.`);
      }
      if (skipped > 0) {
        setError(`Skipped ${skipped} request${skipped > 1 ? 's' : ''} (already processing or invalid state)`);
      }
      if (updated === 0 && skipped === 0) {
        setError('No requests were exported');
      }
    } catch (err) {
      setError(err?.message || 'Export failed');
    } finally {
      setWorking(false);
    }
  };

  const selectedCount = selectedIds.size;
  const queueStats = metrics?.queue || {};
  const workers = metrics?.workers?.heartbeats || [];
  const autoEvents = metrics?.auto_export_events || [];
  const recentFailures = metrics?.recent_failures || [];
  const successMetrics = metrics?.success_metrics || {};

  const formatDuration = useCallback((ms) => {
    if (!ms || Number.isNaN(ms) || ms < 0) return '—';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }, []);

  const lastMetricsUpdate = useMemo(() => {
    if (!metricsUpdatedAt) return '—';
    return formatDuration(Date.now() - new Date(metricsUpdatedAt).getTime());
  }, [metricsUpdatedAt, formatDuration]);

  const refreshAll = () => {
    loadRequests();
    loadMetrics();
  };

  return (
    <Container>
      <MetricsSection>
  
        {metricsError && <Feedback $variant="error">{metricsError}</Feedback>}
        <MetricGrid>
          <MetricCard style={{ background: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.3)' }}>
            <MetricLabel style={{ color: '#16a34a' }}>Successful Exports</MetricLabel>
            <MetricValue style={{ color: '#16a34a' }}>{successMetrics.successful ?? '0'}</MetricValue>
            <MetricSubtext>
              {successMetrics.success_rate_percent !== undefined
                ? `${successMetrics.success_rate_percent}% success rate`
                : 'No data'}
            </MetricSubtext>
          </MetricCard>
          <MetricCard>
            <MetricLabel>Total Exports</MetricLabel>
            <MetricValue>{successMetrics.total_exports ?? '0'}</MetricValue>
            <MetricSubtext>
              {successMetrics.failed ? `${successMetrics.failed} failed` : 'All successful'}
            </MetricSubtext>
          </MetricCard>
          <MetricCard>
            <MetricLabel>Spotify</MetricLabel>
            <MetricValue>{successMetrics.by_platform?.spotify ?? '0'}</MetricValue>
            <MetricSubtext>successful exports</MetricSubtext>
          </MetricCard>
          <MetricCard>
            <MetricLabel>Apple Music</MetricLabel>
            <MetricValue>{successMetrics.by_platform?.apple ?? '0'}</MetricValue>
            <MetricSubtext>successful exports</MetricSubtext>
          </MetricCard>
          <MetricCard>
            <MetricLabel>TIDAL</MetricLabel>
            <MetricValue>{successMetrics.by_platform?.tidal ?? '0'}</MetricValue>
            <MetricSubtext>successful exports</MetricSubtext>
          </MetricCard>
        </MetricGrid>
        <TelemetryRow>
          <Panel>
            <PanelTitle>Worker Heartbeats</PanelTitle>
            {workers.length === 0 ? (
              <EmptyNote>No worker activity detected.</EmptyNote>
            ) : (
              workers.map((worker) => {
                const status = worker.dormant
                  ? 'dormant'
                  : (worker.stale ? 'error' : worker.status);
                return (
                  <WorkerRow key={worker.worker_id}>
                    <WorkerHeadline>
                      <span>
                        <StatusDot $status={status} />
                        {worker.worker_id}
                      </span>
                      <span>{worker.queue_depth} queued</span>
                    </WorkerHeadline>
                    <WorkerMeta>
                      <span>{worker.active_requests} active</span>
                      <span>last seen {worker.last_seen_age_ms ? `${formatDuration(worker.last_seen_age_ms)} ago` : '—'}</span>
                      {worker.dormant ? (
                        <span>dormant — no pending exports</span>
                      ) : null}
                      {worker.stale && !worker.dormant ? (
                        <span>heartbeat stale</span>
                      ) : null}
                      {worker.last_error && <span>error: {worker.last_error}</span>}
                    </WorkerMeta>
                  </WorkerRow>
                );
              })
            )}
          </Panel>
          <Panel>
            <PanelTitle>Auto-Export Events</PanelTitle>
            {autoEvents.length === 0 ? (
              <EmptyNote>No auto-export activity logged.</EmptyNote>
            ) : (
              autoEvents.slice(0, 6).map((event) => (
                <EventRow key={event.id}>
                  [{event.severity}] #{event.playlist_id || '—'} • {event.trigger || 'system'}
                  <br />
                  outcome: {event.outcome}
                  {event.reason ? ` • ${event.reason}` : ''}
                </EventRow>
              ))
            )}
          </Panel>
        </TelemetryRow>
      </MetricsSection>

      <Header>
        <Controls>
          <FilterGroup>
            <Label>
              Status
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </Select>
            </Label>
          </FilterGroup>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            style={{ minWidth: 180, maxWidth: 240 }}
          />
          <Button size="small" onClick={refreshAll} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </Controls>
        <Actions>
          {selectedCount > 0 && (
            <SelectedCount>{selectedCount} selected</SelectedCount>
          )}
          <Button
            size="small"
            variant="secondary"
            onClick={toggleSelectAll}
            disabled={!requests.length}
          >
            {selectedCount === requests.length ? 'Clear' : 'Select All'}
          </Button>
          <Button
            size="small"
            variant="primary"
            onClick={handleExport}
            disabled={!selectedCount || working}
          >
            {working ? 'Exporting...' : `Export Selected (${selectedCount})`}
          </Button>
        </Actions>
      </Header>

      {error && <Feedback $variant="error">{error}</Feedback>}
      {success && <Feedback $variant="success">{success}</Feedback>}

      <Table>
        <Row $header>
          <span>
            <Checkbox
              checked={requests.length > 0 && selectedCount === requests.length}
              onChange={toggleSelectAll}
            />
          </span>
          <span>Playlist</span>
          <span>Curator</span>
          <span>Destinations</span>
          <span>Status</span>
        </Row>

        {requests.length === 0 ? (
          <EmptyState>
            {loading ? 'Loading...' : 'No export requests found'}
          </EmptyState>
        ) : (
          requests.map((item) => {
            const checked = selectedIds.has(item.id);
            const destinations = item.destinations || [];

            return (
              <Row key={item.id} $selected={checked}>
                <span>
                  <Checkbox
                    checked={checked}
                    onChange={() => toggleSelect(item.id)}
                  />
                </span>
                <span>
                  <PlaylistInfo>
                    <PlaylistTitle>{item.playlist_title || 'Untitled'}</PlaylistTitle>
                    <PlaylistId>#{item.playlist_id}</PlaylistId>
                  </PlaylistInfo>
                </span>
                <span>{item.curator_name || '—'}</span>
                <span>
                  {destinations.map((dest) => (
                    <Badge key={dest}>{dest}</Badge>
                  ))}
                </span>
                <span>
                  <StatusBadge $status={item.status}>{item.status}</StatusBadge>
                </span>
              </Row>
            );
          })
        )}
      </Table>
    </Container>
  );
}
