import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

export default function ParagraphBlock({ block }) {
  const { content, alignment = 'center', color, fontWeight = 'regular' } = block;

  return (
    <Paragraph
      $alignment={alignment}
      $color={color}
      $fontWeight={fontWeight}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

const Paragraph = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  text-align: ${props => props.$alignment};
  color: ${props => props.$color || theme.colors.black};
  font-weight: ${props => theme.fontWeights[props.$fontWeight] || theme.fontWeights.regular};
  line-height: 1.6;
  opacity: 0.9;

  b, strong {
    font-weight: ${theme.fontWeights.bold};
  }

  a {
    color: inherit;
    text-decoration: underline;
  }
`;
