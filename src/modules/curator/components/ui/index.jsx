/**
 * Curator UI Design System
 * 
 * Centralized UI primitives for the Curator module.
 * All components should import from here for consistency.
 */

import React from 'react';
import styled, { css } from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

export const tokens = {
  // Spacing scale (4px base)
  spacing: {
    0: '0',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
  },

  // Component-specific spacing
  componentSpacing: {
    sectionGap: '24px',      // Between major sections
    cardPadding: '16px',     // Inside cards
    cardPaddingMobile: '12px',
    formGap: '16px',         // Between form fields
    buttonGap: '8px',        // Between inline buttons
    inputPadding: '12px 16px',
  },

  // Sizing
  sizing: {
    touchTarget: '44px',
    touchTargetComfortable: '48px',
    inputHeight: '44px',
    buttonHeightSm: '36px',
    buttonHeightMd: '44px',
    buttonHeightLg: '56px',
    iconSm: '16px',
    iconMd: '20px',
    iconLg: '24px',
  },

  // Border radius
  radii: {
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },

  // Shadows
  shadows: {
    card: '4px 4px 0 #000',
    cardHover: '6px 6px 0 #000',
    cardActive: '2px 2px 0 #000',
    button: '3px 3px 0 #000',
    buttonHover: '4px 4px 0 #000',
    buttonActive: '2px 2px 0 #000',
    modal: '0 32px 80px rgba(0, 0, 0, 0.64)',
    subtle: '0 2px 8px rgba(0, 0, 0, 0.08)',
  },

  // Transitions
  transitions: {
    fast: '0.15s ease',
    normal: '0.2s ease',
    slow: '0.3s ease',
  },

  // Z-index scale
  zIndex: {
    dropdown: 100,
    sticky: 200,
    modal: 1000,
    toast: 1100,
    tooltip: 1200,
  },
};

// =============================================================================
// BUTTON VARIANTS
// =============================================================================

const buttonVariants = {
  primary: css`
    background: ${theme.colors.primary};
    color: ${theme.colors.black};
    border-color: ${theme.colors.black};
    &:hover:not(:disabled) {
      background: ${theme.colors.hoverPrimary};
    }
  `,
  secondary: css`
    background: ${theme.colors.action};
    color: ${theme.colors.black};
    border-color: ${theme.colors.black};
    &:hover:not(:disabled) {
      background: ${theme.colors.hoverAction};
    }
  `,
  success: css`
    background: ${theme.colors.success};
    color: ${theme.colors.black};
    border-color: ${theme.colors.black};
    &:hover:not(:disabled) {
      background: #3d8b40;
    }
  `,
  danger: css`
    background: ${theme.colors.danger};
    color: ${theme.colors.fpwhite};
    border-color: ${theme.colors.black};
    &:hover:not(:disabled) {
      background: ${theme.colors.hoverDanger};
    }
  `,
  dangerOutline: css`
    background: transparent;
    color: ${theme.colors.danger};
    border-color: ${theme.colors.danger};
    &:hover:not(:disabled) {
      background: ${theme.colors.dangerBG};
      border-color: ${theme.colors.hoverDanger};
      color: ${theme.colors.hoverDanger};
    }
  `,
  ghost: css`
    background: transparent;
    color: ${theme.colors.black};
    border-color: transparent;
    box-shadow: none;
    &:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.05);
      box-shadow: none;
    }
    &:active:not(:disabled) {
      box-shadow: none;
    }
  `,
  olive: css`
    background: ${theme.colors.olive};
    color: ${theme.colors.black};
    border-color: ${theme.colors.black};
    &:hover:not(:disabled) {
      background: ${theme.colors.oliveHover};
    }
  `,
  default: css`
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
    border-color: ${theme.colors.black};
    &:hover:not(:disabled) {
      background: ${theme.colors.fpwhiteTrans};
    }
  `,
};

