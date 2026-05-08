/**
 * Bio Page HTML Rendering Utilities
 * Generates static HTML for bio pages with dynamic theming and SEO optimization
 */

import fs from 'fs';
import path from 'path';
import { getProfileLinksForDisplay } from './profileLinksDerived.js';
import { getCuratorTypeLabel } from '../../src/shared/constants/curatorTypes.js';
import { getThemeById, DEFAULT_THEME } from '../../src/shared/constants/bioThemes.js';
import { getQueries } from '../database/db.js';

const BASE_THEME_STYLES = {
  backgroundColor: DEFAULT_THEME.background,
  textColor: DEFAULT_THEME.text,
  borderColor: DEFAULT_THEME.border,
  accentColor: DEFAULT_THEME.accent,
  linkColor: DEFAULT_THEME.link,
  featuredLinkBg: DEFAULT_THEME.featuredLinkBg,
  fontFamily: 'Paper Mono, monospace',
  fontSize: '16px',
  lineHeight: '1.5',
  borderStyle: 'dashed'
};

export const resolveThemeStyles = (rawThemeSettings) => {
  let themeSettings = rawThemeSettings;

  if (typeof themeSettings === 'string') {
    try {
      themeSettings = JSON.parse(themeSettings);
    } catch (error) {
      console.warn('Failed to parse string theme_settings:', error);
      themeSettings = {};
    }
  }

  if (!themeSettings || typeof themeSettings !== 'object') {
    return { ...BASE_THEME_STYLES };
  }

  if (themeSettings.customColors && typeof themeSettings.customColors === 'object') {
    const { background, text, border, accent, link, featuredLinkBg } = themeSettings.customColors;
    return {
      ...BASE_THEME_STYLES,
      backgroundColor: background || BASE_THEME_STYLES.backgroundColor,
      textColor: text || BASE_THEME_STYLES.textColor,
      borderColor: border || BASE_THEME_STYLES.borderColor,
      accentColor: accent || BASE_THEME_STYLES.accentColor,
      linkColor: link || BASE_THEME_STYLES.linkColor,
      featuredLinkBg: featuredLinkBg || BASE_THEME_STYLES.featuredLinkBg
    };
  }

  if (themeSettings.paletteId) {
    const palette = getThemeById(themeSettings.paletteId) || DEFAULT_THEME;
    return {
      ...BASE_THEME_STYLES,
      backgroundColor: palette.background || BASE_THEME_STYLES.backgroundColor,
      textColor: palette.text || BASE_THEME_STYLES.textColor,
      borderColor: palette.border || BASE_THEME_STYLES.borderColor,
      accentColor: palette.accent || BASE_THEME_STYLES.accentColor,
      linkColor: palette.link || BASE_THEME_STYLES.linkColor,
      featuredLinkBg: palette.featuredLinkBg || BASE_THEME_STYLES.featuredLinkBg
    };
  }

  return { ...BASE_THEME_STYLES };
};

/**
 * Get the base URL for serving assets based on environment
 * @returns {string} Base URL for assets
 */
const getBaseUrl = () => {
  const override = process.env.BIO_ASSET_BASE_URL && process.env.BIO_ASSET_BASE_URL.trim();
  const base = override && override.length > 0
    ? override
    : (process.env.NODE_ENV === 'production' ? 'https://flowerpil.io' : 'https://flowerpil.io');

  return base.replace(/\/+$/, '');
};

const resolveAssetUrl = (input) => {
  if (!input) return '';

  const value = String(input).trim();
  if (!value) return '';

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.startsWith('//')) {
    return `https:${value}`;
  }

  if (value.startsWith('/uploads/') || value.startsWith('uploads/')) {
    const uploadsPath = value.startsWith('/') ? value.slice(1) : value;
    const r2Base = process.env.R2_PUBLIC_URL && process.env.R2_PUBLIC_URL.trim();
    if (r2Base) {
      const normalizedBase = r2Base.replace(/\/+$/, '');
      return `${normalizedBase}/${uploadsPath.replace(/^uploads\//, '')}`;
    }
  }

  const base = getBaseUrl();
  return value.startsWith('/') ? `${base}${value}` : `${base}/${value}`;
};

const getPublicSiteBaseUrl = () => {
  const override = process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim();
  if (override) {
    return override.replace(/\/+$/, '');
  }

  return (process.env.NODE_ENV === 'production' ? 'https://flowerpil.io' : 'https://flowerpil.io');
};

const getDevCssOverride = () => {
  if (process.env.NODE_ENV === 'production') {
    return '';
  }

  const overridePath = process.env.BIO_DEV_CSS_PATH && process.env.BIO_DEV_CSS_PATH.trim()
    ? process.env.BIO_DEV_CSS_PATH.trim()
    : path.join(process.cwd(), 'storage', 'bio-dev.css');

  try {
    return fs.readFileSync(overridePath, 'utf8');
  } catch (_) {
    return '';
  }
};

const normalizePublicUrl = (input) => {
  if (!input) return '';

  const raw = String(input).trim();
  if (!raw) return '';

  if (/^(mailto:|tel:|javascript:)/i.test(raw)) {
    return raw;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }

  const base = getPublicSiteBaseUrl();

  if (raw.startsWith('/')) {
    return `${base}${raw}`;
  }

  return `${base}/${raw}`;
};

