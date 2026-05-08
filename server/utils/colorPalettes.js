/**
 * WCAG AA Compliant Color Palettes for pil.bio
 * Curated theme combinations with accessibility validation
 */

import { validateColorCombination, auditThemeAccessibility } from './accessibilityValidator.js';

/**
 * Base WCAG AA compliant color combinations
 * Each palette includes background, text, border, and accent colors
 */
export const COLOR_PALETTES = {
  // Classic themes
  classic_dark: {
    name: 'Classic Dark',
    category: 'classic',
    mood: 'professional',
    colors: {
      backgroundColor: '#000000',
      textColor: '#ffffff',
      borderColor: 'rgba(255,255,255,0.3)',
      accentColor: '#ff3b30'
    },
    description: 'High contrast dark theme, perfect for readability'
  },
  
  classic_light: {
    name: 'Classic Light',
    category: 'classic',
    mood: 'clean',
    colors: {
      backgroundColor: '#ffffff',
      textColor: '#000000',
      borderColor: 'rgba(0,0,0,0.3)',
      accentColor: '#ff3b30'
    },
    description: 'Clean light theme with maximum contrast'
  },
  
  // Professional themes
  slate_professional: {
    name: 'Slate Professional',
    category: 'professional',
    mood: 'corporate',
    colors: {
      backgroundColor: '#1a1a1a',
      textColor: '#e5e5e5',
      borderColor: 'rgba(229,229,229,0.2)',
      accentColor: '#60a5fa'
    },
    description: 'Sophisticated slate theme for professional profiles'
  },
  
  navy_corporate: {
    name: 'Navy Corporate',
    category: 'professional',
    mood: 'trustworthy',
    colors: {
      backgroundColor: '#0f172a',
      textColor: '#f1f5f9',
      borderColor: 'rgba(241,245,249,0.2)',
      accentColor: '#3b82f6'
    },
    description: 'Deep navy theme conveying trust and stability'
  },
  
  charcoal_executive: {
    name: 'Charcoal Executive',
    category: 'professional',
    mood: 'sophisticated',
    colors: {
      backgroundColor: '#1f2937',
      textColor: '#f9fafb',
      borderColor: 'rgba(249,250,251,0.2)',
      accentColor: '#10b981'
    },
    description: 'Premium charcoal theme for executive profiles'
  },
  
  // Artistic themes
  forest_artistic: {
    name: 'Forest Creative',
    category: 'artistic',
    mood: 'natural',
    colors: {
      backgroundColor: '#1a2e1a',
      textColor: '#f0f9f0',
      borderColor: 'rgba(240,249,240,0.25)',
      accentColor: '#4ade80'
    },
    description: 'Earth-toned theme for creative and natural brands'
  },
  
  plum_creative: {
    name: 'Plum Creative',
    category: 'artistic',
    mood: 'artistic',
    colors: {
      backgroundColor: '#2d1b33',
      textColor: '#f3e8ff',
      borderColor: 'rgba(243,232,255,0.25)',
      accentColor: '#a855f7'
    },
    description: 'Rich purple theme for artistic and creative profiles'
  },
  
  wine_sophisticated: {
    name: 'Wine Sophisticated',
    category: 'artistic',
    mood: 'elegant',
    colors: {
      backgroundColor: '#2d1114',
      textColor: '#fdf2f8',
      borderColor: 'rgba(253,242,248,0.25)',
      accentColor: '#ec4899'
    },
    description: 'Deep wine theme for sophisticated creative work'
  },
  
  // Minimal themes
  off_white_minimal: {
    name: 'Off-White Minimal',
    category: 'minimal',
    mood: 'clean',
    colors: {
      backgroundColor: '#fafafa',
      textColor: '#171717',
      borderColor: 'rgba(23,23,23,0.15)',
      accentColor: '#525252'
    },
    description: 'Soft minimal theme with subtle contrasts'
  },
  
  warm_minimal: {
    name: 'Warm Minimal',
    category: 'minimal',
    mood: 'welcoming',
    colors: {
      backgroundColor: '#fefcf3',
      textColor: '#1c1917',
      borderColor: 'rgba(28,25,23,0.15)',
      accentColor: '#a16207'
    },
    description: 'Warm beige minimal theme for approachable profiles'
  },
  
  cool_minimal: {
    name: 'Cool Minimal',
    category: 'minimal',
    mood: 'modern',
    colors: {
      backgroundColor: '#f8fafc',
      textColor: '#0f172a',
      borderColor: 'rgba(15,23,42,0.15)',
      accentColor: '#475569'
    },
    description: 'Cool minimal theme with modern appeal'
  },
  
  // High contrast themes
  stark_contrast: {
    name: 'Stark Contrast',
    category: 'high-contrast',
    mood: 'bold',
    colors: {
      backgroundColor: '#000000',
      textColor: '#ffffff',
      borderColor: '#ffffff',
      accentColor: '#ffff00'
    },
    description: 'Maximum contrast theme for accessibility needs'
  },
  
  inverse_stark: {
    name: 'Inverse Stark',
    category: 'high-contrast',
    mood: 'bold',
    colors: {
      backgroundColor: '#ffffff',
      textColor: '#000000',
      borderColor: '#000000',
      accentColor: '#0066cc'
    },
    description: 'High contrast light theme for enhanced readability'
  },
  
  // Industry-specific themes
  music_neon: {
    name: 'Music Neon',
    category: 'industry',
    mood: 'energetic',
    colors: {
      backgroundColor: '#0a0a0a',
      textColor: '#fafafa',
      borderColor: 'rgba(250,250,250,0.3)',
      accentColor: '#00ff88'
    },
    description: 'Electric theme perfect for musicians and DJs'
  },
  
  art_gallery: {
    name: 'Art Gallery',
    category: 'industry',
    mood: 'refined',
    colors: {
      backgroundColor: '#f7f7f7',
      textColor: '#2c2c2c',
      borderColor: 'rgba(44,44,44,0.2)',
      accentColor: '#8b0000'
    },
    description: 'Gallery-white theme for visual artists and photographers'
  },
  
  tech_terminal: {
    name: 'Tech Terminal',
    category: 'industry',
    mood: 'technical',
    colors: {
      backgroundColor: '#0d1117',
      textColor: '#f0f6fc',
      borderColor: 'rgba(240,246,252,0.2)',
      accentColor: '#58a6ff'
    },
    description: 'Terminal-inspired theme for developers and tech professionals'
  },
  
  // Mood-based themes
  sunset_warm: {
    name: 'Sunset Warm',
    category: 'mood',
    mood: 'warm',
    colors: {
      backgroundColor: '#2d1810',
      textColor: '#fff8f0',
      borderColor: 'rgba(255,248,240,0.25)',
      accentColor: '#f97316'
    },
    description: 'Warm sunset tones for friendly, approachable profiles'
  },
  
  ocean_calm: {
    name: 'Ocean Calm',
    category: 'mood',
    mood: 'calming',
    colors: {
      backgroundColor: '#0c2340',
      textColor: '#f0f9ff',
      borderColor: 'rgba(240,249,255,0.25)',
      accentColor: '#0ea5e9'
    },
    description: 'Calming ocean theme for wellness and lifestyle profiles'
  },
  
  earth_grounded: {
    name: 'Earth Grounded',
    category: 'mood',
    mood: 'natural',
    colors: {
      backgroundColor: '#2b1810',
      textColor: '#faf7f2',
      borderColor: 'rgba(250,247,242,0.25)',
      accentColor: '#d97706'
    },
    description: 'Grounded earth tones for authentic, natural brands'
  }
};

