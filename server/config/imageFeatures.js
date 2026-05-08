/**
 * Image Optimization Feature Flags
 *
 * Controls which image optimization features are enabled
 * Set via environment variables for gradual rollout
 */

export const IMAGE_FEATURES = {
  // Phase 1: Next-Gen Format Support
  GENERATE_WEBP: process.env.FEATURE_GENERATE_WEBP !== 'false', // Default: true
  GENERATE_AVIF: process.env.FEATURE_GENERATE_AVIF !== 'false', // Default: true

  // Phase 2: Responsive Image Delivery
  USE_RESPONSIVE_IMAGES: process.env.FEATURE_RESPONSIVE_IMAGES === 'true', // Default: false (opt-in)

  // Phase 3: Image Cleanup
  CLEANUP_ENABLED: process.env.FEATURE_IMAGE_CLEANUP === 'true', // Default: false (opt-in)
  AUTO_CLEANUP_IMAGES: process.env.AUTO_CLEANUP_IMAGES === 'true', // Default: false (manual only)

  // Phase 4: Retina Support
  GENERATE_RETINA: process.env.FEATURE_GENERATE_RETINA === 'true', // Default: false (opt-in)
};

/**
 * Get list of formats to generate based on feature flags
 * @returns {Array<string>} Array of format names
 */
export function getEnabledFormats() {
  const formats = ['jpeg']; // Always generate JPEG for backward compatibility

  if (IMAGE_FEATURES.GENERATE_WEBP) {
    formats.push('webp');
  }

  if (IMAGE_FEATURES.GENERATE_AVIF) {
    formats.push('avif');
  }

  return formats;
}

/**
 * Check if a specific feature is enabled
 * @param {string} featureName - Name of the feature
 * @returns {boolean}
 */
export function isFeatureEnabled(featureName) {
  return IMAGE_FEATURES[featureName] === true;
}

/**
 * Log current feature flag status
 */
export function logFeatureStatus() {
  console.log('📸 Image Optimization Features:');
  console.log('  WebP Generation:', IMAGE_FEATURES.GENERATE_WEBP ? '✅' : '❌');
  console.log('  AVIF Generation:', IMAGE_FEATURES.GENERATE_AVIF ? '✅' : '❌');
  console.log('  Responsive Images:', IMAGE_FEATURES.USE_RESPONSIVE_IMAGES ? '✅' : '❌');
  console.log('  Image Cleanup:', IMAGE_FEATURES.CLEANUP_ENABLED ? '✅' : '❌');
  console.log('  Auto Cleanup:', IMAGE_FEATURES.AUTO_CLEANUP_IMAGES ? '✅' : '❌');
  console.log('  Retina Support:', IMAGE_FEATURES.GENERATE_RETINA ? '✅' : '❌');
  console.log('  Enabled Formats:', getEnabledFormats().join(', '));
}

export default IMAGE_FEATURES;
