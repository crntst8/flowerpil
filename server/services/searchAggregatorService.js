const SEARCH_AGGREGATOR_URL = process.env.SEARCH_AGGREGATOR_URL || '';
const SEARCH_AGGREGATOR_SECRET = process.env.SEARCH_AGGREGATOR_SECRET || '';

const normalizeUrl = (base, path) => {
  if (!base) return '';
  try {
    const url = new URL(path, base);
    return url.toString();
  } catch {
    return '';
  }
};

const buildHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (SEARCH_AGGREGATOR_SECRET) {
    headers['x-search-secret'] = SEARCH_AGGREGATOR_SECRET;
  }
  return headers;
};

export const searchAggregator = async ({ query, limit = 5, maxResults = null, providers = null } = {}) => {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    throw new Error('Search query is required');
  }
  if (!SEARCH_AGGREGATOR_URL) {
    throw new Error('Search aggregator is not configured');
  }

  const url = normalizeUrl(SEARCH_AGGREGATOR_URL, '/search');
  if (!url) {
    throw new Error('Search aggregator URL is invalid');
  }

  const body = {
    query: normalizedQuery,
    limit
  };

  if (Number.isFinite(Number(maxResults))) {
    body.maxResults = Number(maxResults);
  }

  if (Array.isArray(providers) && providers.length) {
    body.providers = providers;
  }

  const headers = buildHeaders();

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    const message = data?.error || response.statusText || 'Search aggregator request failed';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data?.data?.results || [];
};

export const getSearchAggregatorHealth = async () => {
  if (!SEARCH_AGGREGATOR_URL) {
    return { ok: false, reason: 'missing_url', providers: [] };
  }

  const url = normalizeUrl(SEARCH_AGGREGATOR_URL, '/health');
  if (!url) {
    return { ok: false, reason: 'invalid_url', providers: [] };
  }

  try {
    const response = await fetch(url, { headers: buildHeaders() });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      return { ok: false, reason: 'unhealthy', providers: [] };
    }
    const providers = Array.isArray(data.providers) ? data.providers : [];
    if (!providers.length) {
      return { ok: false, reason: 'no_providers', providers: [] };
    }
    return { ok: true, reason: 'ready', providers };
  } catch (error) {
    return { ok: false, reason: 'unreachable', providers: [] };
  }
};
