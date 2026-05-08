import express from 'express';
import { getDatabase } from '../../database/db.js';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware, requireAdmin);
const db = getDatabase();

const RANGE_LIMITS = {
  minutes: { min: 5, max: 43200 },
  hours: { min: 1, max: 720 },
  days: { min: 1, max: 365 }
};

const normalizeRangeUnit = (unit) => {
  const normalized = (unit || 'minutes').toString().trim().toLowerCase();
  if (['minute', 'minutes', 'min', 'm'].includes(normalized)) return 'minutes';
  if (['hour', 'hours', 'hr', 'h'].includes(normalized)) return 'hours';
  if (['day', 'days', 'd'].includes(normalized)) return 'days';
  return 'minutes';
};

const getRangeInput = (rawValue, rawUnit) => {
  const value = parseInt(rawValue, 10);
  if (!Number.isFinite(value)) return null;
  const unit = normalizeRangeUnit(rawUnit);
  const limits = RANGE_LIMITS[unit];
  const clampedValue = Math.min(Math.max(value, limits.min), limits.max);
  const minutesPerUnit = unit === 'hours' ? 60 : unit === 'days' ? 1440 : 1;
  return {
    value: clampedValue,
    unit,
    minutes: clampedValue * minutesPerUnit
  };
};

const getBucketConfig = (rangeMinutes) => {
  if (rangeMinutes <= 1440) {
    return { unit: 'minute', groupBy: "strftime('%Y-%m-%d %H:%M', timestamp)" };
  }
  if (rangeMinutes <= 10080) {
    return { unit: 'hour', groupBy: "strftime('%Y-%m-%d %H:00', timestamp)" };
  }
  return { unit: 'day', groupBy: "date(timestamp)" };
};

// Unified range resolver: supports range+unit params or legacy days param
const getMinutesFromQuery = (query, defaultDays = 7) => {
  const rangeInput = getRangeInput(query.range, query.unit);
  if (rangeInput) return rangeInput.minutes;
  const days = parseInt(query.days, 10);
  return (Number.isFinite(days) && days > 0 ? Math.min(days, 365) : defaultDays) * 1440;
};

/**
 * Admin Analytics Dashboard API
 * Provides aggregated analytics data for the admin dashboard
 */

/**
 * GET /api/v1/admin/analytics/overview
 * Summary stats for dashboard header
 */
