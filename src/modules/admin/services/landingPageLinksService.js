import { adminGet, adminPost, adminPut, adminDelete } from '../utils/adminApi';

const API_BASE = '/api/v1/admin/site-admin';

export const getAllLandingPageLinks = async () => {
  const result = await adminGet(`${API_BASE}/landing-page-links`);
  return result?.links || [];
};

export const getLandingPageLinkById = async (id) => {
  const result = await adminGet(`${API_BASE}/landing-page-links/${id}`);
  return result?.link || null;
};

export const createLandingPageLink = async (linkData) => {
  const result = await adminPost(`${API_BASE}/landing-page-links`, linkData);
  return result?.link || null;
};

export const updateLandingPageLink = async (id, linkData) => {
  const result = await adminPut(`${API_BASE}/landing-page-links/${id}`, linkData);
  return result?.link || null;
};

export const deleteLandingPageLink = async (id) => {
  const result = await adminDelete(`${API_BASE}/landing-page-links/${id}`);
  return result?.success || false;
};

export const pruneStaleTop10Links = async () => {
  const result = await adminPost(`${API_BASE}/landing-page-links/prune-top10`, {});
  return result || {};
};
