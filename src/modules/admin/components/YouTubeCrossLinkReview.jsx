import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { DashedBox, Button, Input, theme } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminPatch, adminDelete } from '../utils/adminApi';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: ${theme.spacing.sm};
`;

const MetricCard = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
  background: rgba(0, 0, 0, 0.02);
  padding: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MetricLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const MetricValue = styled.span`
  font-size: 1.8rem;
  line-height: 1;
  font-weight: ${theme.fontWeights.bold};
`;

const ControlsRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
  flex-wrap: wrap;
`;

const Select = styled.select`
  padding: 6px 10px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  min-width: 180px;
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
`;

const SearchInput = styled(Input)`
  min-width: 200px;
`;

const ProgressBar = styled.div`
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  height: 24px;
  overflow: hidden;
  position: relative;
`;

const ProgressFill = styled.div`
  background: ${theme.colors.primary};
  height: 100%;
  transition: width 0.3s ease;
  width: ${({ $percent }) => $percent}%;
`;

const ProgressText = styled.span`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const Table = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 40px 2fr 2fr 80px 100px 140px;
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
    background: ${({ $header }) => ($header ? theme.colors.black : 'rgba(0, 0, 0, 0.03)')};
  }

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 40px 1fr;
    gap: ${theme.spacing.xs};

    > *:nth-child(n+3) {
      grid-column: 1 / -1;
      padding-left: 40px;
    }
  }
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
  cursor: pointer;
`;

const TrackInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const TrackTitle = styled.div`
  font-weight: ${theme.fontWeights.bold};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TrackArtist = styled.div`
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[600]};
`;

const TrackPlaylist = styled.div`
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  font-style: italic;
`;

const YouTubeMatch = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
`;

const YouTubeEmbed = styled.div`
  flex-shrink: 0;
  width: 150px;
  height: 84px;
  background: ${theme.colors.black};
  border-radius: 4px;
  overflow: hidden;

  iframe {
    width: 100%;
    height: 100%;
    border: none;
  }
`;

const NoMatch = styled.div`
  color: ${theme.colors.gray[500]};
  font-style: italic;
`;

const MatchDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const MatchTitle = styled.div`
  font-size: ${theme.fontSizes.small};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MatchArtist = styled.div`
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[600]};
`;

const ConfidenceBadge = styled.span`
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.bold};
  background: ${({ $value }) => {
    if ($value >= 80) return 'rgba(34, 197, 94, 0.15)';
    if ($value >= 60) return 'rgba(234, 179, 8, 0.15)';
    return 'rgba(220, 38, 38, 0.15)';
  }};
  color: ${({ $value }) => {
    if ($value >= 80) return '#22c55e';
    if ($value >= 60) return '#ca8a04';
    return '#dc2626';
  }};
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 2px 6px;
  border: ${theme.borders.dashed} ${theme.colors.black};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ $status }) => {
    switch ($status) {
      case 'pending': return 'rgba(0, 0, 0, 0.04)';
      case 'approved': return 'rgba(34, 197, 94, 0.15)';
      case 'rejected': return 'rgba(220, 38, 38, 0.15)';
      case 'overridden': return 'rgba(59, 130, 246, 0.15)';
      default: return 'transparent';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'approved': return '#22c55e';
      case 'rejected': return '#dc2626';
      case 'overridden': return '#3b82f6';
      default: return theme.colors.black;
    }
  }};
`;

const Actions = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  padding: 4px 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const BulkActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
  padding: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.02);
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
`;

const SelectedCount = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
`;

const Feedback = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solid} ${({ $variant }) =>
    $variant === 'error' ? theme.colors.danger : theme.colors.success};
  background: ${({ $variant }) =>
    $variant === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.1)'};
  color: ${({ $variant }) =>
    $variant === 'error' ? theme.colors.danger : theme.colors.success};
`;

const Pagination = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
  justify-content: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const OverrideModal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled(DashedBox)`
  background: ${theme.colors.fpwhite};
  padding: ${theme.spacing.lg};
  max-width: 500px;
  width: 90%;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ModalTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
`;

