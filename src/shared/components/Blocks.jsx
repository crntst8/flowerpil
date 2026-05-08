import styled from 'styled-components';
import { MainBox, theme, mediaQuery } from '@shared/styles/GlobalStyles';

// Unified Section component - use across all curator pages
export const Section = styled(MainBox)`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
    margin-bottom: ${theme.spacing.sm};
  }
`;

// Unified Section Header - consistent across all pages
export const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding-bottom: ${theme.spacing.sm};
  border-bottom: ${theme.borders.dashedThin} ${theme.colors.black};
  margin-bottom: ${theme.spacing.md};

  .title {
    margin: 0;
    font-family: ${theme.fonts.primary};
    background: ${theme.colors.black};
    color: ${theme.colors.white};
    padding: 0.4em 0.6em;
    text-transform: capitalize;
    font-size: ${theme.fontSizes.body};
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  .subtitle {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    color: ${theme.colors.black};
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  ${mediaQuery.mobile} {
    flex-wrap: wrap;
    margin-bottom: ${theme.spacing.sm};
  }
`;

export const ButtonHeader = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding-bottom: ${theme.spacing.sm};
  border-bottom: ${theme.borders.solidThin} ${theme.colors.black};
  margin-bottom: ${theme.spacing.xs};

  h3 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    text-transform: capitalize;
    letter-spacing: 0.2px;
    font-size: ${theme.fontSizes.body};
  }
`;




export const Chip = styled.span.withConfig({
  shouldForwardProp: (p) => !['$success', '$danger'].includes(p)
})`
  border: ${theme.borders.dashed}
    ${props => props.$success ? theme.colors.success : props.$danger ? theme.colors.danger : theme.colors.black};
  color: ${props => props.$success ? theme.colors.success : props.$danger ? theme.colors.danger : theme.colors.black};
  padding: 2px 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.md};
  font-weight: ${theme.fontWeights.bold};
`;

export const StickyActions = styled.div`
  position: sticky;
  bottom: 0;
  padding: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  border-top: ${theme.borders.solid} ${theme.colors.black};
  backdrop-filter: blur(14px);
  z-index: 3;
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  margin-top: ${theme.spacing.lg};

  button {
    min-height: 48px;
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm} ${theme.spacing.md} ${theme.spacing.md};
    margin-top: ${theme.spacing.md};

    button { 
      flex: 1; 
      min-height: 48px;
    }
  }
`;

export default { Section, SectionHeader, ButtonHeader, Chip, StickyActions };
