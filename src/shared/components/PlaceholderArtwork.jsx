import styled from 'styled-components';
import PropTypes from 'prop-types';
import { useMemo } from 'react';
import { usePlaceholderColor } from '../hooks/usePlaceholderColor';

const FLOWER_IMAGE_PATH = '/placeholder/flower.png';
const FALLBACK_COLOR = '#e5e5e5';

const sizeConfig = {
  small: { flower: '60%', minFlower: '24px' },
  medium: { flower: '55%', minFlower: '40px' },
  large: { flower: '50%', minFlower: '60px' },
};

/**
 * Calculate relative luminance from hex color
 * Returns value 0-255 where higher = brighter
 */
const getLuminance = (hex) => {
  if (!hex) return 200;
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  // Perceived luminance formula
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/**
 * Get flower filter based on background brightness
 * Light backgrounds: darken flower for visibility
 * Dark backgrounds: keep flower light with subtle shadow
 */
const getFlowerFilter = (luminance) => {
  if (luminance > 200) {
    // Very bright - add significant darkening
    return 'brightness(0.6) contrast(1.1) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25))';
  } else if (luminance > 160) {
    // Bright - moderate darkening
    return 'brightness(0.75) contrast(1.05) drop-shadow(0 2px 5px rgba(0, 0, 0, 0.2))';
  } else if (luminance > 120) {
    // Medium - slight adjustment
    return 'brightness(0.9) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15))';
  } else {
    // Dark background - keep flower bright
    return 'brightness(1.05) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))';
  }
};

const PlaceholderArtwork = ({
  itemId,
  previousColorIndex,
  colorIndex,
  size = 'medium',
  borderRadius = '4px',
  className,
}) => {
  const color = usePlaceholderColor(itemId, { previousColorIndex, colorIndex });
  const config = sizeConfig[size] || sizeConfig.medium;
  const bgColor = color?.hex || FALLBACK_COLOR;

  const luminance = useMemo(() => getLuminance(bgColor), [bgColor]);
  const flowerFilter = useMemo(() => getFlowerFilter(luminance), [luminance]);

  return (
    <Container
      $bgColor={bgColor}
      $borderRadius={borderRadius}
      className={className}
      data-color-index={color?.index}
    >
      <NoiseOverlay />
      <FlowerImg
        src={FLOWER_IMAGE_PATH}
        $config={config}
        $filter={flowerFilter}
        alt=""
      />
    </Container>
  );
};

const Container = styled.div`
  width: 100%;
  height: 100%;
  background-color: ${props => props.$bgColor};
  border-radius: ${props => props.$borderRadius};
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  aspect-ratio: 1;
`;

/**
 * Static noise/grain overlay using CSS
 * Creates analog texture without requiring external images
 */
const NoiseOverlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.08;
  mix-blend-mode: overlay;

  /* SVG noise filter as data URI */
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 150px 150px;
`;

const FlowerImg = styled.img`
  width: ${props => props.$config.flower};
  height: auto;
  min-width: ${props => props.$config.minFlower};
  min-height: ${props => props.$config.minFlower};
  object-fit: contain;
  opacity: 0.88;
  filter: ${props => props.$filter};
  position: relative;
  z-index: 1;
`;

PlaceholderArtwork.propTypes = {
  itemId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  previousColorIndex: PropTypes.number,
  colorIndex: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  borderRadius: PropTypes.string,
  className: PropTypes.string,
};

export default PlaceholderArtwork;
