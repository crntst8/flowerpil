import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  background: transparent;
  border: ${theme.borders.solid} ${theme.colors.black[400]};
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.black};
    color: ${theme.colors.fpwhite};
    border-color: ${theme.colors.black};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Icon = styled.span`
  font-size: 16px;
`;

export default function ShareButton({ onClick, disabled = false, children = 'Share' }) {
  return (
    <Button onClick={onClick} disabled={disabled}>
      <Icon>↗</Icon>
      {children}
    </Button>
  );
}
