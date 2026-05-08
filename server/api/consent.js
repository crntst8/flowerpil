import express from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { apiLoggingMiddleware } from '../middleware/logging.js';
import {
  CONSENT_TYPE_ADS,
  CONSENT_STATUSES,
  resolveConsentState,
  applyConsentCookies,
  upsertConsentRecord
} from '../services/consentService.js';

const router = express.Router();

router.use(apiLoggingMiddleware);
router.use(optionalAuth);

const isValidStatus = (status) => CONSENT_STATUSES.has(status);

/**
 * GET /api/v1/consent
 * Returns current consent state for ads tracking.
 */
router.get('/', (req, res) => {
  try {
    const resolved = resolveConsentState({ req, consentType: CONSENT_TYPE_ADS });

    if (resolved.needsCookieUpdate) {
      applyConsentCookies(req, res, {
        status: resolved.status,
        policyVersion: resolved.policyVersion,
        timestamp: resolved.timestamp || Date.now(),
        sessionId: resolved.sessionId
      });
    }

    res.json({
      success: true,
      data: {
        status: resolved.status,
        policy_version: resolved.policyVersion,
        timestamp: resolved.timestamp
      }
    });
  } catch (error) {
    console.error('[Consent] Failed to resolve consent state:', error?.message);
    res.status(500).json({
      success: false,
      error: 'Failed to load consent state'
    });
  }
});

/**
 * POST /api/v1/consent
 * Updates consent state for ads tracking.
 */
router.post('/', (req, res) => {
  try {
    const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
    const policyVersion = typeof req.body?.policy_version === 'string'
      ? req.body.policy_version.trim()
      : '';
    const source = typeof req.body?.source === 'string' ? req.body.source.trim() : null;

    if (!isValidStatus(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid consent status'
      });
    }

    if (!policyVersion) {
      return res.status(400).json({
        success: false,
        error: 'policy_version is required'
      });
    }

    const resolved = resolveConsentState({ req, consentType: CONSENT_TYPE_ADS });
    const timestamp = Date.now();

    const result = upsertConsentRecord({
      userId: req.user?.id || null,
      sessionId: resolved.sessionId,
      consentType: CONSENT_TYPE_ADS,
      status,
      policyVersion,
      source
    });

    if (result.previousStatus && result.previousStatus !== status) {
      console.log('[Consent] Status changed', {
        userId: req.user?.id || null,
        sessionId: resolved.sessionId,
        from: result.previousStatus,
        to: status,
        timestamp: new Date(timestamp).toISOString()
      });
    }

    applyConsentCookies(req, res, {
      status,
      policyVersion,
      timestamp,
      sessionId: resolved.sessionId
    });

    res.json({
      success: true,
      data: {
        status,
        policy_version: policyVersion,
        timestamp
      }
    });
  } catch (error) {
    console.error('[Consent] Failed to update consent state:', error?.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update consent state'
    });
  }
});

export default router;