/**
 * Generate CSS from theme settings with accessibility enhancements
 * @param {Object} themeSettings - Theme configuration from database
 * @returns {string} CSS string for bio page styling
 */
export const generateBioPageCSS = (themeSettings = {}) => {
  const {
    backgroundColor = '#dadada',
    textColor = '#000000',
    borderColor = '#000000',
    accentColor = '#000000',
    linkColor = '#000000ff',
    featuredLinkBg = 'rgba(0, 0, 0, 0.38)',
    fontFamily = 'Paper Mono, monospace',
    fontSize = '16px',
    lineHeight = '1',
    borderStyle = 'dashed'
  } = themeSettings;

  const devCssOverride = getDevCssOverride();

  return `
    :root {
      --bio-bg-color: ${backgroundColor};
      --bio-text-color: ${textColor};
      --bio-border-color: ${borderColor};
      --bio-accent-color: ${accentColor};
      --bio-link-color: ${linkColor};
      --bio-featured-link-bg: ${featuredLinkBg};
      --bio-font-family: ${fontFamily};
      --bio-font-size: ${fontSize};
      --bio-line-height: ${lineHeight};
      --bio-border-style: ${borderStyle};
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background: var(--bio-bg-color);
      color: var(--bio-text-color);
      font-family: var(--bio-font-family);
      font-size: var(--bio-font-size);
      line-height: var(--bio-line-height);
      height: 100vh;
      height: 100dvh; /* Dynamic viewport height for mobile */
      padding: 1rem 0.5rem;
      word-wrap: break-word;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
      /* Accessibility enhancements */
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }

    /* Static grain/noise texture overlay */
    body::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E");
      pointer-events: none;
      opacity: 0.5;
      mix-blend-mode: overlay;
      z-index: 1;
    }

    .bio-container a {
      color: var(--bio-link-color);
    }

    .bio-container {
      position: relative;
      z-index: 2;
      max-width: 640px;
      margin: 0 auto;
      padding: 1rem 0.9rem;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      flex: 1;
      min-height: 0;
      gap: 0.4rem;
      width: 100%;
      overflow-x: hidden;
      box-sizing: border-box;
      background: #dadada;
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 16px;
      box-shadow:
        0 36px 70px -48px rgba(0, 0, 0, 0.4),
        0 32px 80px -60px rgba(0, 0, 0, 0.3);
    }

    .bio-header {
      text-align: center;
      padding: 0.6rem 1rem 0.5rem;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.1rem;
      position: relative;
    }

    .bio-logo-link {
      position: absolute;
      top: 0.85rem;
      left: 1rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .bio-logo {
      width: 62px;
      height: auto;
      opacity: 0.92;
    }

    .bio-avatar {
      width: 120px;
      height: 120px;
      border-radius: 0;
      object-fit: cover;
      object-position: center;
      margin: 0.5rem auto 0.35rem;
      border: 1px solid rgba(0, 0, 0, 0.1);
      display: block;
      box-shadow: 0 4px 12px -4px rgba(0, 0, 0, 0.3);
    }

    .bio-name {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-weight: bold;
      text-transform: capitalize;
      margin-top: 4px;
      white-space: nowrap;
      width: 100%;
    }

    .bio-type {
      font-size: clamp(0.7rem, 2vw, 0.8rem);
      opacity: 0.7;
      margin-bottom: 0.0625rem;
      text-transform: uppercase;
    }

    .bio-location {
      font-size: clamp(0.65rem, 1.5vw, 0.75rem);
      opacity: 0.7;
      margin-bottom: 0.0625rem;
    }

    .bio-description {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      line-height: 1.2;
      font-weight: 800;
      margin-top: 0.1rem;
      white-space: nowrap;
      max-width: 100%;
    }

    .featured-links {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.5rem;
      overflow: hidden;
      padding: 0.4rem 0;
      width: 100%;
      box-sizing: border-box;
      min-height: 0;
    }
    
    .featured-links[data-link-count="1"],
    .featured-links[data-link-count="2"] {
      justify-content: center;
      gap: 0.75rem;
    }

    .featured-links[data-link-count="1"] .featured-link {
      padding: 1rem 0.85rem;
    }
    
    .featured-links[data-link-count="1"] .featured-link-image,
    .featured-links[data-link-count="1"] .featured-link-placeholder {
      width: 72px;
      height: 72px;
    }
    
    .featured-links[data-link-count="1"] .featured-link-title {
      font-size: clamp(1.1rem, 3vw, 1.3rem); 
      font-weight: bold;
    }
    
    .featured-links[data-link-count="2"] .featured-link {
      padding: 0.85rem 0.75rem;
    }
    
    .featured-links[data-link-count="2"] .featured-link-image,
    .featured-links[data-link-count="2"] .featured-link-placeholder {
      width: 62px;
      height: 62px;
    }
    
    .featured-links[data-link-count="2"] .featured-link-title {
      font-size: clamp(1rem, 2.8vw, 1.2rem); /* Enhanced typography */
    }
    
    .featured-links[data-link-count="3"] {
      justify-content: center;
      gap: 0.5rem;
    }

    .featured-links[data-link-count="3"] .featured-link {
      padding: 0.7rem 0.75rem;
    }
    
    
    /* 4+ links: Condensed layout without image previews */
    .featured-links[data-link-count="4"],
    .featured-links[data-link-count="5"],
    .featured-links[data-link-count="6"],
    .featured-links[data-link-count="7"],
    .featured-links[data-link-count="8"],
    .featured-links[data-link-count="9"] {
      justify-content: flex-start;
      gap: 0.4rem;
      overflow-y: auto;
      padding: 0.35rem 0;
    }

    .featured-links[data-link-count="4"] .featured-link,
    .featured-links[data-link-count="5"] .featured-link,
    .featured-links[data-link-count="6"] .featured-link,
    .featured-links[data-link-count="7"] .featured-link,
    .featured-links[data-link-count="8"] .featured-link,
    .featured-links[data-link-count="9"] .featured-link {
      padding: 0.55rem 0.65rem;
      gap: 0.5rem;
    }

    .featured-links[data-link-count="4"] .featured-link-image,
    .featured-links[data-link-count="5"] .featured-link-image,
    .featured-links[data-link-count="6"] .featured-link-image,
    .featured-links[data-link-count="7"] .featured-link-image,
    .featured-links[data-link-count="8"] .featured-link-image,
    .featured-links[data-link-count="9"] .featured-link-image,
    .featured-links[data-link-count="4"] .featured-link-placeholder,
    .featured-links[data-link-count="5"] .featured-link-placeholder,
    .featured-links[data-link-count="6"] .featured-link-placeholder,
    .featured-links[data-link-count="7"] .featured-link-placeholder,
    .featured-links[data-link-count="8"] .featured-link-placeholder,
    .featured-links[data-link-count="9"] .featured-link-placeholder {
      display: none;
    }

    .featured-links[data-link-count="4"] .featured-link-title,
    .featured-links[data-link-count="5"] .featured-link-title,
    .featured-links[data-link-count="6"] .featured-link-title,
    .featured-links[data-link-count="7"] .featured-link-title,
    .featured-links[data-link-count="8"] .featured-link-title,
    .featured-links[data-link-count="9"] .featured-link-title {
      font-size: clamp(0.85rem, 2.2vw, 0.95rem);
    }

    .featured-links[data-link-count="4"] .featured-link-description,
    .featured-links[data-link-count="5"] .featured-link-description,
    .featured-links[data-link-count="6"] .featured-link-description,
    .featured-links[data-link-count="7"] .featured-link-description,
    .featured-links[data-link-count="8"] .featured-link-description,
    .featured-links[data-link-count="9"] .featured-link-description {
      font-size: clamp(0.7rem, 1.8vw, 0.8rem);
      line-height: 1.1;
    }

    .featured-link {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 0.75rem;
      text-decoration: none;
      color: var(--bio-text-color);
      border: 1px solid rgba(0, 0, 0, 0.08);
      padding: 0.7rem 0.75rem;
      transition: transform 0.1s ease, box-shadow 0.1s ease;
      cursor: pointer;
      flex-shrink: 0;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      overflow: hidden;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.75);
      box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.12), 0 1px 3px -1px rgba(0, 0, 0, 0.08);
    }

    .featured-link:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 14px -4px rgba(0, 0, 0, 0.18), 0 2px 6px -2px rgba(0, 0, 0, 0.1);
    }

    .featured-link-image,
    .featured-link-placeholder {
      width: 52px;
      height: 52px;
      object-fit: cover;
      object-position: center;
      flex-shrink: 0;
      border-radius: 0;
      border: 1px solid rgba(0, 0, 0, 0.08);
      display: block;
    }

    .featured-link-placeholder {
      background: linear-gradient(135deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.09) 100%);
    }

    .featured-link-content {
      flex: 1;
      min-width: 0; /* Allow shrinking below content size */
      max-width: 100%; /* Never exceed container */
      overflow: hidden; /* Prevent text overflow */
      word-wrap: break-word; /* Break long words if needed */
    }

    .featured-link-title {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-weight: bold;
      margin-bottom: 0.125rem;
      text-transform: none;
      white-space: nowrap;
    }

    .featured-link-description {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      opacity: 1;
      font-weight: bold;
      line-height: 1;
      white-space: nowrap;
    }

    .featured-link-url {
      display: none;
    }

    .profile-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      justify-content: center;
      max-width: 100%;
      flex-shrink: 0;
      margin-top: auto;
      padding: 0.4rem 0.5rem 0.25rem;
    }

    .profile-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      color: var(--bio-link-color);
      border: 1px solid rgba(0, 0, 0, 0.1);
      padding: 0.5rem 0.4rem;
      text-align: center;
      transition: all 0.15s ease;
      cursor: pointer;
      flex: 1 1 auto;
      min-width: 55px;
      max-width: 80px;
      height: 55px;
      box-sizing: border-box;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.6);
      box-shadow: 0 2px 6px -2px rgba(0, 0, 0, 0.15), 0 1px 2px -1px rgba(0, 0, 0, 0.08);
    }

    .profile-button:hover {
      border-color: rgba(0, 0, 0, 0.25);
      background: rgba(255, 255, 255, 0.9);
      transform: translateY(-1px);
      box-shadow: 0 3px 10px -3px rgba(0, 0, 0, 0.2), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
    }

    .profile-button-icon {
      width: 24px;
      height: 24px;
      margin-bottom: 0.25rem;
      opacity: 0.8;
      fill: currentColor;
    }

    .profile-button-label {
      font-size: clamp(0.7rem, 1.8vw, 0.8rem);
      text-transform: uppercase;
      font-weight: bold;
    }


    /* Medium screens - ensure max 4 per row, compact layout */
    @media (max-width: 768px) and (min-width: 481px) {
      .bio-container {
        gap: 0.375rem;
      }

      .bio-logo {
        width: 50px;
        margin-bottom: 0.4375rem;
      }

      .profile-buttons {
        gap: 0.1875rem;
        max-height: calc(2 * 50px + 0.1875rem);
        overflow: hidden;
        margin-top: auto;
      }

      .profile-button {
        max-width: calc(25% - 0.140625rem); /* Max 4 per row */
        height: 50px;
        padding: 0.25rem 0.125rem;
      }

      .profile-button-icon {
        width: 16px;
        height: 16px;
      }

      .featured-link {
        padding: 0.65rem 0.5rem;
        gap: 0.6rem;
      }

      .featured-link-image,
      .featured-link-placeholder {
        width: 42px;
        height: 42px;
      }
      
      .featured-links {
        gap: 0.375rem; /* 6px - better than 3px but not as wide as desktop */
        padding: 0.375rem 0; /* 6px - cleaner spacing */
      }
    }

    /* Small screens - optimized for mobile, larger elements */
    @media (max-width: 480px) {
      body {
        padding: 0.375rem 0.25rem;
        height: 100vh; /* Fallback for older browsers */
        height: 100dvh; /* Use dynamic viewport height */
      }

      .bio-container {
        padding: 0.5rem 0.5rem;
        gap: 0.35rem;
        max-width: none;
        width: 100%;
      }

      .bio-header {
        padding: 0.5rem 0 0.35rem 0;
      }

      .bio-logo-link {
        top: 0.5rem;
        left: 0.5rem;
      }

      .bio-logo {
        width: 45px;
        margin-bottom: 0.375rem;
      }

      .bio-avatar {
        width: 80px;
        height: 80px;
        margin: 0.35rem auto 0.25rem;
      }

      .bio-name {
        margin-bottom: 0.125rem;
      }

      .bio-type, .bio-location {
        margin-bottom: 0.0625rem;
      }

      .bio-description {
        margin-bottom: 0.15rem;
      }

      .featured-links {
        gap: 0.4rem;
        padding: 0.3rem 0;
      }

      .featured-link-image,
      .featured-link-placeholder {
        width: 44px;
        height: 44px;
      }

      .profile-buttons {
        gap: 0.35rem;
        margin-top: auto;
        padding: 0.3rem 0.3rem 0.15rem;
      }

      .profile-button {
        padding: 0.4rem 0.3rem;
        min-width: 50px;
        max-width: 70px;
        height: 55px;
        flex: 1 1 auto;
      }

      .profile-button-icon {
        width: 20px;
        height: 20px;
        margin-bottom: 0.125rem;
      }

    }

    /* Wide display optimizations - reduce header, adjust sizing */
    @media (min-width: 769px) {
      .bio-header {
        padding: 0.75rem 1rem 0.45rem;
      }

      .bio-logo-link {
        top: 0.75rem;
      }

      .bio-avatar {
        width: 110px;
        height: 110px;
        margin: 0.5rem auto 0.3rem;
      }

      .bio-name {
        margin-top: 3px;
      }
    }

    /* High contrast mode support */
    @media (prefers-contrast: high) {
      .bio-container {
        border: 2px solid var(--bio-text-color);
      }

      .featured-link,
      .profile-button {
        border-style: solid;
      }
    }

    /* Print styles */
    @media print {
      body {
        background: white !important;
        color: black !important;
      }
      
      .featured-link,
      .profile-button {
        border: 1px solid #333 !important;
        break-inside: avoid;
      }
    }
    ${devCssOverride}
  `;
};

