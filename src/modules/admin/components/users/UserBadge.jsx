import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const BADGE_STYLES = {
  beta: {
    background: 'rgba(99, 102, 241, 0.15)',
    border: '#6366f1',
    color: '#4f46e5'
  },
  early_adopter: {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '#10b981',
    color: '#059669'
  },
  verified: {
    background: 'rgba(59, 130, 246, 0.15)',
    border: '#3b82f6',
    color: '#2563eb'
  },
  trusted: {
    background: 'rgba(34, 197, 94, 0.15)',
    border: '#22c55e',
    color: '#16a34a'
  },
  vip: {
    background: 'rgba(245, 158, 11, 0.15)',
    border: '#f59e0b',
    color: '#d97706'
  },
  default: {
    background: 'rgba(0, 0, 0, 0.08)',
    border: 'rgba(0, 0, 0, 0.3)',
    color: 'rgba(0, 0, 0, 0.7)'
  }
};

const BadgeContainer = styled.span.withConfig({
  shouldForwardProp: (prop) => !['$variant'].includes(prop)
})`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid ${({ $variant }) => (BADGE_STYLES[$variant] || BADGE_STYLES.default).border};
  background: ${({ $variant }) => (BADGE_STYLES[$variant] || BADGE_STYLES.default).background};
  color: ${({ $variant }) => (BADGE_STYLES[$variant] || BADGE_STYLES.default).color};
  white-space: nowrap;
`;

const BadgeIcon = styled.span`
  font-size: 10px;
`;

const BADGE_ICONS = {
  beta: 'B',
  early_adopter: 'E',
  verified: 'V',
  trusted: 'T',
  vip: '*'
};

const UserBadge = ({ badge, showIcon = true }) => {
  if (!badge) return null;

  const variant = badge.toLowerCase().replace(/\s+/g, '_');
  const icon = BADGE_ICONS[variant];
  const displayName = badge.replace(/_/g, ' ');

  return (
    <BadgeContainer $variant={variant}>
      {showIcon && icon && <BadgeIcon>{icon}</BadgeIcon>}
      {displayName}
    </BadgeContainer>
  );
};

export default UserBadge;
