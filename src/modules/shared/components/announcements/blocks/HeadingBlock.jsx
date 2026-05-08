import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

export default function HeadingBlock({ block }) {
  const { content, size = 'h2', alignment = 'center', color } = block;

  return (
    <Heading
      as={size}
      $size={size}
      $alignment={alignment}
      $color={color}
    >
      {content}
    </Heading>
  );
}

const Heading = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.primary};
  text-align: ${props => props.$alignment};
  color: ${props => props.$color || theme.colors.black};
  letter-spacing: -0.5px;
  line-height: 1.2;

  ${props => props.$size === 'h1' && `
    font-size: ${theme.fontSizes.h1};
    font-weight: ${theme.fontWeights.bold};
  `}

  ${props => props.$size === 'h2' && `
    font-size: ${theme.fontSizes.h2};
    font-weight: ${theme.fontWeights.bold};
  `}

  ${props => props.$size === 'h3' && `
    font-size: ${theme.fontSizes.h3};
    font-weight: ${theme.fontWeights.medium};
  `}
`;
