const PRESET_GENRE_COLORS = [
  '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000', '#000000'
];

const normalizeHex = (hex = '') => {
  if (!hex) return '';
  const value = hex.trim().toLowerCase();
  if (!value.startsWith('#')) {
    return `#${value}`;
  }
  return value;
};

const hslToHex = (h, s, l) => {
  const hue = h % 360;
  const sat = s / 100;
  const light = l / 100;

  const a = sat * Math.min(light, 1 - light);
  const f = (n) => {
    const k = (n + hue / 30) % 12;
    const color = light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };

  return `#${f(0)}${f(8)}${f(4)}`;
};

const generateGenreColor = (existingColors = [], seed = '') => {
  const used = new Set(existingColors.map(normalizeHex));

  for (const color of PRESET_GENRE_COLORS) {
    const normalized = normalizeHex(color);
    if (!used.has(normalized)) {
      return normalized;
    }
  }

  const hash = seed
    .split('')
    .reduce((acc, char) => (
      ((acc << 5) - acc + char.charCodeAt(0)) | 0
    ), 0);

  const baseIndex = Math.abs(hash);
  const goldenAngle = 137.508;
  let attempt = 0;

  while (attempt < 720) {
    const hue = (baseIndex + attempt) * goldenAngle;
    const color = normalizeHex(hslToHex(hue, 70, 52));
    if (!used.has(color)) {
      return color;
    }
    attempt += 1;
  }

  return '#000000';
};

const slugifyGenreId = (input = '') => {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
};

const formatGenreLabel = (input = '') => {
  const trimmed = input.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getGenreCategoryConfig = (db) => {
  const entries = db.prepare(`
    SELECT config_key, config_value
    FROM admin_system_config
    WHERE config_key LIKE 'genre_category_%'
  `).all();

  const categories = {};
  const colors = {};

  entries.forEach(({ config_key, config_value }) => {
    if (config_key.startsWith('genre_category_color_')) {
      const id = config_key.replace('genre_category_color_', '');
      colors[id] = config_value;
    } else if (config_key.startsWith('genre_category_')) {
      const id = config_key.replace('genre_category_', '');
      categories[id] = config_value;
    }
  });

  const list = Object.entries(categories)
    .map(([id, label]) => ({
      id,
      label,
      color: colors[id] || null
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { list, colors };
};

export {
  PRESET_GENRE_COLORS,
  normalizeHex,
  generateGenreColor,
  slugifyGenreId,
  formatGenreLabel,
  getGenreCategoryConfig
};
