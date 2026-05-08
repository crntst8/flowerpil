import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import PlatformIcon from '@shared/components/PlatformIcon';

export default function IconGridBlock({ block }) {
  const { icons = [], columns = 4, showLabels = false } = block;

  // Handle responsive columns
  const desktopCols = typeof columns === 'object' ? columns.desktop : columns;
  const mobileCols = typeof columns === 'object' ? columns.mobile : Math.min(columns, 3);

  return (
    <IconGrid $desktopCols={desktopCols} $mobileCols={mobileCols}>
      {icons.map((icon, index) => (
        <IconItem key={index}>
          {icon.platform ? (
            <PlatformIcon platform={icon.platform} size={icon.size || 36} />
          ) : icon.src ? (
            <IconImage src={icon.src} alt={icon.label || ''} $size={icon.size || 36} />
          ) : null}
          {showLabels && icon.label && <IconLabel>{icon.label}</IconLabel>}
        </IconItem>
      ))}
    </IconGrid>
  );
}

const IconGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(${props => props.$desktopCols}, 1fr);
  gap: ${theme.spacing.md};
  justify-items: center;
  align-items: center;
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.02);
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: repeat(${props => props.$mobileCols}, 1fr);
    gap: ${theme.spacing.sm};
    padding: ${theme.spacing.sm};
  }
`;

const IconItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.xs};
`;

const IconImage = styled.img`
  width: ${props => props.$size}px;
  height: ${props => props.$size}px;
  object-fit: contain;
  opacity: 0.85;
  transition: all ${theme.transitions.fast};

  &:hover {
    opacity: 1;
    transform: translateY(-2px);
  }
`;

const IconLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  text-transform: lowercase;
  opacity: 0.6;
`;
