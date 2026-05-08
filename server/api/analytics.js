import express from 'express';
import { getDatabase } from '../database/db.js';
import crypto from 'crypto';

const router = express.Router();
const db = getDatabase();

/**
 * Site Analytics - Privacy-first tracking endpoints
 * No IPs stored, session hashing with daily rotation, no cookies
 */

// Daily salt for session hashing (regenerates at midnight UTC)
const getDailySalt = () => {
  const date = new Date().toISOString().split('T')[0];
  return crypto.createHash('sha256').update(`flowerpil-${date}`).digest('hex').substring(0, 16);
};

// Session hash - rotates daily for anonymity
const hashSession = (ip, userAgent) => {
  const salt = getDailySalt();
  return crypto.createHash('sha256')
    .update(`${ip}:${userAgent}:${salt}`)
    .digest('hex')
    .substring(0, 32);
};

// Visitor hash - stable for unique visitor counting (no daily salt)
const hashVisitor = (ip, userAgent) => {
  return crypto.createHash('sha256')
    .update(`${ip}:${userAgent}:flowerpil-visitor-v1`)
    .digest('hex')
    .substring(0, 32);
};

// Get device type from user agent
const getDeviceType = (ua) => {
  if (!ua) return 'unknown';
  const lower = ua.toLowerCase();
  if (/mobile|android.*mobile|iphone|ipod|blackberry|opera mini|iemobile/i.test(lower)) return 'mobile';
  if (/tablet|ipad|android(?!.*mobile)/i.test(lower)) return 'tablet';
  return 'desktop';
};

// Get browser family from user agent
const getBrowserFamily = (ua) => {
  if (!ua) return 'unknown';
  if (/edg/i.test(ua)) return 'edge';
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return 'chrome';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'safari';
  if (/firefox/i.test(ua)) return 'firefox';
  if (/opera|opr/i.test(ua)) return 'opera';
  return 'other';
};

// Get OS family from user agent
const getOSFamily = (ua) => {
  if (!ua) return 'unknown';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/windows/i.test(ua)) return 'windows';
  if (/mac os|macos/i.test(ua)) return 'macos';
  if (/linux/i.test(ua)) return 'linux';
  return 'other';
};

// Detect bots
const isBot = (ua) => {
  if (!ua) return false;
  return /bot|crawler|spider|scraper|headless|phantom|selenium|puppeteer|playwright/i.test(ua);
};

