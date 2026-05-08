import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Simple in-memory cache
let cachedSitemap = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Generate sitemap XML from database
 */
function generateSitemap(db) {
  const baseUrl = 'https://flowerpil.io';
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  // Get all published playlists
  const playlists = db.prepare(`
    SELECT p.id, p.title, p.curator_name, p.published_at, p.updated_at
    FROM playlists p
    LEFT JOIN curators c ON p.curator_id = c.id
    WHERE p.published = 1
      AND (c.is_demo IS NULL OR c.is_demo = 0)
    ORDER BY p.published_at DESC
  `).all();

  // Get all tracks from published playlists
  const tracks = db.prepare(`
    SELECT t.id, t.created_at, p.published_at, p.updated_at
    FROM tracks t
    JOIN playlists p ON t.playlist_id = p.id
    LEFT JOIN curators c ON p.curator_id = c.id
    WHERE p.published = 1
      AND (c.is_demo IS NULL OR c.is_demo = 0)
    ORDER BY t.created_at DESC
  `).all();

  // Get all public curators
  const curators = db.prepare(`
    SELECT id, name, type, created_at, updated_at
    FROM curators
    WHERE profile_visibility = 'public'
      AND (is_demo IS NULL OR is_demo = 0)
    ORDER BY name ASC
  `).all();

  // Get all published releases
  const releases = db.prepare(`
    SELECT r.id, r.post_date, r.release_date, r.updated_at
    FROM releases r
    LEFT JOIN curators c ON r.curator_id = c.id
    WHERE r.is_published = 1
      AND (c.is_demo IS NULL OR c.is_demo = 0)
    ORDER BY r.post_date DESC, r.updated_at DESC
  `).all();

  // Build XML sitemap
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Homepage - highest priority, daily updates
  xml += '  <url>\n';
  xml += `    <loc>${baseUrl}/</loc>\n`;
  xml += `    <lastmod>${now}</lastmod>\n`;
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>1.0</priority>\n';
  xml += '  </url>\n';

  // Category pages - high priority, weekly updates
  const categoryPages = [
    { path: '/playlists', priority: '0.8' },
    { path: '/curators', priority: '0.8' },
    { path: '/about', priority: '0.5' }
  ];

  categoryPages.forEach(page => {
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}${page.path}</loc>\n`;
    xml += `    <lastmod>${now}</lastmod>\n`;
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += '  </url>\n';
  });

  // Individual playlists - medium priority, monthly updates
  playlists.forEach(playlist => {
    const lastmod = playlist.published_at || playlist.updated_at || now;
    const formattedDate = new Date(lastmod).toISOString().split('T')[0];

    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}/playlists/${playlist.id}</loc>\n`;
    xml += `    <lastmod>${formattedDate}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.7</priority>\n';
    xml += '  </url>\n';
  });

  // Individual tracks - medium priority, monthly updates
  tracks.forEach(track => {
    const lastmod = track.published_at || track.updated_at || track.created_at || now;
    const formattedDate = new Date(lastmod).toISOString().split('T')[0];

    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}/track/${track.id}</loc>\n`;
    xml += `    <lastmod>${formattedDate}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.5</priority>\n';
    xml += '  </url>\n';
  });

  // Individual releases - medium priority, monthly updates
  releases.forEach(release => {
    const lastmod = release.post_date || release.updated_at || release.release_date || now;
    const formattedDate = new Date(lastmod).toISOString().split('T')[0];

    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}/r/${release.id}</loc>\n`;
    xml += `    <lastmod>${formattedDate}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.6</priority>\n';
    xml += '  </url>\n';
  });

  // Individual curator profiles - medium priority, weekly updates
  curators.forEach(curator => {
    const encodedName = encodeURIComponent(curator.name);
    const lastmod = curator.updated_at || curator.created_at || now;
    const formattedDate = new Date(lastmod).toISOString().split('T')[0];

    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}/curator/${encodedName}</loc>\n`;
    xml += `    <lastmod>${formattedDate}</lastmod>\n`;
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += '    <priority>0.6</priority>\n';
    xml += '  </url>\n';
  });

  xml += '</urlset>';

  return xml;
}

/**
 * GET /sitemap.xml - Dynamic sitemap generation
 */
router.get('/sitemap.xml', (req, res) => {
  try {
    const now = Date.now();

    // Check if cached sitemap is still valid
    if (cachedSitemap && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // 1 hour cache
      res.set('X-Robots-Tag', 'all'); // Allow robots to crawl sitemap
      res.set('X-Cache', 'HIT');
      return res.send(cachedSitemap);
    }

    // Generate new sitemap
    const dbPath = path.join(__dirname, '../../data/flowerpil.db');
    const db = new Database(dbPath, { readonly: true });

    const sitemap = generateSitemap(db);
    db.close();

    // Update cache
    cachedSitemap = sitemap;
    cacheTimestamp = now;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // 1 hour cache
    res.set('X-Robots-Tag', 'all'); // Allow robots to crawl sitemap
    res.set('X-Cache', 'MISS');
    res.send(sitemap);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
});

export default router;
