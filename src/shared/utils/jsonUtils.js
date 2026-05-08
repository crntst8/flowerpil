// Utilities for working with JSON HTTP responses in a defensive way.
// Designed for fetch() responses where third-party proxies (e.g., Cloudflare)
// may return HTML or empty bodies even though the UI expects JSON.

/**
 * Safely parse a fetch Response as JSON. If the payload is empty, HTML, or
 * otherwise invalid, throw an Error with useful diagnostics so callers can
 * handle the failure without surfacing a browser SyntaxError.
 *
 * @param {Response} response - fetch Response instance
 * @param {Object} [options]
 * @param {*} [options.fallbackValue={}] - value to return when the body is empty
 * @param {string} [options.context] - human-readable context for error messages
 * @returns {Promise<*>} Parsed JSON data or fallback value
 */
export async function safeJson(response, { fallbackValue = {}, context } = {}) {
  if (!response) {
    throw new Error(context ? `${context}: missing response object` : 'Missing response object');
  }

  let rawText = '';
  try {
    rawText = await response.clone().text();
  } catch (error) {
    const message = context ? `${context}: failed to read response body` : 'Failed to read response body';
    const readError = new Error(message);
    readError.cause = error;
    readError.status = response.status;
    throw readError;
  }

  const trimmed = rawText.trim();
  const emptyBody = trimmed.length === 0;
  const status = response.status;
  const contentType = response.headers?.get?.('content-type') || '';

  if (emptyBody) {
    if ([204, 205].includes(status) || response.headers?.get?.('content-length') === '0') {
      return fallbackValue;
    }
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const snippet = trimmed.slice(0, 240);
    const prefix = context ? `${context}: ` : '';
    const looksHtml = /^<!?\w|<html/i.test(snippet);
    const reason = looksHtml
      ? 'received HTML instead of JSON'
      : 'received an invalid JSON payload';
    const message = `${prefix}${reason}${status ? ` (status ${status})` : ''}.`;

    const parseError = new Error(message);
    parseError.cause = error;
    parseError.status = status;
    parseError.contentType = contentType;
    parseError.bodySnippet = snippet;
    throw parseError;
  }
}

/**
 * Convenience helper to check if a response appears to contain HTML content.
 *
 * @param {Response} response
 * @returns {Promise<boolean>}
 */
export async function responseLooksHtml(response) {
  if (!response) return false;
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('text/html')) return true;
  try {
    const text = await response.clone().text();
    return /^<!?\w|<html/i.test(text.trim());
  } catch (_) {
    return false;
  }
}
