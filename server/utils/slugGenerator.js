import crypto from 'crypto';
import { getQueries } from '../database/db.js';

// Base62 alphabet without ambiguous chars (0, O, I, l)
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Generate a random slug using base62 alphabet (no ambiguous chars)
 * @param {number} length - Length of slug (default: 8)
 * @returns {string} Random slug
 */
export function generateSlug(length = 8) {
  let slug = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, ALPHABET.length);
    slug += ALPHABET[randomIndex];
  }
  return slug;
}

/**
 * Generate a unique slug by checking database for collisions
 * @param {number} length - Length of slug (default: 8)
 * @param {number} maxRetries - Max attempts before throwing error (default: 5)
 * @returns {Promise<string>} Unique slug
 */
export async function generateUniqueSlug(length = 8, maxRetries = 5) {
  const queries = getQueries();

  for (let i = 0; i < maxRetries; i++) {
    const slug = generateSlug(length);
    const existing = queries.getSharePageBySlug.get(slug);
    if (!existing) {
      return slug;
    }
  }

  throw new Error('Failed to generate unique slug after maximum retries');
}
