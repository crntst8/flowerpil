import { useState, Suspense, lazy } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { SubTabNavigation, StatusMessage } from '../shared';

const UsersAccountsPanel = lazy(() => import('../users/UsersAccountsPanel.jsx'));
const UsersAnalyticsPanel = lazy(() => import('../users/UsersAnalyticsPanel.jsx'));
const UsersContentPanel = lazy(() => import('../users/UsersContentPanel.jsx'));
const UsersGroupsPanel = lazy(() => import('../users/UsersGroupsPanel.jsx'));

const TabWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const LoadingFallback = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  padding: ${theme.spacing.md};
`;

const UsersTab = () => {
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleStatusChange = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const accountsContent = (
    <TabWrapper>
      {status.message && (
        <StatusMessage type={status.type} message={status.message} />
      )}
      <Suspense fallback={<LoadingFallback>Loading accounts...</LoadingFallback>}>
        <UsersAccountsPanel onStatusChange={handleStatusChange} />
      </Suspense>
    </TabWrapper>
  );

  const analyticsContent = (
    <TabWrapper>
      {status.message && (
        <StatusMessage type={status.type} message={status.message} />
      )}
      <Suspense fallback={<LoadingFallback>Loading analytics...</LoadingFallback>}>
        <UsersAnalyticsPanel onStatusChange={handleStatusChange} />
      </Suspense>
    </TabWrapper>
  );

  const exportRequestsContent = (
    <TabWrapper>
      {status.message && (
        <StatusMessage type={status.type} message={status.message} />
      )}
      <Suspense fallback={<LoadingFallback>Loading export requests...</LoadingFallback>}>
        <UsersContentPanel onStatusChange={handleStatusChange} />
      </Suspense>
    </TabWrapper>
  );

  const groupsContent = (
    <TabWrapper>
      {status.message && (
        <StatusMessage type={status.type} message={status.message} />
      )}
      <Suspense fallback={<LoadingFallback>Loading groups...</LoadingFallback>}>
        <UsersGroupsPanel onStatusChange={handleStatusChange} />
      </Suspense>
    </TabWrapper>
  );

  const tabs = [
    {
      id: 'accounts',
      label: 'Accounts',
      content: accountsContent
    },
    {
      id: 'groups',
      label: 'Groups',
      content: groupsContent
    },
    {
      id: 'analytics',
      label: 'Analytics',
      content: analyticsContent
    },
    {
      id: 'export-requests',
      label: 'Export Requests',
      content: exportRequestsContent
    }
  ];

  return <SubTabNavigation tabs={tabs} defaultTab="accounts" />;
};

export default UsersTab;