/**
 * Generate meta tags for SEO and social sharing
 * @param {Object} profile - Bio profile data
 * @param {string} handle - Bio page handle
 * @returns {string} HTML meta tags
 */
export const generateBioMetaTags = (profile, handle) => {
  const title = profile.seo_metadata?.title || `${profile.curator_name || profile.name || handle} | pil.bio`;
  const description = profile.seo_metadata?.description || profile.bio_short || profile.bio || `${handle}'s bio page on pil.bio`;
  const imageUrl = resolveAssetUrl(profile.profile_image);
  const pageUrl = `https://${handle}.pil.bio`;
  const resolvedTheme = resolveThemeStyles(profile.theme_settings);
  
  // Parse social_links JSON if it exists
  let socialLinks = [];
  try {
    if (profile.social_links) {
      if (typeof profile.social_links === 'string') {
        // Handle double-escaped JSON
        let parsed = JSON.parse(profile.social_links);
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        socialLinks = parsed;
      } else if (Array.isArray(profile.social_links)) {
        socialLinks = profile.social_links;
      }
    }
  } catch (error) {
    console.warn('Failed to parse social_links JSON:', error);
    socialLinks = [];
  }
  
  // Ensure socialLinks is always an array
  if (!Array.isArray(socialLinks)) {
    socialLinks = [];
  }

  const baseUrl = getBaseUrl();

  return `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta charset="utf-8">

    <!-- Favicons -->
    <link rel="icon" type="image/x-icon" href="${baseUrl}/favicon.ico">
    <link rel="icon" type="image/png" sizes="16x16" href="${baseUrl}/icons/favicon-16x16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="${baseUrl}/icons/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="48x48" href="${baseUrl}/icons/favicon-48x48.png">
    <link rel="icon" type="image/png" sizes="96x96" href="${baseUrl}/icons/favicon-96x96.png">
    <!-- Apple Touch Icons -->
    <link rel="apple-touch-icon" href="${baseUrl}/icons/apple-touch-icon.png">
    <link rel="apple-touch-icon" sizes="57x57" href="${baseUrl}/icons/apple-touch-icon-57x57.png">
    <link rel="apple-touch-icon" sizes="60x60" href="${baseUrl}/icons/apple-touch-icon-60x60.png">
    <link rel="apple-touch-icon" sizes="72x72" href="${baseUrl}/icons/apple-touch-icon-72x72.png">
    <link rel="apple-touch-icon" sizes="76x76" href="${baseUrl}/icons/apple-touch-icon-76x76.png">
    <link rel="apple-touch-icon" sizes="114x114" href="${baseUrl}/icons/apple-touch-icon-114x114.png">
    <link rel="apple-touch-icon" sizes="120x120" href="${baseUrl}/icons/apple-touch-icon-120x120.png">
    <link rel="apple-touch-icon" sizes="144x144" href="${baseUrl}/icons/apple-touch-icon-144x144.png">
    <link rel="apple-touch-icon" sizes="152x152" href="${baseUrl}/icons/apple-touch-icon-152x152.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${baseUrl}/icons/apple-touch-icon-180x180.png">

    <!-- Open Graph -->
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:type" content="profile">
    <meta property="og:site_name" content="pil.bio">
    ${imageUrl ? `<meta property="og:image" content="${imageUrl}">` : ''}
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    ${imageUrl ? `<meta name="twitter:image" content="${imageUrl}">` : ''}
    
    <!-- Additional meta tags -->
    <meta name="robots" content="index, follow">
    <meta name="theme-color" content="${resolvedTheme.backgroundColor || '#000000'}">
    <link rel="canonical" href="${pageUrl}">
    
    <!-- Schema.org structured data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Person",
      "name": "${escapeHtml(profile.curator_name || profile.name || handle)}",
      "description": "${escapeHtml(description)}",
      "url": "${pageUrl}",
      ${imageUrl ? `"image": "${imageUrl}",` : ''}
      "sameAs": [
        ${socialLinks.map(link => `"${escapeHtml(link.url)}"`).join(',\n        ')}
      ]
    }
    </script>
  `;
};