router.get('/overview', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const rangeInput = getRangeInput(req.query.range, req.query.unit);

    // Today's stats from events
    const todayStats = db.prepare(`
      SELECT
        COUNT(*) as pageviews,
        COUNT(DISTINCT visitor_hash) as unique_visitors,
        COUNT(DISTINCT session_hash) as unique_sessions
      FROM site_analytics_events
      WHERE date(timestamp) = date('now')
        AND event_type = 'pageview'
    `).get();

    // Last 7 days stats
    const weekStats = db.prepare(`
      SELECT
        COUNT(*) as pageviews,
        COUNT(DISTINCT visitor_hash) as unique_visitors,
        COUNT(DISTINCT session_hash) as unique_sessions
      FROM site_analytics_events
      WHERE timestamp >= datetime('now', '-7 days')
        AND event_type = 'pageview'
    `).get();

    // Last 30 days stats
    const monthStats = db.prepare(`
      SELECT
        COUNT(*) as pageviews,
        COUNT(DISTINCT visitor_hash) as unique_visitors,
        COUNT(DISTINCT session_hash) as unique_sessions
      FROM site_analytics_events
      WHERE timestamp >= datetime('now', '-30 days')
        AND event_type = 'pageview'
    `).get();

    const rangeStats = rangeInput ? db.prepare(`
      SELECT
        COUNT(*) as pageviews,
        COUNT(DISTINCT visitor_hash) as unique_visitors,
        COUNT(DISTINCT session_hash) as unique_sessions
      FROM site_analytics_events
      WHERE timestamp >= datetime('now', '-' || ? || ' minutes')
        AND event_type = 'pageview'
    `).get(rangeInput.minutes) : null;

    // Average time on page (from exit events)
    const avgTimeOnPage = db.prepare(`
      SELECT AVG(time_on_page) as avg_time
      FROM site_analytics_events
      WHERE event_type = 'exit'
        AND timestamp >= datetime('now', '-7 days')
        AND time_on_page > 0
        AND time_on_page < 3600
    `).get();

    const rangeAvgTimeOnPage = rangeInput ? db.prepare(`
      SELECT AVG(time_on_page) as avg_time
      FROM site_analytics_events
      WHERE event_type = 'exit'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
        AND time_on_page > 0
        AND time_on_page < 3600
    `).get(rangeInput.minutes) : null;

    // Current realtime visitors
    const realtimeCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM site_analytics_realtime
      WHERE last_heartbeat >= datetime('now', '-2 minutes')
    `).get();

    res.json({
      success: true,
      data: {
        today: {
          pageviews: todayStats?.pageviews || 0,
          uniqueVisitors: todayStats?.unique_visitors || 0,
          uniqueSessions: todayStats?.unique_sessions || 0
        },
        week: {
          pageviews: weekStats?.pageviews || 0,
          uniqueVisitors: weekStats?.unique_visitors || 0,
          uniqueSessions: weekStats?.unique_sessions || 0
        },
        month: {
          pageviews: monthStats?.pageviews || 0,
          uniqueVisitors: monthStats?.unique_visitors || 0,
          uniqueSessions: monthStats?.unique_sessions || 0
        },
        range: rangeInput ? {
          value: rangeInput.value,
          unit: rangeInput.unit,
          minutes: rangeInput.minutes,
          pageviews: rangeStats?.pageviews || 0,
          uniqueVisitors: rangeStats?.unique_visitors || 0,
          uniqueSessions: rangeStats?.unique_sessions || 0,
          avgTimeOnPage: Math.round(rangeAvgTimeOnPage?.avg_time || 0)
        } : null,
        avgTimeOnPage: Math.round(avgTimeOnPage?.avg_time || 0),
        realtimeVisitors: realtimeCount?.count || 0
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Overview error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch overview' });
  }
});

/**
 * GET /api/v1/admin/analytics/realtime
 * Current active users by page
 */
router.get('/realtime', (req, res) => {
  try {
    const visitors = db.prepare(`
      SELECT
        page_path,
        page_type,
        country_code,
        device_type,
        referrer_domain,
        started_at,
        last_heartbeat
      FROM site_analytics_realtime
      WHERE last_heartbeat >= datetime('now', '-2 minutes')
      ORDER BY last_heartbeat DESC
    `).all();

    // Group by page
    const byPage = {};
    visitors.forEach(v => {
      if (!byPage[v.page_path]) {
        byPage[v.page_path] = {
          path: v.page_path,
          type: v.page_type,
          count: 0,
          visitors: []
        };
      }
      byPage[v.page_path].count++;
      byPage[v.page_path].visitors.push({
        country: v.country_code,
        device: v.device_type,
        referrer: v.referrer_domain,
        duration: Math.round((Date.now() - new Date(v.started_at + 'Z').getTime()) / 1000)
      });
    });

    const pages = Object.values(byPage).sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      data: {
        totalVisitors: visitors.length,
        pages
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Realtime error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch realtime' });
  }
});

/**
 * GET /api/v1/admin/analytics/events
 * Recent events for the event log (verbose view)
 */
router.get('/events', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const pageType = req.query.page_type || null;
    const eventType = req.query.event_type || 'pageview';

    let whereClause = 'WHERE event_type = ?';
    const params = [eventType];

    if (pageType) {
      whereClause += ' AND page_type = ?';
      params.push(pageType);
    }

    params.push(limit, offset);

    const events = db.prepare(`
      SELECT
        id,
        page_path,
        page_type,
        resource_id,
        event_type,
        referrer_domain,
        utm_source,
        utm_medium,
        utm_campaign,
        country_code,
        device_type,
        browser_family,
        os_family,
        time_on_page,
        scroll_depth,
        timestamp
      FROM site_analytics_events
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(...params);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM site_analytics_events ${whereClause}
    `).get(...params.slice(0, -2));

    res.json({
      success: true,
      data: {
        events,
        total: total?.count || 0,
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Events error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/v1/admin/analytics/pages
 * Top pages and exit pages
 */
router.get('/pages', (req, res) => {
  try {
    const minutes = getMinutesFromQuery(req.query, 7);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    // Top pages by views
    const topPages = db.prepare(`
      SELECT
        page_path,
        page_type,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_hash) as unique_visitors,
        COUNT(DISTINCT session_hash) as sessions
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT ?
    `).all(minutes, limit);

    // Top exit pages
    const topExits = db.prepare(`
      SELECT
        page_path,
        SUM(exit_count) as exit_count,
        AVG(avg_time_before_exit) as avg_time
      FROM site_analytics_exits
      WHERE date >= date('now', '-' || CAST(? / 1440 AS INTEGER) || ' days')
      GROUP BY page_path
      ORDER BY exit_count DESC
      LIMIT ?
    `).all(minutes, limit);

    // Page type breakdown
    const byType = db.prepare(`
      SELECT
        page_type,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_hash) as unique_visitors
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
      GROUP BY page_type
      ORDER BY views DESC
    `).all(minutes);

    res.json({
      success: true,
      data: {
        topPages,
        topExits,
        byType,
        period: `${Math.round(minutes / 1440)}d`
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Pages error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch pages' });
  }
});

/**
 * GET /api/v1/admin/analytics/geography
 * Country breakdown
 */
router.get('/geography', (req, res) => {
  try {
    const minutes = getMinutesFromQuery(req.query, 7);

    const countries = db.prepare(`
      SELECT
        country_code,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_hash) as unique_visitors
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
        AND country_code IS NOT NULL
        AND country_code != ''
      GROUP BY country_code
      ORDER BY views DESC
      LIMIT 50
    `).all(minutes);

    // Calculate totals for percentages
    const totals = db.prepare(`
      SELECT
        COUNT(*) as total_views,
        COUNT(DISTINCT visitor_hash) as total_visitors
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
    `).get(minutes);

    res.json({
      success: true,
      data: {
        countries,
        totals: {
          views: totals?.total_views || 0,
          visitors: totals?.total_visitors || 0
        },
        period: `${Math.round(minutes / 1440)}d`
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Geography error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch geography' });
  }
});

/**
 * GET /api/v1/admin/analytics/sources
 * Traffic sources breakdown
 */
router.get('/sources', (req, res) => {
  try {
    const minutes = getMinutesFromQuery(req.query, 7);

    // Referrer breakdown
    const referrers = db.prepare(`
      SELECT
        referrer_domain,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_hash) as unique_visitors
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
      GROUP BY referrer_domain
      ORDER BY views DESC
      LIMIT 50
    `).all(minutes);

    // UTM source breakdown
    const utmSources = db.prepare(`
      SELECT
        utm_source,
        utm_medium,
        utm_campaign,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_hash) as unique_visitors
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
        AND utm_source IS NOT NULL
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY views DESC
      LIMIT 50
    `).all(minutes);

    // Device breakdown
    const devices = db.prepare(`
      SELECT
        device_type,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_hash) as unique_visitors
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
      GROUP BY device_type
      ORDER BY views DESC
    `).all(minutes);

    // Browser breakdown
    const browsers = db.prepare(`
      SELECT
        browser_family,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_hash) as unique_visitors
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
      GROUP BY browser_family
      ORDER BY views DESC
    `).all(minutes);

    res.json({
      success: true,
      data: {
        referrers,
        utmSources,
        devices,
        browsers,
        period: `${Math.round(minutes / 1440)}d`
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Sources error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch sources' });
  }
});

/**
 * GET /api/v1/admin/analytics/traffic
 * Traffic over time
 */
router.get('/traffic', (req, res) => {
  try {
    const rangeInput = getRangeInput(req.query.range, req.query.unit);

    if (rangeInput) {
      const bucketConfig = getBucketConfig(rangeInput.minutes);
      const series = db.prepare(`
        SELECT
          ${bucketConfig.groupBy} as bucket,
          COUNT(*) as pageviews,
          COUNT(DISTINCT visitor_hash) as unique_visitors,
          COUNT(DISTINCT session_hash) as sessions
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND timestamp >= datetime('now', '-' || ? || ' minutes')
        GROUP BY bucket
        ORDER BY bucket ASC
      `).all(rangeInput.minutes);

      res.json({
        success: true,
        data: {
          series,
          bucketUnit: bucketConfig.unit,
          range: rangeInput
        }
      });
      return;
    }

    const days = parseInt(req.query.days) || 7;

    // Daily traffic
    const daily = db.prepare(`
      SELECT
        date(timestamp) as date,
        COUNT(*) as pageviews,
        COUNT(DISTINCT visitor_hash) as unique_visitors,
        COUNT(DISTINCT session_hash) as sessions
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY date(timestamp)
      ORDER BY date ASC
    `).all(days);

    // Hourly traffic for today
    const hourly = db.prepare(`
      SELECT
        strftime('%H', timestamp) as hour,
        COUNT(*) as pageviews,
        COUNT(DISTINCT visitor_hash) as unique_visitors
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND date(timestamp) = date('now')
      GROUP BY strftime('%H', timestamp)
      ORDER BY hour ASC
    `).all();

    res.json({
      success: true,
      data: {
        daily,
        hourly,
        period: `${days}d`
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Traffic error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch traffic' });
  }
});

/**
 * GET /api/v1/admin/analytics/export
 * Export analytics data as CSV
 */
router.get('/export', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const type = req.query.type || 'daily'; // daily, events, pages

    let csv = '';
    let filename = '';

    if (type === 'daily') {
      // Export daily aggregated stats
      const data = db.prepare(`
        SELECT
          date(timestamp) as date,
          COUNT(*) as pageviews,
          COUNT(DISTINCT visitor_hash) as unique_visitors,
          COUNT(DISTINCT session_hash) as sessions
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND timestamp >= datetime('now', '-' || ? || ' days')
        GROUP BY date(timestamp)
        ORDER BY date DESC
      `).all(days);

      csv = 'Date,Page Views,Unique Visitors,Sessions\n';
      data.forEach(row => {
        csv += `${row.date},${row.pageviews},${row.unique_visitors},${row.sessions}\n`;
      });
      filename = `analytics-daily-${days}d.csv`;

    } else if (type === 'events') {
      // Export recent events
      const limit = Math.min(parseInt(req.query.limit) || 1000, 5000);
      const data = db.prepare(`
        SELECT
          timestamp,
          page_path,
          page_type,
          resource_id,
          referrer_domain,
          utm_source,
          utm_medium,
          utm_campaign,
          country_code,
          device_type,
          browser_family,
          time_on_page,
          scroll_depth
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND timestamp >= datetime('now', '-' || ? || ' days')
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(days, limit);

      csv = 'Timestamp,Page Path,Page Type,Resource ID,Referrer,UTM Source,UTM Medium,UTM Campaign,Country,Device,Browser,Time on Page,Scroll Depth\n';
      data.forEach(row => {
        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        csv += [
          row.timestamp,
          escapeCsv(row.page_path),
          row.page_type,
          row.resource_id || '',
          row.referrer_domain || 'direct',
          row.utm_source || '',
          row.utm_medium || '',
          row.utm_campaign || '',
          row.country_code || '',
          row.device_type || '',
          row.browser_family || '',
          row.time_on_page || '',
          row.scroll_depth || ''
        ].join(',') + '\n';
      });
      filename = `analytics-events-${days}d.csv`;

    } else if (type === 'pages') {
      // Export page stats
      const data = db.prepare(`
        SELECT
          page_path,
          page_type,
          COUNT(*) as views,
          COUNT(DISTINCT visitor_hash) as unique_visitors,
          COUNT(DISTINCT session_hash) as sessions
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND timestamp >= datetime('now', '-' || ? || ' days')
        GROUP BY page_path
        ORDER BY views DESC
      `).all(days);

      csv = 'Page Path,Page Type,Views,Unique Visitors,Sessions\n';
      data.forEach(row => {
        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        csv += `${escapeCsv(row.page_path)},${row.page_type},${row.views},${row.unique_visitors},${row.sessions}\n`;
      });
      filename = `analytics-pages-${days}d.csv`;

    } else if (type === 'resources') {
      // Export per-resource stats (playlists/curators)
      const data = db.prepare(`
        SELECT
          page_type,
          resource_id,
          page_path,
          COUNT(*) as views,
          COUNT(DISTINCT visitor_hash) as unique_visitors,
          COUNT(DISTINCT session_hash) as sessions
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND timestamp >= datetime('now', '-' || ? || ' days')
          AND resource_id IS NOT NULL
        GROUP BY page_type, resource_id
        ORDER BY views DESC
      `).all(days);

      csv = 'Type,Resource ID,Page Path,Views,Unique Visitors,Sessions\n';
      data.forEach(row => {
        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        csv += `${row.page_type},${row.resource_id},${escapeCsv(row.page_path)},${row.views},${row.unique_visitors},${row.sessions}\n`;
      });
      filename = `analytics-resources-${days}d.csv`;

    } else {
      return res.status(400).json({ success: false, error: 'Invalid export type' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Export error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to export data' });
  }
});

