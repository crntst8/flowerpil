import express from 'express';
import { getDatabase } from '../database/db.js';
import bioPageRenderer from '../services/bioPageRenderer.js';

const router = express.Router();

// Handle subdomain bio page requests
router.get('/:handle', async (req, res) => {
  const { handle } = req.params;
  const subdomain = req.headers['x-bio-handle'] || handle;
  const wantPreview = req.query.preview === '1' || req.query.draft === '1' || req.query.preview === 'true';
  const isDev = process.env.NODE_ENV !== 'production';
  
  try {
    // Get bio profile by handle
    const db = getDatabase();

    // If preview requested in dev, fetch regardless of published status and include draft_content
    const baseSelect = `
      SELECT 
        bp.id as bio_profile_id,
        bp.handle,
        bp.curator_id,
        bp.display_settings,
        bp.theme_settings,
        bp.seo_metadata,
        bp.published_content,
        bp.draft_content,
        bp.is_published,
        bp.published_at,
        bp.created_at as bio_created_at,
        bp.updated_at as bio_updated_at,
        c.id as curator_id,
        c.name as curator_name,
        c.profile_type,
        c.bio,
        c.bio_short,
        c.profile_image,
        c.location,
        c.website_url,
        c.contact_email,
        c.social_links as social_links,
        c.external_links as external_links,
        c.verification_status,
        c.profile_visibility,
        c.spotify_url,
        c.apple_url,
        c.tidal_url,
        c.bandcamp_url
      FROM bio_profiles bp 
      JOIN curators c ON bp.curator_id = c.id 
      WHERE bp.handle = ?`;

    const bioProfile = isDev && wantPreview
      ? db.prepare(baseSelect).get(subdomain)
      : db.prepare(`${baseSelect} AND bp.is_published = 1`).get(subdomain);

    if (!bioProfile) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Bio Not Found - pil.bio</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: 'Paper Mono', monospace; background: #000; color: #fff; text-align: center; padding: 2rem;">
            <h1>Bio page not found</h1>
            <p>The handle "${subdomain}" doesn't exist or hasn't been published.</p>
            <a href="https://pil.bio" style="color: #fff;">← Back to pil.bio</a>
          </body>
        </html>
      `);
    }

    // Optional: override theme_settings for dev preview if provided by client (for instant theme preview)
    let profileForRender = bioProfile;
    if (isDev && wantPreview && req.query.theme_settings) {
      try {
        // Ensure valid JSON string; store expects a JSON string
        JSON.parse(req.query.theme_settings);
        profileForRender = { ...bioProfile, theme_settings: req.query.theme_settings };
      } catch (e) {
        // Ignore invalid override silently
      }
    }

    // Optional hidden profile links (CSV) for dev preview
    let hiddenProfileLinkTypes = [];
    if (isDev && wantPreview && req.query.hidden_profile_links) {
      hiddenProfileLinkTypes = String(req.query.hidden_profile_links)
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    }

    // Render bio page
    const htmlOutput = isDev && wantPreview
      ? await bioPageRenderer.generateBioPageFromDraft(profileForRender, { hiddenProfileLinkTypes })
      : await bioPageRenderer.generateBioPage(profileForRender, { hiddenProfileLinkTypes });
    
    res.set({
      'Content-Type': 'text/html',
      'Cache-Control': isDev ? 'no-store' : 'public, max-age=300' // 5 minute cache
    });
    
    res.send(htmlOutput);
    
  } catch (error) {
    console.error('Bio page render error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error - pil.bio</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: 'Paper Mono', monospace; background: #000; color: #fff; text-align: center; padding: 2rem;">
          <h1>Something went wrong</h1>
          <p>Unable to load bio page. Please try again later.</p>
          <a href="https://pil.bio" style="color: #fff;">← Back to pil.bio</a>
        </body>
      </html>
    `);
  }
});

export default router;
