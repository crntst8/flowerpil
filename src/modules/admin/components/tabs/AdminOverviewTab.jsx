import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import styled from 'styled-components';
import { formatDistanceToNow } from 'date-fns';
import { MainBox, Button, theme } from '@shared/styles/GlobalStyles';
import {
  getAdminDashboardStats,
  logoutAllAdminAccounts
} from '../../services/adminService';
import { SubTabNavigation, StatusMessage } from '../shared';
import { SystemHealthMonitor } from '../system';
import { GenreCategoryManager, CuratorTypeManager } from '../taxonomy';

const ErrorReportDashboard = React.lazy(() => 
  import('../ErrorReportDashboard.jsx').then(module => ({ default: module.default }))
);

const UserFeedbackPanel = React.lazy(() => import('../UserFeedbackPanel.jsx'));

const OverviewGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
`;

const StatCard = styled(MainBox)`
  background: rgba(0, 0, 0, 0.78);
  border-color: rgba(0, 0, 0, 0.31);
  padding: ${theme.spacing.sm};
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-items: center;
  gap: ${theme.spacing.sm};
`;

const ActionsPanel = styled(MainBox)`
  background: ${theme.colors.fpwhite};
  border-color: rgba(0, 0, 0, 0.15);
  padding: ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const PlaceholderNote = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const Banner = styled(MainBox)`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-color: ${({ $variant }) =>
    $variant === 'error'
      ? theme.colors.danger
      : $variant === 'success'
        ? theme.colors.success
        : 'rgba(0, 0, 0, 0.25)'};
  background: ${({ $variant }) =>
    $variant === 'error'
      ? 'rgba(220, 38, 38, 0.12)'
      : $variant === 'success'
        ? 'rgba(34, 197, 94, 0.12)'
        : 'transparent'};
  color: ${({ $variant }) =>
    $variant === 'error'
      ? theme.colors.danger
      : $variant === 'success'
        ? theme.colors.success
        : 'rgba(0, 0, 0, 0.7)'};
`;

const StatLabel = styled.span`
  font-size: ${theme.fontSizes.tiny};
  font-family: ${theme.fonts.mono};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: left;
  color: rgba(89, 255, 0, 1);
`;

const StatNumber = styled.span`
  font-size: 2.5em;
  font-family: ${theme.fonts.primary};
  font-weight: bold;
  letter-spacing: -0.9px;
  text-align: right;
  color: ${theme.colors.fpwhite};
`;

const ActionsRow = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const StatsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const LoadingFallback = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  padding: ${theme.spacing.md};
`;

const TaxonomyGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  grid-template-columns: 1fr;
`;

const AdminOverviewTab = ({ user }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState({ type: '', message: '' });
  const [status, setStatus] = useState({ type: '', message: '' });

  const refreshStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load admin stats:', err);
      setError(err?.message || 'Unable to load admin stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const generatedAgo = useMemo(() => {
    if (!stats?.generated_at) return null;
    try {
      return formatDistanceToNow(new Date(stats.generated_at), { addSuffix: true });
    } catch {
      return null;
    }
  }, [stats]);

  const handleLogoutAll = useCallback(async () => {
    setBanner({ type: '', message: '' });
    try {
      const result = await logoutAllAdminAccounts();
      const affected = result?.affected_accounts ?? 0;
      setBanner({
        type: 'success',
        message: `Scheduled ${affected} admin account${affected === 1 ? '' : 's'} to re-authenticate.`
      });
    } catch (err) {
      console.error('Failed to logout all admins:', err);
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to logout admin accounts'
      });
    }
  }, []);

  const handleStatusChange = useCallback((type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  }, []);

  // Overview tab content
  const overviewContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
      {(banner.message || error) && (
        <Banner $variant={banner.type || (error ? 'error' : 'default')}>
          {banner.message || error}
        </Banner>
      )}

      <OverviewGrid>
        <StatCard>
          <StatsWrapper>
            <StatLabel>Curators</StatLabel>
            <StatNumber>{stats?.curators ?? '—'}</StatNumber>
          </StatsWrapper>
        </StatCard>
        <StatCard>
          <StatsWrapper>
            <StatLabel>Playlists (Total)</StatLabel>
            <StatNumber>{stats?.playlists ?? '—'}</StatNumber>
          </StatsWrapper>
        </StatCard>
        <StatCard>
          <StatsWrapper>
            <StatLabel>Tracks</StatLabel>
            <StatNumber>{stats?.tracks ?? '—'}</StatNumber>
          </StatsWrapper>
        </StatCard>
        <StatCard>
          <StatsWrapper>
            <StatLabel>PENDING EXPORTS</StatLabel>
            <StatNumber>{stats?.pendingExports ?? '—'}</StatNumber>
          </StatsWrapper>
        </StatCard>
      </OverviewGrid>

      <ActionsPanel>
        <div>
          <h3 style={{ margin: 0, textTransform: 'uppercase', letterSpacing: 0.05 }}>Global Actions</h3>
          <PlaceholderNote>
            Logged in as {user?.username ?? 'admin'} ({user?.role ?? 'admin'}).
            {generatedAgo ? ` Stats refreshed ${generatedAgo}.` : ''}
          </PlaceholderNote>
        </div>
        <ActionsRow>
          <Button
            variant="secondary"
            onClick={refreshStats}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh Stats'}
          </Button>
          <Button
            variant="danger"
            onClick={handleLogoutAll}
            disabled={!stats}
          >
            Logout All Accounts
          </Button>
        </ActionsRow>
      </ActionsPanel>
    </div>
  );

  // System Health tab content
  const systemHealthContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
      {status.message && (
        <StatusMessage type={status.type} message={status.message} />
      )}
      <SystemHealthMonitor onStatusChange={handleStatusChange} />
    </div>
  );

  // Taxonomy tab content
  const taxonomyContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
      {status.message && (
        <StatusMessage type={status.type} message={status.message} />
      )}
      <TaxonomyGrid>
        <GenreCategoryManager onStatusChange={handleStatusChange} />
        <CuratorTypeManager onStatusChange={handleStatusChange} />
      </TaxonomyGrid>
    </div>
  );

  // Error Reports tab content
  const errorReportsContent = (
    <Suspense fallback={<div>Loading error reports…</div>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
        {status.message && (
          <StatusMessage type={status.type} message={status.message} />
        )}
        <ErrorReportDashboard />
      </div>
    </Suspense>
  );

  // Feedback tab content
  const feedbackContent = (
    <Suspense fallback={<div>Loading feedback...</div>}>
      <UserFeedbackPanel />
    </Suspense>
  );

  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      content: overviewContent
    },
    {
      id: 'feedback',
      label: 'User Feedback',
      content: feedbackContent
    },
    {
      id: 'errors',
      label: 'Error Reports',
      content: errorReportsContent
    },
    {
      id: 'system-health',
      label: 'System Health',
      content: systemHealthContent
    },
    {
      id: 'taxonomy',
      label: 'Taxonomy',
      content: taxonomyContent
    }
  ];

  return <SubTabNavigation tabs={tabs} defaultTab="overview" />;
};

export default AdminOverviewTab;
