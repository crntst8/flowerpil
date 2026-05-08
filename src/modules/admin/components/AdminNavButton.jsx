import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const AdminNavButton = ({ 
  to, 
  onClick, 
  children, 
  variant = 'default', 
  size = 'default',
  disabled = false,
  external = false,
  title,
  ...props 
}) => {
  const handleClick = (e) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    
    if (external && to) {
      // External navigation (open in new tab)
      window.open(to, '_blank', 'noopener,noreferrer');
    } else if (to) {
      // Internal navigation (same tab)
      window.location.href = to;
    } else if (onClick) {
      onClick(e);
    }
  };

  return (
    <NavButton
      onClick={handleClick}
      variant={variant}
      size={size}
      disabled={disabled}
      title={title}
      {...props}
    >
      {children}
    </NavButton>
  );
};

const NavButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['variant', 'size'].includes(prop)
})`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: ${theme.borders.solid};
  background: transparent;
  color: ${theme.colors.black};
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  text-decoration: none;
  
  /* Size variants */
  ${props => props.size === 'small' && `
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    font-size: ${theme.fontSizes.tiny};
    min-height: 32px;
  `}
  
  ${props => props.size === 'default' && `
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    font-size: ${theme.fontSizes.small};
    min-height: 40px;
  `}
  
  /* Color variants */
  ${props => props.variant === 'default' && `
    border-color: ${theme.colors.black};
    &:hover:not(:disabled) {
      border-color: ${theme.colors.black};
      background: rgba(255, 255, 255, 0.05);
    }
  `}
  
  ${props => props.variant === 'primary' && `
    border-color: ${theme.colors.primary};
    color: ${theme.colors.primary};
    &:hover:not(:disabled) {
      background: ${theme.colors.primary};
      color: ${theme.colors.black};
    }
  `}
  
  ${props => props.variant === 'success' && `
    border-color: ${theme.colors.success};
    color: ${theme.colors.success};
    &:hover:not(:disabled) {
      background: ${theme.colors.success};
      color: ${theme.colors.black};
    }
  `}
  
  ${props => props.variant === 'warning' && `
    border-color: ${theme.colors.warning};
    color: ${theme.colors.warning};
    &:hover:not(:disabled) {
      background: ${theme.colors.warning};
      color: ${theme.colors.black};
    }
  `}
  
  /* Disabled state */
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  /* Active/focus states */
  &:active:not(:disabled) {
    transform: translateY(1px);
  }
  
  &:focus:not(:disabled) {
    outline: 2px solid ${theme.colors.white};
    outline-offset: 2px;
  }
`;

export default AdminNavButton;