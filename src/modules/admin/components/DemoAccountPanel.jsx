import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost } from '../utils/adminApi.js';
import EmptyState from './shared/EmptyState.jsx';

const PanelStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.lg};
  border-radius: 16px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.08);
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.1rem, 2vw, 1.4rem);
  letter-spacing: -0.5px;
`;

const SectionMeta = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.6);
`;

const FormGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${theme.colors.black};
`;

const Input = styled.input`
  border-radius: 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const Select = styled.select`
  border-radius: 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  background: ${theme.colors.fpwhite};
`;

const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
`;

const Button = styled.button`
  border-radius: 999px;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: ${({ $variant }) => ($variant === 'filled' ? theme.colors.black : theme.colors.fpwhite)};
  color: ${({ $variant }) => ($variant === 'filled' ? theme.colors.fpwhite : theme.colors.black)};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StatusText = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${({ $tone }) => ($tone === 'error' ? theme.colors.error : theme.colors.black)};
`;

const AccountList = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
`;

const AccountCard = styled.button.withConfig({ shouldForwardProp: (prop) => prop !== '$active' })`
  border-radius: 14px;
  border: ${theme.borders.solidThin} ${({ $active }) => ($active ? theme.colors.black : 'rgba(0,0,0,0.2)')};
  padding: ${theme.spacing.md};
  text-align: left;
  background: ${({ $active }) => ($active ? 'rgba(0,0,0,0.05)' : theme.colors.fpwhite)};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const AccountTitle = styled.h4`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.medium};
`;

const AccountMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const GridSplit = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
`;

const MetricCard = styled.div`
  border-radius: 12px;
  padding: ${theme.spacing.md};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const MetricValue = styled.div`
  font-size: ${theme.fontSizes.h2};
  font-family: ${theme.fonts.primary};
`;

const MetricLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.55);
`;

const Table = styled.div`
  display: grid;
  gap: ${theme.spacing.xs};
`;

const Row = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: minmax(140px, 1fr) minmax(160px, 2fr) minmax(80px, 0.6fr) minmax(120px, 0.8fr);
  align-items: center;
  padding: ${theme.spacing.sm};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
  background: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

const RowLabel = styled.div`
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.6);
`;

const LinkRow = styled.a`
  color: ${theme.colors.black};
  text-decoration: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;

  &:hover {
    text-decoration: underline;
  }
`;