// Parse page path to extract type and resource ID
const parsePagePath = (path) => {
  if (!path) return { type: 'other', id: null };
  if (path === '/' || path === '') return { type: 'home', id: null };

  // Playlist pages: /playlists/123 or /playlists/slug or /playlist/...
  if (path.startsWith('/playlists/') || path.startsWith('/playlist/')) {
    const segment = path.split('/')[2];
    return { type: 'playlist', id: segment || null };
  }
  if (path === '/playlists' || path === '/playlist') return { type: 'playlist', id: null };

  // Perfect Sundays
  if (path === '/perf') return { type: 'perf', id: null };

  // Curator profiles: /curators/handle or /@handle or /curator/name
  if (path.startsWith('/curators/') || path.startsWith('/curator/') || path.startsWith('/@')) {
    const segment = path.startsWith('/@') ? path.substring(2) : path.split('/')[2];
    return { type: 'curator', id: segment || null };
  }
  if (path === '/curators') return { type: 'curator', id: null };

  // Lists: /lists/...
  if (path.startsWith('/lists/')) return { type: 'list', id: path.split('/')[2] || null };

  // Top 10: /top10/...
  if (path.startsWith('/top10')) return { type: 'top10', id: path.split('/')[2] || null };

  // Search: /search
  if (path.startsWith('/search')) return { type: 'search', id: null };

  // Features / writing
  if (path.startsWith('/features')) {
    const segment = path.split('/')[2];
    return { type: 'feature', id: segment || null };
  }

  // Releases: /releases or /r/:id
  if (path === '/releases') return { type: 'release', id: null };
  if (path.startsWith('/r/')) return { type: 'release', id: path.split('/')[2] || null };

  // Blog posts
  if (path.startsWith('/posts/')) return { type: 'blog', id: path.split('/')[2] || null };

  // Bio pages
  if (path.startsWith('/bio/')) return { type: 'bio', id: path.split('/')[2] || null };

  // Content tag pages
  if (path.startsWith('/content-tag/')) return { type: 'content-tag', id: path.split('/')[2] || null };

  // Discover
  if (path === '/discover') return { type: 'discover', id: null };
  if (path === '/home') return { type: 'home', id: null };
  if (path === '/australia') return { type: 'home', id: null };

  // About
  if (path === '/about') return { type: 'about', id: null };

  // Share pages: /s/:slug, /track/:trackId, /p/:slug, /l/:slug
  if (path.startsWith('/s/')) return { type: 'share', id: path.split('/')[2] || null };
  if (path.startsWith('/track/')) return { type: 'share', id: path.split('/')[2] || null };
  if (path.startsWith('/p/')) return { type: 'share', id: path.split('/')[2] || null };
  if (path.startsWith('/l/')) return { type: 'share', id: path.split('/')[2] || null };

  // Auth pages
  if (path.startsWith('/auth/') || path === '/reset-password' || path === '/signup' || path === '/curator-admin/login') {
    return { type: 'auth', id: null };
  }

  // Admin pages
  if (path.startsWith('/admin') || path.startsWith('/curator-admin')) return { type: 'admin', id: null };

  // Remaining unknowns
  return { type: 'other', id: null };
};

// Extract referrer domain only (privacy - strip full URL)
const extractReferrerDomain = (referrer, currentHost) => {
  if (!referrer) return 'direct';
  try {
    const url = new URL(referrer);
    // Check if internal referrer
    if (currentHost && url.hostname.includes(currentHost)) return 'internal';
    if (url.hostname.includes('flowerpil')) return 'internal';
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'direct';
  }
};

// Get client IP (respecting Cloudflare headers)
const getClientIP = (req) => {
  return req.headers['cf-connecting-ip'] ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.ip ||
         '0.0.0.0';
};

/**
 * POST /api/v1/analytics/track
 * Track a pageview event
 */
