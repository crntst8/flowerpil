import express from 'express';
import { authMiddleware, requireAdmin } from '../../middleware/auth.js';
import CircuitBreaker from '../../utils/CircuitBreaker.js';
import logger from '../../utils/logger.js';

const router = express.Router();

router.use(authMiddleware, requireAdmin);

router.get('/', (_req, res) => {
  try {
    const now = Date.now();
    const breakers = CircuitBreaker.list().map((cb) => {
      const state = cb.getState();
      const toIso = (value) => (value ? new Date(value).toISOString() : null);

      return {
        name: state.name,
        state: state.state,
        failureCount: state.failureCount,
        threshold: state.threshold,
        timeoutMs: state.timeout,
        halfOpenMaxCalls: state.halfOpenMaxCalls,
        halfOpenInFlight: state.halfOpenInFlight,
        totalFailures: state.totalFailures,
        totalSuccesses: state.totalSuccesses,
        lastError: state.lastError,
        lastErrorAt: toIso(state.lastErrorAt),
        lastSuccessAt: toIso(state.lastSuccessAt),
        lastStateChange: toIso(state.lastStateChange),
        openedAt: toIso(state.openedAt),
        nextAttemptAt: toIso(state.nextAttemptAt),
        cooldownRemainingMs: state.nextAttemptAt ? Math.max(0, state.nextAttemptAt - now) : null,
        reason: state.reason || null
      };
    });

    return res.json({
      success: true,
      data: breakers
    });
  } catch (error) {
    logger.error('ADMIN_CIRCUIT', 'Failed to load circuit breaker states', error);
    return res.status(500).json({ error: 'Failed to load circuit breakers' });
  }
});

export default router;
