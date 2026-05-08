import React, { useState } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/GlobalStyles';

/**
 * IconWithFallback
 *
 * Simple icon component with Unicode flower fallback
 * - Displays icon from src URL
 * - On error or missing src: shows ✿ (U+273F) fallback
 * - No ResponsiveImage complexity (icons are small, single-format PNG)
 * - Optimized for playlist custom action icons
 */

const IconWithFallback = ({ src, alt, size = 28, className }) => {
  const [failed, setFailed] = useState(false);

  // Show fallback if no src or if load failed
  if (!src || failed) {
    return (
      <FallbackIcon size={size} className={className} title={alt || 'Icon'}>
        ✿
      </FallbackIcon>
    );
  }

  return (
    <IconImg
      src={src}
      alt={alt || 'Icon'}
      onError={() => setFailed(true)}
      width={size}
      height={size}
      className={className}
    />
  );
};

// Styled Components

const IconImg = styled.img`
  width: ${props => props.width}px;
  height: ${props => props.height}px;
  object-fit: contain;
  display: block;
`;

const FallbackIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  font-size: ${props => props.size * 0.8}px;
  color: ${theme.colors.black};
  opacity: 0.6;
  user-select: none;
`;

export default IconWithFallback;
