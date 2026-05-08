import express from 'express';

const app = express();
app.use(express.json({ limit: '256kb' }));

const HOST = process.env.SEARCH_AGGREGATOR_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || process.env.SEARCH_AGGREGATOR_PORT || 3010);
const SHARED_SECRET = process.env.SEARCH_AGGREGATOR_SECRET || '';
const TIMEOUT_MS = Number(process.env.SEARCH_AGGREGATOR_TIMEOUT_MS || 7000);

const PROVIDER_ORDER = (process.env.SEARCH_AGGREGATOR_PROVIDER_ORDER || 'brave,bing,serpapi,google_cse')
  .split(',')
  .map((provider) => provider.trim().toLowerCase())
  .filter(Boolean);

const limitNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const normalizeUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    const normalized = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
    return normalized.replace(/\/+$/, '');
  } catch {
    return url.trim();
  }
};

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message = data?.error?.message || data?.message || response.statusText || 'Request failed';
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
};

const buildResult = (source, payload, index) => ({
  source,
  rank: index + 1,
  title: payload.title || payload.name || '',
  url: payload.url || payload.link || '',
  snippet: payload.snippet || payload.description || ''
});

const providerHandlers = {
  brave: async (query, limit) => {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) return [];

    const count = limitNumber(limit, 1, 10, 5);
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(count));

    const data = await fetchJson(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      }
    });

    const results = Array.isArray(data?.web?.results) ? data.web.results : [];
    return results.map((item, index) => buildResult('brave', {
      title: item.title,
      url: item.url,
      snippet: item.description
    }, index));
  },

  bing: async (query, limit) => {
    const apiKey = process.env.BING_SEARCH_API_KEY;
    if (!apiKey) return [];

    const count = limitNumber(limit, 1, 10, 5);
    const url = new URL('https://api.bing.microsoft.com/v7.0/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(count));
    url.searchParams.set('responseFilter', 'Webpages');

    const data = await fetchJson(url.toString(), {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey
      }
    });

    const results = Array.isArray(data?.webPages?.value) ? data.webPages.value : [];
    return results.map((item, index) => buildResult('bing', {
      title: item.name,
      url: item.url,
      snippet: item.snippet
    }, index));
  },

  serpapi: async (query, limit) => {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) return [];

    const count = limitNumber(limit, 1, 10, 5);
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(count));
    url.searchParams.set('api_key', apiKey);

    const data = await fetchJson(url.toString());
    const results = Array.isArray(data?.organic_results) ? data.organic_results : [];
    return results.map((item, index) => buildResult('serpapi', {
      title: item.title,
      url: item.link,
      snippet: item.snippet
    }, index));
  },

  google_cse: async (query, limit) => {
    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const engineId = process.env.GOOGLE_CSE_ENGINE_ID;
    if (!apiKey || !engineId) return [];

    const count = limitNumber(limit, 1, 10, 5);
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('q', query);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', engineId);
    url.searchParams.set('num', String(count));

    const data = await fetchJson(url.toString());
    const results = Array.isArray(data?.items) ? data.items : [];
    return results.map((item, index) => buildResult('google_cse', {
      title: item.title,
      url: item.link,
      snippet: item.snippet
    }, index));
  }
};

const getEnabledProviders = () => Object.keys(providerHandlers).filter((provider) => {
  if (provider === 'brave') return !!process.env.BRAVE_SEARCH_API_KEY;
  if (provider === 'bing') return !!process.env.BING_SEARCH_API_KEY;
  if (provider === 'serpapi') return !!process.env.SERPAPI_API_KEY;
  if (provider === 'google_cse') return !!process.env.GOOGLE_CSE_API_KEY && !!process.env.GOOGLE_CSE_ENGINE_ID;
  return false;
});

const selectProviders = (requested) => {
  const enabled = new Set(getEnabledProviders());
  const order = PROVIDER_ORDER.length ? PROVIDER_ORDER : Array.from(enabled);
  const candidates = Array.isArray(requested) && requested.length
    ? requested.map((provider) => String(provider || '').toLowerCase()).filter(Boolean)
    : order;
  return candidates.filter((provider) => enabled.has(provider));
};

const mergeResults = (providerOrder, providerResults, maxResults) => {
  const seen = new Set();
  const merged = [];

  providerOrder.forEach((provider) => {
    const results = providerResults[provider] || [];
    results.forEach((result) => {
      if (!result?.url) return;
      const key = normalizeUrl(result.url);
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(result);
    });
  });

  return merged.slice(0, maxResults);
};

app.get('/health', (_req, res) => {
  const enabled = getEnabledProviders();
  res.json({
    ok: true,
    providers: enabled,
    provider_order: PROVIDER_ORDER,
    total_enabled: enabled.length
  });
});

app.post('/search', async (req, res) => {
  try {
    if (SHARED_SECRET && req.headers['x-search-secret'] !== SHARED_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { query, limit = 5, providers, maxResults } = req.body || {};
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const providerOrder = selectProviders(providers);
    if (!providerOrder.length) {
      return res.status(503).json({ success: false, error: 'No search providers configured' });
    }

    const providerLimit = limitNumber(limit, 1, 10, 5);
    const resultLimit = limitNumber(maxResults, 1, 50, providerLimit * providerOrder.length);

    const settled = await Promise.allSettled(
      providerOrder.map((provider) => providerHandlers[provider](normalizedQuery, providerLimit))
    );

    const providerResults = {};
    settled.forEach((entry, index) => {
      const provider = providerOrder[index];
      if (entry.status === 'fulfilled') {
        providerResults[provider] = entry.value || [];
      } else {
        providerResults[provider] = [];
      }
    });

    const results = mergeResults(providerOrder, providerResults, resultLimit);

    res.json({
      success: true,
      data: {
        query: normalizedQuery,
        results,
        providers: providerOrder
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Search failed'
    });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[search-aggregator] listening on http://${HOST}:${PORT}`);
});
