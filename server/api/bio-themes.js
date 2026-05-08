/**
 * Bio Theme Management API
 * Handles theme selection, customization, and accessibility validation
 */

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { 
  validateColorCombination, 
  auditThemeAccessibility,
  testColorBlindnessAccessibility,
  generateAccessibleAlternatives
} from '../utils/accessibilityValidator.js';
import {
  COLOR_PALETTES,
  getPalettesByCategory,
  getPalettesByMood,
  getRecommendedPalettes,
  createCustomPalette,
  generatePaletteVariations,
  getPaletteCategories,
  getValidatedPalettes
} from '../utils/colorPalettes.js';

const router = express.Router();

// Apply logging middleware
router.use(apiLoggingMiddleware);

// ACCESSIBILITY VALIDATION ENDPOINTS

// POST /api/v1/bio-themes/validate - Validate color combination
router.post('/validate', async (req, res) => {
  try {
    const { backgroundColor, textColor, borderColor, accentColor } = req.body;
    
    if (!backgroundColor || !textColor) {
      return res.status(400).json({
        error: 'Background color and text color are required',
        required: ['backgroundColor', 'textColor']
      });
    }

    // Validate main color combination
    const mainValidation = validateColorCombination(backgroundColor, textColor, borderColor);
    
    // Validate accent color if provided
    let accentValidation = null;
    if (accentColor) {
      accentValidation = validateColorCombination(backgroundColor, accentColor);
    }

    // Test color blindness accessibility
    const colorBlindnessTest = testColorBlindnessAccessibility(backgroundColor, textColor);

    // Generate alternatives if validation fails
    let alternatives = null;
    if (!mainValidation.valid) {
      alternatives = {
        text: generateAccessibleAlternatives(textColor, backgroundColor),
        background: generateAccessibleAlternatives(backgroundColor, textColor)
      };
    }

    res.json({
      success: true,
      data: {
        main: mainValidation,
        accent: accentValidation,
        colorBlindness: colorBlindnessTest,
        alternatives,
        overall: {
          accessible: mainValidation.valid && colorBlindnessTest.overallAccessible,
          score: mainValidation.score,
          grade: mainValidation.overallGrade,
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error validating color combination:', error);
    res.status(500).json({ error: 'Failed to validate color combination' });
  }
});

// POST /api/v1/bio-themes/audit - Complete theme accessibility audit
router.post('/audit', async (req, res) => {
  try {
    const themeConfig = req.body;
    
    if (!themeConfig.backgroundColor || !themeConfig.textColor) {
      return res.status(400).json({
        error: 'Theme configuration must include backgroundColor and textColor'
      });
    }

    const audit = auditThemeAccessibility(themeConfig);
    
    res.json({
      success: true,
      data: {
        audit,
        recommendations: audit.accessible ? 
          ['Theme meets accessibility standards'] :
          [
            'Improve contrast ratios for text readability',
            'Test with color blindness simulation',
            'Consider using high-contrast alternatives'
          ]
      }
    });
  } catch (error) {
    console.error('Error auditing theme accessibility:', error);
    res.status(500).json({ error: 'Failed to audit theme accessibility' });
  }
});

// COLOR PALETTE ENDPOINTS

// GET /api/v1/bio-themes/palettes - Get all color palettes
router.get('/palettes', async (req, res) => {
  try {
    const { category, mood, highContrast, includeValidation } = req.query;
    
    let palettes;
    
    if (category || mood || highContrast === 'true') {
      // Get filtered/recommended palettes
      palettes = getRecommendedPalettes({
        category,
        mood,
        highContrast: highContrast === 'true'
      });
    } else {
      // Get all palettes
      palettes = includeValidation === 'true' ? 
        Object.values(getValidatedPalettes()) :
        Object.entries(COLOR_PALETTES).map(([key, palette]) => ({ key, ...palette }));
    }

    const categories = getPaletteCategories();

    res.json({
      success: true,
      data: {
        palettes,
        categories,
        total: palettes.length,
        filters: {
          category: category || null,
          mood: mood || null,
          highContrast: highContrast === 'true'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching color palettes:', error);
    res.status(500).json({ error: 'Failed to fetch color palettes' });
  }
});

// GET /api/v1/bio-themes/palettes/:key - Get specific palette
router.get('/palettes/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { variations } = req.query;
    
    const palette = COLOR_PALETTES[key];
    if (!palette) {
      return res.status(404).json({ error: 'Palette not found' });
    }

    // Get accessibility validation
    const accessibility = auditThemeAccessibility(palette.colors);
    
    let paletteVariations = null;
    if (variations === 'true') {
      paletteVariations = generatePaletteVariations(palette);
    }

    res.json({
      success: true,
      data: {
        palette: {
          key,
          ...palette,
          accessibility
        },
        variations: paletteVariations
      }
    });
  } catch (error) {
    console.error('Error fetching palette:', error);
    res.status(500).json({ error: 'Failed to fetch palette' });
  }
});

// GET /api/v1/bio-themes/categories - Get palette categories
router.get('/categories', async (req, res) => {
  try {
    const categories = getPaletteCategories();
    
    res.json({
      success: true,
      data: {
        categories,
        total: Object.keys(categories).length
      }
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// CUSTOM THEME ENDPOINTS

// POST /api/v1/bio-themes/custom - Create custom theme
router.post('/custom', authMiddleware, async (req, res) => {
  try {
    const { colors, metadata } = req.body;
    
    if (!colors || !colors.backgroundColor || !colors.textColor) {
      return res.status(400).json({
        error: 'Colors configuration is required',
        required: {
          colors: {
            backgroundColor: 'string (hex)',
            textColor: 'string (hex)',
            borderColor: 'string (optional)',
            accentColor: 'string (optional)'
          }
        }
      });
    }

    const customPalette = createCustomPalette(colors, {
      ...metadata,
      createdBy: req.user.id,
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Custom theme created successfully',
      data: customPalette
    });
  } catch (error) {
    console.error('Error creating custom theme:', error);
    res.status(500).json({ error: 'Failed to create custom theme' });
  }
});

// THEME RECOMMENDATIONS ENDPOINT

// POST /api/v1/bio-themes/recommend - Get theme recommendations
router.post('/recommend', async (req, res) => {
  try {
    const {
      profileType = null,
      industry = null,
      mood = null,
      accessibility = 'AA',
      customPreferences = {}
    } = req.body;

    let criteria = { accessibility };

    // Map profile types to categories
    const profileCategoryMap = {
      'artist': 'artistic',
      'musician': 'industry',
      'developer': 'industry',
      'photographer': 'artistic',
      'writer': 'minimal',
      'business': 'professional',
      'corporate': 'professional'
    };

    if (profileType && profileCategoryMap[profileType]) {
      criteria.category = profileCategoryMap[profileType];
    }

    if (mood) {
      criteria.mood = mood;
    }

    // Get high contrast themes for accessibility needs
    if (customPreferences.highContrast) {
      criteria.highContrast = true;
    }

    const recommendations = getRecommendedPalettes(criteria);

    // Sort by accessibility score and relevance
    const sortedRecommendations = recommendations
      .sort((a, b) => {
        // Prioritize accessibility score
        if (b.accessibility.overallScore !== a.accessibility.overallScore) {
          return b.accessibility.overallScore - a.accessibility.overallScore;
        }
        // Then by category match
        if (criteria.category) {
          const aMatch = a.category === criteria.category ? 1 : 0;
          const bMatch = b.category === criteria.category ? 1 : 0;
          return bMatch - aMatch;
        }
        return 0;
      })
      .slice(0, 8); // Top 8 recommendations

    res.json({
      success: true,
      data: {
        recommendations: sortedRecommendations,
        criteria,
        total: sortedRecommendations.length,
        reasoning: {
          profileType,
          industry,
          mood,
          accessibilityLevel: accessibility,
          sortedBy: ['accessibility_score', 'category_match', 'mood_match']
        }
      }
    });
  } catch (error) {
    console.error('Error generating theme recommendations:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// THEME TESTING ENDPOINTS

// POST /api/v1/bio-themes/test/colorblind - Test theme with color blindness simulation
router.post('/test/colorblind', async (req, res) => {
  try {
    const { backgroundColor, textColor } = req.body;
    
    if (!backgroundColor || !textColor) {
      return res.status(400).json({
        error: 'Background color and text color are required'
      });
    }

    const colorBlindnessTest = testColorBlindnessAccessibility(backgroundColor, textColor);
    
    res.json({
      success: true,
      data: {
        test: colorBlindnessTest,
        recommendations: colorBlindnessTest.overallAccessible ? 
          ['Theme is accessible for all color vision types'] :
          [
            `Theme may be difficult for people with: ${colorBlindnessTest.summary.issuesFor.join(', ')}`,
            'Consider adjusting colors for better universal accessibility',
            'Test with actual users who have color vision differences'
          ]
      }
    });
  } catch (error) {
    console.error('Error testing color blindness accessibility:', error);
    res.status(500).json({ error: 'Failed to test color blindness accessibility' });
  }
});

// POST /api/v1/bio-themes/generate-alternatives - Generate accessible alternatives
router.post('/generate-alternatives', async (req, res) => {
  try {
    const { baseColor, contrastColor, type = 'both' } = req.body;
    
    if (!baseColor || !contrastColor) {
      return res.status(400).json({
        error: 'Base color and contrast color are required'
      });
    }

    const alternatives = {};
    
    if (type === 'both' || type === 'darker') {
      alternatives.darker = generateAccessibleAlternatives(baseColor, contrastColor, true);
    }
    
    if (type === 'both' || type === 'lighter') {
      alternatives.lighter = generateAccessibleAlternatives(baseColor, contrastColor, false);
    }

    const totalAlternatives = Object.values(alternatives).reduce((sum, arr) => sum + arr.length, 0);

    res.json({
      success: true,
      data: {
        alternatives,
        originalColors: { baseColor, contrastColor },
        totalAlternatives,
        type
      }
    });
  } catch (error) {
    console.error('Error generating alternatives:', error);
    res.status(500).json({ error: 'Failed to generate color alternatives' });
  }
});

export default router;