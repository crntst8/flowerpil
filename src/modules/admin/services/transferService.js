import { adminGet, adminPost, adminDelete, AdminApiError } from '../utils/adminApi.js';

const BASE = '/api/v1/admin/transfers';

const buildQuery = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    search.set(key, value);
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
};

export const createTransfer = async ({ sourceUrl, destinations, options = {} }) => {
  try {
    const response = await adminPost(BASE, { sourceUrl, destinations, options });
    return response.data;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(error.message || 'Failed to create transfer');
  }
};

export const getTransferJob = async (id) => {
  try {
    const response = await adminGet(`${BASE}/${id}`);
    return response.data;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(error.message || 'Failed to load transfer job');
  }
};

export const listTransferJobs = async (params = {}) => {
  const query = buildQuery(params);
  try {
    const response = await adminGet(`${BASE}${query}`);
    return response.data || [];
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(error.message || 'Failed to load transfer jobs');
  }
};

export const exportTransferResults = async (id, format = 'csv') => {
  const query = buildQuery({ format });
  const response = await fetch(`${BASE}/${id}/export${query}`, {
    method: 'GET',
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('Failed to export results');
  }
  return response;
};

export const deleteTransferJob = async (id) => {
  try {
    const response = await adminDelete(`${BASE}/${id}`);
    return response.data;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(error.message || 'Failed to delete transfer job');
  }
};

export default {
  createTransfer,
  getTransferJob,
  listTransferJobs,
  exportTransferResults,
  deleteTransferJob
};