/**
 * Get palettes by category
 * @param {string} category - Category to filter by
 * @returns {Object} Filtered palettes
 */
export const getPalettesByCategory = (category) => {
  return Object.entries(COLOR_PALETTES)
    .filter(([key, palette]) => palette.category === category)
    .reduce((acc, [key, palette]) => {
      acc[key] = palette;
      return acc;
    }, {});
};

/**
 * Get palettes by mood
 * @param {string} mood - Mood to filter by
 * @returns {Object} Filtered palettes
 */
export const getPalettesByMood = (mood) => {
  return Object.entries(COLOR_PALETTES)
    .filter(([key, palette]) => palette.mood === mood)
    .reduce((acc, [key, palette]) => {
      acc[key] = palette;
      return acc;
    }, {});
};

/**
 * Validate all color palettes for accessibility
 * @returns {Object} Validation results for all palettes
 */
export const validateAllPalettes = () => {
  const results = {};
  
  Object.entries(COLOR_PALETTES).forEach(([key, palette]) => {
    results[key] = {
      palette,
      accessibility: auditThemeAccessibility(palette.colors),
      validated: true
    };
  });
  
  return results;
};

/**
 * Get recommended palettes based on criteria
 * @param {Object} criteria - Selection criteria
 * @returns {Array} Array of recommended palettes
 */