const buttonSizes = {
  sm: css`
    padding: 6px 12px;
    min-height: ${tokens.sizing.buttonHeightSm};
    font-size: ${theme.fontSizes.tiny};
  `,
  md: css`
    padding: 8px 16px;
    min-height: ${tokens.sizing.buttonHeightMd};
    font-size: ${theme.fontSizes.small};
  `,
  lg: css`
    padding: 12px 24px;
    min-height: ${tokens.sizing.buttonHeightLg};
    font-size: ${theme.fontSizes.body};
  `,
};

// =============================================================================
// BUTTON COMPONENT
// =============================================================================

export const Button = styled.button.withConfig({
  shouldForwardProp: (prop) => !['$variant', '$size', '$fullWidth', '$iconOnly'].includes(prop),
})`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 2px solid ${theme.colors.black};
  border-radius: 0;
  font-family: ${theme.fonts.mono};
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: 
    transform ${tokens.transitions.fast},
    box-shadow ${tokens.transitions.normal},
    background ${tokens.transitions.fast},
    border-color ${tokens.transitions.fast},
    color ${tokens.transitions.fast};
  white-space: nowrap;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  box-shadow: ${tokens.shadows.button};
  
  ${({ $size = 'md' }) => buttonSizes[$size] || buttonSizes.md}
  ${({ $variant = 'default' }) => buttonVariants[$variant] || buttonVariants.default}
  
  ${({ $fullWidth }) => $fullWidth && css`
    width: 100%;
  `}
  
  ${({ $iconOnly }) => $iconOnly && css`
    padding: 0;
    width: ${tokens.sizing.buttonHeightMd};
    min-width: ${tokens.sizing.buttonHeightMd};
  `}
  
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: ${tokens.shadows.buttonHover};
  }
  
  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: ${tokens.shadows.buttonActive};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
  
  &:focus-visible {
    outline: 2px dashed ${theme.colors.black};
    outline-offset: 2px;
  }
  
  ${mediaQuery.mobile} {
    min-height: ${tokens.sizing.touchTarget};
    padding: 12px 16px;
  }
`;

// Icon button for compact actions
export const IconButton = styled(Button).withConfig({
  shouldForwardProp: (prop) => !['$variant', '$size'].includes(prop),
})`
  padding: 0;
  width: ${({ $size }) => {
    if ($size === 'sm') return '32px';
    if ($size === 'lg') return '48px';
    return '40px';
  }};
  min-width: ${({ $size }) => {
    if ($size === 'sm') return '32px';
    if ($size === 'lg') return '48px';
    return '40px';
  }};
  height: ${({ $size }) => {
    if ($size === 'sm') return '32px';
    if ($size === 'lg') return '48px';
    return '40px';
  }};
  
  ${mediaQuery.mobile} {
    width: ${tokens.sizing.touchTarget};
    min-width: ${tokens.sizing.touchTarget};
    height: ${tokens.sizing.touchTarget};
  }
`;

// =============================================================================
// FORM COMPONENTS
// =============================================================================

export const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  width: 100%;
`;

export const Label = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
`;

export const HelperText = styled.span.withConfig({
  shouldForwardProp: (prop) => !['$error'].includes(prop),
})`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${({ $error }) => $error ? theme.colors.danger : 'rgba(0, 0, 0, 0.6)'};
  margin-top: ${tokens.spacing[1]};
`;

const inputBaseStyles = css`
  width: 100%;
  min-height: ${tokens.sizing.inputHeight};
  background: ${theme.colors.focusoutText};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 0;
  color: ${theme.colors.black};
  padding: ${tokens.componentSpacing.inputPadding};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  transition: 
    border-color ${tokens.transitions.fast},
    background ${tokens.transitions.fast},
    box-shadow ${tokens.transitions.fast};
  
  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
    background: ${theme.colors.white};
    box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1);
  }
  
  &::placeholder {
    color: rgba(0, 0, 0, 0.4);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: rgba(0, 0, 0, 0.05);
  }
  
  ${mediaQuery.mobile} {
    padding: 12px 16px;
  }
`;

