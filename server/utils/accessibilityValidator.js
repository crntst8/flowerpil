/**
 * Accessibility Validation Engine for pil.bio
 * WCAG AA compliance checking, contrast ratio calculations, and accessibility testing
 */

/**
 * Convert hex color to RGB values
 * @param {string} hex - Hex color code (#ffffff or ffffff)
 * @returns {Object} RGB values {r, g, b}
 */
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

/**
 * Convert RGB to relative luminance
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)  
 * @param {number} b - Blue value (0-255)
 * @returns {number} Relative luminance (0-1)
 */
const getRelativeLuminance = (r, g, b) => {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

/**
 * Calculate contrast ratio between two colors
 * @param {string} color1 - First color (hex)
 * @param {string} color2 - Second color (hex)
 * @returns {number} Contrast ratio (1-21)
 */
export const getContrastRatio = (color1, color2) => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  
  if (!rgb1 || !rgb2) {
    throw new Error('Invalid hex color format');
  }
  
  const lum1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
  
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  
  return (brightest + 0.05) / (darkest + 0.05);
};

/**
 * Check if contrast ratio meets WCAG standards
 * @param {number} contrastRatio - Contrast ratio
 * @param {string} level - WCAG level ('AA' or 'AAA')
 * @param {boolean} isLargeText - Whether text is considered large (18pt+ bold or 24pt+)
 * @returns {Object} Compliance status
 */
export const checkWCAGCompliance = (contrastRatio, level = 'AA', isLargeText = false) => {
  const requirements = {
    AA: {
      normal: 4.5,
      large: 3.0
    },
    AAA: {
      normal: 7.0,
      large: 4.5
    }
  };
  
  const required = requirements[level][isLargeText ? 'large' : 'normal'];
  const passes = contrastRatio >= required;
  
  return {
    passes,
    level,
    contrastRatio: Math.round(contrastRatio * 100) / 100,
    required,
    isLargeText,
    grade: passes ? (level === 'AAA' ? 'AAA' : 'AA') : 'FAIL'
  };
};

/**
 * Validate color combination for accessibility
 * @param {string} backgroundColor - Background color (hex)
 * @param {string} textColor - Text color (hex)
 * @param {string} borderColor - Border color (hex)
 * @returns {Object} Comprehensive accessibility validation
 */
export const validateColorCombination = (backgroundColor, textColor, borderColor = null) => {
  try {
    // Calculate contrast ratios
    const textContrast = getContrastRatio(backgroundColor, textColor);
    const borderContrast = borderColor ? getContrastRatio(backgroundColor, borderColor) : null;
    
    // Check WCAG compliance
    const textComplianceAA = checkWCAGCompliance(textContrast, 'AA', false);
    const textComplianceAAA = checkWCAGCompliance(textContrast, 'AAA', false);
    const textComplianceLarge = checkWCAGCompliance(textContrast, 'AA', true);
    
    const borderCompliance = borderColor ? {
      AA: checkWCAGCompliance(borderContrast, 'AA', false),
      largeAA: checkWCAGCompliance(borderContrast, 'AA', true)
    } : null;
    
    // Overall accessibility score (0-100)
    let score = 0;
    if (textComplianceAA.passes) score += 40;
    if (textComplianceAAA.passes) score += 20;
    if (textComplianceLarge.passes) score += 20;
    if (borderCompliance?.AA?.passes) score += 10;
    if (borderCompliance?.largeAA?.passes) score += 10;
    
    // Determine overall grade
    let overallGrade = 'FAIL';
    if (textComplianceAA.passes) overallGrade = 'AA';
    if (textComplianceAAA.passes && (!borderCompliance || borderCompliance.AA.passes)) overallGrade = 'AAA';
    
    return {
      valid: textComplianceAA.passes,
      score,
      overallGrade,
      text: {
        contrast: textContrast,
        complianceAA: textComplianceAA,
        complianceAAA: textComplianceAAA,
        complianceLarge: textComplianceLarge
      },
      border: borderCompliance,
      colors: {
        background: backgroundColor,
        text: textColor,
        border: borderColor
      },
      recommendations: generateAccessibilityRecommendations(textComplianceAA, borderCompliance)
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      score: 0,
      overallGrade: 'ERROR'
    };
  }
};

