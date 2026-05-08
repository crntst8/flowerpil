import { getDatabase } from '../database/db.js';

/**
 * Generate a URL-safe slug from text
 * Converts text to lowercase, replaces non-alphanumeric chars with hyphens,
 * and removes leading/trailing hyphens.
 *
 * @param {string} text - Input text to slugify
 * @returns {string} - URL-safe slug
 *
 * @example
 * generateSlug("Staff Picks") // "staff-picks"
 * generateSlug("New Release!!!") // "new-release"
 * generateSlug("  Hello World  ") // "hello-world"
 */
export function generateSlug(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }

  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '');      // Remove leading/trailing hyphens
}

/**
 * Generate a unique slug, appending numbers if collision detected
 * Checks the database for existing slugs and appends -2, -3, etc. if needed.
 *
 * @param {string} text - Input text to slugify
 * @param {number|null} excludeId - Tag ID to exclude from uniqueness check (for updates)
 * @returns {string} - Unique slug
 * @throws {Error} - If slug cannot be generated or after 100 attempts
 *
 * @example
 * generateUniqueSlug("Staff Picks") // "staff-picks"
 * generateUniqueSlug("Staff Picks") // "staff-picks-2" (if first exists)
 * generateUniqueSlug("Staff Picks", 5) // "staff-picks" (if ID 5 already has it)
 */
export function generateUniqueSlug(text, excludeId = null) {
  const db = getDatabase();
  let slug = generateSlug(text);

  if (!slug) {
    throw new Error('Cannot generate slug from empty text');
  }

  // Validate slug format (alphanumeric and hyphens only)
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Generated slug contains invalid characters');
  }

  let suffix = 2;
  let finalSlug = slug;

  while (true) {
    // Check if slug exists (excluding the specified ID if updating)
    const existing = db.prepare(
      'SELECT id FROM custom_playlist_flags WHERE url_slug = ? AND (? IS NULL OR id != ?)'
    ).get(finalSlug, excludeId, excludeId);

    if (!existing) {
      return finalSlug;
    }

    // Collision detected, try with suffix
    finalSlug = `${slug}-${suffix}`;
    suffix++;

    // Safety: prevent infinite loops
    if (suffix > 100) {
      throw new Error('Unable to generate unique slug after 100 attempts');
    }
  }
}

/**
 * Validate if a slug is properly formatted
 *
 * @param {string} slug - Slug to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  // Must contain only lowercase letters, numbers, and hyphens
  // Must not start or end with a hyphen
  // Must not be empty
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}
