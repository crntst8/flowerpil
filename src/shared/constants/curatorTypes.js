// Comprehensive Curator Types Configuration
// Organized by categories with display formatting

// Define category sections with unselectable headers
export const CURATOR_TYPE_CATEGORIES = {
  GENERAL: {
    id: 'general',
    label: '—[GENERAL]—',
    isSelectable: false,
    types: ['curator', 'flowerpil']
  },
  LABEL: {
    id: 'label',
    label: '—[LABEL]—',
    isSelectable: false,
    types: ['label', 'label-ar', 'label-services']
  },
  ARTIST: {
    id: 'artist',
    label: '—[ARTIST]—',
    isSelectable: false,
    types: ['artist', 'band', 'artist-manager', 'artist-management', 'artist-booker', 'musician', 'dj']
  },
  CONTENT: {
    id: 'content',
    label: '—[CONTENT]—', 
    isSelectable: false,
    types: ['magazine', 'blog', 'podcast', 'podcast-host', 'music-journalist', 'writer']
  },
  VENUE: {
    id: 'venue',
    label: '—[VENUE]—',
    isSelectable: false, 
    types: ['venue', 'venue-manager', 'venue-booker']
  },
  BOOKINGS: {
    id: 'bookings',
    label: '—[BOOKINGS]—',
    isSelectable: false,
    types: ['booking-agent', 'festival-booker']
  },
  RADIO: {
    id: 'radio',
    label: '—[RADIO]—',
    isSelectable: false,
    types: ['radio-station', 'radio-presenter', 'radio-producer', 'radio-programmer', 'radio-show']
  },
  TECH: {
    id: 'tech',
    label: '—[TECH]—',
    isSelectable: false,
    types: ['producer', 'engineer', 'mix-engineer', 'mastering-engineer', 'recording-studio', 'live-engineer', 'sound-engineer']
  },
  LENSE: {
    id: 'lense',
    label: '—[LENSE]—',
    isSelectable: false,
    types: ['filmmaker', 'photographer']
  }
};

// Define display labels for each type
export const CURATOR_TYPE_LABELS = {
  // General
  'curator': 'Curator',
  'flowerpil': 'Flowerpil',
  
  // Label
  'label': 'Label',
  'label-ar': 'Label A&R',
  'label-services': 'Label Services',
  
  // Artist
  'artist-manager': 'Artist Manager',
  'artist-management': 'Artist Management',
  'artist-booker': 'Artist Booker', 
  'musician': 'Musician',
  'dj': 'DJ',
  
  // Content
  'magazine': 'Magazine',
  'blog': 'Blog',
  'podcast': 'Podcast',
  'podcast-host': 'Podcast Host',
  'music-journalist': 'Music Journalist',
  'writer': 'Writer',
  
  // Venue
  'venue': 'Venue',
  'venue-manager': 'Venue Manager',
  'venue-booker': 'Venue Booker',
  
  // Bookings
  'booking-agent': 'Booking Agent',
  'festival-booker': 'Festival Booker',
  
  // Radio
  'radio-station': 'Radio Station',
  'radio-presenter': 'Radio Presenter',
  'radio-producer': 'Radio Producer',
  'radio-programmer': 'Radio Programmer',
  'radio-show': 'Radio Show',
  
  // Tech
  'producer': 'Producer',
  'engineer': 'Engineer',
  'mix-engineer': 'Mix Engineer',
  'mastering-engineer': 'Mastering Engineer',
  'recording-studio': 'Recording Studio',
  'live-engineer': 'Live Engineer',
  'sound-engineer': 'Sound Engineer',
  
  // Lense
  'filmmaker': 'Filmmaker',
  'photographer': 'Photographer'
};

// Internal helper to normalize custom types supplied at runtime
const normalizeCustomTypes = (customTypes = []) => {
  if (!Array.isArray(customTypes) || customTypes.length === 0) {
    return [];
  }

  return customTypes
    .map((type) => {
      if (!type) return null;
      if (typeof type === 'string') {
        return { id: type, label: type, custom: true };
      }
      if (typeof type === 'object') {
        const { id, value, label, name } = type;
        const resolvedId = id || value;
        const resolvedLabel = label || name || resolvedId;
        if (!resolvedId || !resolvedLabel) return null;
        return { ...type, id: resolvedId, label: resolvedLabel, custom: true };
      }
      return null;
    })
    .filter(Boolean);
};

// Legacy type mapping for backward compatibility
export const LEGACY_TYPE_MAPPING = {
  'artist': 'musician',
  'label': 'label',
  'radio': 'radio-station',
  'blogger': 'blog'
};

// Map legacy type to new canonical type id
export const mapLegacyType = (legacyType) => {
  if (!legacyType) return legacyType;
  if (typeof legacyType !== 'string') return legacyType;

  const trimmed = legacyType.trim();
  if (!trimmed) return trimmed;

  const normalized = trimmed.toLowerCase();
  return LEGACY_TYPE_MAPPING[normalized] || trimmed;
};

// Get all selectable curator types as a flat array
export const getAllCuratorTypes = (customTypes = []) => {
  const base = Object.values(CURATOR_TYPE_CATEGORIES)
    .flatMap(category => category.types);

  if (!customTypes || customTypes.length === 0) {
    return base;
  }

  const normalizedCustoms = normalizeCustomTypes(customTypes)
    .map(type => type.id)
    .filter(id => id && !base.includes(id));

  return [...base, ...normalizedCustoms];
};

// Get formatted options for select dropdowns (includes category headers)
export const getCuratorTypeOptions = (customTypes = []) => {
  const options = [];
  
  Object.values(CURATOR_TYPE_CATEGORIES).forEach(category => {
    // Add category header (unselectable)
    options.push({
      value: category.id,
      label: category.label,
      isSelectable: false,
      isHeader: true
    });
    
    // Add category types
    category.types.forEach(type => {
      options.push({
        value: type,
        label: CURATOR_TYPE_LABELS[type],
        isSelectable: true,
        isHeader: false,
        category: category.id
      });
    });
  });

  const normalizedCustoms = normalizeCustomTypes(customTypes)
    .filter(type => type.id && !options.some(option => !option.isHeader && option.value === type.id));

  if (normalizedCustoms.length > 0) {
    options.push({
      value: 'custom',
      label: '—[CUSTOM]—',
      isSelectable: false,
      isHeader: true
    });

    normalizedCustoms.forEach(type => {
      options.push({
        value: type.id,
        label: type.label,
        isSelectable: true,
        isHeader: false,
        category: 'custom',
        custom: true
      });
    });
  }
  
  return options;
};

// Get display label for a curator type
export const getCuratorTypeLabel = (type) => {
  if (!type) return '';
  const normalized = mapLegacyType(type);
  return CURATOR_TYPE_LABELS[normalized] || normalized;
};

// Check if a type is valid
export const isValidCuratorType = (type, customTypes = []) => {
  return getAllCuratorTypes(customTypes).includes(type);
};

// Get options without headers (useful for filters)
export const getCuratorTypeFilterOptions = (customTypes = []) => {
  return getCuratorTypeOptions(customTypes)
    .filter(option => !option.isHeader)
    .map(option => ({ value: option.value, label: option.label, custom: option.custom }));
};

// Default curator type
export const DEFAULT_CURATOR_TYPE = 'curator';
