import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';

const PlaceholderColorContext = createContext(null);

const BRIGHTNESS_THRESHOLD = 200;

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


// Hash function for deterministic color selection
const hashString = (str) => {
  let hash = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

export const PlaceholderColorProvider = ({ children }) => {
  const [allColors, setAllColors] = useState([]);
  const [colors, setColors] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const usedIndicesRef = useRef(new Set());
  const colorCacheRef = useRef(new Map());

  // Load colors.json once
  useEffect(() => {
    fetch('/placeholder/colors.json')
      .then(res => res.json())
      .then(data => {
        const fetchedColors = data.colors || [];
        setAllColors(fetchedColors);
        const nonBright = fetchedColors.filter(c => getLuminance(c.hex) <= BRIGHTNESS_THRESHOLD);
        setColors(nonBright.length > 0 ? nonBright : fetchedColors);
        setIsLoaded(true);
      })
      .catch(err => {
        console.error('[PlaceholderColors] Failed to load colors:', err);
        setIsLoaded(true);
      });
  }, []);

  const getColorForItem = useCallback((itemId, previousColorIndex = null) => {
    if (!colors.length) return null;

    // Check cache first for consistency
    const cacheKey = `${itemId}-${previousColorIndex ?? 'none'}`;
    if (colorCacheRef.current.has(cacheKey)) {
      return colorCacheRef.current.get(cacheKey);
    }

    let selectedColor;

    if (previousColorIndex != null) {
      // Harmonization mode: pick from previous color's combinations
      const prevColor = allColors.find(c => c.index === previousColorIndex);
      if (prevColor?.combinations?.length) {
        const available = prevColor.combinations.filter(
          idx => !usedIndicesRef.current.has(idx) && colors.some(c => c.index === idx)
        );
        if (available.length > 0) {
          // Use item ID to deterministically pick from available
          const pickIndex = hashString(itemId) % available.length;
          selectedColor = colors.find(c => c.index === available[pickIndex]);
        }
      }
    }

    if (!selectedColor) {
      // Fallback: deterministic selection based on ID, avoiding used colors
      const hash = hashString(itemId);
      const availableColors = colors.filter(c => !usedIndicesRef.current.has(c.index));

      if (availableColors.length > 0) {
        const index = hash % availableColors.length;
        selectedColor = availableColors[index];
      } else {
        // All colors used, just pick based on hash
        const index = hash % colors.length;
        selectedColor = colors[index];
      }
    }

    // Cache the result
    colorCacheRef.current.set(cacheKey, selectedColor);
    return selectedColor;
  }, [colors, allColors]);

  const markColorUsed = useCallback((index) => {
    usedIndicesRef.current.add(index);
  }, []);

  const resetUsedColors = useCallback(() => {
    usedIndicesRef.current.clear();
    colorCacheRef.current.clear();
  }, []);

  const value = {
    colors,
    isLoaded,
    getColorForItem,
    markColorUsed,
    resetUsedColors,
  };

  return (
    <PlaceholderColorContext.Provider value={value}>
      {children}
    </PlaceholderColorContext.Provider>
  );
};

PlaceholderColorProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const usePlaceholderColors = () => {
  const context = useContext(PlaceholderColorContext);
  if (!context) {
    throw new Error('usePlaceholderColors must be used within PlaceholderColorProvider');
  }
  return context;
};
