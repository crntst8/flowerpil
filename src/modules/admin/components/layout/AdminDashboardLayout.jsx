import styled from 'styled-components';
import { Container, theme, MainBox } from '@shared/styles/GlobalStyles';

export const DashboardShell = styled(Container)`
  padding: ${theme.spacing.md} ${theme.layout.containerPadding};
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  color: ${theme.colors.black};
`;

export const HeaderRow = styled.header`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
`;

export const HeaderInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  min-width: 240px;
`;

export const HeaderTitle = styled.h1`

  margin: 0;
  font-size: ${theme.fontSizes.h3};
  font-family: ${theme.fonts.primary};
  letter-spacing: -0.9px;
  text-transform: uppercase;
`;

export const HeaderMeta = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.7);
`;

export const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};

  button {
    text-transform: uppercase;
  }
`;

export const TabBar = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.93);
padding: 0.6em;
  border-bottom: ${theme.borders.solid} rgba(0, 0, 0, 0.93);
      box-shadow: 0 0 0 3px rgba(95, 121, 145, 0.65);
      box-shadow: 6px 3px rgba(95, 121, 145, 0.65);



`;

export const TabButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$active'
})`
  border: ${theme.borders.solid} ${props => props.$active ? theme.colors.white : 'rgb(255, 255, 255)'};
  background: ${props => props.$active ? 'rgba(0, 0, 0, 0.05)' : 'transparent'};
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
      box-shadow: 4px 3px rgba(95, 121, 145, 0.65);

  &:hover {
    border-color: ${theme.colors.primary};
    background: rgba(177, 172, 172, 0.08);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const DashboardBody = styled.main`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

export const TabSection = styled(MainBox)`
  background: ${theme.colors.primary};
  border-color: rgba(0, 0, 0, 0.15);
  
`;
