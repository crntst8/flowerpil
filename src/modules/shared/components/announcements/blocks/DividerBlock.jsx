import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

export default function DividerBlock({ block }) {
  const { style = 'solid', margin = 'md' } = block;

  return <Divider $style={style} $margin={margin} />;
}

const Divider = styled.hr`
  width: 100%;
  height: 1px;
  border: none;
  background: ${theme.colors.blackAct};
  margin: ${props => theme.spacing[props.$margin] || theme.spacing.md} 0;

  ${props => props.$style === 'dashed' && `
    background: none;
    border-top: 1px dashed ${theme.colors.blackAct};
  `}
`;
