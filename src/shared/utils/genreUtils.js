export const parseGenreTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  return [];
};

const toSlug = (input = '') => {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const createGenreLookup = (catalog = []) => {
  const byId = {};
  const byLabel = {};
  const bySlug = {};

  catalog.forEach((category) => {
    if (!category) return;
    const id = category.id || '';
    const label = category.label || id;

    if (id) {
      byId[id.toLowerCase()] = category;
      bySlug[toSlug(id)] = category;
    }
    if (label) {
      byLabel[label.toLowerCase()] = category;
      bySlug[toSlug(label)] = category;
    }
  });

  const resolve = (raw) => {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    const slug = toSlug(trimmed);
    return byId[lower] || byLabel[lower] || bySlug[slug] || null;
  };

  return { byId, byLabel, bySlug, resolve };
};
