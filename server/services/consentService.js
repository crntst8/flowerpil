import crypto from 'crypto';
import { getDatabase } from '../database/db.js';
import { buildCSRFCookieOptions } from '../middleware/csrfProtection.js';

export const CONSENT_TYPE_ADS = 'ads';
export const CONSENT_STATUSES = new Set(['unknown', 'granted_ads', 'denied_ads']);

const CONSENT_COOKIE_KEYS = {
  status: 'fp_consent_ads',
  policy: 'fp_consent_policy',
  timestamp: 'fp_consent_ts',
  session: 'fp_consent_session'
};

const CONSENT_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const database = getDatabase();

let selectByUserStmt = null;
let selectBySessionStmt = null;
let insertConsentStmt = null;
let updateConsentStmt = null;

try {
  selectByUserStmt = database.prepare(`
    SELECT *
    FROM consent_records
    WHERE user_id = ? AND consent_type = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  selectBySessionStmt = database.prepare(`
    SELECT *
    FROM consent_records
    WHERE session_id = ? AND consent_type = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  insertConsentStmt = database.prepare(`
    INSERT INTO consent_records (
      user_id, session_id, consent_type, status, policy_version, source, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  updateConsentStmt = database.prepare(`
    UPDATE consent_records
    SET
      status = ?,
      policy_version = ?,
      source = ?,
      session_id = ?,
      last_seen_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `);
} catch (error) {
  console.warn('[Consent] Failed to prepare consent statements:', error?.message);
}

const normalizeStatus = (status) => {
  if (typeof status !== 'string') return 'unknown';
  const trimmed = status.trim();
  return CONSENT_STATUSES.has(trimmed) ? trimmed : 'unknown';
};

const parseTimestamp = (value) => {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDbTimestamp = (value) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const createSessionId = () => {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
};

export const readConsentCookies = (req) => ({
  status: normalizeStatus(req.cookies?.[CONSENT_COOKIE_KEYS.status]),
  policyVersion: req.cookies?.[CONSENT_COOKIE_KEYS.policy] || null,
  timestamp: parseTimestamp(req.cookies?.[CONSENT_COOKIE_KEYS.timestamp]),
  sessionId: req.cookies?.[CONSENT_COOKIE_KEYS.session] || null
});

export const applyConsentCookies = (req, res, payload) => {
  const options = buildCSRFCookieOptions(req, {
    maxAge: CONSENT_COOKIE_MAX_AGE_MS,
    httpOnly: false
  });

  res.cookie(CONSENT_COOKIE_KEYS.status, payload.status, options);
  res.cookie(CONSENT_COOKIE_KEYS.policy, payload.policyVersion || 'unknown', options);
  res.cookie(CONSENT_COOKIE_KEYS.timestamp, String(payload.timestamp || Date.now()), options);
  res.cookie(CONSENT_COOKIE_KEYS.session, payload.sessionId, options);
};

const readConsentRecord = ({ userId, sessionId, consentType }) => {
  try {
    if (userId && selectByUserStmt) {
      return selectByUserStmt.get(userId, consentType);
    }
    if (sessionId && selectBySessionStmt) {
      return selectBySessionStmt.get(sessionId, consentType);
    }
  } catch (error) {
    console.warn('[Consent] Failed to read consent record:', error?.message);
  }
  return null;
};

export const resolveConsentState = ({ req, consentType = CONSENT_TYPE_ADS }) => {
  const cookieData = readConsentCookies(req);
  const userId = req.user?.id || null;
  const record = readConsentRecord({
    userId,
    sessionId: cookieData.sessionId,
    consentType
  });

  const resolved = {
    status: normalizeStatus(record?.status || cookieData.status || 'unknown'),
    policyVersion: record?.policy_version || cookieData.policyVersion || 'unknown',
    timestamp: parseDbTimestamp(record?.updated_at) || cookieData.timestamp || null,
    sessionId: cookieData.sessionId || record?.session_id || createSessionId(),
    record
  };

  const needsCookieUpdate =
    !cookieData.sessionId ||
    cookieData.status !== resolved.status ||
    cookieData.policyVersion !== resolved.policyVersion ||
    cookieData.timestamp !== resolved.timestamp;

  return {
    ...resolved,
    needsCookieUpdate
  };
};

export const upsertConsentRecord = ({
  userId,
  sessionId,
  consentType = CONSENT_TYPE_ADS,
  status,
  policyVersion,
  source
}) => {
  const normalizedStatus = normalizeStatus(status);
  const existing = readConsentRecord({
    userId,
    sessionId,
    consentType
  });

  if (!insertConsentStmt || !updateConsentStmt) {
    return {
      previousStatus: existing?.status || null,
      status: normalizedStatus
    };
  }

  if (existing) {
    updateConsentStmt.run(
      normalizedStatus,
      policyVersion || existing.policy_version || 'unknown',
      source || existing.source || null,
      sessionId,
      existing.id
    );
  } else {
    insertConsentStmt.run(
      userId || null,
      sessionId,
      consentType,
      normalizedStatus,
      policyVersion || 'unknown',
      source || null
    );
  }

  return {
    previousStatus: existing?.status || null,
    status: normalizedStatus
  };
};
