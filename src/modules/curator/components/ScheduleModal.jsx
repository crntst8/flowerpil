import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import { ModalRoot, ModalSurface } from '@shared/components/Modal';
import { Button, Input, Select, theme } from '@shared/styles/GlobalStyles';
import { safeJson } from '@shared/utils/jsonUtils';
import ImportModal from './ImportModal.jsx';
import {
  createSchedule,
  deleteSchedule,
  runScheduleNow,
  updateSchedule
} from '../services/scheduleService.js';

const DEFAULT_FORM = {
  mode: 'replace',
  append_position: 'top',
  update_source_title: false,
  frequency: 'daily',
  frequency_value: '',
  time_utc: '09:00',
  source: 'spotify',
  wip_spotify_playlist_id: ''
};

const StyledSurface = styled(ModalSurface)`
  width: min(1000px, 100%);
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.xl} ${theme.spacing.xl} ${theme.spacing.lg};

  @media (max-width: ${theme.breakpoints.tablet}) {
    padding: ${theme.spacing.lg} ${theme.spacing.md};
    max-height: 100vh;
  }
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.md};
`;

const Title = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  font-size: ${theme.fontSizes.small};
  letter-spacing: 0.12em;
`;

const Subheading = styled.p`
  margin: 0;
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[500]};
  line-height: 1.5;
`;

const Section = styled.section`
  display: grid;
  gap: ${theme.spacing.sm};
`;

const FieldRow = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const Label = styled.label`
  display: block;
  background: black;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.white};
  margin-bottom: 4px;
    margin-top: 4px;
    padding: 1em;

`;

const HelpText = styled.p`
  margin: ${theme.spacing.xs} 0 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${theme.colors.black};
`;

const Callout = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$warning' })`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 10px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: ${(p) => (p.$warning ? 'rgba(255, 193, 7, 0.12)' : 'rgba(16, 185, 129, 0.12)')};
  color: ${(p) => (p.$warning ? '#7a4c03' : '#065f46')};
  border: 1px solid ${(p) => (p.$warning ? 'rgba(255, 193, 7, 0.35)' : 'rgba(16, 185, 129, 0.35)')};
`;

const Toggle = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
`;

