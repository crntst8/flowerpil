const DEFAULT_MAX_ENTRIES = Number.parseInt(process.env.LOG_BUFFER_SIZE || '5000', 10);
const maxEntries = Number.isFinite(DEFAULT_MAX_ENTRIES) && DEFAULT_MAX_ENTRIES > 0
  ? DEFAULT_MAX_ENTRIES
  : 5000;

const entries = [];

export const pushLogEntry = (entry) => {
  if (!entry) return;
  entries.push(entry);
  if (entries.length > maxEntries) {
    entries.splice(0, entries.length - maxEntries);
  }
};

export const getLogEntries = ({ startMs, endMs, requestId } = {}) => {
  return entries.filter((entry) => {
    if (requestId && entry.request_id !== requestId) {
      return false;
    }
    if (typeof startMs === 'number' && entry.ts < startMs) {
      return false;
    }
    if (typeof endMs === 'number' && entry.ts > endMs) {
      return false;
    }
    return true;
  });
};

export const getLatestLogEntries = (limit = 100) => {
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }
  return entries.slice(-limit);
};
