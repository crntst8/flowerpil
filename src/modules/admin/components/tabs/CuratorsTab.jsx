import { useState, Suspense, lazy } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { SubTabNavigation, StatusMessage } from '../shared';
import { BioHandleManager, ReferralManager } from '../curator';

// Lazy load the existing curator list component
const CuratorsTabOriginal = lazy(() => import('./CuratorsListTab.jsx'));

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

const CuratorsTab = () => {
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleStatusChange = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  // Curators List tab - use existing component
  const curatorsListContent = (
    <Suspense fallback={<LoadingFallback>Loading curators…</LoadingFallback>}>
      <CuratorsTabOriginal />
    </Suspense>
  );

  // Bio Handles tab
  const bioHandlesContent = (
    <TabWrapper>
      {status.message && (
        <StatusMessage type={status.type} message={status.message} />
      )}
      <BioHandleManager onStatusChange={handleStatusChange} />
    </TabWrapper>
  );

  // Referrals tab
  const referralsContent = (
    <TabWrapper>
      {status.message && (
        <StatusMessage type={status.type} message={status.message} />
      )}
      <ReferralManager onStatusChange={handleStatusChange} />
    </TabWrapper>
  );

  const tabs = [
    {
      id: 'curators',
      label: 'Curators',
      content: curatorsListContent
    },
    {
      id: 'bio-handles',
      label: 'Bio Handles',
      content: bioHandlesContent
    },
    {
      id: 'referrals',
      label: 'Referrals',
      content: referralsContent
    }
  ];

  return <SubTabNavigation tabs={tabs} defaultTab="curators" />;
};

export default CuratorsTab;