export const getRecommendedPalettes = (criteria = {}) => {
  const {
    category = null,
    mood = null,
    highContrast = false,
    accessibility = 'AA'
  } = criteria;
  
  let palettes = Object.entries(COLOR_PALETTES);
  
  // Filter by category
  if (category) {
    palettes = palettes.filter(([key, palette]) => palette.category === category);
  }
  
  // Filter by mood
  if (mood) {
    palettes = palettes.filter(([key, palette]) => palette.mood === mood);
  }
  
  // Filter by high contrast requirement
  if (highContrast) {
    palettes = palettes.filter(([key, palette]) => {
      const validation = validateColorCombination(
        palette.colors.backgroundColor,
        palette.colors.textColor
      );
      return validation.text.contrast >= 7.0; // AAA level
    });
  }
  
  return palettes.map(([key, palette]) => ({
    key,
    ...palette,
    accessibility: auditThemeAccessibility(palette.colors)
  }));
};

/**
 * Create custom palette with accessibility validation
 * @param {Object} colors - Color configuration
 * @param {Object} metadata - Palette metadata
 * @returns {Object} Custom palette with validation
 */
export const createCustomPalette = (colors, metadata = {}) => {
  const {
    name = 'Custom Palette',
    category = 'custom',
    mood = 'personal',
    description = 'Custom color combination'
  } = metadata;
  
  const palette = {
    name,
    category,
    mood,
    colors,
    description,
    custom: true,
    createdAt: new Date().toISOString()
  };
  
  const accessibility = auditThemeAccessibility(colors);
  
  return {
    palette,
    accessibility,
    recommendations: accessibility.accessible ? [] : [
      'Consider adjusting colors for better accessibility compliance',
      'Test with color blindness simulation',
      'Verify contrast ratios meet WCAG AA standards'
    ]
  };
};

/**
 * Generate color variations from a base palette
 * @param {Object} basePalette - Base palette to generate variations from
 * @param {number} variations - Number of variations to generate
 * @returns {Array} Array of palette variations
 */
export const generatePaletteVariations = (basePalette, variations = 5) => {
  const { colors } = basePalette;
  const variationResults = [];
  
  // Generate subtle variations by adjusting lightness
  const adjustments = [-15, -8, 0, 8, 15];
  
  adjustments.slice(0, variations).forEach((adjustment, index) => {
    if (adjustment === 0) {
      // Original palette
      variationResults.push({
        ...basePalette,
        key: `${basePalette.name.toLowerCase().replace(/\s+/g, '_')}_original`,
        variation: 'original'
      });
      return;
    }
    
    // Adjust colors slightly
    const adjustColor = (hex, amount) => {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = Math.max(0, Math.min(255, (num >> 16) + amount));
      const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
      const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
      return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
    };
    
    const adjustedColors = {
      ...colors,
      backgroundColor: adjustColor(colors.backgroundColor, adjustment),
      textColor: adjustColor(colors.textColor, -adjustment) // Opposite adjustment for contrast
    };
    
    // Validate the adjusted palette
    const accessibility = auditThemeAccessibility(adjustedColors);
    
    if (accessibility.accessible) {
      variationResults.push({
        ...basePalette,
        name: `${basePalette.name} ${adjustment > 0 ? 'Light' : 'Dark'}`,
        key: `${basePalette.name.toLowerCase().replace(/\s+/g, '_')}_${adjustment > 0 ? 'light' : 'dark'}`,
        colors: adjustedColors,
        variation: adjustment > 0 ? 'lighter' : 'darker',
        accessibility
      });
    }
  });
  
  return variationResults;
};

/**
 * Get palette categories with counts
 * @returns {Object} Categories with palette counts
 */
export const getPaletteCategories = () => {
  const categories = {};
  
  Object.values(COLOR_PALETTES).forEach(palette => {
    if (!categories[palette.category]) {
      categories[palette.category] = {
        name: palette.category.charAt(0).toUpperCase() + palette.category.slice(1),
        count: 0,
        moods: new Set()
      };
    }
    categories[palette.category].count++;
    categories[palette.category].moods.add(palette.mood);
  });
  
  // Convert mood sets to arrays
  Object.keys(categories).forEach(category => {
    categories[category].moods = Array.from(categories[category].moods);
  });
  
  return categories;
};

/**
 * Export validated palettes for use in themes
 * @returns {Object} All palettes with accessibility validation
 */
export const getValidatedPalettes = () => {
  const validated = {};
  
  Object.entries(COLOR_PALETTES).forEach(([key, palette]) => {
    const accessibility = auditThemeAccessibility(palette.colors);
    validated[key] = {
      ...palette,
      key,
      accessibility,
      validated: accessibility.accessible,
      score: accessibility.overallScore
    };
  });
  
  return validated;
};

export default {
  COLOR_PALETTES,
  getPalettesByCategory,
  getPalettesByMood,
  validateAllPalettes,
  getRecommendedPalettes,
  createCustomPalette,
  generatePaletteVariations,
  getPaletteCategories,
  getValidatedPalettes
};