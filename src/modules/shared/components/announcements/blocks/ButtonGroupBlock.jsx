import React from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';

export default function ButtonGroupBlock({ block, onAction }) {
  const { buttons = [] } = block;

  const handleClick = (button) => {
    if (onAction) {
      onAction({ action: button.action, url: button.url, label: button.label });
    }
  };

  return (
    <ButtonGroup>
      {buttons.map((button, index) => (
        <Button
          key={index}
          variant={button.variant || 'secondary'}
          onClick={() => handleClick(button)}
          style={{ flex: 1 }}
        >
          {button.label}
        </Button>
      ))}
    </ButtonGroup>
  );
}

const ButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.md};

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
  }
`;