router.post('/track', (req, res) => {
  try {
    const ip = getClientIP(req);
    const ua = req.headers['user-agent'] || '';
    const countryCode = req.headers['cf-ipcountry'] || null;
    const currentHost = req.headers.host;

    const {
      page_path,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content
    } = req.body;

    if (!page_path) {
      return res.status(400).json({ success: false, error: 'page_path required' });
    }

    // Skip bot traffic silently
    if (isBot(ua)) {
      return res.json({ success: true, tracked: false });
    }

    const sessionHash = hashSession(ip, ua);
    const visitorHash = hashVisitor(ip, ua);
    const { type: pageType, id: resourceId } = parsePagePath(page_path);
    const referrerDomain = extractReferrerDomain(referrer, currentHost);

    // Insert pageview event
    db.prepare(`
      INSERT INTO site_analytics_events (
        session_hash, visitor_hash, page_path, page_type, resource_id,
        event_type, referrer_domain, utm_source, utm_medium, utm_campaign,
        utm_term, utm_content, country_code, device_type, browser_family,
        os_family, is_bot
      ) VALUES (?, ?, ?, ?, ?, 'pageview', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      sessionHash, visitorHash, page_path, pageType, resourceId,
      referrerDomain, utm_source || null, utm_medium || null, utm_campaign || null,
      utm_term || null, utm_content || null, countryCode, getDeviceType(ua),
      getBrowserFamily(ua), getOSFamily(ua)
    );

    // Update or insert realtime tracking
    db.prepare(`
      INSERT INTO site_analytics_realtime (
        session_hash, page_path, page_type, resource_id,
        started_at, last_heartbeat, country_code, device_type, referrer_domain
      ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)
      ON CONFLICT(session_hash) DO UPDATE SET
        page_path = excluded.page_path,
        page_type = excluded.page_type,
        resource_id = excluded.resource_id,
        last_heartbeat = datetime('now')
    `).run(
      sessionHash, page_path, pageType, resourceId,
      countryCode, getDeviceType(ua), referrerDomain
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[ANALYTICS] Track error:', error.message);
    res.status(500).json({ success: false });
  }
});

/**
 * POST /api/v1/analytics/heartbeat
 * Keep a realtime session alive
 */
router.post('/heartbeat', (req, res) => {
  try {
    const ip = getClientIP(req);
    const ua = req.headers['user-agent'] || '';
    const sessionHash = hashSession(ip, ua);
    const { page_path } = req.body;

    if (!page_path) {
      return res.json({ success: true });
    }

    const { type: pageType, id: resourceId } = parsePagePath(page_path);

    db.prepare(`
      UPDATE site_analytics_realtime
      SET last_heartbeat = datetime('now'),
          page_path = ?,
          page_type = ?,
          resource_id = ?
      WHERE session_hash = ?
    `).run(page_path, pageType, resourceId, sessionHash);

    res.json({ success: true });
  } catch (error) {
    // Fail silently for heartbeats
    res.json({ success: true });
  }
});

/**
 * POST /api/v1/analytics/exit
 * Track page exit (called via sendBeacon)
 */
router.post('/exit', express.text({ type: '*/*' }), (req, res) => {
  try {
    // Parse body - could be JSON string from sendBeacon
    let data;
    try {
      data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.json({ success: true });
    }

    const ip = getClientIP(req);
    const ua = req.headers['user-agent'] || '';
    const countryCode = req.headers['cf-ipcountry'] || null;
    const sessionHash = hashSession(ip, ua);
    const visitorHash = hashVisitor(ip, ua);

    const { page_path, time_on_page, scroll_depth } = data;

    if (!page_path) {
      return res.json({ success: true });
    }

    const { type: pageType, id: resourceId } = parsePagePath(page_path);

    // Insert exit event
    db.prepare(`
      INSERT INTO site_analytics_events (
        session_hash, visitor_hash, page_path, page_type, resource_id,
        event_type, time_on_page, scroll_depth, country_code, device_type,
        browser_family, os_family
      ) VALUES (?, ?, ?, ?, ?, 'exit', ?, ?, ?, ?, ?, ?)
    `).run(
      sessionHash, visitorHash, page_path, pageType, resourceId,
      time_on_page || 0, scroll_depth || 0,
      countryCode, getDeviceType(ua), getBrowserFamily(ua), getOSFamily(ua)
    );

    // Update exit counts for this page
    db.prepare(`
      INSERT INTO site_analytics_exits (date, page_path, exit_count, avg_time_before_exit)
      VALUES (date('now'), ?, 1, ?)
      ON CONFLICT(date, page_path) DO UPDATE SET
        exit_count = exit_count + 1,
        avg_time_before_exit = (avg_time_before_exit * exit_count + ?) / (exit_count + 1)
    `).run(page_path, time_on_page || 0, time_on_page || 0);

    // Remove from realtime
    db.prepare('DELETE FROM site_analytics_realtime WHERE session_hash = ?').run(sessionHash);

    res.json({ success: true });
  } catch (error) {
    // Fail silently for exit beacons
    res.json({ success: true });
  }
});

// ===== ACTION TRACKING (User Behavior Priorities) =====

const ACTION_TYPES_SET = new Set(['click', 'start', 'complete', 'error', 'performance', 'dropoff']);
const FEATURE_KEY_RE = /^[a-z_]+$/;
const SENSITIVE_KEYS_RE = /^(email|token|password|auth|cookie|secret|key|ssn|phone)$/i;
const PII_TEXT_RE = /[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/\S+/gi;

// Per-session rate limiting: max 100 actions/min
const sessionActionCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 100;

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sessionActionCounts) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      sessionActionCounts.delete(key);
    }
  }
}, 300000).unref?.();

const checkRateLimit = (sessionHash) => {
  const now = Date.now();
  const entry = sessionActionCounts.get(sessionHash);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    sessionActionCounts.set(sessionHash, { windowStart: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
};

const sampleRate = parseFloat(process.env.ANALYTICS_ACTION_SAMPLE_RATE || '1.0');
const devMode = process.env.ANALYTICS_DEV_MODE === 'true';

const shouldSkipDevTraffic = (req) => {
  if (devMode) return false;
  const host = req.headers.host || '';
  return host.includes('localhost') || host.includes('127.0.0.1') || host.includes('dev.testing');
};

const sanitizeTargetText = (text) => {
  if (!text) return null;
  let clean = String(text).replace(/<[^>]*>/g, '').replace(PII_TEXT_RE, '').trim();
  return clean.substring(0, 50) || null;
};

const sanitizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return null;
  const clean = {};
  let keyCount = 0;
  for (const [k, v] of Object.entries(metadata)) {
    if (keyCount >= 10) break;
    if (SENSITIVE_KEYS_RE.test(k)) continue;
    const val = String(v ?? '').substring(0, 200);
    clean[k] = val;
    keyCount++;
  }
  const json = JSON.stringify(clean);
  return json.length <= 2048 ? json : null;
};

const validateAction = (payload) => {
  if (!payload) return null;
  const { feature_key, action_type, action_name } = payload;
  if (!feature_key || !action_type || !action_name) return null;
  if (typeof feature_key !== 'string' || feature_key.length > 64 || !FEATURE_KEY_RE.test(feature_key)) return null;
  if (!ACTION_TYPES_SET.has(action_type)) return null;
  if (typeof action_name !== 'string' || action_name.length > 64) return null;

  const targetKey = payload.target_key ? String(payload.target_key).substring(0, 64) : null;
  const targetText = sanitizeTargetText(payload.target_text);
  const durationMs = typeof payload.duration_ms === 'number'
    ? Math.max(0, Math.min(payload.duration_ms, 300000))
    : null;
  const valueNum = typeof payload.value_num === 'number'
    ? Math.max(-1000000, Math.min(payload.value_num, 1000000))
    : null;
  const success = payload.success === 1 || payload.success === true ? 1
    : payload.success === 0 || payload.success === false ? 0
    : null;
  const metadataJson = sanitizeMetadata(payload.metadata);

  return {
    feature_key,
    action_type,
    action_name,
    target_key: targetKey,
    target_text: targetText,
    duration_ms: durationMs,
    value_num: valueNum,
    success,
    metadata_json: metadataJson,
    page_path: typeof payload.page_path === 'string' ? payload.page_path : null,
  };
};

// Check for privacy mode from analytics_settings
let privacyModeCache = null;
let privacyModeCacheTime = 0;
const getPrivacyMode = () => {
  const now = Date.now();
  if (privacyModeCache !== null && now - privacyModeCacheTime < 60000) return privacyModeCache;
  try {
    const row = db.prepare("SELECT value FROM site_settings WHERE key = 'analytics_settings'").get();
    if (row) {
      const settings = JSON.parse(row.value);
      privacyModeCache = !!settings.privacy_mode;
    } else {
      privacyModeCache = false;
    }
  } catch {
    privacyModeCache = false;
  }
  privacyModeCacheTime = now;
  return privacyModeCache;
};

const insertActionStmt = db.prepare(`
  INSERT INTO site_analytics_actions (
    session_hash, visitor_hash, page_path, page_type, resource_id,
    feature_key, action_type, action_name, target_key, target_text,
    duration_ms, value_num, success, metadata_json,
    country_code, device_type, browser_family, os_family, is_bot
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTransitionStmt = db.prepare(`
  INSERT INTO site_analytics_transitions (from_feature, to_feature, session_hash)
  VALUES (?, ?, ?)
`);

const lastActionStmt = db.prepare(`
  SELECT feature_key FROM site_analytics_actions
  WHERE session_hash = ? AND id != ?
  ORDER BY occurred_at DESC LIMIT 1
`);

const processAction = (validated, ip, ua, countryCode, referer) => {
  const sessionHash = hashSession(ip, ua);
  const visitorHash = hashVisitor(ip, ua);

  // Derive page_path from payload or referer
  let pagePath = validated.page_path;
  if (!pagePath && referer) {
    try {
      const url = new URL(referer);
      pagePath = url.pathname;
    } catch {
      pagePath = '/';
    }
  }
  pagePath = pagePath || '/';

  const { type: pageType, id: resourceId } = parsePagePath(pagePath);
  const isBotFlag = isBot(ua) ? 1 : 0;

  const result = insertActionStmt.run(
    sessionHash, visitorHash, pagePath, pageType, resourceId,
    validated.feature_key, validated.action_type, validated.action_name,
    validated.target_key, validated.target_text,
    validated.duration_ms, validated.value_num, validated.success,
    validated.metadata_json,
    countryCode, getDeviceType(ua), getBrowserFamily(ua), getOSFamily(ua), isBotFlag
  );

  // Check for transition
  try {
    const prev = lastActionStmt.get(sessionHash, result.lastInsertRowid);
    if (prev && prev.feature_key !== validated.feature_key) {
      insertTransitionStmt.run(prev.feature_key, validated.feature_key, sessionHash);
    }
  } catch {
    // Transition insert is non-critical
  }
};

/**
 * POST /api/v1/analytics/action
 * Track a single behavior action
 */
router.post('/action', (req, res) => {
  try {
    if (shouldSkipDevTraffic(req)) return res.json({ success: true });
    if (getPrivacyMode()) return res.json({ success: true });
    if (Math.random() >= sampleRate) return res.json({ success: true });

    const ip = getClientIP(req);
    const ua = req.headers['user-agent'] || '';
    if (isBot(ua)) return res.json({ success: true });

    const sessionHash = hashSession(ip, ua);
    if (!checkRateLimit(sessionHash)) return res.json({ success: true });

    const validated = validateAction(req.body);
    if (!validated) return res.json({ success: true });

    const countryCode = req.headers['cf-ipcountry'] || null;
    const referer = req.headers.referer || req.headers.referrer || null;

    processAction(validated, ip, ua, countryCode, referer);

    res.json({ success: true });
  } catch (error) {
    console.error('[ANALYTICS] Action track error:', error.message);
    res.json({ success: true });
  }
});

/**
 * POST /api/v1/analytics/actions
 * Track a batch of behavior actions (max 25)
 */
router.post('/actions', express.text({ type: '*/*', limit: '64kb' }), (req, res) => {
  try {
    if (shouldSkipDevTraffic(req)) return res.json({ success: true });
    if (getPrivacyMode()) return res.json({ success: true });

    // Parse body - could be JSON string from sendBeacon
    let data;
    try {
      data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.json({ success: true });
    }

    const events = Array.isArray(data) ? data : data?.events;
    if (!Array.isArray(events) || events.length === 0) return res.json({ success: true });

    const ip = getClientIP(req);
    const ua = req.headers['user-agent'] || '';
    if (isBot(ua)) return res.json({ success: true });

    const sessionHash = hashSession(ip, ua);
    if (!checkRateLimit(sessionHash)) return res.json({ success: true });

    const countryCode = req.headers['cf-ipcountry'] || null;
    const referer = req.headers.referer || req.headers.referrer || null;

    const batchInsert = db.transaction(() => {
      const limit = Math.min(events.length, 25);
      for (let i = 0; i < limit; i++) {
        if (Math.random() >= sampleRate) continue;
        const validated = validateAction(events[i]);
        if (!validated) continue;
        processAction(validated, ip, ua, countryCode, referer);
      }
    });

    batchInsert();

    res.json({ success: true });
  } catch (error) {
    console.error('[ANALYTICS] Batch action track error:', error.message);
    res.json({ success: true });
  }
});

export default router;