/**
 * Generate platform icon SVG
 * @param {string} platform - Platform name (spotify, apple, etc.)
 * @returns {string} SVG icon markup
 */
const generatePlatformIcon = (platform) => {
  // Platform icon mapping with emojis (matches profileLinksDerived.js platform detection)
  const PLATFORM_ICONS = {
    // Music Streaming
    spotify: { name: 'Spotify', emoji: '🎵' },
    apple: { name: 'Apple Music', emoji: '🍎' },
    applemusic: { name: 'Apple Music', emoji: '🍎' },
    tidal: { name: 'Tidal', emoji: '🌊' },
    bandcamp: { name: 'Bandcamp', emoji: '🎧' },
    soundcloud: { name: 'SoundCloud', emoji: '☁️' },
    youtube: { name: 'YouTube', emoji: '📺' },
    youtubemusic: { name: 'YouTube Music', emoji: '📺' },
    deezer: { name: 'Deezer', emoji: '🎶' },
    
    // Social Media
    instagram: { name: 'Instagram', emoji: '📷' },
    twitter: { name: 'Twitter', emoji: '🐦' },
    x: { name: 'X (Twitter)', emoji: '🐦' },
    facebook: { name: 'Facebook', emoji: '👥' },
    tiktok: { name: 'TikTok', emoji: '📱' },
    linkedin: { name: 'LinkedIn', emoji: '💼' },
    mastodon: { name: 'Mastodon', emoji: '🐘' },
    discord: { name: 'Discord', emoji: '🎮' },
    twitch: { name: 'Twitch', emoji: '🎮' },
    
    // Professional
    website: { name: 'Website', emoji: '🌐' },
    homepage: { name: 'Website', emoji: '🌐' },
    site: { name: 'Website', emoji: '🌐' },
    www: { name: 'Website', emoji: '🌐' },
    email: { name: 'Email', emoji: '📧' },
    contact: { name: 'Contact', emoji: '📧' },
    substack: { name: 'Substack', emoji: '📝' },
    medium: { name: 'Medium', emoji: '📝' },
    
    // Special
    curator: { name: 'Curator Profile', emoji: '👤' }
  };
  
  const AVAILABLE_ICON_FILES = new Set([
    'apple',
    'bandcamp',
    'discogs',
    'discord',
    'gen',
    'instagram',
    'mixcloud',
    'reddit',
    'soundcloud',
    'spotify',
    'tidal',
    'tiktok',
    'website',
    'youtube',
    'youtubemusic'
  ]);

  const ICON_NAME_OVERRIDES = {
    applemusic: 'apple',
    apple: 'apple',
    x: 'twitter',
    twitter: 'gen',
    facebook: 'gen',
    linkedin: 'gen',
    homepage: 'website',
    site: 'website',
    website: 'website',
    email: 'website',
    contact: 'website',
    curator: 'website'
  };

  const normalizedPlatform = platform.toLowerCase().trim();
  const sanitizedPlatform = normalizedPlatform.replace(/[\s_-]+/g, '');
  const platformConfig = PLATFORM_ICONS[normalizedPlatform] || PLATFORM_ICONS[sanitizedPlatform];

  const overrideKey = ICON_NAME_OVERRIDES[sanitizedPlatform] || ICON_NAME_OVERRIDES[normalizedPlatform];
  const candidateKey = overrideKey || sanitizedPlatform;
  const iconKey = AVAILABLE_ICON_FILES.has(candidateKey) ? candidateKey : 'gen';
  const iconExt = iconKey === 'youtubemusic' ? 'svg' : 'png';
  const iconPath = resolveAssetUrl(`/icons/${iconKey}.${iconExt}`);
  
  if (!platformConfig) {
    // Fallback to a generic website icon
    return `
      <div class="profile-button-icon" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">
        <img src="${resolveAssetUrl('/icons/website.png')}" alt="Link" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'">
      </div>
    `;
  }
  
  // Use PNG icons from public/icons directory
  return `
    <div class="profile-button-icon" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">
      <img src="${iconPath}" alt="${platformConfig.name}" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'">
    </div>
  `;
};

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
const escapeHtml = (text) => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

