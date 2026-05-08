import { useMemo, useEffect } from 'react';
import { usePlaceholderColors } from '../contexts/PlaceholderColorContext';

const normalizeColorIndex = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const usePlaceholderColor = (itemId, options = {}) => {
  const { previousColorIndex = null, autoMark = true, colorIndex = null } = options;
  const { isLoaded, getColorForItem, markColorUsed, colors } = usePlaceholderColors();
  const resolvedColorIndex = normalizeColorIndex(colorIndex);

  const color = useMemo(() => {
    if (!isLoaded) return null;
    if (resolvedColorIndex != null) {
      const forced = colors.find((entry) => entry.index === resolvedColorIndex);
      if (forced) return forced;
    }
    if (!itemId) return null;
    return getColorForItem(itemId, previousColorIndex);
  }, [itemId, previousColorIndex, isLoaded, getColorForItem, colors, resolvedColorIndex]);

  useEffect(() => {
    if (autoMark && color?.index != null) {
      markColorUsed(color.index);
    }
  }, [autoMark, color?.index, markColorUsed]);

  return color;
};