export const Input = styled.input.withConfig({
  shouldForwardProp: (prop) => !['$error', '$hasIcon'].includes(prop),
})`
  ${inputBaseStyles}
  
  ${({ $error }) => $error && css`
    border-color: ${theme.colors.danger};
    &:focus {
      border-color: ${theme.colors.danger};
      box-shadow: 0 0 0 3px rgba(229, 62, 62, 0.1);
    }
  `}
`;

export const Select = styled.select.withConfig({
  shouldForwardProp: (prop) => !['$error'].includes(prop),
})`
  ${inputBaseStyles}
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23000' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
  
  ${({ $error }) => $error && css`
    border-color: ${theme.colors.danger};
  `}
`;

export const TextArea = styled.textarea.withConfig({
  shouldForwardProp: (prop) => !['$error'].includes(prop),
})`
  ${inputBaseStyles}
  min-height: 120px;
  resize: vertical;
  
  ${({ $error }) => $error && css`
    border-color: ${theme.colors.danger};
  `}
`;

// Composite FormField with label, input, and helper/error text
export const FormField = ({ label, error, helper, children, required, ...props }) => (
  <FormGroup {...props}>
    {label && (
      <Label>
        {label}
        {required && <span style={{ color: theme.colors.danger }}> *</span>}
      </Label>
    )}
    {children}
    {(error || helper) && (
      <HelperText $error={!!error}>{error || helper}</HelperText>
    )}
  </FormGroup>
);

// =============================================================================
// LAYOUT COMPONENTS
// =============================================================================

export const Stack = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$gap', '$direction', '$align', '$justify'].includes(prop),
})`
  display: flex;
  flex-direction: ${({ $direction = 'column' }) => $direction};
  gap: ${({ $gap = tokens.spacing[4] }) => typeof $gap === 'number' ? tokens.spacing[$gap] : $gap};
  align-items: ${({ $align = 'stretch' }) => $align};
  justify-content: ${({ $justify = 'flex-start' }) => $justify};
`;

export const Flex = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$gap', '$align', '$justify', '$wrap'].includes(prop),
})`
  display: flex;
  gap: ${({ $gap = tokens.spacing[2] }) => typeof $gap === 'number' ? tokens.spacing[$gap] : $gap};
  align-items: ${({ $align = 'center' }) => $align};
  justify-content: ${({ $justify = 'flex-start' }) => $justify};
  flex-wrap: ${({ $wrap }) => $wrap ? 'wrap' : 'nowrap'};
`;

export const Grid = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$columns', '$gap', '$minWidth'].includes(prop),
})`
  display: grid;
  gap: ${({ $gap = tokens.spacing[4] }) => typeof $gap === 'number' ? tokens.spacing[$gap] : $gap};
  grid-template-columns: ${({ $columns, $minWidth = '280px' }) => 
    $columns 
      ? `repeat(${$columns}, 1fr)` 
      : `repeat(auto-fit, minmax(${$minWidth}, 1fr))`
  };
  
  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    gap: ${({ $gap }) => {
      const gapVal = typeof $gap === 'number' ? $gap : 4;
      return tokens.spacing[Math.max(2, gapVal - 2)] || tokens.spacing[3];
    }};
  }
`;

// =============================================================================
// CARD COMPONENTS
// =============================================================================

export const Card = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$variant', '$hoverable', '$padding'].includes(prop),
})`
  background: ${({ $variant }) => $variant === 'dark' ? theme.colors.black : theme.colors.fpwhite};
  color: ${({ $variant }) => $variant === 'dark' ? theme.colors.fpwhite : theme.colors.black};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${({ $padding = tokens.componentSpacing.cardPadding }) => $padding};
  box-shadow: ${tokens.shadows.card};
  transition: 
    transform ${tokens.transitions.fast},
    box-shadow ${tokens.transitions.fast};
  
  ${({ $hoverable }) => $hoverable && css`
    cursor: pointer;
    &:hover {
      transform: translateY(-2px);
      box-shadow: ${tokens.shadows.cardHover};
    }
    &:active {
      transform: translateY(0);
      box-shadow: ${tokens.shadows.cardActive};
    }
  `}
  
  ${mediaQuery.mobile} {
    padding: ${tokens.componentSpacing.cardPaddingMobile};
  }
`;