const formatDuration = (ms) => {
  if (!ms || Number.isNaN(ms)) return '0m';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const buildPassword = () => {
  const length = 12;
  const base = 'abcdefghijklmnopqrstuvwxyz';
  const upper = base.toUpperCase();
  const digits = '0123456789';
  const extra = '!@#$%^&*';
  const all = base + upper + digits + extra;

  const pick = (set) => {
    const index = window.crypto?.getRandomValues ? window.crypto.getRandomValues(new Uint32Array(1))[0] % set.length : Math.floor(Math.random() * set.length);
    return set[index];
  };

  let result = `${pick(upper)}${pick(digits)}`;
  for (let i = result.length; i < length; i += 1) {
    result += pick(all);
  }

  return result.split('').sort(() => (Math.random() > 0.5 ? 1 : -1)).join('');
};

const DemoAccountPanel = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activity, setActivity] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [formData, setFormData] = useState({
    curatorName: '',
    curatorType: 'curator',
    email: '',
    password: ''
  });
  const [passwordReset, setPasswordReset] = useState(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const result = await adminGet('/api/v1/admin/demo-accounts');
      const list = result.data || [];
      setAccounts(list);
      if (list.length > 0) {
        setSelectedId((current) => current || list[0].curator.id);
      }
    } catch (error) {
      setStatus({ type: 'error', message: error?.message || 'Failed to load demo accounts' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async (curatorId) => {
    if (!curatorId) return;
    setActivityLoading(true);
    try {
      const result = await adminGet(`/api/v1/admin/demo-accounts/${curatorId}/activity?days=14&limit=120`);
      setActivity(result.data || null);
    } catch (error) {
      setActivity(null);
      setStatus({ type: 'error', message: error?.message || 'Failed to load activity' });
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (selectedId) {
      loadActivity(selectedId);
    }
  }, [selectedId, loadActivity]);

  useEffect(() => {
    setPasswordReset(null);
  }, [selectedId]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.curator.id === selectedId) || null,
    [accounts, selectedId]
  );

  const handleCreate = async () => {
    setStatus(null);
    setPasswordReset(null);
    try {
      await adminPost('/api/v1/admin/demo-accounts', {
        curatorName: formData.curatorName,
        curatorType: formData.curatorType,
        email: formData.email,
        password: formData.password
      });
      setFormData({ curatorName: '', curatorType: 'curator', email: '', password: '' });
      await loadAccounts();
      setStatus({ type: 'success', message: 'Demo account created.' });
    } catch (error) {
      setStatus({ type: 'error', message: error?.message || 'Failed to create demo account' });
    }
  };

  const handleGeneratePassword = () => {
    const password = buildPassword();
    setFormData((prev) => ({ ...prev, password }));
    setStatus({ type: 'success', message: 'Password generated.' });
  };

  const handleResetPassword = async (curatorId) => {
    if (!curatorId) return;
    setStatus(null);
    try {
      const result = await adminPost(`/api/v1/admin/demo-accounts/${curatorId}/reset-password`, {});
      setPasswordReset(result.data || null);
      setStatus({ type: 'success', message: 'Password regenerated.' });
    } catch (error) {
      setStatus({ type: 'error', message: error?.message || 'Failed to reset password' });
    }
  };

  const handleCopy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatus({ type: 'success', message: 'Copied to clipboard.' });
    } catch {
      setStatus({ type: 'error', message: 'Clipboard unavailable.' });
    }
  };

  return (
    <PanelStack>
      <Section>
        <SectionTitle>Create Demo Curator</SectionTitle>
        <SectionMeta>Provision a hidden curator account with its own login</SectionMeta>
        <FormGrid>
          <Field>
            Curator name
            <Input
              value={formData.curatorName}
              onChange={(event) => setFormData((prev) => ({ ...prev, curatorName: event.target.value }))}
              placeholder="Demo Curator"
            />
          </Field>
          <Field>
            Curator type
            <Select
              value={formData.curatorType}
              onChange={(event) => setFormData((prev) => ({ ...prev, curatorType: event.target.value }))}
            >
              <option value="curator">Curator</option>
              <option value="artist">Artist</option>
              <option value="label">Label</option>
              <option value="dj">DJ</option>
              <option value="blog">Blog</option>
              <option value="magazine">Magazine</option>
              <option value="radio-station">Radio Station</option>
            </Select>
          </Field>
          <Field>
            Login email
            <Input
              type="email"
              value={formData.email}
              onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="demo@flowerpil.io"
            />
          </Field>
          <Field>
            Password
            <Input
              type="text"
              value={formData.password}
              onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="At least 10 chars, uppercase, number"
            />
          </Field>
        </FormGrid>
        <ButtonRow>
          <Button $variant="filled" onClick={handleCreate} disabled={loading}>
            Create demo account
          </Button>
          <Button onClick={handleGeneratePassword} disabled={loading}>
            Generate password
          </Button>
          <Button onClick={loadAccounts} disabled={loading}>
            Refresh list
          </Button>
        </ButtonRow>
        {status?.message && <StatusText $tone={status.type}>{status.message}</StatusText>}
      </Section>

      <Section>
        <SectionTitle>Demo Accounts</SectionTitle>
        <SectionMeta>Hidden from public listings unless authenticated as demo or admin</SectionMeta>
        {loading && <StatusText>Loading demo accounts...</StatusText>}
        {!loading && accounts.length === 0 && (
          <EmptyState message="No demo accounts" subtext="Create a demo curator to start tracking sessions." />
        )}
        <AccountList>
          {accounts.map((account) => (
            <AccountCard
              key={account.curator.id}
              type="button"
              $active={account.curator.id === selectedId}
              onClick={() => setSelectedId(account.curator.id)}
            >
              <AccountTitle>{account.curator.name}</AccountTitle>
              <AccountMeta>{account.admin_user?.username || 'No login linked'}</AccountMeta>
              <AccountMeta>{account.curator.profile_type}</AccountMeta>
              <AccountMeta>Last activity: {formatDate(account.activity?.last_activity)}</AccountMeta>
            </AccountCard>
          ))}
        </AccountList>
      </Section>

      {selectedAccount && (
        <Section>
          <SectionTitle>Demo Account Detail</SectionTitle>
          <SectionMeta>Profile, content, and session insight</SectionMeta>
          <GridSplit>
            <MetricCard>
              <MetricLabel>Profile</MetricLabel>
              <MetricValue>{selectedAccount.curator.name}</MetricValue>
              <AccountMeta>{selectedAccount.curator.profile_type}</AccountMeta>
              <AccountMeta>Visibility: {selectedAccount.curator.profile_visibility}</AccountMeta>
              <AccountMeta>Location: {selectedAccount.curator.location || '-'}</AccountMeta>
              <AccountMeta>Login: {selectedAccount.admin_user?.username || 'Not linked'}</AccountMeta>
              <AccountMeta>Last login: {formatDate(selectedAccount.admin_user?.last_login)}</AccountMeta>
            </MetricCard>
            <MetricCard>
              <MetricLabel>Content</MetricLabel>
              <MetricValue>{selectedAccount.playlists.total}</MetricValue>
              <AccountMeta>Published: {selectedAccount.playlists.published}</AccountMeta>
              <AccountMeta>Drafts: {selectedAccount.playlists.drafts}</AccountMeta>
              <AccountMeta>Last update: {formatDate(selectedAccount.playlists.last_updated)}</AccountMeta>
            </MetricCard>
            <MetricCard>
              <MetricLabel>Activity (14 days)</MetricLabel>
              <MetricValue>{activity?.totals?.sessions ?? selectedAccount.activity.sessions}</MetricValue>
              <AccountMeta>Total time: {formatDuration(activity?.totals?.total_time_ms || selectedAccount.activity.total_time_ms)}</AccountMeta>
              <AccountMeta>Last activity: {formatDate(activity?.totals?.last_activity || selectedAccount.activity.last_activity)}</AccountMeta>
            </MetricCard>
          </GridSplit>

          <ButtonRow>
            <Button onClick={() => handleResetPassword(selectedAccount.curator.id)}>
              Regenerate password
            </Button>
            <Button onClick={() => handleCopy(selectedAccount.admin_user?.username)}>
              Copy login
            </Button>
            <Button onClick={() => handleCopy(passwordReset?.password)} disabled={!passwordReset?.password}>
              Copy password
            </Button>
            <LinkRow href={`/curator/${encodeURIComponent(selectedAccount.curator.name)}`} target="_blank" rel="noreferrer">
              Open public profile
            </LinkRow>
            <LinkRow href="/curator-admin" target="_blank" rel="noreferrer">
              Open curator dashboard
            </LinkRow>
          </ButtonRow>

          {passwordReset?.password && (
            <StatusText>
              New password: {passwordReset.password}
            </StatusText>
          )}

          <SectionTitle>Recent Playlists</SectionTitle>
          {selectedAccount.playlists.recent.length === 0 ? (
            <StatusText>No playlists yet.</StatusText>
          ) : (
            <Table>
              {selectedAccount.playlists.recent.map((playlist) => (
                <Row key={playlist.id}>
                  <RowLabel>{playlist.published ? 'Published' : 'Draft'}</RowLabel>
                  <div>{playlist.title}</div>
                  <div>{formatDate(playlist.updated_at)}</div>
                  <LinkRow href={`/playlists/${playlist.id}`} target="_blank" rel="noreferrer">
                    View
                  </LinkRow>
                </Row>
              ))}
            </Table>
          )}

          <SectionTitle>Recent Pathways</SectionTitle>
          {activityLoading && <StatusText>Loading activity...</StatusText>}
          {!activityLoading && (!activity?.events || activity.events.length === 0) && (
            <StatusText>No activity recorded yet.</StatusText>
          )}
          {!activityLoading && activity?.events && activity.events.length > 0 && (
            <Table>
              {activity.events.slice(0, 12).map((event) => (
                <Row key={event.id}>
                  <RowLabel>{event.event_type}</RowLabel>
                  <div>{event.path || '-'}</div>
                  <div>{formatDuration(event.duration_ms)}</div>
                  <div>{formatDate(event.created_at)}</div>
                </Row>
              ))}
            </Table>
          )}

          {activity?.top_paths?.length > 0 && (
            <>
              <SectionTitle>Top Paths</SectionTitle>
              <Table>
                {activity.top_paths.map((item) => (
                  <Row key={item.path || 'unknown'}>
                    <RowLabel>Path</RowLabel>
                    <div>{item.path || '-'}</div>
                    <div>{formatDuration(item.total_time_ms)}</div>
                    <div>{item.events} visits</div>
                  </Row>
                ))}
              </Table>
            </>
          )}
        </Section>
      )}
    </PanelStack>
  );
};

export default DemoAccountPanel;
