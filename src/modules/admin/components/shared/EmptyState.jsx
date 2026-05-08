import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.xl};
  text-align: center;
  gap: ${theme.spacing.sm};
  min-height: 200px;
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.15);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.02);
`;

const EmptyStateIcon = styled.div`
  font-size: calc(${theme.fontSizes.h1} * 1.5);
  opacity: 0.3;
  filter: grayscale(1);
`;

const EmptyStateText = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const EmptyStateSubtext = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  max-width: 400px;
`;

const EmptyState = ({ icon = '∅', message = 'No items found', subtext, children }) => {
  return (
    <EmptyStateContainer>
      <EmptyStateIcon>{icon}</EmptyStateIcon>
      <EmptyStateText>{message}</EmptyStateText>
      {subtext && <EmptyStateSubtext>{subtext}</EmptyStateSubtext>}
      {children}
    </EmptyStateContainer>
  );
};

export default EmptyState;
