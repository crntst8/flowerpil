import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';

/**
 * Analytics Service
 * Handles realtime session cleanup, data retention, and aggregation
 */

const REALTIME_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
const REALTIME_SESSION_TIMEOUT_MINS = 2;
const EVENT_RETENTION_DAYS = 90;
const DAILY_CLEANUP_HOUR = 3; // 3 AM

class AnalyticsService {
  constructor() {
    this.db = getDatabase();
    this.cleanupInterval = null;
    this.lastDailyCleanup = null;
    this.lastAggregation = null;
  }

  /**
   * Clean up stale realtime sessions
   * Sessions without a heartbeat in the last 2 minutes are removed
   */
  cleanupRealtimeSessions() {
    try {
      const result = this.db.prepare(`
        DELETE FROM site_analytics_realtime
        WHERE last_heartbeat < datetime('now', '-${REALTIME_SESSION_TIMEOUT_MINS} minutes')
      `).run();

      if (result.changes > 0) {
        logger.debug('ANALYTICS', 'Cleaned up stale realtime sessions', {
          removed: result.changes
        });
      }

      return result.changes;
    } catch (error) {
      logger.error('ANALYTICS', 'Failed to cleanup realtime sessions', {
        error: error?.message
      });
      return 0;
    }
  }

  /**
   * Clean up old event data
   * Events older than retention period are deleted
   */
  cleanupOldEvents() {
    try {
      const result = this.db.prepare(`
        DELETE FROM site_analytics_events
        WHERE timestamp < datetime('now', '-${EVENT_RETENTION_DAYS} days')
      `).run();

      if (result.changes > 0) {
        logger.info('ANALYTICS', 'Cleaned up old analytics events', {
          removed: result.changes,
          retentionDays: EVENT_RETENTION_DAYS
        });
      }

      return result.changes;
    } catch (error) {
      logger.error('ANALYTICS', 'Failed to cleanup old events', {
        error: error?.message
      });
      return 0;
    }
  }

  /**
   * Clean up old action tracking data
   */
  cleanupOldActions() {
    try {
      const actionsResult = this.db.prepare(`
        DELETE FROM site_analytics_actions
        WHERE occurred_at < datetime('now', '-${EVENT_RETENTION_DAYS} days')
      `).run();

      if (actionsResult.changes > 0) {
        logger.info('ANALYTICS', 'Cleaned up old action events', {
          removed: actionsResult.changes,
          retentionDays: EVENT_RETENTION_DAYS
        });
      }

      const transitionsResult = this.db.prepare(`
        DELETE FROM site_analytics_transitions
        WHERE occurred_at < datetime('now', '-${EVENT_RETENTION_DAYS} days')
      `).run();

      if (transitionsResult.changes > 0) {
        logger.info('ANALYTICS', 'Cleaned up old transitions', {
          removed: transitionsResult.changes,
          retentionDays: EVENT_RETENTION_DAYS
        });
      }

      return actionsResult.changes + transitionsResult.changes;
    } catch (error) {
      logger.error('ANALYTICS', 'Failed to cleanup old actions/transitions', {
        error: error?.message
      });
      return 0;
    }
  }

  /**
   * Clean up old exit data
   */
  cleanupOldExits() {
    try {
      const result = this.db.prepare(`
        DELETE FROM site_analytics_exits
        WHERE date < date('now', '-${EVENT_RETENTION_DAYS} days')
      `).run();

      if (result.changes > 0) {
        logger.debug('ANALYTICS', 'Cleaned up old exit data', {
          removed: result.changes
        });
      }

      return result.changes;
    } catch (error) {
      logger.error('ANALYTICS', 'Failed to cleanup old exits', {
        error: error?.message
      });
      return 0;
    }
  }

