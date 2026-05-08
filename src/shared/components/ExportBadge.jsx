import React from 'react';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import PlatformIcon from './PlatformIcon';

const BadgeContainer = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #1e40af;
  font-weight: ${theme.fontWeights.semibold};
  flex-shrink: 0;
`;

const PlatformList = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const BadgeLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

/**
 * ExportBadge Component
 * 
 * Displays export readiness indicator for playlist cards.
 * Shows which platforms have export-ready tracks.
 * 
 * @param {Object} props
 * @param {Array<string>} props.platforms - Array of platform keys that are export-ready (e.g., ['spotify', 'apple', 'tidal'])
 * @param {boolean} props.hasExports - Whether playlist has existing exports
 */
export const ExportBadge = ({ platforms = [], hasExports = false }) => {
  if (!platforms || platforms.length === 0) {
    if (hasExports) {
      return (
        <BadgeContainer>
          <BadgeLabel>Exported</BadgeLabel>
        </BadgeContainer>
      );
    }
    return null;
  }

  const platformLabels = {
    spotify: 'Spotify',
    apple: 'Apple',
    tidal: 'TIDAL'
  };

  return (
    <BadgeContainer>
      <BadgeLabel>AVAIL:</BadgeLabel>
      <PlatformList>
        {platforms.slice(0, 3).map((platform) => (
          <PlatformIcon
            key={platform}
            platform={platform}
            size={14}
            inline
          />
        ))}
        {platforms.length > 3 && (
          <span style={{ fontSize: '10px', opacity: 0.7 }}>+{platforms.length - 3}</span>
        )}
      </PlatformList>
    </BadgeContainer>
  );
};

export default ExportBadge;