export const SectionCard = styled(Card)`
  margin-bottom: ${tokens.spacing[4]};
  
  ${mediaQuery.mobile} {
    margin-bottom: ${tokens.spacing[3]};
  }
`;

// =============================================================================
// SECTION HEADER
// =============================================================================

export const SectionHeader = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$noBorder'].includes(prop),
})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${tokens.spacing[3]};
  padding-bottom: ${tokens.spacing[3]};
  border-bottom: ${({ $noBorder }) => $noBorder ? 'none' : `1px dashed ${theme.colors.black}`};
  margin-bottom: ${tokens.spacing[4]};
  
  ${mediaQuery.mobile} {
    flex-wrap: wrap;
    margin-bottom: ${tokens.spacing[3]};
  }
`;

export const SectionTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  background: ${theme.colors.black};
  color: ${theme.colors.white};
  padding: 0.4em 0.6em;
  text-transform: capitalize;
  min-height: ${tokens.sizing.touchTarget};
  display: flex;
  align-items: center;
`;

export const SectionSubtitle = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

// =============================================================================
// PAGE HEADER
// =============================================================================

export const PageHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  background: ${theme.colors.black};
  padding: ${tokens.spacing[6]} ${tokens.spacing[8]};
  margin-bottom: ${tokens.spacing[6]};
  
  h1 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h2};
    color: ${theme.colors.fpwhite};
    text-transform: capitalize;
    letter-spacing: -0.9px;
  }
  
  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.fpwhite};
    opacity: 0.8;
  }
  
  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
    margin-bottom: ${tokens.spacing[4]};
    
    h1 {
      font-size: ${theme.fontSizes.h3};
    }
  }
`;

export const PageHeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};
  margin-top: ${tokens.spacing[3]};
  
  ${mediaQuery.mobile} {
    flex-wrap: wrap;
    gap: ${tokens.spacing[2]};
    
    > * {
      flex: 1;
      min-width: 140px;
    }
  }
`;

// =============================================================================
// STATUS & FEEDBACK
// =============================================================================

export const StatusBanner = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$variant'].includes(prop),
})`
  background: ${({ $variant }) => {
    if ($variant === 'error') return 'rgba(229, 62, 62, 0.08)';
    if ($variant === 'success') return 'rgba(76, 175, 80, 0.08)';
    if ($variant === 'warning') return 'rgba(221, 107, 32, 0.08)';
    return theme.colors.fpwhite;
  }};
  border: ${theme.borders.solid} ${({ $variant }) => {
    if ($variant === 'error') return theme.colors.danger;
    if ($variant === 'success') return theme.colors.success;
    if ($variant === 'warning') return theme.colors.warning;
    return theme.colors.black;
  }};
  color: ${({ $variant }) => {
    if ($variant === 'error') return theme.colors.danger;
    if ($variant === 'success') return theme.colors.success;
    if ($variant === 'warning') return theme.colors.warning;
    return theme.colors.black;
  }};
  padding: ${tokens.spacing[3]} ${tokens.spacing[4]};
  margin-bottom: ${tokens.spacing[4]};
  
  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    line-height: 1.5;
  }
  
  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[3]};
    margin-bottom: ${tokens.spacing[3]};
  }
`;

