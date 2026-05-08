import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

export default function ImageBlock({ block, onAction }) {
  const { src, width, height, alt, alignment, style } = block;

  if (!src) {
    return (
      <Placeholder style={style ? { backgroundColor: style.backgroundColor } : undefined}>
        No image URL set
      </Placeholder>
    );
  }

  return (
    <Container
      $alignment={alignment}
      style={style ? { backgroundColor: style.backgroundColor } : undefined}
    >
      <Image
        src={src}
        alt={alt || ''}
        $width={width}
        $height={height}
      />
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: ${props => {
    switch (props.$alignment) {
      case 'left': return 'flex-start';
      case 'right': return 'flex-end';
      default: return 'center';
    }
  }};
  padding: ${theme.spacing.sm};
`;

const Image = styled.img`
  max-width: 100%;
  width: ${props => props.$width ? `${props.$width}px` : 'auto'};
  height: ${props => props.$height ? `${props.$height}px` : 'auto'};
  object-fit: contain;
`;

const Placeholder = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.lg};
  background: rgba(0, 0, 0, 0.05);
  border: 1px dashed rgba(0, 0, 0, 0.2);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.5);
`;
