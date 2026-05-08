// Bio Page Theme Defaults & Utilities
// Provides a single default palette plus helpers for custom color validation.

const FLOWERPIL_DEFAULT_THEME = {
  id: 'flowerpil-default',
  name: 'Flowerpil Default',
  description: 'Matches the main Flowerpil site aesthetic.',
  background: '#dad4d4ff',
  text: '#000000',
  border: '#000000',
  accent: '#000000',
  link: '#000000ff',
  featuredLinkBg: 'rgba(236, 236, 236, 0.38)'
};

export const BIO_THEME_PALETTES = [FLOWERPIL_DEFAULT_THEME];

export const DEFAULT_THEME = FLOWERPIL_DEFAULT_THEME;

export const getThemeById = () => FLOWERPIL_DEFAULT_THEME;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const hexToRgb = (value) => {
  const normalized = value.replace('#', '');

  if (normalized.length === 3) {
    const [r, g, b] = normalized.split('').map((char) => parseInt(`${char}${char}`, 16));
    return { r, g, b, alpha: 1 };
  }

  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return { r, g, b, alpha: 1 };
  }

  return null;
};

const rgbaToRgb = (value) => {
  const match = value
    .replace(/\s+/g, '')
    .match(/^rgba?\((\d+),(\d+),(\d+)(?:,(\d*\.?\d+))?\)$/i);

  if (!match) {
    return null;
  }

  const [, r, g, b, a] = match;
  return {
    r: clamp(parseInt(r, 10), 0, 255),
    g: clamp(parseInt(g, 10), 0, 255),
    b: clamp(parseInt(b, 10), 0, 255),
    alpha: a !== undefined ? clamp(parseFloat(a), 0, 1) : 1,
  };
};

const parseColor = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  if (trimmed.startsWith('#')) {
    return hexToRgb(trimmed);
  }

  if (trimmed.startsWith('rgb')) {
    return rgbaToRgb(trimmed);
  }

  return null;
};

const channelToLinear = (channel) => {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

const getRelativeLuminance = (color) => {
  const parsed = parseColor(color);
  if (!parsed) {
    return null;
  }

  const { r, g, b } = parsed;
  const rLinear = channelToLinear(r);
  const gLinear = channelToLinear(g);
  const bLinear = channelToLinear(b);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
};

const getContrastRatio = (background, text) => {
  const backgroundLuminance = getRelativeLuminance(background);
  const textLuminance = getRelativeLuminance(text);

  if (backgroundLuminance === null || textLuminance === null) {
    return null;
  }

  const lighter = Math.max(backgroundLuminance, textLuminance);
  const darker = Math.min(backgroundLuminance, textLuminance);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
};

export const validateColorCombination = (background, text) => {
  const contrastRatio = getContrastRatio(background, text);

  if (contrastRatio === null) {
    return {
      isValid: false,
      contrastRatio: 0,
      wcagLevel: 'Fail',
    };
  }

  if (contrastRatio >= 7) {
    return {
      isValid: true,
      contrastRatio,
      wcagLevel: 'AAA',
    };
  }

  if (contrastRatio >= 4.5) {
    return {
      isValid: true,
      contrastRatio,
      wcagLevel: 'AA',
    };
  }

  return {
    isValid: false,
    contrastRatio,
    wcagLevel: 'Fail',
  };
};
