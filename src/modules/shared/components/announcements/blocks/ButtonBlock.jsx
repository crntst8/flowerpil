import React from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';

export default function ButtonBlock({ block, onAction }) {
  const { label, action, url, variant = 'primary' } = block;

  const handleClick = () => {
    if (onAction) {
      onAction({ action, url, label });
    }
  };

  return (
    <ButtonWrapper>
      <Button variant={variant} onClick={handleClick}>
        {label}
      </Button>
    </ButtonWrapper>
  );
}

const ButtonWrapper = styled.div`
  display: flex;
  justify-content: center;
`;