/**
 * GET /api/v1/admin/analytics/resources
 * Analytics for specific resources (playlists/curators)
 */
router.get('/resources', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const pageType = req.query.page_type || null; // 'playlist', 'curator', etc.
    const resourceId = req.query.resource_id || null;

    // If specific resource requested
    if (resourceId) {
      const stats = db.prepare(`
        SELECT
          COUNT(*) as views,
          COUNT(DISTINCT visitor_hash) as unique_visitors,
          COUNT(DISTINCT session_hash) as sessions
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND resource_id = ?
          AND timestamp >= datetime('now', '-' || ? || ' days')
      `).get(resourceId, days);

      // Daily breakdown for this resource
      const daily = db.prepare(`
        SELECT
          date(timestamp) as date,
          COUNT(*) as views,
          COUNT(DISTINCT visitor_hash) as unique_visitors
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND resource_id = ?
          AND timestamp >= datetime('now', '-' || ? || ' days')
        GROUP BY date(timestamp)
        ORDER BY date ASC
      `).all(resourceId, days);

      // Traffic sources for this resource
      const sources = db.prepare(`
        SELECT
          referrer_domain,
          COUNT(*) as views
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND resource_id = ?
          AND timestamp >= datetime('now', '-' || ? || ' days')
        GROUP BY referrer_domain
        ORDER BY views DESC
        LIMIT 10
      `).all(resourceId, days);

      return res.json({
        success: true,
        data: {
          resourceId,
          stats: {
            views: stats?.views || 0,
            uniqueVisitors: stats?.unique_visitors || 0,
            sessions: stats?.sessions || 0
          },
          daily,
          sources,
          period: `${days}d`
        }
      });
    }

    // Otherwise, return top resources
    let whereClause = "WHERE event_type = 'pageview' AND resource_id IS NOT NULL";
    const params = [days];

    if (pageType) {
      whereClause += ' AND page_type = ?';
      params.push(pageType);
    }

    const topResources = db.prepare(`
      SELECT
        page_type,
        resource_id,
        page_path,
        COUNT(*) as views,
        COUNT(DISTINCT visitor_hash) as unique_visitors,
        COUNT(DISTINCT session_hash) as sessions
      FROM site_analytics_events
      ${whereClause}
        AND timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY resource_id
      ORDER BY views DESC
      LIMIT 50
    `).all(...params);

    // Get resource type breakdown
    const byType = db.prepare(`
      SELECT
        page_type,
        COUNT(DISTINCT resource_id) as resource_count,
        COUNT(*) as total_views,
        COUNT(DISTINCT visitor_hash) as unique_visitors
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND resource_id IS NOT NULL
        AND timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY page_type
      ORDER BY total_views DESC
    `).all(days);

    res.json({
      success: true,
      data: {
        topResources,
        byType,
        period: `${days}d`
      }
    });

  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Resources error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch resources' });
  }
});

