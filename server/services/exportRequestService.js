import { getDatabase, getQueries } from '../database/db.js';

const SUPPORTED_DESTINATIONS = ['spotify', 'apple', 'tidal', 'youtube_music'];
const ACTIVE_STATUSES = new Set(['pending', 'auth_required', 'in_progress']);
const RECENT_COMPLETED_WINDOW = '-30 seconds';

const sortDestinations = (destinations) => {
  const orderIndex = new Map(SUPPORTED_DESTINATIONS.map((name, index) => [name, index]));
  return [...destinations].sort((a, b) => {
    const aIndex = orderIndex.has(a) ? orderIndex.get(a) : SUPPORTED_DESTINATIONS.length;
    const bIndex = orderIndex.has(b) ? orderIndex.get(b) : SUPPORTED_DESTINATIONS.length;
    if (aIndex === bIndex) return a.localeCompare(b);
    return aIndex - bIndex;
  });
};

const normalizeDestinations = (input) => {
  if (!Array.isArray(input)) return [];
  const normalized = new Set();
  for (const value of input) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().toLowerCase();
    if (!SUPPORTED_DESTINATIONS.includes(trimmed)) continue;
    normalized.add(trimmed);
  }
  return sortDestinations(Array.from(normalized));
};

const parseDestinationsField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return normalizeDestinations(value);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return normalizeDestinations(parsed);
      }
    } catch (_) {
      // fall through to CSV parsing
      return normalizeDestinations(value.split(',').map((item) => item.trim()));
    }
  }
  return [];
};

const parseJsonField = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
};

const normalizeMode = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'create_new' ? 'create_new' : 'replace_existing';
};

export const parseAccountPreferencesField = (value) => {
  const parsed = parseJsonField(value);
  return parsed && typeof parsed === 'object' ? parsed : {};
};

const normalizeAccountPreferences = (destinations, prefsInput = {}, defaultCuratorId = null) => {
  if (!Array.isArray(destinations) || destinations.length === 0) return {};
  const normalized = {};
  for (const dest of destinations) {
    if (!SUPPORTED_DESTINATIONS.includes(dest)) continue;
    const raw = prefsInput?.[dest];
    const accountType = typeof raw?.account_type === 'string'
      ? raw.account_type.toLowerCase()
      : null;
    if (accountType === 'curator') {
      const ownerId = raw?.owner_curator_id
        ? Number(raw.owner_curator_id)
        : defaultCuratorId
          ? Number(defaultCuratorId)
          : null;
      normalized[dest] = {
        account_type: 'curator',
        owner_curator_id: ownerId || null,
        mode: normalizeMode(raw?.mode)
      };
    } else if (accountType === 'flowerpil') {
      normalized[dest] = {
        account_type: 'flowerpil',
        owner_curator_id: null,
        mode: normalizeMode(raw?.mode)
      };
    } else {
      normalized[dest] = {
        account_type: 'flowerpil',
        owner_curator_id: null,
        mode: normalizeMode(raw?.mode)
      };
    }
  }
  return normalized;
};

const getExecutionMode = (normalizedPreferences = {}, override = null) => {
  const normalizedOverride = typeof override === 'string' ? override.trim().toLowerCase() : null;
  if (normalizedOverride === 'inline' || normalizedOverride === 'worker') {
    return normalizedOverride;
  }

  return Object.values(normalizedPreferences).some((pref) => pref?.account_type === 'curator')
    ? 'inline'
    : 'worker';
};

const matchesNormalizedRequest = (row, serializedDestinations, serializedPreferences, executionMode) => {
  if (!row) return false;

  const rowPreferences = normalizeAccountPreferences(
    parseDestinationsField(row.destinations),
    parseAccountPreferencesField(row.account_preferences)
  );

  return row.destinations === serializedDestinations
    && JSON.stringify(rowPreferences) === serializedPreferences
    && (row.execution_mode || 'worker') === executionMode;
};

export const mapExportRequestRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    playlist_id: row.playlist_id,
    requested_by: row.requested_by,
    destinations: parseDestinationsField(row.destinations),
    status: row.status,
    results: parseJsonField(row.results),
    last_error: row.last_error || null,
    execution_mode: row.execution_mode || 'worker',
    account_preferences: parseAccountPreferencesField(row.account_preferences),
    job_metadata: parseJsonField(row.job_metadata),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

export const ensureExportRequest = ({
  playlistId,
  destinations,
  requestedBy = 'curator',
  resetProgress = true,
  existingRequestId = null,
  accountPreferences = null,
  curatorId = null,
  executionMode = null
}) => {
  const normalizedDestinations = normalizeDestinations(destinations);
  if (!normalizedDestinations.length) {
    throw new Error('At least one valid destination is required');
  }

  const db = getDatabase();
  const queries = getQueries();
  const normalizedPrefs = normalizeAccountPreferences(
    normalizedDestinations,
    accountPreferences,
    curatorId
  );
  const serializedDestinations = JSON.stringify(normalizedDestinations);
  const serializedPreferences = JSON.stringify(normalizedPrefs || {});
  const resolvedExecutionMode = getExecutionMode(normalizedPrefs, executionMode);

  const transaction = db.transaction(() => {
    let targetRow = null;

    if (existingRequestId) {
      const byId = queries.findExportRequestById.get(existingRequestId);
      if (!byId) {
        throw new Error('Export request not found');
      }
      if (Number(byId.playlist_id) !== Number(playlistId)) {
        throw new Error('Export request does not belong to the provided playlist');
      }
      targetRow = byId;
    } else {
      const activeMatches = queries.findActiveExportRequestsForPlaylist.all(playlistId) || [];
      targetRow = activeMatches.find((row) => matchesNormalizedRequest(
        row,
        serializedDestinations,
        serializedPreferences,
        resolvedExecutionMode
      )) || null;

      if (targetRow) {
        return queries.findExportRequestById.get(targetRow.id);
      }

      const recentMatches = queries.findRecentExportsForPlaylist.all(
        playlistId,
        RECENT_COMPLETED_WINDOW
      ) || [];

      targetRow = recentMatches.find((row) => row.status === 'completed' && matchesNormalizedRequest(
        row,
        serializedDestinations,
        serializedPreferences,
        resolvedExecutionMode
      )) || null;

      if (targetRow) {
        return queries.findExportRequestById.get(targetRow.id);
      }
    }

    if (targetRow && ACTIVE_STATUSES.has(targetRow.status)) {
      const resultsValue = resetProgress ? null : targetRow.results;
      const errorValue = resetProgress ? null : targetRow.last_error;
      queries.requeueExportRequest.run(
        serializedDestinations,
        requestedBy,
        serializedPreferences,
        resolvedExecutionMode,
        resultsValue,
        errorValue,
        targetRow.id
      );
      return queries.findExportRequestById.get(targetRow.id);
    }

    const insertInfo = queries.createExportRequest.run(
      playlistId,
      requestedBy,
      serializedDestinations,
      'pending',
      null,
      null,
      serializedPreferences,
      resolvedExecutionMode
    );
    return queries.findExportRequestById.get(insertInfo.lastInsertRowid);
  });

  const stored = transaction();
  return mapExportRequestRow(stored);
};

export const getExportRequestsForPlaylist = (playlistId) => {
  const queries = getQueries();
  const rows = queries.listExportRequestsByPlaylist.all(playlistId) || [];
  return rows.map(mapExportRequestRow);
};

export const getDestinationsFromStoredValue = parseDestinationsField;
export const normalizeDestinationsForStorage = normalizeDestinations;
export const parseResultsField = parseJsonField;
