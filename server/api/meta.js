import express from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import { publicApiLimiter } from '../middleware/rateLimiting.js';
import { getDatabase } from '../database/db.js';
import { resolveConsentState, CONSENT_TYPE_ADS } from '../services/consentService.js';
import { buildUserData, enqueueMetaEvent, flushMetaQueue } from '../services/metaConversionsService.js';

const router = express.Router();
const database = getDatabase();

const ALLOWED_EVENTS = new Set(['PageView', 'ViewContent', 'PlaylistClickout']);

const parseConfig = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getConfigValue = (key, fallback) => {
  try {
    const row = database.prepare(
      'SELECT config_value FROM admin_system_config WHERE config_key = ? LIMIT 1'
    ).get(key);
    return row?.config_value ? parseConfig(row.config_value, fallback) : fallback;
  } catch {
    return fallback;
  }
};

const getBooleanConfig = (key, fallback = false) => {
  const value = getConfigValue(key, null);
  if (typeof value === 'boolean') return value;
  if (value && typeof value.enabled === 'boolean') return value.enabled;
  return fallback;
};

const getAllowedHosts = (req) => {
  const hosts = new Set();
  const addHost = (value) => {
    if (!value || typeof value !== 'string') return;
    try {
      const url = new URL(value);
      if (url.host) hosts.add(url.host);
    } catch {
      const trimmed = value.trim();
      if (trimmed) hosts.add(trimmed);
    }
  };

  addHost(process.env.BASE_URL);
  addHost(process.env.FRONTEND_URL);
  addHost(req.headers.host);

  return hosts;
};

const isAllowedEventSource = (value, req) => {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const allowedHosts = getAllowedHosts(req);
    return allowedHosts.has(url.host);
  } catch {
    return false;
  }
};

router.use(apiLoggingMiddleware);
router.use(publicApiLimiter);
router.use(optionalAuth);

/**
 * POST /api/v1/meta/events
 * Public CAPI bridge endpoint for browser-triggered events.
 */
router.post('/events', express.text({ type: '*/*' }), async (req, res) => {
  try {
    const metaPixelEnabled = getBooleanConfig('meta_pixel_enabled', false);
    const analyticsSettings = getConfigValue('analytics_settings', {});
    const privacyMode = analyticsSettings?.privacy_mode === true;

    if (!metaPixelEnabled || privacyMode) {
      return res.json({
        success: true,
        data: { suppressed: true, reason: 'disabled' }
      });
    }

    const consent = resolveConsentState({ req, consentType: CONSENT_TYPE_ADS });
    if (consent.status !== 'granted_ads') {
      console.log('[Meta CAPI] Suppressed due to consent', {
        status: consent.status,
        sessionId: consent.sessionId,
        userId: req.user?.id || null
      });
      return res.json({
        success: true,
        data: { suppressed: true, reason: 'consent' }
      });
    }

    const rawBody = req.body;
    let payload = rawBody;
    if (typeof rawBody === 'string') {
      try {
        payload = JSON.parse(rawBody);
      } catch (error) {
        return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
      }
    }

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }

    const eventName = typeof payload.event_name === 'string' ? payload.event_name.trim() : '';
    if (!ALLOWED_EVENTS.has(eventName)) {
      return res.status(400).json({ success: false, error: 'Unsupported event name' });
    }

    const eventIdBase = typeof payload.event_id_base === 'string' ? payload.event_id_base.trim() : '';
    if (!eventIdBase) {
      return res.status(400).json({ success: false, error: 'event_id_base is required' });
    }

    const eventSourceUrl = typeof payload.event_source_url === 'string' ? payload.event_source_url.trim() : '';
    if (!isAllowedEventSource(eventSourceUrl, req)) {
      return res.status(400).json({ success: false, error: 'Invalid event_source_url' });
    }

    const pixelIds = Array.isArray(payload.pixel_ids)
      ? Array.from(
          new Set(payload.pixel_ids.map((id) => String(id).trim()).filter(Boolean))
        )
      : [];

    if (!pixelIds.length) {
      return res.status(400).json({ success: false, error: 'pixel_ids required' });
    }

    const customData = payload.custom_data && typeof payload.custom_data === 'object'
      ? payload.custom_data
      : {};

    const eventTime = Math.floor(Date.now() / 1000);
    const userData = buildUserData({ user: req.user, req });
    const clientUserAgent = req.get('User-Agent') || '';
    const clientIp = req.headers['cf-connecting-ip'] ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.ip ||
      '';

    const queued = pixelIds.map((pixelId) => {
      const eventId = `${eventIdBase}:${pixelId}`;
      const eventPayload = {
        event_name: eventName,
        event_time: eventTime,
        event_source_url: eventSourceUrl,
        action_source: 'website',
        event_id: eventId,
        user_data: userData,
        custom_data: customData,
        client_user_agent: clientUserAgent,
        client_ip_address: clientIp
      };

      return enqueueMetaEvent({ pixelId, payload: eventPayload });
    });

    setImmediate(() => {
      flushMetaQueue().catch(() => {});
    });

    res.json({
      success: true,
      data: {
        queued: queued.filter((item) => item.queued).length
      }
    });
  } catch (error) {
    console.error('[Meta CAPI] Event enqueue error:', error?.message);
    res.status(500).json({
      success: false,
      error: 'Failed to enqueue Meta event'
    });
  }
});

export default router;