/**
 * Compute dynamic font size based on text length
 */
const getNameFontSize = (text) => {
  const len = text.length;
  if (len <= 7) return '48px';
  if (len <= 10) return '40px';
  if (len <= 14) return '32px';
  if (len <= 17) return '26px';
  return '22px';
};

const getBioFontSize = (text) => {
  const len = text.length;
  if (len <= 20) return '18px';
  if (len <= 35) return '16px';
  if (len <= 50) return '14px';
  return '12px';
};

const getLinkTitleFontSize = (text) => {
  const len = text.length;
  if (len <= 15) return '1.05rem';
  if (len <= 25) return '0.92rem';
  if (len <= 35) return '0.82rem';
  return '0.72rem';
};

const getLinkDescFontSize = (text) => {
  const len = text.length;
  if (len <= 20) return '0.85rem';
  if (len <= 35) return '0.78rem';
  if (len <= 50) return '0.7rem';
  return '0.62rem';
};

/**
 * Generate complete bio page HTML
 * @param {Object} options - Page generation options
 * @returns {string} Complete HTML page
 */
export const generateBioPageHTML = ({ profile, publishedContent, featuredLinks, themeCSS, metaTags, handle, hiddenProfileLinkTypes = [] }) => {

  // Parse social_links and external_links JSON if they exist
  let socialLinks = [];
  let externalLinks = [];
  
  try {
    if (profile.social_links) {
      if (typeof profile.social_links === 'string') {
        // Handle double-escaped JSON
        let parsed = JSON.parse(profile.social_links);
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        socialLinks = parsed;
      } else if (Array.isArray(profile.social_links)) {
        socialLinks = profile.social_links;
      }
    }
  } catch (error) {
    console.warn('Failed to parse social_links JSON in generateBioPageHTML:', error);
    socialLinks = [];
  }
  
  try {
    if (profile.external_links) {
      if (typeof profile.external_links === 'string') {
        // Handle double-escaped JSON
        let parsed = JSON.parse(profile.external_links);
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        externalLinks = parsed;
      } else if (Array.isArray(profile.external_links)) {
        externalLinks = profile.external_links;
      }
    }
  } catch (error) {
    console.warn('Failed to parse external_links JSON in generateBioPageHTML:', error);
    externalLinks = [];
  }
  
  // Ensure both are always arrays
  if (!Array.isArray(socialLinks)) {
    socialLinks = [];
  }
  if (!Array.isArray(externalLinks)) {
    externalLinks = [];
  }

  // Generate featured links HTML - use featuredLinks parameter or fall back to publishedContent
  let actualFeaturedLinks = featuredLinks;
  if (!featuredLinks || featuredLinks.length === 0) {
    // Fall back to published content if no separate featured links exist
    if (publishedContent && publishedContent.featuredLinks) {
      actualFeaturedLinks = publishedContent.featuredLinks.filter(link => link.is_enabled);
    } else {
      actualFeaturedLinks = [];
    }
  }
  
  const queries = getQueries();

  const featuredLinksHTML = actualFeaturedLinks.map((link) => {
    // Enhanced title logic - handle playlist/release/show titles better
    let title = link.title || '';

    let playlistRecord;
    let releaseRecord;
    let showRecord;

    if (link.playlist_id) {
      try {
        playlistRecord = queries.getPlaylistById.get(link.playlist_id);
      } catch (e) {
        playlistRecord = null;
      }
    } else if (link.release_id) {
      try {
        releaseRecord = queries.getReleaseById.get(link.release_id);
      } catch (e) {
        releaseRecord = null;
      }
    } else if (link.show_id) {
      try {
        showRecord = queries.getShowById.get(link.show_id);
      } catch (e) {
        showRecord = null;
      }
    }

    if (!title) {
      if (playlistRecord) {
        title = playlistRecord.title || 'Playlist';
      } else if (releaseRecord) {
        title = releaseRecord.title || 'Release';
      } else if (showRecord) {
        title = showRecord?.venue
          ? `${showRecord.venue} - ${new Date(showRecord.show_date).toLocaleDateString()}`
          : 'Show';
      }
    }

    // Final fallback
    if (!title) title = 'Featured Link';

    // Enforce character limits for consistent sizing
    title = title.slice(0, 40);
    const description = (link.description || '').slice(0, 60);

    let rawUrl = link.url || '';
    const linkData = typeof link.link_data === 'object' && link.link_data !== null
      ? link.link_data
      : {};

    // Enhanced URL generation for type-specific links
    if (!rawUrl) {
      if (playlistRecord) {
        rawUrl = playlistRecord.share_url
          || playlistRecord.public_url
          || playlistRecord.external_url
          || `/playlists/${playlistRecord.id}`;
      } else if (link.playlist_id) {
        rawUrl = `/playlists/${link.playlist_id}`;
      } else if (releaseRecord) {
        rawUrl = releaseRecord.share_url
          || releaseRecord.public_url
          || releaseRecord.external_url
          || `/releases/${releaseRecord.id}`;
      } else if (link.release_id) {
        rawUrl = `/releases/${link.release_id}`;
      } else if (showRecord) {
        rawUrl = showRecord.share_url
          || showRecord.ticket_url
          || `/shows/${showRecord.id}`;
      } else if (link.show_id) {
        rawUrl = `/shows/${link.show_id}`;
      } else if (linkData.content_type && linkData.content_id) {
        const contentType = String(linkData.content_type).toLowerCase();
        const id = linkData.content_id;
        if (contentType === 'playlist') rawUrl = `/playlists/${id}`;
        if (contentType === 'release') rawUrl = `/releases/${id}`;
        if (contentType === 'show') rawUrl = `/shows/${id}`;
      }
    }

    const normalizedUrl = rawUrl ? normalizePublicUrl(rawUrl) : '';
    const href = normalizedUrl || '#';
    const isInternal = normalizedUrl && normalizedUrl.startsWith(getPublicSiteBaseUrl());
    const relAttr = isInternal ? '' : ' rel="noopener noreferrer"';
    const targetAttr = isInternal ? '_self' : '_blank';

    const displayUrl = normalizedUrl
      ? normalizedUrl.replace(/^https?:\/\//, '').replace(/^www\./, '')
      : '';

    // Handle both image and image_url fields, and filter out blob URLs
    let image = link.image_url || link.image || '';

    if ((!image || image.startsWith('blob:')) && playlistRecord) {
      image = playlistRecord.image
        || playlistRecord.cover_image
        || playlistRecord.hero_image
        || playlistRecord.square_image
        || '';
    }

    if ((!image || image.startsWith('blob:')) && releaseRecord) {
      image = releaseRecord.artwork_url || releaseRecord.image_url || '';
    }

    const isValidImage = image && !image.startsWith('blob:');
    const resolvedImage = isValidImage ? resolveAssetUrl(image) : '';

    return `
      <a href="${escapeHtml(href)}"
         class="featured-link"
         target="${targetAttr}"${relAttr}>
        ${resolvedImage ? `<img src="${escapeHtml(resolvedImage)}" alt="" class="featured-link-image">` : `<div class="featured-link-placeholder"></div>`}
        <div class="featured-link-content">
          <div class="featured-link-title" style="font-size: ${getLinkTitleFontSize(title)}">${escapeHtml(title)}</div>
          ${description ? `<div class="featured-link-description" style="font-size: ${getLinkDescFontSize(description)}">${escapeHtml(description)}</div>` : ''}
        </div>
      </a>
    `;
  }).join('\n');

  const profileImageSrc = resolveAssetUrl(profile.profile_image);

  // Generate profile buttons HTML using social_links array
  // Process social_links to extract platform links
  const profileLinks = [];

  // First, check legacy DSP URL fields (for backwards compatibility)
  if (profile.spotify_url) {
    profileLinks.push({
      type: 'spotify',
      url: profile.spotify_url,
      displayTitle: 'Spotify',
      target: '_blank',
      rel: 'noopener noreferrer'
    });
  }

  if (profile.apple_url) {
    profileLinks.push({
      type: 'apple',
      url: profile.apple_url,
      displayTitle: 'Apple Music',
      target: '_blank',
      rel: 'noopener noreferrer'
    });
  }

  if (profile.tidal_url) {
    profileLinks.push({
      type: 'tidal',
      url: profile.tidal_url,
      displayTitle: 'Tidal',
      target: '_blank',
      rel: 'noopener noreferrer'
    });
  }

  if (profile.bandcamp_url) {
    profileLinks.push({
      type: 'bandcamp',
      url: profile.bandcamp_url,
      displayTitle: 'Bandcamp',
      target: '_blank',
      rel: 'noopener noreferrer'
    });
  }

  // Process all social_links to find supported platforms
  if (socialLinks && socialLinks.length > 0) {
    socialLinks.forEach(socialLink => {
      // Handle both 'platform' and 'type' fields
      const platform = socialLink.platform || socialLink.type;
      if (socialLink.url && platform) {
        // Avoid duplicates with legacy fields
        const exists = profileLinks.some(pl => pl.type === platform.toLowerCase());
        if (!exists) {
          profileLinks.push({
            type: platform.toLowerCase(),
            url: socialLink.url,
            displayTitle: platform,
            target: '_blank',
            rel: 'noopener noreferrer'
          });
        }
      }
    });
  }

  // Also check external_links for additional platform links
  if (externalLinks && externalLinks.length > 0) {
    externalLinks.forEach(extLink => {
      // Handle both 'platform' and 'type' fields
      const platform = extLink.platform || extLink.type;
      if (extLink.url && platform) {
        // Avoid duplicates - check if this platform already exists
        const exists = profileLinks.some(pl => pl.type === platform.toLowerCase());
        if (!exists) {
          profileLinks.push({
            type: platform.toLowerCase(),
            url: extLink.url,
            displayTitle: platform,
            target: '_blank',
            rel: 'noopener noreferrer'
          });
        }
      }
    });
  }

  // Always add curator profile as the last button - use curator name not bio handle
  const curatorName = profile.curator_name || profile.name || handle;
  profileLinks.push({
    type: 'curator_profile',
    url: normalizePublicUrl(`/curator/${curatorName}`),
    displayTitle: curatorName,
    target: '_self',
    rel: null
  });

  // Apply visibility overrides (always show curator_profile, filter others based on visibility)
  const filteredProfileLinks = Array.isArray(hiddenProfileLinkTypes) && hiddenProfileLinkTypes.length
    ? profileLinks.filter(l => l.type === 'curator_profile' || !hiddenProfileLinkTypes.includes(l.type))
    : profileLinks;

  const profileButtonsHTML = filteredProfileLinks
    .map(link => {
      const href = normalizePublicUrl(link.url);

      // Special handling for curator profile link
      if (link.type === 'curator_profile') {
        return `
          <a href="${escapeHtml(href)}" 
             class="profile-button"
             target="${link.target}"
             ${link.rel ? `rel="${link.rel}"` : ''}>
            <div class="profile-button-icon" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">
              <img src="${resolveAssetUrl('/black.png')}" alt="Profile" style="width: 90%; height: 90%; object-fit: contain;">
            </div>
          </a>
        `;
      }
      
      // Regular platform links
      return `
        <a href="${escapeHtml(href)}" 
           class="profile-button" 
           target="${link.target}"
           ${link.rel ? `rel="${link.rel}"` : ''}>
          ${generatePlatformIcon(link.type)}
        </a>
      `;
    })
    .join('\n');

  const isDev = process.env.NODE_ENV !== 'production';
  const devReloadButton = isDev
    ? `<button
        type="button"
        aria-label="Reload bio page"
        style="position:fixed;top:12px;right:12px;z-index:2147483647;padding:6px 10px;border:1px solid rgba(0,0,0,0.6);background:rgba(255,255,255,0.9);color:#000;font-family:'Paper Mono', monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;"
        onclick="(function(){try{var params=new URLSearchParams(window.location.search);params.set('v', Date.now());window.location.search=params.toString();}catch(e){var sep=window.location.search?'&':'?';window.location.href=window.location.pathname+window.location.search+sep+'v='+Date.now();}})()"
      >Reload</button>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${metaTags}
  <style>
    ${themeCSS}
  </style>
</head>
<body>
  ${devReloadButton}
  <div class="bio-container">
    <header class="bio-header">
      <a href="${getPublicSiteBaseUrl()}" class="bio-logo-link">
        <img src="${resolveAssetUrl('/black.png')}" alt="Flowerpil" class="bio-logo">
      </a>
      ${profileImageSrc ? `<img src="${escapeHtml(profileImageSrc)}" alt="${escapeHtml(profile.curator_name || handle)}" class="bio-avatar">` : ''}

      <h1 class="bio-name" style="font-size: ${getNameFontSize((profile.curator_name || handle).slice(0, 20))}">${escapeHtml((profile.curator_name || handle).slice(0, 20))}</h1>

      ${(() => {
        const bioText = publishedContent.customBio || profile.bio_short || '';
        if (!bioText) return '';
        const truncated = bioText.slice(0, 60);
        return `<div class="bio-description" style="font-size: ${getBioFontSize(truncated)}">${escapeHtml(truncated)}</div>`;
      })()}
    </header>

    ${actualFeaturedLinks.length > 0 ? `
    <section class="featured-links" data-link-count="${actualFeaturedLinks.length}">
      ${featuredLinksHTML}
    </section>
    ` : ''}

    <section class="profile-buttons">
      ${profileButtonsHTML}
    </section>

  </div>

</body>
</html>`;
};


export default {
  resolveThemeStyles,
  generateBioPageCSS,
  generateBioMetaTags,
  generateBioPageHTML
};
