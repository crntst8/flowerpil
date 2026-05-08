import React, { useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const ToastContainer = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$type' })`
  position: fixed;
  bottom: ${theme.spacing.xl};
  right: ${theme.spacing.xl};
  background: ${({ $type }) => {
    if ($type === 'success') return theme.colors.success;
    if ($type === 'error') return theme.colors.danger;
    if ($type === 'warning') return theme.colors.warning;
    return theme.colors.black;
  }};
  color: ${({ $type }) => {
    if ($type === 'success' || $type === 'error' || $type === 'warning') return theme.colors.white;
    return theme.colors.fpwhite;
  }};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  z-index: 10000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  min-width: 200px;
  max-width: 400px;
  animation: slideInUp 0.2s ease-out;

  @keyframes slideInUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    bottom: ${theme.spacing.md};
    right: ${theme.spacing.md};
    left: ${theme.spacing.md};
    max-width: none;
  }
`;

const ToastIcon = styled.span`
  font-size: ${theme.fontSizes.medium};
  flex-shrink: 0;
`;

const ToastMessage = styled.span`
  flex: 1;
`;

const UndoButton = styled.button`
  background: transparent;
  border: 1px solid currentColor;
  color: inherit;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  border-radius: 4px;
  margin-left: ${theme.spacing.sm};
  transition: background 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

const Toast = ({ type = 'info', message, onUndo, duration = 3000, onClose }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        if (onClose) onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: '•'
  };

  return (
    <ToastContainer $type={type} role="alert" aria-live="polite">
      <ToastIcon>{icons[type] || '•'}</ToastIcon>
      <ToastMessage>{message}</ToastMessage>
      {onUndo && (
        <UndoButton onClick={onUndo} aria-label="Undo">
          Undo
        </UndoButton>
      )}
    </ToastContainer>
  );
};

export default Toast;

