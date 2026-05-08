/**
 * DividerBlock Component
 *
 * Simple horizontal divider block for the feature editor.
 */

import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { visuals } from '../../../styles/featureStyles.js';

const DividerBlock = ({ block, onDelete }) => {
  return (
    <Container>
      <DeleteButton onClick={() => onDelete(block.id)} title="Delete block">
        x
      </DeleteButton>
      <DividerLine />
    </Container>
  );
};

const Container = styled.div`
  position: relative;
  padding: 32px 0;

  &:hover > button {
    opacity: 1;
  }
`;

const DeleteButton = styled.button`
  position: absolute;
  top: 50%;
  right: -32px;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid ${theme.colors.danger};
  color: ${theme.colors.danger};
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.danger};
    color: ${theme.colors.fpwhite};
  }
`;

const DividerLine = styled.hr`
  border: none;
  border-top: ${visuals.dividerWidth} solid ${visuals.dividerColor};
  margin: 0;
`;

export default DividerBlock;
