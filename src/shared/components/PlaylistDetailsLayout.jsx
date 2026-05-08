import styled from 'styled-components';
import { MainBox, theme } from '@shared/styles/GlobalStyles';

export const PlaylistDetailsLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

export const DetailsSection = styled(MainBox)`
  padding: clamp(${theme.spacing.sm}, 2vw, ${theme.spacing.sm});
  border-radius: 5px;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.06);
`;

export const DetailsSectionHeader = styled.header`
  display: flex;
  flex-direction: column;
  
  margin-bottom: ${theme.spacing.md};
`;

export const DetailsSectionTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.primary};
  text-transform: Capitalize;
  background: black;
  padding: 0.5em;
  letter-spacing: 0.01m;
  font-size: ${theme.fontSizes.medium};
  color: ${theme.colors.white};
`;

export const DetailsSectionSubtitle = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  background: rgba(15, 23, 42, 0.08);
  padding: 0.2em;
  padding-left: 0.5em;
  line-height: 1.5;
`;

export const DetailsSectionBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

export const DetailsFieldRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: ${theme.spacing.md};

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

export const DetailsField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

export const FieldLabel = styled.label.withConfig({ shouldForwardProp: (p) => p !== '$required' })`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xxs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${theme.colors.black};

  &::after {
    content: ${({ $required }) => ($required ? '"*"' : '""')};
    color: ${theme.colors.danger};
    font-size: ${theme.fontSizes.small};
    line-height: 1;
  }
`;

export const FieldHint = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[600]};
  line-height: 1.5;
`;

export const FieldError = styled(FieldHint)`
  color: ${theme.colors.danger};
`;

export const FieldMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[500]};
  line-height: 1.3;
`;

export const FieldSelect = styled.select`
  width: 100%;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};
  color: ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  border-radius: 10px;
  transition: border-color ${theme.transitions.fast}, box-shadow ${theme.transitions.fast};

  &:focus {
    border-color: ${theme.colors.primary};
    box-shadow: 0 0 0 2px rgba(49, 130, 206, 0.2);
    outline: none;
  }

  option {
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
  }
`;

export const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  align-items: center;
`;

export const Chip = styled.span.withConfig({ shouldForwardProp: (p) => !['$tone', '$variant'].includes(p) })`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1.5px solid ${({ $tone }) => $tone || theme.colors.black[500]};
  background: ${({ $variant, $tone }) => ($variant === 'solid' ? ($tone || theme.colors.black) : 'transparent')};
  color: ${({ $variant, $tone }) => ($variant === 'solid' ? theme.colors.white : ($tone || theme.colors.black))};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
`;

export const ChipButton = styled.button.withConfig({ shouldForwardProp: (p) => !['$tone', '$textTone', '$selected', '$variant'].includes(p) })`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1.5px solid ${({ $tone }) => $tone || theme.colors.black[500]};
  background: ${({ $selected, $variant, $tone }) => ($selected || $variant === 'solid') ? ($tone || theme.colors.black) : 'transparent'};
  color: ${({ $selected, $variant, $tone, $textTone }) => ($selected || $variant === 'solid') ? ($textTone || theme.colors.white) : ($tone || theme.colors.black)};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  font-weight: ${({ $selected }) => ($selected ? 'bold' : 'normal')};

  &:hover:not(:disabled) {
    background: ${({ $tone }) => $tone || theme.colors.black};
    color: ${({ $textTone }) => $textTone || theme.colors.white};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const ChipRemove = styled.button`
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  line-height: 1;
  display: inline-flex;
  align-items: center;

  &:hover {
    opacity: 0.75;
  }
`;

export const DetailsNote = styled.div.withConfig({ shouldForwardProp: (p) => !['$tone'].includes(p) })`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 12px;
  border: ${theme.borders.dashedThin} ${({ $tone }) => $tone || theme.colors.black[300]};
  background: ${({ $tone }) => ($tone ? 'rgba(15, 23, 42, 0.02)' : 'rgba(15, 23, 42, 0.03)')};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  line-height: 1.4;
`;

export default {
  PlaylistDetailsLayout,
  DetailsSection,
  DetailsSectionHeader,
  DetailsSectionTitle,
  DetailsSectionSubtitle,
  DetailsSectionBody,
  DetailsFieldRow,
  DetailsField,
  FieldLabel,
  FieldHint,
  FieldError,
  FieldMeta,
  FieldSelect,
  ChipRow,
  Chip,
  ChipButton,
  ChipRemove,
  DetailsNote,
};
