/**
 * Signup Risk Evaluator
 *
 * Evaluates traffic signals during open curator signup to determine
 * if email verification should be required.
 */

// Countries allowed without additional verification
// Uses Cloudflare cf-ipcountry header values (ISO 3166-1 alpha-2)
const ALLOWED_COUNTRIES = new Set(['AU', 'US', 'GB', 'NZ', 'CA', 'DE', 'FR', 'NL', 'SE', 'NO', 'DK', 'FI', 'IE', 'AT', 'CH', 'BE']);

// Common/trusted email TLDs that don't trigger verification
const COMMON_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil',
  'io', 'co', 'dev', 'app', 'me', 'info',
  'au', 'uk', 'nz', 'us', 'ca', 'de', 'fr', 'nl', 'se', 'no', 'dk', 'fi', 'ie', 'at', 'ch', 'be', 'es', 'it', 'pt', 'jp', 'kr',
  'com.au', 'co.uk', 'co.nz', 'org.au', 'net.au', 'edu.au', 'gov.au'
]);

// TLDs commonly associated with spam/abuse
const SUSPICIOUS_TLDS = new Set([
  'xyz', 'top', 'club', 'online', 'site', 'website', 'space', 'tech',
  'icu', 'buzz', 'gq', 'ml', 'cf', 'ga', 'tk', 'pw', 'cc', 'bid', 'win', 'loan', 'date', 'download'
]);

// Bot/headless user agent patterns
const BOT_UA_PATTERNS = [
  /headless/i,
  /phantom/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /webdriver/i,
  /bot\b/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /node-fetch/i,
  /axios\//i,
  /postman/i,
  /insomnia/i
];

/**
 * Extract TLD from email address
 * @param {string} email
 * @returns {string|null}
 */
const extractTLD = (email) => {
  if (!email || typeof email !== 'string') return null;
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const domain = parts[1].toLowerCase();
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return null;

  // Handle multi-part TLDs like .com.au, .co.uk
  if (domainParts.length >= 3) {
    const twoPartTLD = domainParts.slice(-2).join('.');
    if (COMMON_TLDS.has(twoPartTLD)) {
      return twoPartTLD;
    }
  }

  return domainParts[domainParts.length - 1];
};

/**
 * Check if user agent looks like a bot or automation tool
 * @param {string} userAgent
 * @returns {boolean}
 */
const isBotUserAgent = (userAgent) => {
  if (!userAgent || typeof userAgent !== 'string') return true; // Missing UA is suspicious
  if (userAgent.length < 20) return true; // Very short UA is suspicious

  return BOT_UA_PATTERNS.some(pattern => pattern.test(userAgent));
};

/**
 * Evaluate signup traffic for risk signals
 *
 * @param {Object} params
 * @param {string} params.email - Email address being registered
 * @param {string} params.ip - Client IP address
 * @param {string} params.country - Country code from cf-ipcountry header
 * @param {string} params.userAgent - User-Agent header
 * @returns {Object} { requiresVerification: boolean, riskFlags: string[], riskScore: number }
 */
export const evaluateSignupRisk = ({ email, ip, country, userAgent }) => {
  const riskFlags = [];
  let riskScore = 0;

  // Check country
  const normalizedCountry = (country || '').toUpperCase().trim();
  if (!normalizedCountry) {
    // Missing country header - could be direct access bypassing CDN
    riskFlags.push('missing_country');
    riskScore += 2;
  } else if (!ALLOWED_COUNTRIES.has(normalizedCountry)) {
    riskFlags.push('country_not_allowed');
    riskScore += 3;
  }

  // Check email TLD
  const tld = extractTLD(email);
  if (!tld) {
    riskFlags.push('invalid_email_domain');
    riskScore += 3;
  } else if (SUSPICIOUS_TLDS.has(tld)) {
    riskFlags.push('suspicious_tld');
    riskScore += 4;
  } else if (!COMMON_TLDS.has(tld)) {
    riskFlags.push('uncommon_tld');
    riskScore += 1;
  }

  // Check user agent
  if (isBotUserAgent(userAgent)) {
    riskFlags.push('bot_user_agent');
    riskScore += 3;
  }

  // Check for missing or suspicious headers patterns
  if (!userAgent) {
    riskFlags.push('missing_user_agent');
    riskScore += 2;
  }

  // Threshold for requiring verification
  // Score >= 3 triggers verification
  const requiresVerification = riskScore >= 3;

  return {
    requiresVerification,
    riskFlags,
    riskScore
  };
};

/**
 * Get human-readable explanation for risk flags
 * @param {string[]} flags
 * @returns {string}
 */
export const explainRiskFlags = (flags) => {
  const explanations = {
    missing_country: 'Could not determine your location',
    country_not_allowed: 'Signup from your region requires verification',
    invalid_email_domain: 'Email domain appears invalid',
    suspicious_tld: 'Email domain requires additional verification',
    uncommon_tld: 'Email domain is less common',
    bot_user_agent: 'Request appears automated',
    missing_user_agent: 'Missing browser information'
  };

  return flags
    .map(flag => explanations[flag] || flag)
    .join('; ');
};

export default {
  evaluateSignupRisk,
  explainRiskFlags,
  ALLOWED_COUNTRIES: [...ALLOWED_COUNTRIES],
  COMMON_TLDS: [...COMMON_TLDS]
};