/**
 * Generate accessibility improvement recommendations
 * @param {Object} textCompliance - Text compliance results
 * @param {Object} borderCompliance - Border compliance results
 * @returns {Array} Array of recommendation objects
 */
const generateAccessibilityRecommendations = (textCompliance, borderCompliance) => {
  const recommendations = [];
  
  if (!textCompliance.passes) {
    recommendations.push({
      type: 'contrast',
      severity: 'high',
      message: `Text contrast ratio ${textCompliance.contrastRatio}:1 does not meet WCAG AA standard (${textCompliance.required}:1 required)`,
      suggestion: 'Use darker text on light backgrounds or lighter text on dark backgrounds'
    });
  }
  
  if (borderCompliance && !borderCompliance.AA.passes) {
    recommendations.push({
      type: 'border',
      severity: 'medium',
      message: `Border contrast may be too low for accessibility`,
      suggestion: 'Consider using a border color with higher contrast against the background'
    });
  }
  
  if (textCompliance.passes && !textCompliance.complianceAAA?.passes) {
    recommendations.push({
      type: 'enhancement',
      severity: 'low',
      message: 'Consider improving contrast for AAA compliance',
      suggestion: 'Increase contrast ratio for better accessibility'
    });
  }
  
  return recommendations;
};

/**
 * Simulate color blindness for accessibility testing
 * @param {string} hexColor - Color to simulate (hex)
 * @param {string} type - Type of color blindness ('protanopia', 'deuteranopia', 'tritanopia')
 * @returns {string} Simulated color (hex)
 */
export const simulateColorBlindness = (hexColor, type) => {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return hexColor;
  
  let { r, g, b } = rgb;
  
  // Normalize to 0-1
  r /= 255;
  g /= 255;
  b /= 255;
  
  // Apply color blindness simulation matrices
  let newR, newG, newB;
  
  switch (type) {
    case 'protanopia': // Red-blind
      newR = 0.567 * r + 0.433 * g;
      newG = 0.558 * r + 0.442 * g;
      newB = 0.242 * g + 0.758 * b;
      break;
    case 'deuteranopia': // Green-blind
      newR = 0.625 * r + 0.375 * g;
      newG = 0.7 * r + 0.3 * g;
      newB = 0.3 * g + 0.7 * b;
      break;
    case 'tritanopia': // Blue-blind
      newR = 0.95 * r + 0.05 * g;
      newG = 0.433 * g + 0.567 * b;
      newB = 0.475 * g + 0.525 * b;
      break;
    default:
      return hexColor;
  }
  
  // Clamp and convert back to 0-255
  newR = Math.max(0, Math.min(1, newR)) * 255;
  newG = Math.max(0, Math.min(1, newG)) * 255;
  newB = Math.max(0, Math.min(1, newB)) * 255;
  
  // Convert back to hex
  const toHex = (c) => Math.round(c).toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
};

/**
 * Test color combination against color blindness
 * @param {string} backgroundColor - Background color (hex)
 * @param {string} textColor - Text color (hex)
 * @returns {Object} Color blindness accessibility results
 */
export const testColorBlindnessAccessibility = (backgroundColor, textColor) => {
  const colorBlindnessTypes = ['protanopia', 'deuteranopia', 'tritanopia'];
  const results = {};
  
  colorBlindnessTypes.forEach(type => {
    const simulatedBg = simulateColorBlindness(backgroundColor, type);
    const simulatedText = simulateColorBlindness(textColor, type);
    const contrast = getContrastRatio(simulatedBg, simulatedText);
    const compliance = checkWCAGCompliance(contrast);
    
    results[type] = {
      simulatedBackground: simulatedBg,
      simulatedText: simulatedText,
      contrast,
      compliance,
      accessible: compliance.passes
    };
  });
  
  const overallAccessible = Object.values(results).every(r => r.accessible);
  
  return {
    overallAccessible,
    results,
    summary: {
      accessibleFor: colorBlindnessTypes.filter(type => results[type].accessible),
      issuesFor: colorBlindnessTypes.filter(type => !results[type].accessible)
    }
  };
};

