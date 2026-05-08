const DEV_FALLBACK_URL = 'https://flowerpil.io';

export const getPublicSiteBaseUrl = () => {
  const fromEnv = typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_SITE_URL;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return DEV_FALLBACK_URL;
};

export const normalizePublicUrl = (input) => {
  if (!input) return '';

  const raw = String(input).trim();
  if (!raw) return '';

  if (/^(mailto:|tel:|javascript:)/i.test(raw)) {
    return raw;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }

  const base = getPublicSiteBaseUrl();

  if (raw.startsWith('/')) {
    return `${base}${raw}`;
  }

  return `${base}/${raw}`;
};