/**
 * GET /api/v1/admin/analytics/journeys
 * Common session patterns - what pages users visit in sequence
 */
router.get('/journeys', (req, res) => {
  try {
    const minutes = getMinutesFromQuery(req.query, 7);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const sessions = db.prepare(`
      SELECT
        session_hash,
        GROUP_CONCAT(page_type || ':' || COALESCE(page_path, ''), '|') as journey,
        COUNT(*) as page_count,
        MIN(timestamp) as started,
        MAX(timestamp) as ended
      FROM site_analytics_events
      WHERE event_type = 'pageview'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
      GROUP BY session_hash
      HAVING page_count >= 2
      ORDER BY started DESC
      LIMIT 500
    `).all(minutes);

    const patternCounts = {};
    sessions.forEach(session => {
      const steps = session.journey.split('|').map(s => {
        const [type] = s.split(':');
        return type || 'unknown';
      });
      const pattern = steps.slice(0, 5).join(' -> ');
      if (!patternCounts[pattern]) {
        patternCounts[pattern] = { pattern, steps: steps.slice(0, 5), count: 0, totalPages: 0 };
      }
      patternCounts[pattern].count++;
      patternCounts[pattern].totalPages += session.page_count;
    });

    const topPatterns = Object.values(patternCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(p => ({
        ...p,
        avgPages: Math.round(p.totalPages / p.count * 10) / 10
      }));

    const entryPages = db.prepare(`
      SELECT
        page_path,
        page_type,
        COUNT(*) as entries
      FROM (
        SELECT
          session_hash,
          page_path,
          page_type,
          ROW_NUMBER() OVER (PARTITION BY session_hash ORDER BY timestamp ASC) as rn
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND timestamp >= datetime('now', '-' || ? || ' minutes')
      )
      WHERE rn = 1
      GROUP BY page_path
      ORDER BY entries DESC
      LIMIT 10
    `).all(minutes);

    const exitPages = db.prepare(`
      SELECT
        page_path,
        page_type,
        COUNT(*) as exits,
        AVG(time_on_page) as avg_time_before_exit
      FROM site_analytics_events
      WHERE event_type = 'exit'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
        AND time_on_page > 0
      GROUP BY page_path
      ORDER BY exits DESC
      LIMIT 10
    `).all(minutes);

    const sessionDepth = db.prepare(`
      SELECT
        CASE
          WHEN cnt = 1 THEN '1 page'
          WHEN cnt = 2 THEN '2 pages'
          WHEN cnt = 3 THEN '3 pages'
          WHEN cnt BETWEEN 4 AND 5 THEN '4-5 pages'
          ELSE '6+ pages'
        END as depth,
        COUNT(*) as sessions
      FROM (
        SELECT session_hash, COUNT(*) as cnt
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND timestamp >= datetime('now', '-' || ? || ' minutes')
        GROUP BY session_hash
      )
      GROUP BY depth
      ORDER BY MIN(cnt)
    `).all(minutes);

    res.json({
      success: true,
      data: {
        topPatterns,
        entryPages,
        exitPages,
        sessionDepth,
        totalSessions: sessions.length,
        period: `${Math.round(minutes / 1440)}d`
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Journeys error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch journeys' });
  }
});

/**
 * GET /api/v1/admin/analytics/behavior
 * Engagement metrics - scroll depth, time on page, device UX gaps
 */
router.get('/behavior', (req, res) => {
  try {
    const minutes = getMinutesFromQuery(req.query, 7);

    const scrollDepth = db.prepare(`
      SELECT
        CASE
          WHEN scroll_depth < 25 THEN '0-25%'
          WHEN scroll_depth < 50 THEN '25-50%'
          WHEN scroll_depth < 75 THEN '50-75%'
          ELSE '75-100%'
        END as range,
        COUNT(*) as count,
        AVG(time_on_page) as avg_time
      FROM site_analytics_events
      WHERE event_type = 'exit'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
        AND scroll_depth IS NOT NULL
        AND scroll_depth > 0
      GROUP BY range
      ORDER BY MIN(scroll_depth)
    `).all(minutes);

    const timeDistribution = db.prepare(`
      SELECT
        CASE
          WHEN time_on_page < 10 THEN '< 10s'
          WHEN time_on_page < 30 THEN '10-30s'
          WHEN time_on_page < 60 THEN '30-60s'
          WHEN time_on_page < 120 THEN '1-2 min'
          WHEN time_on_page < 300 THEN '2-5 min'
          ELSE '5+ min'
        END as range,
        COUNT(*) as count
      FROM site_analytics_events
      WHERE event_type = 'exit'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
        AND time_on_page > 0
        AND time_on_page < 3600
      GROUP BY range
      ORDER BY MIN(time_on_page)
    `).all(minutes);

    const deviceEngagement = db.prepare(`
      SELECT
        device_type,
        COUNT(*) as exits,
        AVG(time_on_page) as avg_time,
        AVG(scroll_depth) as avg_scroll
      FROM site_analytics_events
      WHERE event_type = 'exit'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
        AND time_on_page > 0
        AND time_on_page < 3600
      GROUP BY device_type
    `).all(minutes);

    const bounceByType = db.prepare(`
      SELECT
        page_type,
        COUNT(*) as total_entries,
        SUM(CASE WHEN session_pages = 1 THEN 1 ELSE 0 END) as bounced
      FROM (
        SELECT
          e.page_type,
          (SELECT COUNT(*) FROM site_analytics_events e2
           WHERE e2.session_hash = e.session_hash AND e2.event_type = 'pageview') as session_pages
        FROM site_analytics_events e
        WHERE e.event_type = 'pageview'
          AND e.timestamp >= datetime('now', '-' || ? || ' minutes')
          AND e.page_type IS NOT NULL
      )
      GROUP BY page_type
      HAVING total_entries > 5
      ORDER BY total_entries DESC
    `).all(minutes);

    const hourlyEngagement = db.prepare(`
      SELECT
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        COUNT(*) as events,
        AVG(time_on_page) as avg_time,
        AVG(scroll_depth) as avg_scroll
      FROM site_analytics_events
      WHERE event_type = 'exit'
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
        AND time_on_page > 0
        AND time_on_page < 3600
      GROUP BY hour
      ORDER BY hour
    `).all(minutes);

    res.json({
      success: true,
      data: {
        scrollDepth,
        timeDistribution,
        deviceEngagement,
        bounceByType,
        hourlyEngagement,
        period: `${Math.round(minutes / 1440)}d`
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Behavior error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch behavior' });
  }
});

/**
 * GET /api/v1/admin/analytics/content
 * Content performance - which playlists/curators perform best
 */
router.get('/content', (req, res) => {
  try {
    const minutes = getMinutesFromQuery(req.query, 30);

    const topPlaylists = db.prepare(`
      SELECT
        e.resource_id,
        e.page_path,
        COUNT(*) as views,
        COUNT(DISTINCT e.visitor_hash) as unique_visitors,
        AVG(ex.time_on_page) as avg_time,
        AVG(ex.scroll_depth) as avg_scroll
      FROM site_analytics_events e
      LEFT JOIN site_analytics_events ex
        ON ex.session_hash = e.session_hash
        AND ex.page_path = e.page_path
        AND ex.event_type = 'exit'
      WHERE e.event_type = 'pageview'
        AND e.page_type = 'playlist'
        AND e.timestamp >= datetime('now', '-' || ? || ' minutes')
        AND e.resource_id IS NOT NULL
      GROUP BY e.resource_id
      ORDER BY views DESC
      LIMIT 15
    `).all(minutes);

    const topCurators = db.prepare(`
      SELECT
        e.resource_id,
        e.page_path,
        COUNT(*) as views,
        COUNT(DISTINCT e.visitor_hash) as unique_visitors,
        AVG(ex.time_on_page) as avg_time,
        AVG(ex.scroll_depth) as avg_scroll
      FROM site_analytics_events e
      LEFT JOIN site_analytics_events ex
        ON ex.session_hash = e.session_hash
        AND ex.page_path = e.page_path
        AND ex.event_type = 'exit'
      WHERE e.event_type = 'pageview'
        AND e.page_type = 'curator'
        AND e.timestamp >= datetime('now', '-' || ? || ' minutes')
        AND e.resource_id IS NOT NULL
      GROUP BY e.resource_id
      ORDER BY views DESC
      LIMIT 15
    `).all(minutes);

    const typePerformance = db.prepare(`
      SELECT
        e.page_type,
        COUNT(*) as views,
        COUNT(DISTINCT e.visitor_hash) as unique_visitors,
        AVG(ex.time_on_page) as avg_time,
        AVG(ex.scroll_depth) as avg_scroll
      FROM site_analytics_events e
      LEFT JOIN site_analytics_events ex
        ON ex.session_hash = e.session_hash
        AND ex.page_path = e.page_path
        AND ex.event_type = 'exit'
      WHERE e.event_type = 'pageview'
        AND e.timestamp >= datetime('now', '-' || ? || ' minutes')
        AND e.page_type IS NOT NULL
      GROUP BY e.page_type
      ORDER BY views DESC
    `).all(minutes);

    const trending = db.prepare(`
      SELECT
        resource_id,
        page_path,
        page_type,
        recent_views,
        prior_views,
        CASE WHEN prior_views > 0
          THEN ROUND((CAST(recent_views AS REAL) - prior_views) / prior_views * 100, 1)
          ELSE 100.0
        END as growth_pct
      FROM (
        SELECT
          resource_id,
          page_path,
          page_type,
          SUM(CASE WHEN timestamp >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as recent_views,
          SUM(CASE WHEN timestamp >= datetime('now', '-14 days') AND timestamp < datetime('now', '-7 days') THEN 1 ELSE 0 END) as prior_views
        FROM site_analytics_events
        WHERE event_type = 'pageview'
          AND resource_id IS NOT NULL
          AND timestamp >= datetime('now', '-14 days')
        GROUP BY resource_id
        HAVING recent_views >= 3
      )
      ORDER BY growth_pct DESC
      LIMIT 10
    `).all();

    res.json({
      success: true,
      data: {
        topPlaylists,
        topCurators,
        typePerformance,
        trending,
        period: `${Math.round(minutes / 1440)}d`
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Content error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch content analytics' });
  }
});

/**
 * GET /api/v1/admin/analytics/priorities
 * User behavior priorities - feature usage, friction, click targets, transitions, priority scoring
 */
router.get('/priorities', (req, res) => {
  try {
    const minutes = getMinutesFromQuery(req.query, 30);
    const rangeExpr = `-${minutes} minutes`;

    // Topline KPIs
    const topline = db.prepare(`
      SELECT
        COUNT(DISTINCT session_hash) as totalSessions,
        COUNT(DISTINCT visitor_hash) as uniqueVisitors,
        COUNT(*) as trackedActions,
        COUNT(DISTINCT feature_key) as activeFeatures
      FROM site_analytics_actions
      WHERE occurred_at >= datetime('now', ?)
    `).get(rangeExpr);

    // Feature usage
    const totalSessionsForShare = topline?.totalSessions || 1;

    const featureUsageRows = db.prepare(`
      SELECT feature_key,
        COUNT(DISTINCT session_hash) as sessions,
        COUNT(*) as actions,
        ROUND(COUNT(DISTINCT session_hash) * 1.0 / ?, 4) as usage_share
      FROM site_analytics_actions
      WHERE occurred_at >= datetime('now', ?)
      GROUP BY feature_key
      ORDER BY sessions DESC
    `).all(totalSessionsForShare, rangeExpr);

    // Growth: compare current window vs prior window
    const priorRangeExpr = `-${minutes * 2} minutes`;
    const priorUsage = db.prepare(`
      SELECT feature_key,
        COUNT(DISTINCT session_hash) as sessions
      FROM site_analytics_actions
      WHERE occurred_at >= datetime('now', ?) AND occurred_at < datetime('now', ?)
      GROUP BY feature_key
    `).all(priorRangeExpr, rangeExpr);

    const priorMap = {};
    priorUsage.forEach(r => { priorMap[r.feature_key] = r.sessions; });

    const featureUsage = featureUsageRows.map(r => ({
      ...r,
      growth_pct: priorMap[r.feature_key]
        ? Math.round(((r.sessions - priorMap[r.feature_key]) / priorMap[r.feature_key]) * 1000) / 10
        : null
    }));

    // Friction metrics
    const frictionRaw = db.prepare(`
      SELECT feature_key,
        SUM(CASE WHEN action_type = 'start' THEN 1 ELSE 0 END) as starts,
        SUM(CASE WHEN action_type = 'complete' THEN 1 ELSE 0 END) as completes,
        SUM(CASE WHEN action_type = 'error' THEN 1 ELSE 0 END) as errors,
        SUM(CASE WHEN is_rage_click = 1 THEN 1 ELSE 0 END) as rage_clicks
      FROM site_analytics_actions
      WHERE occurred_at >= datetime('now', ?)
      GROUP BY feature_key
    `).all(rangeExpr);

    // Dropoff: sessions with start but no complete
    const dropoffRaw = db.prepare(`
      SELECT sa.feature_key, COUNT(DISTINCT sa.session_hash) as dropoff_sessions
      FROM site_analytics_actions sa
      WHERE sa.action_type = 'start' AND sa.occurred_at >= datetime('now', ?)
        AND NOT EXISTS (
          SELECT 1 FROM site_analytics_actions sa2
          WHERE sa2.session_hash = sa.session_hash
            AND sa2.feature_key = sa.feature_key
            AND sa2.action_type = 'complete'
            AND sa2.occurred_at >= datetime('now', ?)
        )
      GROUP BY sa.feature_key
    `).all(rangeExpr, rangeExpr);

    const dropoffMap = {};
    dropoffRaw.forEach(r => { dropoffMap[r.feature_key] = r.dropoff_sessions; });

    const featureFriction = frictionRaw.map(r => {
      const dropoffs = dropoffMap[r.feature_key] || 0;
      const dropoffRate = r.starts > 0 ? Math.round((dropoffs / r.starts) * 100) / 100 : 0;
      const errorRate = r.starts > 0 ? Math.round((r.errors / r.starts) * 100) / 100 : 0;
      return {
        feature_key: r.feature_key,
        starts: r.starts,
        completes: r.completes,
        errors: r.errors,
        dropoff_rate: dropoffRate,
        error_rate: errorRate,
      };
    });

    // Click targets
    const topClickTargets = db.prepare(`
      SELECT feature_key, target_key,
        COUNT(*) as clicks,
        COUNT(DISTINCT session_hash) as unique_sessions
      FROM site_analytics_actions
      WHERE action_type = 'click' AND occurred_at >= datetime('now', ?)
      GROUP BY feature_key, target_key
      ORDER BY clicks DESC
      LIMIT 50
    `).all(rangeExpr);

    // Transitions
    const topTransitions = db.prepare(`
      SELECT from_feature, to_feature,
        COUNT(*) as count,
        COUNT(DISTINCT session_hash) as unique_sessions
      FROM site_analytics_transitions
      WHERE occurred_at >= datetime('now', ?)
      GROUP BY from_feature, to_feature
      ORDER BY count DESC
      LIMIT 30
    `).all(rangeExpr);

    // Priority scoring
    const frictionMap = {};
    featureFriction.forEach(r => { frictionMap[r.feature_key] = r; });

    const usageMap = {};
    featureUsage.forEach(r => { usageMap[r.feature_key] = r; });

    // Build rage rate per feature
    const rageSessionsRaw = db.prepare(`
      SELECT feature_key,
        COUNT(DISTINCT session_hash) as rage_sessions
      FROM site_analytics_actions
      WHERE is_rage_click = 1 AND occurred_at >= datetime('now', ?)
      GROUP BY feature_key
    `).all(rangeExpr);
    const rageMap = {};
    rageSessionsRaw.forEach(r => { rageMap[r.feature_key] = r.rage_sessions; });

    const allFeatures = new Set([
      ...featureUsage.map(r => r.feature_key),
      ...featureFriction.map(r => r.feature_key),
    ]);

    const scoredFeatures = [];
    allFeatures.forEach(fk => {
      const usage = usageMap[fk] || { sessions: 0, usage_share: 0 };
      const friction = frictionMap[fk] || { dropoff_rate: 0, error_rate: 0 };
      const rageSessions = rageMap[fk] || 0;
      const rageRate = usage.sessions > 0 ? rageSessions / usage.sessions : 0;

      const frictionScore = 0.50 * friction.dropoff_rate + 0.35 * friction.error_rate + 0.15 * rageRate;
      const absoluteImpact = Math.round(frictionScore * usage.sessions);

      scoredFeatures.push({
        feature_key: fk,
        usage_share: usage.usage_share,
        friction_score: Math.round(frictionScore * 100) / 100,
        absolute_impact: absoluteImpact,
        components: {
          dropoff_rate: friction.dropoff_rate,
          error_rate: friction.error_rate,
          rage_rate: Math.round(rageRate * 100) / 100,
        },
      });
    });

    // Normalize and compute priority_score
    const maxImpact = Math.max(...scoredFeatures.map(f => f.absolute_impact), 1);
    const priorityRanking = scoredFeatures.map(f => ({
      ...f,
      priority_score: Math.round(
        (0.6 * f.usage_share + 0.4 * (f.absolute_impact / maxImpact)) * f.friction_score * 10000
      ) / 100,
    })).sort((a, b) => b.priority_score - a.priority_score);

    res.json({
      success: true,
      data: {
        topline: {
          totalSessions: topline?.totalSessions || 0,
          uniqueVisitors: topline?.uniqueVisitors || 0,
          trackedActions: topline?.trackedActions || 0,
          activeFeatures: topline?.activeFeatures || 0,
        },
        featureUsage,
        featureFriction,
        topClickTargets,
        topTransitions,
        priorityRanking,
      }
    });
  } catch (error) {
    console.error('[ADMIN_ANALYTICS] Priorities error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch priorities' });
  }
});

export default router;
