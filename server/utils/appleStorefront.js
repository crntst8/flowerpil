const STOREFRONT_PRIORITY = ['au', 'us', 'gb', 'ca'];

const normalizeStorefrontCode = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return /^[a-z]{2}$/.test(trimmed) ? trimmed : null;
};

export const getStorefrontPriority = () => [...STOREFRONT_PRIORITY];

export const resolveStorefront = (value) => {
  const normalized = normalizeStorefrontCode(value);
  if (normalized) return normalized;
  return STOREFRONT_PRIORITY[0];
};

export const resolveStorefrontWithFallbacks = (value, fallbacks = STOREFRONT_PRIORITY) => {
  const normalized = normalizeStorefrontCode(value);
  if (normalized) return normalized;
  for (const fallback of fallbacks) {
    const code = normalizeStorefrontCode(fallback);
    if (code) return code;
  }
  // Absolute fallback if list was empty or invalid
  return 'us';
};

export const getNextStorefront = (current) => {
  const normalized = normalizeStorefrontCode(current);
  const list = getStorefrontPriority();
  if (!normalized) return list[0];
  const idx = list.indexOf(normalized);
  if (idx === -1 || idx === list.length - 1) {
    return list[0];
  }
  return list[idx + 1];
};

export const isValidStorefront = (value) => !!normalizeStorefrontCode(value);
