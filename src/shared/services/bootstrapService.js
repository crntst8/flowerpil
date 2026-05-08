const GLOBAL_KEY = '__FLOWERPIL_BOOTSTRAP__';
const STORAGE_KEY = 'flowerpil:bootstrap-data';
const STORAGE_TTL = 5 * 60 * 1000; // 5 minutes

let bootstrapCache = null;
let bootstrapPromise = null;

const hasWindow = typeof window !== 'undefined';

const readStorage = () => {
  if (!hasWindow) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - parsed.timestamp > STORAGE_TTL) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.data || null;
  } catch {
    return null;
  }
};

const writeStorage = (data) => {
  if (!hasWindow) return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data,
      })
    );
  } catch {
    // Ignore storage quota issues
  }
};

const readGlobal = () => {
  if (!hasWindow) return null;
  const payload = window[GLOBAL_KEY];
  if (payload && typeof payload === 'object') {
    return payload;
  }
  return null;
};

const primeGlobal = (data) => {
  if (!hasWindow) return;
  window[GLOBAL_KEY] = { ...(window[GLOBAL_KEY] || {}), ...data };
};

const sanitizeData = (data) => {
  if (!data || typeof data !== 'object') return null;
  return {
    siteSettings: data.siteSettings || null,
    genres: Array.isArray(data.genres) ? data.genres : [],
  };
};

// Initialize cache from global/window/sessionStorage on first import
(() => {
  const initial =
    sanitizeData(readGlobal()) ||
    sanitizeData(readStorage());
  if (initial) {
    bootstrapCache = initial;
    if (hasWindow) {
      primeGlobal(initial);
    }
  }
})();

export const getBootstrapSnapshot = () => {
  if (bootstrapCache) return bootstrapCache;
  const globalData = sanitizeData(readGlobal());
  if (globalData) {
    bootstrapCache = globalData;
    writeStorage(globalData);
    return bootstrapCache;
  }
  const stored = sanitizeData(readStorage());
  if (stored) {
    bootstrapCache = stored;
    if (hasWindow) {
      primeGlobal(stored);
    }
    return bootstrapCache;
  }
  return null;
};

export const primeBootstrapData = (partial) => {
  if (!partial) return bootstrapCache;
  const next = sanitizeData({
    ...(bootstrapCache || {}),
    ...partial,
  });
  bootstrapCache = next;
  if (next) {
    primeGlobal(next);
    writeStorage(next);
  }
  return bootstrapCache;
};

export const fetchBootstrapData = ({ force = false } = {}) => {
  if (!force) {
    const snapshot = getBootstrapSnapshot();
    if (snapshot) {
      return Promise.resolve(snapshot);
    }
  }

  if (bootstrapPromise && !force) {
    return bootstrapPromise;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 8000);

  bootstrapPromise = fetch('/api/v1/bootstrap', {
    credentials: 'include',
    cache: 'no-store',
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Bootstrap fetch failed with status ${res.status}`);
      }
      return res.json();
    })
    .then((payload) => {
      const data = sanitizeData(payload?.data || payload);
      if (data) {
        primeBootstrapData(data);
      }
      return data;
    })
    .catch((error) => {
      if (force) {
        bootstrapCache = null;
        writeStorage(null);
      }
      throw error;
    })
    .finally(() => {
      bootstrapPromise = null;
      clearTimeout(timeoutHandle);
    });

  return bootstrapPromise;
};
