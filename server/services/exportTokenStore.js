import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';

const db = getDatabase();

const ACCOUNT_LABELS = {
  flowerpil: 'flowerpil-primary'
};

export const resolveAccountContext = (user = null) => {
  if (user && user.role === 'curator') {
    if (!user.curator_id) {
      throw new Error('Curator profile required to save curator token');
    }
    const curatorId = Number(user.curator_id);
    return {
      accountType: 'curator',
      ownerCuratorId: curatorId,
      accountLabel: `curator-${curatorId}-primary`
    };
  }
  return {
    accountType: 'flowerpil',
    ownerCuratorId: null,
    accountLabel: ACCOUNT_LABELS.flowerpil
  };
};

export const getExportToken = (
  platform,
  {
    accountType = 'flowerpil',
    ownerCuratorId = null,
    includeInactive = false
  } = {}
) => {
  if (accountType === 'curator' && !ownerCuratorId) {
    throw new Error('ownerCuratorId required for curator tokens');
  }

  let sql = `
    SELECT * FROM export_oauth_tokens
    WHERE platform = ?
      AND account_type = ?
  `;
  const params = [platform, accountType];

  if (accountType === 'curator') {
    sql += ' AND owner_curator_id = ?';
    params.push(ownerCuratorId);
  } else {
    sql += ' AND owner_curator_id IS NULL';
  }

  if (!includeInactive) {
    sql += ' AND is_active = 1';
  }

  sql += ' ORDER BY last_validated_at DESC NULLS LAST, id DESC LIMIT 1';

  const stmt = db.prepare(sql);
  return stmt.get(...params);
};

export const saveExportToken = ({
  platform,
  tokenData,
  userInfo = {},
  accountType = 'flowerpil',
  ownerCuratorId = null,
  accountLabel
}) => {
  if (accountType === 'curator' && !ownerCuratorId) {
    throw new Error('Curator tokens must include ownerCuratorId');
  }

  const label =
    accountLabel ||
    (accountType === 'flowerpil'
      ? ACCOUNT_LABELS.flowerpil
      : `curator-${ownerCuratorId}-primary`);

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  const refreshExpiresAt = tokenData.refresh_expires_in
    ? new Date(Date.now() + tokenData.refresh_expires_in * 1000).toISOString()
    : null;

  const existingToken = getExportToken(platform, {
    accountType,
    ownerCuratorId,
    includeInactive: true
  });

  if (existingToken) {
    const stmt = db.prepare(`
      UPDATE export_oauth_tokens
      SET access_token = ?,
          refresh_token = ?,
          expires_at = ?,
          refresh_expires_at = ?,
          user_info = ?,
          account_label = ?,
          is_active = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      tokenData.access_token,
      tokenData.refresh_token || null,
      expiresAt,
      refreshExpiresAt,
      JSON.stringify(userInfo),
      label,
      existingToken.id
    );

    return { tokenId: existingToken.id, operation: 'updated' };
  }

  const stmt = db.prepare(`
    INSERT INTO export_oauth_tokens
    (platform, access_token, refresh_token, expires_at, refresh_expires_at,
     account_type, account_label, owner_curator_id, user_info, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const result = stmt.run(
    platform,
    tokenData.access_token,
    tokenData.refresh_token || null,
    expiresAt,
    refreshExpiresAt,
    accountType,
    label,
    ownerCuratorId,
    JSON.stringify(userInfo || {})
  );

  return { tokenId: result.lastInsertRowid, operation: 'inserted' };
};

export const isTokenExpired = (token) => {
  if (!token || !token.expires_at) return false;
  return new Date(token.expires_at) <= new Date();
};

export const buildTokenStatus = (token, platform) => {
  if (!token) {
    return {
      connected: false,
      user: null,
      expires_at: null,
      account_type: null,
      account_label: null,
      token_id: null
    };
  }

  let parsedUser = null;
  try {
    parsedUser = token.user_info ? JSON.parse(token.user_info) : null;
  } catch (err) {
    logger.warn('AUTH_STATUS', `Failed to parse user_info for token ${token.id}`, err);
  }

  const connected = platform === 'apple'
    ? true
    : !isTokenExpired(token);

  return {
    connected: connected && token.is_active === 1,
    user: parsedUser,
    expires_at: token.expires_at || null,
    account_type: token.account_type,
    account_label: token.account_label,
    token_id: token.id
  };
};