const Footer = styled.footer`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const ErrorBanner = styled.div`
  background: rgba(220, 38, 38, 0.12);
  color: #7f1d1d;
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: 8px;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
`;

const SuccessBanner = styled.div`
  background: rgba(16, 185, 129, 0.1);
  color: #065f46;
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 8px;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
`;

const formatDate = (value) => {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
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

export default function ScheduleModal({
  isOpen,
  playlist,
  schedule,
  mode = 'import',
  authenticatedFetch,
  onClose,
  onSaved,
  onDeleted,
  onPlaylistUpdated,
  onRequestConnectSpotify
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [publishTime, setPublishTime] = useState('12:00');
  const [authStatus, setAuthStatus] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importProcessingId, setImportProcessingId] = useState(null);

  const spotifyConnected = Boolean(authStatus?.spotify?.connected);
  const nextRunLabel = useMemo(() => formatDate(schedule?.next_run_at), [schedule?.next_run_at]);
  const lastRunLabel = useMemo(() => formatDate(schedule?.last_run_at), [schedule?.last_run_at]);

  useEffect(() => {
    if (!isOpen) return;
    const base = { ...DEFAULT_FORM, ...(schedule || {}) };
    setForm(base);
    setError('');
    setSuccess('');

    // Initialize publish schedule from playlist data
    if (mode === 'publish' && playlist?.scheduled_publish_at) {
      const d = new Date(playlist.scheduled_publish_at);
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setPublishDate(`${yyyy}-${mm}-${dd}`);
        setPublishTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      }
    } else if (mode === 'publish') {
      setPublishDate('');
      setPublishTime('12:00');
    }

    if (mode === 'import') {
      const loadStatus = async () => {
        try {
          const res = await authenticatedFetch('/api/v1/export/auth/status', { method: 'GET' });
          const json = await safeJson(res, { context: 'Load DSP auth status' });
          if (res.ok && json.success) {
            setAuthStatus(json.data || {});
          }
        } catch (err) {
          // best-effort only
        }
      };
      loadStatus();
    }
  }, [isOpen, schedule, authenticatedFetch, mode, playlist?.scheduled_publish_at]);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!playlist?.id) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        playlist_id: playlist.id,
        source: 'spotify',
        mode: form.mode === 'append' ? 'append' : 'replace',
        append_position: form.append_position === 'bottom' ? 'bottom' : 'top',
        update_source_title: Boolean(form.update_source_title),
        frequency: form.frequency || 'daily',
        frequency_value: form.frequency === 'daily' ? null : (form.frequency_value || null),
        time_utc: form.time_utc || '09:00',
        wip_spotify_playlist_id: form.wip_spotify_playlist_id || null
      };

      let result;
      if (schedule?.id) {
        result = await updateSchedule(authenticatedFetch, schedule.id, payload);
      } else {
        result = await createSchedule(authenticatedFetch, payload);
      }
      setSuccess(schedule?.id ? 'Schedule updated' : 'Schedule created');
      if (onSaved) onSaved(result);
    } catch (err) {
      setError(err.message || 'Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!schedule?.id) {
      setForm(DEFAULT_FORM);
      onDeleted?.();
      onClose();
      return;
    }
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      await deleteSchedule(authenticatedFetch, schedule.id);
      setForm(DEFAULT_FORM);
      setSuccess('Schedule removed');
      onDeleted?.(schedule.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete schedule');
    } finally {
      setWorking(false);
    }
  };

  const handleRunNow = async () => {
    if (!schedule?.id) return;
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      await runScheduleNow(authenticatedFetch, schedule.id);
      setSuccess('Import started');
    } catch (err) {
      setError(err.message || 'Failed to start import');
    } finally {
      setWorking(false);
    }
  };

  const handleSelectImport = async (selection) => {
    setShowImport(false);
    if (!selection) return;
    setImportProcessingId(selection.id);
    setForm((prev) => ({
      ...prev,
      wip_spotify_playlist_id: selection.id,
      source_title: selection.title || selection.name || prev.source_title
    }));
    setImportProcessingId(null);
  };

  const handleSavePublishSchedule = async () => {
    if (!playlist?.id || !publishDate || !publishTime) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const utcTimestamp = new Date(`${publishDate}T${publishTime}`).toISOString();
      const res = await authenticatedFetch(`/api/v1/playlists/${playlist.id}/schedule-publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_publish_at: utcTimestamp })
      });
      const json = await safeJson(res, { context: 'Schedule publish' });
      if (!res.ok) throw new Error(json.error || 'Failed to schedule');
      const displayDate = new Date(`${publishDate}T${publishTime}`).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      setSuccess(`Scheduled for ${displayDate}`);
      // Notify parent that playlist was updated (different from schedule saves)
      if (onPlaylistUpdated) onPlaylistUpdated(json.data);
    } catch (err) {
      setError(err.message || 'Failed to schedule publish');
    } finally {
      setLoading(false);
    }
  };

  const handleClearPublishSchedule = async () => {
    if (!playlist?.id) return;
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      const res = await authenticatedFetch(`/api/v1/playlists/${playlist.id}/schedule-publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_publish_at: null })
      });
      const json = await safeJson(res, { context: 'Clear scheduled publish' });
      if (!res.ok) throw new Error(json.error || 'Failed to clear schedule');
      setPublishDate('');
      setPublishTime('12:00');
      setSuccess('Scheduled publish cancelled');
      // Notify parent that playlist was updated
      if (onPlaylistUpdated) onPlaylistUpdated(json.data);
    } catch (err) {
      setError(err.message || 'Failed to clear schedule');
    } finally {
      setWorking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalRoot isOpen={isOpen} onClose={onClose}>
      <StyledSurface>
        <Header>
          <div>
            <Title>{mode === 'publish' ? 'Scheduled Publish' : 'Scheduled Import'}</Title>
            <Subheading>
              {playlist?.title ? `Target: ${playlist.title}` : 'Select a playlist to manage scheduling.'}
            </Subheading>
          </div>
          <Button onClick={onClose}>Close</Button>
        </Header>

        {error && <ErrorBanner>{error}</ErrorBanner>}
        {success && <SuccessBanner>{success}</SuccessBanner>}

        {mode === 'publish' ? (
          <>
            <Section>
              <FieldRow>
                <div>
                  <Label htmlFor="publish-date">Date</Label>
                  <Input
                    id="publish-date"
                    type="date"
                    value={publishDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setPublishDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="publish-time">Time</Label>
                  <Input
                    id="publish-time"
                    type="time"
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                  />
                </div>
              </FieldRow>
              <HelpText>
                Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </HelpText>
            </Section>

            {playlist?.scheduled_publish_at && (
              <Callout>
                Currently scheduled for {formatDate(playlist.scheduled_publish_at)}
              </Callout>
            )}

            <Footer>
              <ButtonGroup>
                <Button
                  variant="primary"
                  onClick={handleSavePublishSchedule}
                  disabled={loading || working || !publishDate || !publishTime}
                >
                  {loading ? 'Saving...' : playlist?.scheduled_publish_at ? 'Update Schedule' : 'Schedule Publish'}
                </Button>
                {playlist?.scheduled_publish_at && (
                  <Button
                    variant="secondary"
                    onClick={handleClearPublishSchedule}
                    disabled={working}
                  >
                    Cancel Schedule
                  </Button>
                )}
              </ButtonGroup>
            </Footer>
          </>
        ) : (
          <>

        <Callout $warning={!spotifyConnected}>
          {spotifyConnected ? (
            'Spotify is connected — scheduled imports will use your curator account.'
          ) : (
            <>
              Spotify not connected.{' '}
              <Button
                variant="ghost"
                style={{ padding: '2px 8px' }}
                onClick={() => (onRequestConnectSpotify ? onRequestConnectSpotify() : window.open('/curator-admin?tab=dsp', '_blank', 'noopener'))}
              >
                Connect now
              </Button>
            </>
          )}
        </Callout>

        {nextRunLabel && (
          <Callout>
            Next import scheduled for {nextRunLabel}
            {lastRunLabel ? ` • Last import ${lastRunLabel}` : ''}
          </Callout>
        )}

        <Section>
          <FieldRow>
            <div>
              <Label htmlFor="schedule-mode">Sync strategy</Label>
              <Select
                id="schedule-mode"
                value={form.mode}
                onChange={(e) => handleChange('mode', e.target.value)}
              >
                <option value="replace">Replace — mirror source order</option>
                <option value="append">Append — add new tracks</option>
              </Select>
              <HelpText>
                Replace is safest for keeping ordering identical to the source playlist.
              </HelpText>
            </div>
            <div>
              <Label htmlFor="schedule-time">Run time (UTC)</Label>
              <Input
                id="schedule-time"
                type="time"
                value={form.time_utc}
                onChange={(e) => handleChange('time_utc', e.target.value)}
              />
              <HelpText>Imports run daily at this UTC time.</HelpText>
            </div>
          </FieldRow>

          {form.mode === 'append' && (
            <FieldRow>
              <div>
                <Label htmlFor="schedule-append">Append position</Label>
                <Select
                  id="schedule-append"
                  value={form.append_position}
                  onChange={(e) => handleChange('append_position', e.target.value)}
                >
                  <option value="top">Add new tracks to the top</option>
                  <option value="bottom">Add new tracks to the bottom</option>
                </Select>
                <HelpText>Choose where new imports land relative to your set list.</HelpText>
              </div>
              <div>
                <Label>Metadata updates</Label>
                <Toggle>
                  <input
                    type="checkbox"
                    checked={Boolean(form.update_source_title)}
                    onChange={(e) => handleChange('update_source_title', e.target.checked)}
                  />
                  Sync Flowerpil title with source playlist
                </Toggle>
                <HelpText>Enable to mirror seasonal naming automatically.</HelpText>
              </div>
            </FieldRow>
          )}

          {form.mode !== 'append' && (
            <Section>
              <Label>Metadata updates</Label>
              <Toggle>
                <input
                  type="checkbox"
                  checked={Boolean(form.update_source_title)}
                  onChange={(e) => handleChange('update_source_title', e.target.checked)}
                />
                Sync Flowerpil title with source playlist
              </Toggle>
              <HelpText>Off by default to preserve bespoke titles.</HelpText>
            </Section>
          )}

          <FieldRow>
            <div>
              <Label htmlFor="schedule-frequency">Cadence</Label>
              <Select
                id="schedule-frequency"
                value={form.frequency}
                onChange={(e) => handleChange('frequency', e.target.value)}
              >
                <option value="daily">Daily</option>
                <option value="monthly">Monthly (same date)</option>
                <option value="every_x_date">Specific day of month</option>
                <option value="every_x_dow">Specific days of week</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="schedule-frequency-value">
                {form.frequency === 'every_x_dow'
                  ? 'Days (mon,tue,wed)'
                  : form.frequency === 'every_x_date'
                    ? 'Day of month (1-31)'
                    : 'Optional details'}
              </Label>
              <Input
                id="schedule-frequency-value"
                type="text"
                placeholder={
                  form.frequency === 'every_x_dow'
                    ? 'mon,wed,fri'
                    : form.frequency === 'every_x_date'
                      ? '15'
                      : '—'
                }
                value={form.frequency === 'daily' ? '' : (form.frequency_value || '')}
                disabled={form.frequency === 'daily'}
                onChange={(e) => handleChange('frequency_value', e.target.value)}
              />
              <HelpText>
                Use comma separated day codes for weekly cadence (e.g., mon,thu).
              </HelpText>
            </div>
          </FieldRow>

          <Section>
            <Label htmlFor="schedule-source-id">Source playlist override</Label>
            <Input
              id="schedule-source-id"
              type="text"
              placeholder="Spotify playlist ID (37i9dQZF1DX...)"
              value={form.wip_spotify_playlist_id || ''}
              onChange={(e) => handleChange('wip_spotify_playlist_id', e.target.value)}
            />
            <HelpText>
              Leave blank to use the Spotify link saved on this playlist.
            </HelpText>
            <Button
              variant="ghost"
              onClick={() => setShowImport(true)}
            >
              Browse Spotify playlists
            </Button>
          </Section>
        </Section>

        <Footer>
          <ButtonGroup>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={loading || working || !playlist?.id || (!spotifyConnected && !schedule?.id)}
            >
              {loading ? 'Saving…' : schedule?.id ? 'Save changes' : 'Create schedule'}
            </Button>
            <Button
              variant="secondary"
              onClick={handleDelete}
              disabled={working}
            >
              {schedule?.id ? 'Delete schedule' : 'Clear'}
            </Button>
          </ButtonGroup>
          {schedule?.id && (
            <Button
              variant="fpwhite"
              onClick={handleRunNow}
              disabled={working}
            >
              {working ? 'Starting…' : 'Run import now'}
            </Button>
          )}
        </Footer>

        {showImport && (
          <ImportModal
            isOpen
            onClose={() => setShowImport(false)}
            onImported={handleSelectImport}
            processingId={importProcessingId}
            actionLabel="Use for schedule"
            defaultPlatform="spotify"
            availablePlatforms={['spotify']}
          />
        )}
          </>
        )}
      </StyledSurface>
    </ModalRoot>
  );
}

ScheduleModal.propTypes = {
  isOpen: PropTypes.bool,
  playlist: PropTypes.shape({
    id: PropTypes.number,
    title: PropTypes.string,
    scheduled_publish_at: PropTypes.string
  }),
  schedule: PropTypes.object,
  mode: PropTypes.oneOf(['import', 'publish']),
  authenticatedFetch: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
  onDeleted: PropTypes.func,
  onPlaylistUpdated: PropTypes.func,
  onRequestConnectSpotify: PropTypes.func
};