  /**
   * Aggregate daily stats from events
   * Aggregates yesterday's events into site_analytics_daily
   */
  aggregateDailyStats(targetDate = null) {
    try {
      const date = targetDate || this.getYesterdayDate();

      // Check if already aggregated
      const existing = this.db.prepare(`
        SELECT 1 FROM site_analytics_daily WHERE date = ? AND page_type = 'all' AND resource_id IS NULL
      `).get(date);

      if (existing) {
        logger.debug('ANALYTICS', 'Daily stats already aggregated', { date });
        return false;
      }

      // Aggregate overall stats
      const overallStats = this.db.prepare(`
        SELECT
          COUNT(*) as pageviews,
          COUNT(DISTINCT visitor_hash) as unique_visitors,
          COUNT(DISTINCT session_hash) as unique_sessions
        FROM site_analytics_events
        WHERE date(timestamp) = ?
          AND event_type = 'pageview'
      `).get(date);

      // Get average time on page and scroll depth from exit events
      const exitStats = this.db.prepare(`
        SELECT
          AVG(time_on_page) as avg_time,
          AVG(scroll_depth) as avg_scroll
        FROM site_analytics_events
        WHERE date(timestamp) = ?
          AND event_type = 'exit'
          AND time_on_page > 0 AND time_on_page < 3600
      `).get(date);

      // Get exit count
      const exitCount = this.db.prepare(`
        SELECT SUM(exit_count) as total FROM site_analytics_exits WHERE date = ?
      `).get(date);

      // Get breakdown data
      const referrerBreakdown = this.db.prepare(`
        SELECT referrer_domain, COUNT(*) as count
        FROM site_analytics_events
        WHERE date(timestamp) = ? AND event_type = 'pageview' AND referrer_domain IS NOT NULL
        GROUP BY referrer_domain ORDER BY count DESC LIMIT 20
      `).all(date);

      const countryBreakdown = this.db.prepare(`
        SELECT country_code, COUNT(*) as count
        FROM site_analytics_events
        WHERE date(timestamp) = ? AND event_type = 'pageview' AND country_code IS NOT NULL
        GROUP BY country_code ORDER BY count DESC LIMIT 20
      `).all(date);

      const deviceBreakdown = this.db.prepare(`
        SELECT device_type, COUNT(*) as count
        FROM site_analytics_events
        WHERE date(timestamp) = ? AND event_type = 'pageview'
        GROUP BY device_type ORDER BY count DESC
      `).all(date);

      const browserBreakdown = this.db.prepare(`
        SELECT browser_family, COUNT(*) as count
        FROM site_analytics_events
        WHERE date(timestamp) = ? AND event_type = 'pageview'
        GROUP BY browser_family ORDER BY count DESC LIMIT 10
      `).all(date);

      const utmBreakdown = this.db.prepare(`
        SELECT utm_source, utm_medium, utm_campaign, COUNT(*) as count
        FROM site_analytics_events
        WHERE date(timestamp) = ? AND event_type = 'pageview' AND utm_source IS NOT NULL
        GROUP BY utm_source, utm_medium, utm_campaign ORDER BY count DESC LIMIT 20
      `).all(date);

      // Calculate bounce rate (sessions with only 1 pageview)
      const sessionCounts = this.db.prepare(`
        SELECT session_hash, COUNT(*) as pv
        FROM site_analytics_events
        WHERE date(timestamp) = ? AND event_type = 'pageview'
        GROUP BY session_hash
      `).all(date);

      const totalSessions = sessionCounts.length;
      const bounceSessions = sessionCounts.filter(s => s.pv === 1).length;
      const bounceRate = totalSessions > 0 ? (bounceSessions / totalSessions) * 100 : 0;

      // Insert aggregated data
      this.db.prepare(`
        INSERT INTO site_analytics_daily (
          date, page_type, resource_id, pageviews, unique_visitors, unique_sessions,
          avg_time_on_page, avg_scroll_depth, bounce_rate, exit_count,
          referrer_breakdown, utm_breakdown, country_breakdown, device_breakdown, browser_breakdown
        ) VALUES (?, 'all', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        date,
        overallStats?.pageviews || 0,
        overallStats?.unique_visitors || 0,
        overallStats?.unique_sessions || 0,
        Math.round(exitStats?.avg_time || 0),
        Math.round(exitStats?.avg_scroll || 0),
        Math.round(bounceRate * 100) / 100,
        exitCount?.total || 0,
        JSON.stringify(referrerBreakdown),
        JSON.stringify(utmBreakdown),
        JSON.stringify(countryBreakdown),
        JSON.stringify(deviceBreakdown),
        JSON.stringify(browserBreakdown)
      );

      // Aggregate by page_type
      const pageTypes = this.db.prepare(`
        SELECT DISTINCT page_type FROM site_analytics_events
        WHERE date(timestamp) = ? AND event_type = 'pageview' AND page_type IS NOT NULL
      `).all(date);

      for (const { page_type } of pageTypes) {
        const typeStats = this.db.prepare(`
          SELECT
            COUNT(*) as pageviews,
            COUNT(DISTINCT visitor_hash) as unique_visitors,
            COUNT(DISTINCT session_hash) as unique_sessions
          FROM site_analytics_events
          WHERE date(timestamp) = ? AND event_type = 'pageview' AND page_type = ?
        `).get(date, page_type);

        this.db.prepare(`
          INSERT OR REPLACE INTO site_analytics_daily (
            date, page_type, resource_id, pageviews, unique_visitors, unique_sessions
          ) VALUES (?, ?, NULL, ?, ?, ?)
        `).run(date, page_type, typeStats?.pageviews || 0, typeStats?.unique_visitors || 0, typeStats?.unique_sessions || 0);
      }

      logger.info('ANALYTICS', 'Daily stats aggregated', {
        date,
        pageviews: overallStats?.pageviews || 0,
        visitors: overallStats?.unique_visitors || 0,
        pageTypes: pageTypes.length
      });

      return true;
    } catch (error) {
      logger.error('ANALYTICS', 'Failed to aggregate daily stats', { error: error?.message });
      return false;
    }
  }

  /**
   * Aggregate weekly stats from daily data
   * Runs on Mondays, aggregates the previous week
   */
  aggregateWeeklyStats() {
    try {
      const now = new Date();
      if (now.getDay() !== 1) return false; // Only on Mondays

      const { year, week } = this.getISOWeek(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

      // Check if already aggregated
      const existing = this.db.prepare(`
        SELECT 1 FROM site_analytics_weekly WHERE year = ? AND week = ? AND page_type = 'all'
      `).get(year, week);

      if (existing) {
        logger.debug('ANALYTICS', 'Weekly stats already aggregated', { year, week });
        return false;
      }

      // Get date range for the ISO week
      const weekStart = this.getISOWeekStart(year, week);
      const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
      const startDate = weekStart.toISOString().split('T')[0];
      const endDate = weekEnd.toISOString().split('T')[0];

      // Aggregate from daily table
      const weekStats = this.db.prepare(`
        SELECT
          SUM(pageviews) as pageviews,
          SUM(unique_visitors) as unique_visitors,
          SUM(unique_sessions) as unique_sessions,
          AVG(avg_time_on_page) as avg_time
        FROM site_analytics_daily
        WHERE date >= ? AND date <= ? AND page_type = 'all'
      `).get(startDate, endDate);

      // Top pages for the week
      const topPages = this.db.prepare(`
        SELECT page_path, SUM(views) as views
        FROM (
          SELECT page_path, COUNT(*) as views
          FROM site_analytics_events
          WHERE date(timestamp) >= ? AND date(timestamp) <= ? AND event_type = 'pageview'
          GROUP BY page_path
        )
        GROUP BY page_path ORDER BY views DESC LIMIT 10
      `).all(startDate, endDate);

      // Calculate growth rate compared to previous week
      const prevWeekStats = this.db.prepare(`
        SELECT SUM(pageviews) as pageviews, SUM(unique_visitors) as unique_visitors
        FROM site_analytics_daily
        WHERE date >= date(?, '-7 days') AND date < ? AND page_type = 'all'
      `).get(startDate, startDate);

      const growthViews = prevWeekStats?.pageviews > 0
        ? ((weekStats?.pageviews - prevWeekStats.pageviews) / prevWeekStats.pageviews) * 100
        : 0;
      const growthVisitors = prevWeekStats?.unique_visitors > 0
        ? ((weekStats?.unique_visitors - prevWeekStats.unique_visitors) / prevWeekStats.unique_visitors) * 100
        : 0;

      this.db.prepare(`
        INSERT INTO site_analytics_weekly (
          year, week, page_type, resource_id, pageviews, unique_visitors, unique_sessions,
          avg_time_on_page, growth_rate_views, growth_rate_visitors, top_pages
        ) VALUES (?, ?, 'all', NULL, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        year, week,
        weekStats?.pageviews || 0,
        weekStats?.unique_visitors || 0,
        weekStats?.unique_sessions || 0,
        Math.round(weekStats?.avg_time || 0),
        Math.round(growthViews * 100) / 100,
        Math.round(growthVisitors * 100) / 100,
        JSON.stringify(topPages)
      );

      logger.info('ANALYTICS', 'Weekly stats aggregated', { year, week, pageviews: weekStats?.pageviews });
      return true;
    } catch (error) {
      logger.error('ANALYTICS', 'Failed to aggregate weekly stats', { error: error?.message });
      return false;
    }
  }

  /**
   * Aggregate monthly stats from daily data
   * Runs on the 1st of each month, aggregates the previous month
   */
  aggregateMonthlyStats() {
    try {
      const now = new Date();
      if (now.getDate() !== 1) return false; // Only on 1st of month

      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = prevMonth.getFullYear();
      const month = prevMonth.getMonth() + 1;

      // Check if already aggregated
      const existing = this.db.prepare(`
        SELECT 1 FROM site_analytics_monthly WHERE year = ? AND month = ? AND page_type = 'all'
      `).get(year, month);

      if (existing) {
        logger.debug('ANALYTICS', 'Monthly stats already aggregated', { year, month });
        return false;
      }

      // Get date range for the month
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      // Aggregate from daily table
      const monthStats = this.db.prepare(`
        SELECT
          SUM(pageviews) as pageviews,
          SUM(unique_visitors) as unique_visitors,
          SUM(unique_sessions) as unique_sessions,
          AVG(avg_time_on_page) as avg_time
        FROM site_analytics_daily
        WHERE date >= ? AND date <= ? AND page_type = 'all'
      `).get(startDate, endDate);

      // Top pages for the month
      const topPages = this.db.prepare(`
        SELECT page_path, COUNT(*) as views
        FROM site_analytics_events
        WHERE date(timestamp) >= ? AND date(timestamp) <= ? AND event_type = 'pageview'
        GROUP BY page_path ORDER BY views DESC LIMIT 10
      `).all(startDate, endDate);

      // Top countries
      const topCountries = this.db.prepare(`
        SELECT country_code, COUNT(*) as views
        FROM site_analytics_events
        WHERE date(timestamp) >= ? AND date(timestamp) <= ? AND event_type = 'pageview' AND country_code IS NOT NULL
        GROUP BY country_code ORDER BY views DESC LIMIT 10
      `).all(startDate, endDate);

      // Calculate growth rate compared to previous month
      const prevMonthDate = new Date(year, month - 2, 1);
      const prevStartDate = prevMonthDate.toISOString().split('T')[0];
      const prevEndDate = new Date(year, month - 1, 0).toISOString().split('T')[0];

      const prevMonthStats = this.db.prepare(`
        SELECT SUM(pageviews) as pageviews, SUM(unique_visitors) as unique_visitors
        FROM site_analytics_daily
        WHERE date >= ? AND date <= ? AND page_type = 'all'
      `).get(prevStartDate, prevEndDate);

      const growthViews = prevMonthStats?.pageviews > 0
        ? ((monthStats?.pageviews - prevMonthStats.pageviews) / prevMonthStats.pageviews) * 100
        : 0;
      const growthVisitors = prevMonthStats?.unique_visitors > 0
        ? ((monthStats?.unique_visitors - prevMonthStats.unique_visitors) / prevMonthStats.unique_visitors) * 100
        : 0;

      this.db.prepare(`
        INSERT INTO site_analytics_monthly (
          year, month, page_type, resource_id, pageviews, unique_visitors, unique_sessions,
          avg_time_on_page, growth_rate_views, growth_rate_visitors, top_pages, top_countries
        ) VALUES (?, ?, 'all', NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        year, month,
        monthStats?.pageviews || 0,
        monthStats?.unique_visitors || 0,
        monthStats?.unique_sessions || 0,
        Math.round(monthStats?.avg_time || 0),
        Math.round(growthViews * 100) / 100,
        Math.round(growthVisitors * 100) / 100,
        JSON.stringify(topPages),
        JSON.stringify(topCountries)
      );

      logger.info('ANALYTICS', 'Monthly stats aggregated', { year, month, pageviews: monthStats?.pageviews });
      return true;
    } catch (error) {
      logger.error('ANALYTICS', 'Failed to aggregate monthly stats', { error: error?.message });
      return false;
    }
  }

  /**
   * Run all aggregation tasks
   */
  runAggregation() {
    const today = new Date().toISOString().split('T')[0];

    if (this.lastAggregation === today) return;

    logger.info('ANALYTICS', 'Running analytics aggregation');

    this.aggregateDailyStats();
    this.aggregateWeeklyStats();
    this.aggregateMonthlyStats();

    this.lastAggregation = today;
  }

  /**
   * Helper: Get yesterday's date as YYYY-MM-DD
   */
  getYesterdayDate() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  /**
   * Helper: Get ISO week number and year
   */
  getISOWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return { year: d.getFullYear(), week };
  }

  /**
   * Helper: Get start date of ISO week
   */
  getISOWeekStart(year, week) {
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const weekStart = new Date(jan4);
    weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
    return weekStart;
  }

  /**
   * Run daily cleanup tasks
   */
  runDailyCleanup() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Only run once per day
    if (this.lastDailyCleanup === today) {
      return;
    }

    // Only run at the designated hour
    if (now.getHours() !== DAILY_CLEANUP_HOUR) {
      return;
    }

    logger.info('ANALYTICS', 'Running daily analytics tasks');

    // Run aggregation first (before cleanup)
    this.runAggregation();

    const eventsRemoved = this.cleanupOldEvents();
    const exitsRemoved = this.cleanupOldExits();
    const actionsRemoved = this.cleanupOldActions();

    this.lastDailyCleanup = today;

    logger.info('ANALYTICS', 'Daily tasks complete', {
      eventsRemoved,
      exitsRemoved,
      actionsRemoved,
      retentionDays: EVENT_RETENTION_DAYS
    });
  }

  /**
   * Main cleanup loop
   */
  runCleanup() {
    try {
      this.cleanupRealtimeSessions();
      this.runDailyCleanup();
    } catch (error) {
      logger.error('ANALYTICS', 'Cleanup run failed', {
        error: error?.message
      });
    }
  }

  /**
   * Start the analytics service
   */
  start() {
    if (this.cleanupInterval) {
      return this.cleanupInterval;
    }

    // Run immediately
    this.runCleanup();

    // Set up interval
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, REALTIME_CLEANUP_INTERVAL_MS);

    // Don't prevent process from exiting
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }

    logger.info('ANALYTICS', 'Analytics service started', {
      cleanupIntervalMs: REALTIME_CLEANUP_INTERVAL_MS,
      sessionTimeoutMins: REALTIME_SESSION_TIMEOUT_MINS,
      eventRetentionDays: EVENT_RETENTION_DAYS
    });

    return this.cleanupInterval;
  }

  /**
   * Stop the analytics service
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('ANALYTICS', 'Analytics service stopped');
    }
  }

  /**
   * Get current realtime visitor count
   */
  getRealtimeCount() {
    try {
      const result = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM site_analytics_realtime
        WHERE last_heartbeat >= datetime('now', '-${REALTIME_SESSION_TIMEOUT_MINS} minutes')
      `).get();

      return result?.count || 0;
    } catch (error) {
      return 0;
    }
  }
}

const analyticsService = new AnalyticsService();

export const startAnalyticsService = () => analyticsService.start();
export const stopAnalyticsService = () => analyticsService.stop();
export default analyticsService;
