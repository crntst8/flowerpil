import React from 'react';
import styled from 'styled-components';
import { theme, DashedBox } from '@shared/styles/GlobalStyles';
import ExportRequestsPanel from '../ExportRequestsPanel';

const TabWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const HelperCard = styled(DashedBox)`
  background: ${theme.colors.fpwhite};
  border-color: rgba(0, 0, 0, 0.15);
  padding: ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.7);
`;

const ExportsTab = () => {
  return (
    <TabWrapper>
      <HelperCard>
        Manage export requests queued by curators. Pending jobs appear first; additional filters will arrive with the workflow upgrades.
      </HelperCard>
      <ExportRequestsPanel />
    </TabWrapper>
  );
};

export default ExportsTab;
