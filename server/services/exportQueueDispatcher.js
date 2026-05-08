import { getQueries } from '../database/db.js';
import { getDestinationsFromStoredValue, parseAccountPreferencesField } from './exportRequestService.js';
import { runPlaylistExport } from './playlistExportRunner.js';

let queries;
const resolveQueries = () => {
  if (!queries) queries = getQueries();
  return queries;
};

export const dispatchExportRequests = async (requestIds, { actor = 'system' } = {}) => {
  if (!Array.isArray(requestIds) || requestIds.length === 0) return;

  const q = resolveQueries();

  for (const requestId of requestIds) {
    try {
      const row = q.findExportRequestById.get(requestId);
      if (!row) {
        console.warn(`[EXPORT_QUEUE] Request ${requestId} not found`);
        continue;
      }

      const destinations = getDestinationsFromStoredValue(row.destinations);
      if (!destinations.length) {
        console.warn(`[EXPORT_QUEUE] Request ${requestId} has no destinations`);
        continue;
      }

      const accountPreferences = parseAccountPreferencesField(row.account_preferences);
      console.log(`[EXPORT_QUEUE] Processing request ${requestId} for playlist ${row.playlist_id} → ${destinations.join(', ')}`);
      for (const destination of destinations) {
        try {
          const pref = accountPreferences?.[destination] || null;
          await runPlaylistExport({
            playlistId: row.playlist_id,
            platform: destination,
            isPublic: true,
            allowDraftExport: actor === 'curator',
            exportRequestId: row.id,
            accountPreference: pref,
            mode: pref?.mode || 'replace_existing'
          });
          console.log(`[EXPORT_QUEUE] Exported playlist ${row.playlist_id} to ${destination} (request ${requestId})`);
        } catch (error) {
          console.error(`[EXPORT_QUEUE] Export failed for request ${requestId} platform ${destination}:`, error.message);
        }
      }
    } catch (error) {
      console.error(`[EXPORT_QUEUE] Fatal error running request ${requestId}:`, error.message);
    }
  }
};