/**
 * Generate accessible color alternatives
 * @param {string} baseColor - Base color to generate alternatives for (hex)
 * @param {string} contrastColor - Color to maintain contrast with (hex)
 * @param {boolean} darken - Whether to darken (true) or lighten (false) the base color
 * @returns {Array} Array of accessible color alternatives
 */
export const generateAccessibleAlternatives = (baseColor, contrastColor, darken = true) => {
  const alternatives = [];
  const rgb = hexToRgb(baseColor);
  if (!rgb) return alternatives;
  
  // Generate variations by adjusting lightness
  const steps = darken ? [-20, -40, -60, -80] : [20, 40, 60, 80];
  
  steps.forEach(step => {
    const newR = Math.max(0, Math.min(255, rgb.r + step));
    const newG = Math.max(0, Math.min(255, rgb.g + step));
    const newB = Math.max(0, Math.min(255, rgb.b + step));
    
    const toHex = (c) => Math.round(c).toString(16).padStart(2, '0');
    const newColor = `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
    
    try {
      const contrast = getContrastRatio(newColor, contrastColor);
      const compliance = checkWCAGCompliance(contrast);
      
      if (compliance.passes) {
        alternatives.push({
          color: newColor,
          contrast,
          compliance,
          lightness: step > 0 ? 'lighter' : 'darker'
        });
      }
    } catch (error) {
      // Skip invalid colors
    }
  });
  
  return alternatives.sort((a, b) => b.contrast - a.contrast);
};

/**
 * Complete accessibility audit for bio page theme
 * @param {Object} theme - Theme configuration object
 * @returns {Object} Comprehensive accessibility audit results
 */
export const auditThemeAccessibility = (theme) => {
  const {
    backgroundColor = '#000000',
    textColor = '#ffffff',
    borderColor = 'rgba(255,255,255,0.3)',
    accentColor = '#ff3b30'
  } = theme;
  
  // Convert rgba to hex for border color (approximate)
  const solidBorderColor = borderColor.includes('rgba') ? '#4d4d4d' : borderColor;
  
  const results = {
    timestamp: new Date().toISOString(),
    theme,
    tests: {}
  };
  
  // Test main color combinations
  results.tests.mainColors = validateColorCombination(backgroundColor, textColor, solidBorderColor);
  results.tests.accentColors = validateColorCombination(backgroundColor, accentColor);
  results.tests.colorBlindness = testColorBlindnessAccessibility(backgroundColor, textColor);
  
  // Generate alternatives if needed
  if (!results.tests.mainColors.valid) {
    results.alternatives = {
      text: generateAccessibleAlternatives(textColor, backgroundColor),
      background: generateAccessibleAlternatives(backgroundColor, textColor)
    };
  }
  
  // Calculate overall accessibility score
  const scores = [
    results.tests.mainColors.score,
    results.tests.accentColors.score,
    results.tests.colorBlindness.overallAccessible ? 20 : 0
  ];
  
  results.overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / 3);
  results.overallGrade = results.overallScore >= 80 ? 'AA' : results.overallScore >= 60 ? 'Partial' : 'FAIL';
  results.accessible = results.tests.mainColors.valid && results.tests.colorBlindness.overallAccessible;
  
  return results;
};

export default {
  getContrastRatio,
  checkWCAGCompliance,
  validateColorCombination,
  simulateColorBlindness,
  testColorBlindnessAccessibility,
  generateAccessibleAlternatives,
  auditThemeAccessibility
};