export const Badge = styled.span.withConfig({
  shouldForwardProp: (prop) => !['$variant'].includes(prop),
})`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 4px;
  
  ${({ $variant }) => {
    switch ($variant) {
      case 'success':
        return css`
          background: #e5ffe9;
          color: ${theme.colors.success};
          border: 1px solid ${theme.colors.success};
        `;
      case 'danger':
        return css`
          background: #ffe5e5;
          color: ${theme.colors.danger};
          border: 1px solid ${theme.colors.danger};
        `;
      case 'warning':
        return css`
          background: #fff3e5;
          color: ${theme.colors.warning};
          border: 1px solid ${theme.colors.warning};
        `;
      case 'info':
        return css`
          background: rgba(49, 130, 206, 0.1);
          color: ${theme.colors.primary};
          border: 1px solid ${theme.colors.primary};
        `;
      default:
        return css`
          background: ${theme.colors.fpwhite};
          color: ${theme.colors.black};
          border: 1px solid ${theme.colors.black};
        `;
    }
  }}
`;

export const StatusDot = styled.span.withConfig({
  shouldForwardProp: (prop) => !['$active'].includes(prop),
})`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $active }) => $active ? '#26b846' : '#f5a524'};
  border: 1px solid ${theme.colors.black};
  flex-shrink: 0;
  box-shadow: 1px 1px 0 ${theme.colors.black};
`;

// =============================================================================
// ACTION BARS
// =============================================================================

export const StickyActionBar = styled.div`
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  background: ${theme.colors.fpwhite};
  border-top: ${theme.borders.solid} ${theme.colors.black};
  padding: ${tokens.spacing[4]};
  z-index: ${tokens.zIndex.sticky};
  display: flex;
  gap: ${tokens.spacing[3]};
  flex-wrap: wrap;
  backdrop-filter: blur(14px);
  
  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[3]} ${tokens.spacing[4]} ${tokens.spacing[4]};
    
    > button {
      flex: 1;
      min-height: ${tokens.sizing.touchTargetComfortable};
    }
  }
`;

export const ActionBar = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$align'].includes(prop),
})`
  display: flex;
  gap: ${tokens.spacing[2]};
  justify-content: ${({ $align = 'flex-start' }) => $align};
  flex-wrap: wrap;
  
  ${mediaQuery.mobile} {
    gap: ${tokens.spacing[2]};
    
    > button {
      flex: 1;
      min-width: 120px;
    }
  }
`;

// =============================================================================
// TOOLBAR & FILTERS
// =============================================================================

export const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${tokens.spacing[3]};
  padding: ${tokens.spacing[3]} ${tokens.spacing[4]};
  margin-bottom: ${tokens.spacing[4]};
  
  ${mediaQuery.mobile} {
    flex-direction: column;
    align-items: stretch;
    gap: ${tokens.spacing[3]};
    margin-bottom: ${tokens.spacing[3]};
  }
`;

export const ToolbarGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${tokens.spacing[2]};
  
  ${mediaQuery.mobile} {
    width: 100%;
    justify-content: flex-start;
  }
`;

export const FilterPill = styled.button.withConfig({
  shouldForwardProp: (prop) => !['$active'].includes(prop),
})`
  padding: ${tokens.spacing[2]} ${tokens.spacing[4]};
  min-height: ${tokens.sizing.buttonHeightSm};
  border: 1px solid ${theme.colors.black};
  background: ${({ $active }) => $active ? theme.colors.black : theme.colors.fpwhite};
  color: ${({ $active }) => $active ? theme.colors.fpwhite : theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: 
    background ${tokens.transitions.fast},
    color ${tokens.transitions.fast},
    transform ${tokens.transitions.fast},
    box-shadow ${tokens.transitions.fast};
  
  &:hover:not(:disabled) {
    background: ${({ $active }) => $active ? theme.colors.black : theme.colors.fpwhiteIn};
    transform: translateY(-1px);
    box-shadow: ${tokens.shadows.button};
  }
  
  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: ${tokens.shadows.buttonActive};
  }
  
  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

export const SearchInput = styled(Input)`
  min-width: 180px;
  max-width: 280px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
  
  ${mediaQuery.mobile} {
    min-width: 100%;
    max-width: 100%;
  }
