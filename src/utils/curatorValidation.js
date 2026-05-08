// Validation utilities for curator profile data
// Provides runtime validation for forms and API requests

/**
 * Valid release types
 */
export const RELEASE_TYPES = ['Album', 'EP', 'Live Recording', 'Remix', 'Single'];

/**
 * Valid featured content kinds
 */
export const FEATURED_CONTENT_KINDS = ['SingleDSP', 'AudioUpload', 'MusicVideo'];

/**
 * Valid sale indicators
 */
export const SALE_INDICATORS = ['ON_SALE', 'FIFTY_SOLD', 'SOLD_OUT'];

/**
 * Validate release form data
 * @param {import('../types/curator.js').ReleaseFormData} data 
 * @returns {import('../types/curator.js').ValidationResult}
 */
export const validateReleaseData = (data) => {
  const errors = [];

  // Required fields
  if (!data.title?.trim()) {
    errors.push({ field: 'title', message: 'Release title is required' });
  }

  if (!data.releaseDate) {
    errors.push({ field: 'releaseDate', message: 'Release date is required' });
  } else {
    // Validate date format and future date
    const releaseDate = new Date(data.releaseDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(releaseDate.getTime())) {
      errors.push({ field: 'releaseDate', message: 'Invalid release date format' });
    }
    // Note: Release date can be in the past (for already released music)
    // or future (for upcoming releases). No temporal validation needed.
  }

  // Optional field validation
  if (data.releaseType && !RELEASE_TYPES.includes(data.releaseType)) {
    errors.push({ field: 'releaseType', message: 'Invalid release type' });
  }

  if (data.featuredKind && !FEATURED_CONTENT_KINDS.includes(data.featuredKind)) {
    errors.push({ field: 'featuredKind', message: 'Invalid featured content kind' });
  }

  // URL validation helper
  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Validate URLs if provided
  const urlFields = ['preOrderUrl', 'preSaveUrl', 'infoUrl', 'featuredUrl'];
  urlFields.forEach(field => {
    if (data[field] && !isValidUrl(data[field])) {
      errors.push({ field, message: `Invalid ${field} format` });
    }
  });

  // Featured content specific validation
  if (data.featuredKind === 'AudioUpload') {
    if (!data.featuredUrl) {
      errors.push({ field: 'featuredUrl', message: 'Audio upload URL is required' });
    }
    if (!data.featuredDurationSec || data.featuredDurationSec <= 0 || data.featuredDurationSec > 30) {
      errors.push({ field: 'featuredDurationSec', message: 'Audio duration must be between 1-30 seconds' });
    }
  }

  // Title length validation
  if (data.title && data.title.length > 100) {
    errors.push({ field: 'title', message: 'Title must be 100 characters or less' });
  }

  // Artist name validation for curator releases
  if (data.releaseContentType === 'curator') {
    if (!data.artistName?.trim()) {
      errors.push({ field: 'artistName', message: 'Artist name is required for curator releases' });
    } else if (data.artistName.length > 100) {
      errors.push({ field: 'artistName', message: 'Artist name must be 100 characters or less' });
    }
    
    // If attributing to curator, require curator selection
    if (data.attributeToCurator && !data.artistCuratorId) {
      errors.push({ field: 'artistCuratorId', message: 'Please select the artist\'s curator profile' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate show form data
 * @param {import('../types/curator.js').ShowFormData} data 
 * @returns {import('../types/curator.js').ValidationResult}
 */
export const validateShowData = (data) => {
  const errors = [];

  // Required fields
  if (!data.showDate) {
    errors.push({ field: 'showDate', message: 'Show date is required' });
  } else {
    // Validate date format and future date
    const showDate = new Date(data.showDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(showDate.getTime())) {
      errors.push({ field: 'showDate', message: 'Invalid show date format' });
    } else if (showDate < today) {
      errors.push({ field: 'showDate', message: 'Show date must be in the future' });
    }
  }

  if (!data.city?.trim()) {
    errors.push({ field: 'city', message: 'City is required' });
  }

  if (!data.country?.trim()) {
    errors.push({ field: 'country', message: 'Country is required' });
  }

  if (!data.venue?.trim()) {
    errors.push({ field: 'venue', message: 'Venue is required' });
  }

  // Optional field validation
  if (data.saleIndicator && !SALE_INDICATORS.includes(data.saleIndicator)) {
    errors.push({ field: 'saleIndicator', message: 'Invalid sale indicator' });
  }

  // URL validation
  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  if (data.ticketUrl && !isValidUrl(data.ticketUrl)) {
    errors.push({ field: 'ticketUrl', message: 'Invalid ticket URL format' });
  }

  if (data.infoUrl && !isValidUrl(data.infoUrl)) {
    errors.push({ field: 'infoUrl', message: 'Invalid info URL format' });
  }

  // Length validation
  const maxLengths = {
    city: 100,
    country: 100,
    venue: 200
  };

  Object.entries(maxLengths).forEach(([field, maxLength]) => {
    if (data[field] && data[field].length > maxLength) {
      errors.push({ field, message: `${field} must be ${maxLength} characters or less` });
    }
  });

  // Guests validation
  if (data.guests && Array.isArray(data.guests)) {
    if (data.guests.length > 10) {
      errors.push({ field: 'guests', message: 'Maximum 10 supporting acts allowed' });
    }
    
    data.guests.forEach((guest, index) => {
      if (!guest?.trim()) {
        errors.push({ field: `guests[${index}]`, message: 'Guest name cannot be empty' });
      } else if (guest.length > 100) {
        errors.push({ field: `guests[${index}]`, message: 'Guest name must be 100 characters or less' });
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate section configuration
 * @param {import('../types/curator.js').SectionConfigUpdate} data 
 * @returns {import('../types/curator.js').ValidationResult}
 */
export const validateSectionConfig = (data) => {
  const errors = [];

  const validSections = ['upcoming_releases', 'upcoming_shows'];
  if (!validSections.includes(data.section)) {
    errors.push({ field: 'section', message: 'Invalid section name' });
  }

  if (typeof data.enabled !== 'boolean') {
    errors.push({ field: 'enabled', message: 'Enabled must be a boolean' });
  }

  if (typeof data.displayOrder !== 'number' || data.displayOrder < 0) {
    errors.push({ field: 'displayOrder', message: 'Display order must be a non-negative number' });
  }

  if (typeof data.openOnLoad !== 'boolean') {
    errors.push({ field: 'openOnLoad', message: 'Open on load must be a boolean' });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Get default values for release form
 * @returns {import('../types/curator.js').ReleaseFormData}
 */
export const getDefaultReleaseData = () => ({
  title: '',
  releaseDate: '',
  releaseType: null,
  preOrderUrl: null,
  preSaveUrl: null,
  infoUrl: null,
  featuredKind: null,
  featuredUrl: null,
  featuredDurationSec: null
});

/**
 * Get default values for show form
 * @returns {import('../types/curator.js').ShowFormData}
 */
export const getDefaultShowData = () => ({
  showDate: '',
  city: '',
  country: '',
  venue: '',
  ticketUrl: null,
  infoUrl: null,
  saleIndicator: null,
  guests: []
});

/**
 * Get default section configuration
 * @param {string} section - Section name
 * @param {number} displayOrder - Default display order
 * @returns {import('../types/curator.js').SectionConfig}
 */
export const getDefaultSectionConfig = (section, displayOrder = 1) => ({
  enabled: true,
  displayOrder,
  openOnLoad: section === 'upcoming_releases' // Releases open by default
});

/**
 * Format date for form inputs (YYYY-MM-DD)
 * @param {Date|string} date 
 * @returns {string}
 */
export const formatDateForInput = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

/**
 * Format date for display (Month DD, YYYY or Month DD)
 * @param {Date|string} date 
 * @param {boolean} hideCurrentYear - Hide year if it's 2025
 * @returns {string}
 */
export const formatDateForDisplay = (date, hideCurrentYear = true) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const options = { month: 'long', day: 'numeric' };
  const currentYear = new Date().getFullYear();
  
  if (!hideCurrentYear || d.getFullYear() !== currentYear) {
    options.year = 'numeric';
  }
  
  return d.toLocaleDateString('en-US', options).toUpperCase();
};