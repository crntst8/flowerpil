import { safeJson } from '@shared/utils/jsonUtils';

const BASE_PATH = '/api/v1/playlist-actions';

const handleResponse = async (res, context) => {
  const json = await safeJson(res, { context });
  if (!res.ok || !json?.success) {
    const message = json?.error || json?.message || `Failed to ${context.toLowerCase()}`;
    throw new Error(message);
  }
  return json?.data;
};

export const listSchedules = async (authenticatedFetch, { playlistId } = {}) => {
  const query = playlistId ? `?playlistId=${encodeURIComponent(playlistId)}` : '';
  const res = await authenticatedFetch(`${BASE_PATH}/schedules${query}`, { method: 'GET' });
  return handleResponse(res, 'List schedules');
};

export const fetchScheduleRuns = async (authenticatedFetch, scheduleId, { limit = 5 } = {}) => {
  const res = await authenticatedFetch(
    `${BASE_PATH}/schedules/${scheduleId}/runs?limit=${Math.min(Math.max(limit, 1), 25)}`,
    { method: 'GET' }
  );
  return handleResponse(res, 'Load schedule runs');
};

export const createSchedule = async (authenticatedFetch, payload) => {
  const res = await authenticatedFetch(`${BASE_PATH}/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse(res, 'Create schedule');
};

export const updateSchedule = async (authenticatedFetch, scheduleId, payload) => {
  const res = await authenticatedFetch(`${BASE_PATH}/schedules/${scheduleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse(res, 'Update schedule');
};

export const deleteSchedule = async (authenticatedFetch, scheduleId) => {
  const res = await authenticatedFetch(`${BASE_PATH}/schedules/${scheduleId}`, { method: 'DELETE' });
  await handleResponse(res, 'Delete schedule');
  return true;
};

export const runScheduleNow = async (authenticatedFetch, scheduleId) => {
  const res = await authenticatedFetch(`${BASE_PATH}/schedules/${scheduleId}/run-now`, {
    method: 'POST'
  });
  return handleResponse(res, 'Start schedule run');
};
