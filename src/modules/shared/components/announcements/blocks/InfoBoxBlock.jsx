import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const styleConfig = {
  success: {
    background: 'rgba(76, 175, 80, 0.08)',
    border: theme.colors.success,
  },
  warning: {
    background: 'rgba(221, 107, 32, 0.08)',
    border: theme.colors.warning,
  },
  info: {
    background: 'rgba(71, 159, 242, 0.08)',
    border: theme.colors.primary,
  },
  danger: {
    background: 'rgba(229, 62, 62, 0.08)',
    border: theme.colors.danger,
  },
};

export default function InfoBoxBlock({ block }) {
  const { content, style = 'info', icon } = block;
  const config = styleConfig[style] || styleConfig.info;

  return (
    <InfoBox $background={config.background} $borderColor={config.border}>
      {icon && <InfoIcon>{icon}</InfoIcon>}
      <InfoContent dangerouslySetInnerHTML={{ __html: content }} />
    </InfoBox>
  );
}

const InfoBox = styled.div`
  padding: ${theme.spacing.md};
  background: ${props => props.$background};
  border: ${theme.borders.dashed} ${props => props.$borderColor};
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const InfoIcon = styled.span`
  font-size: 24px;
`;

const InfoContent = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  line-height: 1.5;
  opacity: 0.8;

  b, strong {
    font-weight: ${theme.fontWeights.bold};
  }

  a {
    color: inherit;
    text-decoration: underline;
  }
`;