`;

// =============================================================================
// EMPTY STATES
// =============================================================================

export const EmptyState = styled.div`
  padding: ${tokens.spacing[8]};
  text-align: center;
  border: 1px dashed ${theme.colors.blackAct};
  background: rgba(255, 255, 255, 0.9);
  
  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    letter-spacing: 0.05em;
  }
  
  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[6]};
  }
`;

// =============================================================================
// LIST COMPONENTS
// =============================================================================

export const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: ${tokens.spacing[4]};
  grid-template-columns: repeat(auto-fit, minmax(325px, 1fr));
  
  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    gap: ${tokens.spacing[3]};
  }
`;

export const ListItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  padding: ${tokens.spacing[3]};
  border: 1px solid ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  box-shadow: ${tokens.shadows.card};
  transition: 
    transform ${tokens.transitions.fast},
    box-shadow ${tokens.transitions.fast};
  
  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
  }
`;

// =============================================================================
// CONTAINER WRAPPERS
// =============================================================================

export const ContentWrapper = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
`;

export const PageContainer = styled.div`
  max-width: 1920px;
  margin: 0 auto;
  padding: ${tokens.spacing[4]} ${tokens.spacing[4]} 100px;
  background: ${theme.colors.fpwhite};
  min-height: 100vh;
  
  ${mediaQuery.tablet} {
    padding: ${tokens.spacing[3]} ${tokens.spacing[3]} 100px;
  }
  
  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[2]} ${tokens.spacing[2]} 100px;
    max-width: 100vw;
    overflow-x: hidden;
  }
`;

// =============================================================================
// TWO-COLUMN LAYOUT
// =============================================================================

export const TwoColumnGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${tokens.spacing[4]};
  
  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

// =============================================================================
// MENU & NAVIGATION
// =============================================================================

export const MenuGroup = styled.div`
  padding: ${tokens.spacing[2]} 0 ${tokens.spacing[4]};
`;

export const MenuLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0 ${tokens.spacing[6]};
  margin-bottom: ${tokens.spacing[2]};
  padding-bottom: ${tokens.spacing[4]};
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

export const MenuItem = styled.button`
  display: flex;
  align-items: center;
  width: 100%;
  padding: ${tokens.spacing[4]} ${tokens.spacing[6]};
  min-height: ${tokens.sizing.touchTargetComfortable};
  background: transparent;
  color: ${theme.colors.fpwhite};
  border: none;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.hx};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  text-align: left;
  transition: 
    background ${tokens.transitions.fast},
    transform ${tokens.transitions.fast};
  
  &:hover {
    background: ${theme.colors.blackLess};
    transform: translateX(8px);
  }
  
  &:focus-visible {
    outline: 2px dashed ${theme.colors.fpwhite};
    outline-offset: -2px;
  }
`;

// =============================================================================
// TABS
// =============================================================================

export const TabList = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};
  overflow-x: auto;
  padding: ${tokens.spacing[3]} ${tokens.spacing[4]};
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  
  &::-webkit-scrollbar {
    display: none;
  }
  
  ${mediaQuery.mobile} {
    display: none;
  }
`;

export const Tab = styled.button.withConfig({
  shouldForwardProp: (prop) => !['$active'].includes(prop),
})`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
  min-height: ${tokens.sizing.touchTarget};
  background: ${({ $active }) => $active ? theme.colors.fpwhiteIn : 'transparent'};
  color: ${theme.colors.black};
  border: ${theme.borders.solidAct} ${({ $active }) => $active ? theme.colors.black : theme.colors.blackAct};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${({ $active }) => $active ? theme.fontWeights.medium : theme.fontWeights.regular};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: 
    background ${tokens.transitions.fast},
    border-color ${tokens.transitions.fast};
  white-space: nowrap;
  flex: 0 0 auto;
  
  &:hover {
    background: ${({ $active }) => $active ? theme.colors.fpwhiteIn : theme.colors.fpwhiteTrans};
  }
`;

// Re-export theme for convenience
export { theme, mediaQuery };








