import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const heightMap = {
  sm: theme.spacing.sm,
  md: theme.spacing.md,
  lg: theme.spacing.lg,
  xl: theme.spacing.xl,
};

export default function SpacerBlock({ block }) {
  const { height = 'md' } = block;

  return <Spacer $height={heightMap[height] || heightMap.md} />;
}

const Spacer = styled.div`
  height: ${props => props.$height};
`;