const ModalField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ModalActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
`;

const SettingsRow = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  align-items: center;
  padding: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.02);
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
`;

const SettingsLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${theme.colors.gray[300]};
    transition: 0.3s;
    border-radius: 24px;

    &:before {
      position: absolute;
      content: '';
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }
  }

  input:checked + span {
    background-color: ${theme.colors.primary};
  }

  input:checked + span:before {
    transform: translateX(24px);
  }
`;

export default function YouTubeCrossLinkReview() {
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ status: 'all', playlistId: '', search: '' });
  const [jobProgress, setJobProgress] = useState(null);
  const [overrideModal, setOverrideModal] = useState(null);
  const [overrideUrl, setOverrideUrl] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [settings, setSettings] = useState({ youtube_auto_link_enabled: false });

  const loadStats = useCallback(async () => {
    try {
      const response = await adminGet('/api/v1/admin/youtube-crosslink/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    try {
      const response = await adminGet('/api/v1/admin/youtube-crosslink/playlists');
      setPlaylists(response.data || []);
    } catch (err) {
      console.error('Failed to load playlists:', err);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const response = await adminGet('/api/v1/admin/youtube-crosslink/settings');
      setSettings(response.data || { youtube_auto_link_enabled: false });
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  const loadResults = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', pagination.page);
      params.set('limit', pagination.limit);
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.playlistId) params.set('playlistId', filters.playlistId);
      if (filters.search) params.set('search', filters.search);

      const response = await adminGet(`/api/v1/admin/youtube-crosslink/results?${params}`);
      setResults(response.data || []);
      setPagination(prev => ({ ...prev, ...response.pagination }));
      setSelectedIds(new Set());
    } catch (err) {
      setError(err?.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    loadStats();
    loadPlaylists();
    loadSettings();
  }, [loadStats, loadPlaylists, loadSettings]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const startDryRun = async (siteWide = false) => {
    setError('');
    setSuccess('');
    try {
      const payload = siteWide
        ? { siteWide: true }
        : { playlistId: parseInt(filters.playlistId, 10) };

      const response = await adminPost('/api/v1/admin/youtube-crosslink/dry-run', payload);

      if (response.jobId) {
        setJobProgress({
          jobId: response.jobId,
          status: 'queued',
          progress: { total: response.totalTracks, processed: 0 }
        });
        pollJobProgress(response.jobId);
      } else {
        setSuccess(response.message || 'Dry run completed');
        loadResults();
        loadStats();
      }
    } catch (err) {
      setError(err?.message || 'Failed to start dry run');
    }
  };

  const pollJobProgress = async (jobId) => {
    try {
      const response = await adminGet(`/api/v1/admin/youtube-crosslink/job/${jobId}`);
      const progress = response.data;

      setJobProgress(progress);

      if (progress.status === 'processing' || progress.status === 'pending') {
        setTimeout(() => pollJobProgress(jobId), 2000);
      } else {
        setTimeout(() => {
          setJobProgress(null);
          loadResults();
          loadStats();
          if (progress.status === 'completed') {
            setSuccess(`Dry run completed: ${progress.progress.found}/${progress.progress.total} tracks matched`);
          }
        }, 1000);
      }
    } catch (err) {
      console.error('Poll error:', err);
      setJobProgress(null);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
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
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map(r => r.id)));
    }
  };

  const approveSelected = async () => {
    if (selectedIds.size === 0) return;
    setError('');
    try {
      await adminPost('/api/v1/admin/youtube-crosslink/bulk-approve', {
        stagingIds: Array.from(selectedIds)
      });
      setSuccess(`Approved ${selectedIds.size} entries`);
      loadResults();
      loadStats();
    } catch (err) {
      setError(err?.message || 'Failed to approve');
    }
  };

  const approveAll = async () => {
    setError('');
    try {
      const response = await adminPost('/api/v1/admin/youtube-crosslink/bulk-approve', {
        approveAll: true
      });
      setSuccess(`Approved ${response.approved} entries`);
      loadResults();
      loadStats();
    } catch (err) {
      setError(err?.message || 'Failed to approve all');
    }
  };

  const applySelected = async () => {
    if (selectedIds.size === 0) return;
    setError('');
    try {
      const response = await adminPost('/api/v1/admin/youtube-crosslink/apply', {
        stagingIds: Array.from(selectedIds)
      });
      const dupeMsg = response.duplicatesLinked > 0 ? ` (+${response.duplicatesLinked} duplicates)` : '';
      setSuccess(`Applied ${response.applied} entries${dupeMsg}`);
      loadResults();
      loadStats();
    } catch (err) {
      setError(err?.message || 'Failed to apply');
    }
  };

  const applyAll = async () => {
    setError('');
    try {
      const response = await adminPost('/api/v1/admin/youtube-crosslink/apply', {
        applyAll: true
      });
      const dupeMsg = response.duplicatesLinked > 0 ? ` (+${response.duplicatesLinked} duplicates)` : '';
      setSuccess(`Applied ${response.applied} entries${dupeMsg}`);
      loadResults();
      loadStats();
    } catch (err) {
      setError(err?.message || 'Failed to apply all');
    }
  };

  const updateStatus = async (id, status) => {
    setError('');
    try {
      await adminPatch(`/api/v1/admin/youtube-crosslink/staging/${id}/status`, { status });
      loadResults();
      loadStats();
    } catch (err) {
      setError(err?.message || 'Failed to update status');
    }
  };

  const deleteEntry = async (id) => {
    setError('');
    try {
      await adminDelete(`/api/v1/admin/youtube-crosslink/staging/${id}`);
      loadResults();
      loadStats();
    } catch (err) {
      setError(err?.message || 'Failed to delete');
    }
  };

  const openOverrideModal = (entry) => {
    setOverrideModal(entry);
    setOverrideUrl(entry.override_url || '');
    setOverrideReason(entry.override_reason || '');
  };

  const saveOverride = async () => {
    if (!overrideModal) return;
    setError('');
    try {
      await adminPost('/api/v1/admin/youtube-crosslink/override', {
        stagingId: overrideModal.id,
        url: overrideUrl,
        reason: overrideReason
      });
      setOverrideModal(null);
      setOverrideUrl('');
      setOverrideReason('');
      loadResults();
      loadStats();
    } catch (err) {
      setError(err?.message || 'Failed to save override');
    }
  };

  const toggleAutoLink = async () => {
    try {
      const newValue = !settings.youtube_auto_link_enabled;
      await adminPost('/api/v1/admin/youtube-crosslink/settings', {
        youtube_auto_link_enabled: newValue
      });
      setSettings(prev => ({ ...prev, youtube_auto_link_enabled: newValue }));
      setSuccess(`Auto-linking ${newValue ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setError(err?.message || 'Failed to update settings');
    }
  };

  const progressPercent = useMemo(() => {
    if (!jobProgress?.progress) return 0;
    const { processed, total } = jobProgress.progress;
    return total > 0 ? Math.round((processed / total) * 100) : 0;
  }, [jobProgress]);

  return (
    <Container>
      {/* Stats */}
      {stats && (
        <MetricsGrid>
          <MetricCard>
            <MetricLabel>Total</MetricLabel>
            <MetricValue>{stats.total}</MetricValue>
          </MetricCard>
          <MetricCard>
            <MetricLabel>Pending</MetricLabel>
            <MetricValue>{stats.pending}</MetricValue>
          </MetricCard>
          <MetricCard>
            <MetricLabel>Pending + Matched</MetricLabel>
            <MetricValue>{stats.pending_matched || 0}</MetricValue>
          </MetricCard>
          <MetricCard>
            <MetricLabel>Approved</MetricLabel>
            <MetricValue>{stats.approved}</MetricValue>
          </MetricCard>
          <MetricCard>
            <MetricLabel>Overridden</MetricLabel>
            <MetricValue>{stats.overridden}</MetricValue>
          </MetricCard>
          <MetricCard>
            <MetricLabel>Ready to Apply</MetricLabel>
            <MetricValue>{stats.ready_to_apply || 0}</MetricValue>
          </MetricCard>
          <MetricCard>
            <MetricLabel>Applied</MetricLabel>
            <MetricValue>{stats.applied}</MetricValue>
          </MetricCard>
          <MetricCard>
            <MetricLabel>Matched</MetricLabel>
            <MetricValue>{stats.matched}</MetricValue>
          </MetricCard>
        </MetricsGrid>
      )}

      {/* Settings */}
      <SettingsRow>
        <SettingsLabel>Auto-link YouTube for new playlists:</SettingsLabel>
        <ToggleSwitch>
          <input
            type="checkbox"
            checked={settings.youtube_auto_link_enabled}
            onChange={toggleAutoLink}
          />
          <span />
        </ToggleSwitch>
        <SettingsLabel style={{ color: settings.youtube_auto_link_enabled ? '#22c55e' : theme.colors.gray[500] }}>
          {settings.youtube_auto_link_enabled ? 'Enabled' : 'Disabled'}
        </SettingsLabel>
      </SettingsRow>

      {/* Controls */}
      <ControlsRow>
        <FilterGroup>
          <Label>Playlist:</Label>
          <Select
            value={filters.playlistId}
            onChange={(e) => setFilters(f => ({ ...f, playlistId: e.target.value }))}
          >
            <option value="">All Playlists</option>
            {playlists.map(p => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.missing_youtube_count} missing)
              </option>
            ))}
          </Select>
        </FilterGroup>

        <Button
          onClick={() => startDryRun(false)}
          disabled={!filters.playlistId || !!jobProgress}
        >
          Dry Run Playlist
        </Button>

        <Button
          onClick={() => startDryRun(true)}
          disabled={!!jobProgress}
        >
          Dry Run Site-Wide
        </Button>
      </ControlsRow>

      <ControlsRow>
        <FilterGroup>
          <Label>Status:</Label>
          <Select
            value={filters.status}
            onChange={(e) => {
              setFilters(f => ({ ...f, status: e.target.value }));
              setPagination(p => ({ ...p, page: 1 }));
            }}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="overridden">Overridden</option>
            <option value="rejected">Rejected</option>
          </Select>
        </FilterGroup>

        <SearchInput
          placeholder="Search artist, title..."
          value={filters.search}
          onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPagination(p => ({ ...p, page: 1 }));
              loadResults();
            }
          }}
        />

        <Button onClick={loadResults}>Refresh</Button>
      </ControlsRow>

      {/* Progress Bar */}
      {jobProgress && (
        <ProgressBar>
          <ProgressFill $percent={progressPercent} />
          <ProgressText>
            {jobProgress.progress.processed} / {jobProgress.progress.total} ({progressPercent}%)
            {jobProgress.eta_seconds && ` - ~${jobProgress.eta_seconds}s remaining`}
          </ProgressText>
        </ProgressBar>
      )}

      {/* Feedback */}
      {error && <Feedback $variant="error">{error}</Feedback>}
      {success && <Feedback $variant="success">{success}</Feedback>}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <BulkActions>
          <SelectedCount>{selectedIds.size} selected</SelectedCount>
          <Button onClick={approveSelected}>Approve Selected</Button>
          <Button onClick={applySelected}>Apply Selected</Button>
        </BulkActions>
      )}

      {/* Bulk Approve/Apply All */}
      {stats && (stats.pending_matched > 0 || stats.ready_to_apply > 0) && (
        <BulkActions>
          {stats.pending_matched > 0 && (
            <Button onClick={approveAll}>
              Approve All Matched ({stats.pending_matched})
            </Button>
          )}
          {stats.ready_to_apply > 0 && (
            <Button onClick={applyAll}>
              Apply All Approved/Overridden ({stats.ready_to_apply})
            </Button>
          )}
        </BulkActions>
      )}

      {/* Results Table */}
      <Table>
        <Row $header>
          <Checkbox
            checked={selectedIds.size === results.length && results.length > 0}
            onChange={toggleSelectAll}
          />
          <span>Track</span>
          <span>YouTube Match</span>
          <span>Conf</span>
          <span>Status</span>
          <span>Actions</span>
        </Row>

        {loading && <EmptyState>Loading...</EmptyState>}

        {!loading && results.length === 0 && (
          <EmptyState>No results found. Run a dry run to populate staging.</EmptyState>
        )}

        {!loading && results.map(entry => (
          <Row key={entry.id} $selected={selectedIds.has(entry.id)}>
            <Checkbox
              checked={selectedIds.has(entry.id)}
              onChange={() => toggleSelect(entry.id)}
            />

            <TrackInfo>
              <TrackTitle>{entry.title}</TrackTitle>
              <TrackArtist>{entry.artist}</TrackArtist>
              {entry.playlist_title && (
                <TrackPlaylist>{entry.playlist_title}</TrackPlaylist>
              )}
            </TrackInfo>

            <YouTubeMatch>
              {entry.youtube_video_id || entry.override_video_id ? (
                <>
                  <YouTubeEmbed>
                    <iframe
                      src={`https://www.youtube.com/embed/${entry.override_video_id || entry.youtube_video_id}?controls=1`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media"
                      allowFullScreen
                      title="YouTube preview"
                    />
                  </YouTubeEmbed>
                  <MatchDetails>
                    <MatchTitle>
                      {entry.status === 'overridden' ? '(Override)' : ''} {entry.youtube_title || 'No title'}
                    </MatchTitle>
                    <MatchArtist>{entry.youtube_artist || 'Unknown artist'}</MatchArtist>
                  </MatchDetails>
                </>
              ) : (
                <NoMatch>No match found</NoMatch>
              )}
            </YouTubeMatch>

            <div>
              {entry.match_confidence ? (
                <ConfidenceBadge $value={entry.match_confidence}>
                  {entry.match_confidence}%
                </ConfidenceBadge>
              ) : (
                <span>-</span>
              )}
            </div>

            <StatusBadge $status={entry.status}>{entry.status}</StatusBadge>

            <Actions>
              {entry.status === 'pending' && entry.youtube_video_id && (
                <ActionButton onClick={() => updateStatus(entry.id, 'approved')}>
                  Approve
                </ActionButton>
              )}
              <ActionButton onClick={() => openOverrideModal(entry)}>
                Override
              </ActionButton>
              {entry.status === 'pending' && (
                <ActionButton onClick={() => updateStatus(entry.id, 'rejected')}>
                  Reject
                </ActionButton>
              )}
              <ActionButton onClick={() => deleteEntry(entry.id)}>
                Delete
              </ActionButton>
            </Actions>
          </Row>
        ))}
      </Table>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <Pagination>
          <Button
            disabled={pagination.page <= 1}
            onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
          >
            Prev
          </Button>
          <span>Page {pagination.page} of {pagination.pages}</span>
          <Button
            disabled={pagination.page >= pagination.pages}
            onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
          >
            Next
          </Button>
        </Pagination>
      )}

      {/* Override Modal */}
      {overrideModal && (
        <OverrideModal onClick={() => setOverrideModal(null)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Override YouTube Link</ModalTitle>

            <ModalField>
              <Label>Track</Label>
              <div>{overrideModal.artist} - {overrideModal.title}</div>
            </ModalField>

            {overrideModal.youtube_video_id && (
              <ModalField>
                <Label>Current Match</Label>
                <div>{overrideModal.youtube_title} ({overrideModal.youtube_video_id})</div>
              </ModalField>
            )}

            <ModalField>
              <Label>Correct YouTube URL</Label>
              <Input
                value={overrideUrl}
                onChange={(e) => setOverrideUrl(e.target.value)}
                placeholder="https://music.youtube.com/watch?v=..."
              />
            </ModalField>

            <ModalField>
              <Label>Reason (optional)</Label>
              <Input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Wrong track, different version, etc."
              />
            </ModalField>

            <ModalActions>
              <Button onClick={() => setOverrideModal(null)}>Cancel</Button>
              <Button onClick={saveOverride} disabled={!overrideUrl}>Save Override</Button>
            </ModalActions>
          </ModalContent>
        </OverrideModal>
      )}
    </Container>
  );
}
