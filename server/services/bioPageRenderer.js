/**
 * Bio Page Rendering Service
 * Orchestrates the complete bio page generation process
 */

import { getDatabase } from '../database/db.js';
import { 
  generateBioPageCSS, 
  generateBioMetaTags, 
  generateBioPageHTML,
  resolveThemeStyles
} from '../utils/bioPageRenderer.js';

/**
 * Generate complete bio page HTML with all dependencies
 * @param {Object} bioProfile - Bio profile data from database
 * @returns {Promise<string>} Complete HTML page
 */
export const generateBioPage = async (bioProfile, options = {}) => {
  try {
    const db = getDatabase();

    // Parse published content to get featured links and custom bio
    let publishedContent = {};
    try {
      publishedContent = bioProfile.published_content ?
        JSON.parse(bioProfile.published_content) : {};
    } catch (error) {
      console.warn('Failed to parse published_content:', error);
      publishedContent = {};
    }

    // Use featured links from published_content instead of separate table
    const featuredLinks = publishedContent.featuredLinks || [];

    // Parse theme settings and apply theme palette
    let themeSettings = resolveThemeStyles({});
    try {
      const rawThemeSettings = bioProfile.theme_settings ?
        JSON.parse(bioProfile.theme_settings) : {};
      themeSettings = resolveThemeStyles(rawThemeSettings);
    } catch (error) {
      console.warn('Failed to parse theme_settings:', error);
      themeSettings = resolveThemeStyles({});
    }

    // Parse display settings to get profile link visibility
    let displaySettings = {};
    try {
      displaySettings = bioProfile.display_settings ?
        JSON.parse(bioProfile.display_settings) : {};
    } catch (error) {
      console.warn('Failed to parse display_settings:', error);
      displaySettings = {};
    }

    // Extract hidden profile link types from visibility settings
    const profileLinksVisibility = displaySettings.profileLinksVisibility || {};
    const hiddenProfileLinkTypes = Object.keys(profileLinksVisibility)
      .filter(key => profileLinksVisibility[key] === false);

    // Generate CSS with theme
    const themeCSS = generateBioPageCSS(themeSettings);

    // Generate meta tags for SEO
    const metaTags = generateBioMetaTags(bioProfile, bioProfile.handle);

    // Generate complete HTML page with published content
    const html = generateBioPageHTML({
      profile: bioProfile,
      publishedContent,
      featuredLinks,
      themeCSS,
      metaTags,
      handle: bioProfile.handle,
      hiddenProfileLinkTypes: options.hiddenProfileLinkTypes || hiddenProfileLinkTypes
    });

    return html;

  } catch (error) {
    console.error('Bio page generation error:', error);
    throw new Error(`Failed to generate bio page: ${error.message}`);
  }
};

/**
 * Generate bio page HTML from draft content (for authenticated/dev previews)
 * Mirrors generateBioPage but uses draft_content instead of published_content.
 * @param {Object} bioProfile - Bio profile data from database
 * @returns {Promise<string>} Complete HTML page (draft)
 */
export const generateBioPageFromDraft = async (bioProfile, options = {}) => {
  try {
    // Parse draft content for featured links and custom bio
    let draftContent = {};
    try {
      draftContent = bioProfile.draft_content ? JSON.parse(bioProfile.draft_content) : {};
    } catch (error) {
      console.warn('Failed to parse draft_content:', error);
      draftContent = {};
    }

    // Use featured links from draft_content
    const featuredLinks = draftContent.featuredLinks || [];

    // Parse theme settings and apply theme palette (same logic as published)
    let themeSettings = resolveThemeStyles({});
    try {
      const rawThemeSettings = bioProfile.theme_settings ?
        JSON.parse(bioProfile.theme_settings) : {};
      themeSettings = resolveThemeStyles(rawThemeSettings);
    } catch (error) {
      console.warn('Failed to parse theme_settings:', error);
      themeSettings = resolveThemeStyles({});
    }

    // Parse display settings to get profile link visibility
    let displaySettings = {};
    try {
      displaySettings = bioProfile.display_settings ?
        JSON.parse(bioProfile.display_settings) : {};
    } catch (error) {
      console.warn('Failed to parse display_settings:', error);
      displaySettings = {};
    }

    // Extract hidden profile link types from visibility settings
    const profileLinksVisibility = displaySettings.profileLinksVisibility || {};
    const hiddenProfileLinkTypes = Object.keys(profileLinksVisibility)
      .filter(key => profileLinksVisibility[key] === false);

    const themeCSS = generateBioPageCSS(themeSettings);
    const metaTags = generateBioMetaTags(bioProfile, bioProfile.handle);

    const html = generateBioPageHTML({
      profile: bioProfile,
      publishedContent: draftContent, // feed draft content into renderer
      featuredLinks,
      themeCSS,
      metaTags,
      handle: bioProfile.handle,
      hiddenProfileLinkTypes: options.hiddenProfileLinkTypes || hiddenProfileLinkTypes
    });

    return html;
  } catch (error) {
    console.error('Draft bio page generation error:', error);
    throw new Error(`Failed to generate draft bio page: ${error.message}`);
  }
};

export default {
  generateBioPage,
  generateBioPageFromDraft
};
