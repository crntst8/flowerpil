import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { getPublicUserAnalytics } from '../../services/adminService';

const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.6);
  border-bottom: 1px dashed rgba(0, 0, 0, 0.2);
  padding-bottom: ${theme.spacing.xs};
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${theme.spacing.md};
`;

const StatCard = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$variant'].includes(prop)
})`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.md};
  background: ${theme.colors.white};
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.08);

  ${({ $variant }) => {
    switch ($variant) {
      case 'success':
        return `
          border-left: 3px solid #22c55e;
        `;
      case 'warning':
        return `
          border-left: 3px solid #f59e0b;
        `;
      case 'danger':
        return `
          border-left: 3px solid #dc3545;
        `;
      case 'info':
        return `
          border-left: 3px solid #6366f1;
        `;
      default:
        return `
          border-left: 3px solid rgba(0, 0, 0, 0.3);
        `;
    }
  }}
`;

const StatLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.5);
`;

const StatValue = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 28px;
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  line-height: 1;
`;

const StatMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  color: rgba(0, 0, 0, 0.4);
`;

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const ErrorState = styled.div`
  padding: ${theme.spacing.md};
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid ${theme.colors.error};
  color: ${theme.colors.error};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const RefreshButton = styled.button`
  align-self: flex-start;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.2);
  color: ${theme.colors.black};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const UsersAnalyticsPanel = ({ onStatusChange }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicUserAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error('Error loading analytics:', err);
      setError(err.message || 'Failed to load analytics');
      if (onStatusChange) {
        onStatusChange('error', 'Failed to load analytics');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading) {
    return <LoadingState>Loading analytics...</LoadingState>;
  }

  if (error) {
    return (
      <PanelContainer>
        <ErrorState>{error}</ErrorState>
        <RefreshButton onClick={loadAnalytics}>Retry</RefreshButton>
      </PanelContainer>
    );
  }

  const users = analytics?.users || {};
  const imports = analytics?.imports || {};
  const exportRequests = analytics?.exportRequests || {};

  return (
    <PanelContainer>
      <RefreshButton onClick={loadAnalytics} disabled={loading}>
        Refresh
      </RefreshButton>

      <Section>
        <SectionTitle>User Signups</SectionTitle>
        <StatsGrid>
          <StatCard>
            <StatLabel>Total Users</StatLabel>
            <StatValue>{users.total || 0}</StatValue>
          </StatCard>
          <StatCard $variant="success">
            <StatLabel>Last 7 Days</StatLabel>
            <StatValue>{users.last7Days || 0}</StatValue>
            <StatMeta>New signups</StatMeta>
          </StatCard>
          <StatCard $variant="info">
            <StatLabel>Last 30 Days</StatLabel>
            <StatValue>{users.last30Days || 0}</StatValue>
            <StatMeta>New signups</StatMeta>
          </StatCard>
          <StatCard $variant="success">
            <StatLabel>Verified</StatLabel>
            <StatValue>{users.verified || 0}</StatValue>
            <StatMeta>Email verified</StatMeta>
          </StatCard>
        </StatsGrid>
      </Section>

      <Section>
        <SectionTitle>Account Status</SectionTitle>
        <StatsGrid>
          <StatCard $variant="success">
            <StatLabel>Exports Unlocked</StatLabel>
            <StatValue>{users.exportsUnlocked || 0}</StatValue>
            <StatMeta>Can export playlists</StatMeta>
          </StatCard>
          <StatCard $variant="warning">
            <StatLabel>Suspended</StatLabel>
            <StatValue>{users.suspended || 0}</StatValue>
            <StatMeta>Temporarily blocked</StatMeta>
          </StatCard>
          <StatCard $variant="danger">
            <StatLabel>Pending Requests</StatLabel>
            <StatValue>{exportRequests.pending || 0}</StatValue>
            <StatMeta>Export access requests</StatMeta>
          </StatCard>
        </StatsGrid>
      </Section>

      <Section>
        <SectionTitle>Import Activity</SectionTitle>
        <StatsGrid>
          <StatCard>
            <StatLabel>Total Imports</StatLabel>
            <StatValue>{imports.total || 0}</StatValue>
            <StatMeta>All time</StatMeta>
          </StatCard>
          <StatCard $variant="info">
            <StatLabel>Last 7 Days</StatLabel>
            <StatValue>{imports.last7Days || 0}</StatValue>
            <StatMeta>Recent imports</StatMeta>
          </StatCard>
          <StatCard>
            <StatLabel>Unique Users</StatLabel>
            <StatValue>{imports.uniqueUsers || 0}</StatValue>
            <StatMeta>Who imported</StatMeta>
          </StatCard>
        </StatsGrid>
      </Section>
    </PanelContainer>
  );
};

export default UsersAnalyticsPanel;
