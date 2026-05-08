import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const StatusMessageContainer = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$type' })`
  padding: ${theme.spacing.md};
  border-radius: 10px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  border: ${theme.borders.solidThin};
  animation: slideIn 0.2s ease-out;

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  ${({ $type }) => {
    if ($type === 'success') {
      return `
        background: rgba(76, 175, 80, 0.1);
        border-color: ${theme.colors.success};
        color: ${theme.colors.success};
      `;
    }
    if ($type === 'error') {
      return `
        background: rgba(220, 53, 69, 0.1);
        border-color: ${theme.colors.error};
        color: ${theme.colors.error};
      `;
    }
    if ($type === 'warning') {
      return `
        background: rgba(255, 193, 7, 0.1);
        border-color: ${theme.colors.warning};
        color: ${theme.colors.warning};
      `;
    }
    if ($type === 'info') {
      return `
        background: rgba(33, 150, 243, 0.1);
        border-color: ${theme.colors.black};
        color: ${theme.colors.black};
      `;
    }
    return `
      background: rgba(0, 0, 0, 0.05);
      border-color: rgba(0, 0, 0, 0.2);
      color: ${theme.colors.black};
    `;
  }}
`;

const StatusIcon = styled.span`
  font-size: ${theme.fontSizes.large};
  flex-shrink: 0;
`;

const StatusText = styled.span`
  flex: 1;
  line-height: 1.4;
`;

const StatusMessage = ({ type = 'info', message, icon }) => {
  if (!message) return null;

  const defaultIcons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  return (
    <StatusMessageContainer $type={type}>
      <StatusIcon>{icon || defaultIcons[type] || '•'}</StatusIcon>
      <StatusText>{message}</StatusText>
    </StatusMessageContainer>
  );
};

export default StatusMessage;
