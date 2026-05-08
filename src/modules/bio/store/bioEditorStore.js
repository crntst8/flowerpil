import { create } from 'zustand';
import { DEFAULT_THEME } from '../../../shared/constants/bioThemes';

const DEFAULT_DISPLAY_SETTINGS = {
  showBio: true,
  showLocation: true,
  showSocialLinks: true,
  showFeaturedLinks: true,
  showAnalytics: false,
  showProfilePicture: true,
  profileLinksVisibility: {}
};

const DEFAULT_THEME_SETTINGS = {
  paletteId: DEFAULT_THEME.id,
  customColors: null
};

const MAX_FEATURED_LINKS = 9;

const createEmptyFeaturedLink = (position) => ({
  position,
  link_type: 'url',
  title: '',
  description: '',
  url: '',
  image_url: null,
  is_enabled: true,
  playlist_id: null
});

const sanitizeFeaturedLinkForEditor = (link, index) => {
  if (!link || typeof link !== 'object') {
    return createEmptyFeaturedLink(index + 1);
  }

  const position = Math.max(1, Math.min(MAX_FEATURED_LINKS, parseInt(link.position, 10) || index + 1));
  const requestedType = typeof link.link_type === 'string' ? link.link_type.toLowerCase() : 'url';
  const isPlaylist = requestedType === 'playlist';

  const playlistId = isPlaylist && link.playlist_id ? parseInt(link.playlist_id, 10) : null;
  const safeUrl = typeof link.url === 'string' ? link.url.trim() : '';
  const safeImage = typeof link.image_url === 'string' ? link.image_url.trim() : null;

  if (isPlaylist && !playlistId) {
    return {
      ...createEmptyFeaturedLink(position),
      position,
      link_type: 'url',
      title: typeof link.title === 'string' ? link.title : '',
      description: typeof link.description === 'string' ? link.description : '',
      url: safeUrl,
      image_url: safeImage,
      is_enabled: link.is_enabled !== false
    };
  }

  return {
    position,
    link_type: isPlaylist ? 'playlist' : 'url',
    title: typeof link.title === 'string' ? link.title : '',
    description: typeof link.description === 'string' ? link.description : '',
    url: safeUrl,
    image_url: safeImage,
    is_enabled: link.is_enabled !== false,
    playlist_id: isPlaylist ? playlistId : null
  };
};

const normalizeFeaturedLinks = (links = []) => {
  const trimmed = Array.isArray(links) ? links.slice(0, MAX_FEATURED_LINKS) : [];
  return trimmed
    .map((link, index) => sanitizeFeaturedLinkForEditor(link, index))
    .map((link, index) => ({ ...link, position: index + 1 }));
};

const mergeDisplaySettings = (settings) => ({
  ...DEFAULT_DISPLAY_SETTINGS,
  ...(settings || {}),
  showBio: settings?.showBio !== false,
  showLocation: settings?.showLocation !== false,
  showSocialLinks: settings?.showSocialLinks !== false,
  showFeaturedLinks: settings?.showFeaturedLinks !== false,
  showAnalytics: settings?.showAnalytics === true,
  showProfilePicture: settings?.showProfilePicture !== false,
  profileLinksVisibility: settings?.profileLinksVisibility && typeof settings.profileLinksVisibility === 'object'
    ? settings.profileLinksVisibility
    : {}
});

const normalizeThemeSettings = (settings) => {
  if (!settings || typeof settings !== 'object') {
    return { ...DEFAULT_THEME_SETTINGS };
  }

  return {
    paletteId: typeof settings.paletteId === 'string' && settings.paletteId.trim()
      ? settings.paletteId.trim()
      : DEFAULT_THEME_SETTINGS.paletteId,
    customColors: settings.customColors && typeof settings.customColors === 'object'
      ? { ...settings.customColors }
      : null
  };
};

const useBioEditorStore = create((set, get) => ({
  // Current bio profile state
  currentBioProfile: {
    id: null,
    handle: '',
    curator_id: null,
    display_settings: { ...DEFAULT_DISPLAY_SETTINGS },
    theme_settings: { ...DEFAULT_THEME_SETTINGS },
    seo_metadata: {
      title: '',
      description: '',
      keywords: []
    },
    draft_content: {
      bio: null,
      customBio: '',
      featuredLinks: []
    },
    is_published: false,
    version_number: 1
  },

  // Featured links state (dynamic array)
  featuredLinks: [],

  // Profile links (4 buttons - derived from curator data, read-only)
  profileLinks: [],
  // Visibility map for profile links (by platform/type), true = show
  profileLinksVisibility: {},
  
  // Available curators for selection
  curators: [],
  selectedCurator: null,
  
  // Handle validation state
  handleValidation: {
    isValid: true,
    isAvailable: true,
    isChecking: false,
    errors: [],
    suggestions: []
  },

  // UI state
  isLoading: false,
  isSaving: false,
  isPublishing: false,
  error: null,
  unsavedChanges: false,
  
  // Preview state
  previewMode: 'desktop', // 'mobile', 'tablet', 'desktop'
  previewUrl: '',
  
  // Auto-save state
  lastSavedAt: null,
  autoSaveInterval: null,

  // Actions - Bio Profile Management
  setCurrentBioProfile: (bioProfile) => {
    const currentProfile = get().currentBioProfile;
    const processedProfile = {
      ...bioProfile,
      // Preserve handle if server response doesn't include it
      handle: bioProfile.handle || currentProfile.handle,
      display_settings: mergeDisplaySettings(
        typeof bioProfile.display_settings === 'string'
          ? JSON.parse(bioProfile.display_settings)
          : bioProfile.display_settings
      ),
      theme_settings: normalizeThemeSettings(
        typeof bioProfile.theme_settings === 'string'
          ? JSON.parse(bioProfile.theme_settings)
          : bioProfile.theme_settings
      ),
      seo_metadata: typeof bioProfile.seo_metadata === 'string'
        ? JSON.parse(bioProfile.seo_metadata)
        : bioProfile.seo_metadata || currentProfile.seo_metadata,
      draft_content: typeof bioProfile.draft_content === 'string'
        ? JSON.parse(bioProfile.draft_content)
        : bioProfile.draft_content || currentProfile.draft_content
    };

    const normalizedFeaturedLinks = normalizeFeaturedLinks(processedProfile.draft_content?.featuredLinks || []);

    set({
      currentBioProfile: {
        ...processedProfile,
        draft_content: {
          ...processedProfile.draft_content,
          featuredLinks: normalizedFeaturedLinks
        }
      },
      featuredLinks: normalizedFeaturedLinks,
      profileLinksVisibility: processedProfile.display_settings?.profileLinksVisibility || {},
      unsavedChanges: false
    });

    // Update preview URL
    if (processedProfile.handle) {
      get().updatePreviewUrl(processedProfile.handle);
    }
  },

  updateBioProfile: (updates) => set((state) => ({
    currentBioProfile: { ...state.currentBioProfile, ...updates },
    unsavedChanges: true
  })),

  updateDisplaySettings: (settings) => set((state) => {
    const mergedSettings = mergeDisplaySettings({
      ...state.currentBioProfile.display_settings,
      ...settings
    });
    return {
      currentBioProfile: {
        ...state.currentBioProfile,
        display_settings: mergedSettings
      },
      profileLinksVisibility: mergedSettings.profileLinksVisibility || state.profileLinksVisibility,
      unsavedChanges: true
    };
  }),

  updateThemeSettings: (settings) => set((state) => ({
      currentBioProfile: {
        ...state.currentBioProfile,
        theme_settings: normalizeThemeSettings({
          ...state.currentBioProfile.theme_settings,
          ...settings
        })
      },
    unsavedChanges: true
  })),

  updateSeoMetadata: (metadata) => set((state) => ({
    currentBioProfile: {
      ...state.currentBioProfile,
      seo_metadata: { ...state.currentBioProfile.seo_metadata, ...metadata }
    },
    unsavedChanges: true
  })),

  updateDraftContent: (content) => set((state) => ({
    currentBioProfile: {
      ...state.currentBioProfile,
      draft_content: { ...state.currentBioProfile.draft_content, ...content }
    },
    unsavedChanges: true
  })),

  // Actions - Featured Links Management
  setFeaturedLinks: (links) => set((state) => {
    const normalized = normalizeFeaturedLinks(links);
    return {
      featuredLinks: normalized,
      currentBioProfile: {
        ...state.currentBioProfile,
        draft_content: {
          ...state.currentBioProfile.draft_content,
          featuredLinks: normalized
        }
      },
      unsavedChanges: true
    };
  }),

  updateFeaturedLink: (position, updates) => set((state) => {
    const updatedFeaturedLinks = state.featuredLinks.map(link =>
      link.position === position ? { ...link, ...updates } : link
    );
    const normalized = normalizeFeaturedLinks(updatedFeaturedLinks);
    return {
      featuredLinks: normalized,
      currentBioProfile: {
        ...state.currentBioProfile,
        draft_content: {
          ...state.currentBioProfile.draft_content,
          featuredLinks: normalized
        }
      },
      unsavedChanges: true
    };
  }),

  reorderFeaturedLinks: (dragIndex, hoverIndex) => set((state) => {
    const updatedLinks = [...state.featuredLinks];
    const draggedLink = updatedLinks[dragIndex];
    const targetLink = updatedLinks[hoverIndex];

    updatedLinks[dragIndex] = { ...targetLink, position: dragIndex + 1 };
    updatedLinks[hoverIndex] = { ...draggedLink, position: hoverIndex + 1 };

    const normalized = normalizeFeaturedLinks(updatedLinks);
    return {
      featuredLinks: normalized,
      currentBioProfile: {
        ...state.currentBioProfile,
        draft_content: {
          ...state.currentBioProfile.draft_content,
          featuredLinks: normalized
        }
      },
      unsavedChanges: true
    };
  }),

  toggleFeaturedLink: (position) => set((state) => {
    const toggled = state.featuredLinks.map(link =>
      link.position === position ? { ...link, is_enabled: !link.is_enabled } : link
    );
    const normalized = normalizeFeaturedLinks(toggled);
    return {
      featuredLinks: normalized,
      currentBioProfile: {
        ...state.currentBioProfile,
        draft_content: {
          ...state.currentBioProfile.draft_content,
          featuredLinks: normalized
        }
      },
      unsavedChanges: true
    };
  }),

  addFeaturedLink: () => set((state) => {
    if (state.featuredLinks.length >= MAX_FEATURED_LINKS) {
      return {};
    }

    const newPosition = state.featuredLinks.length + 1;
    const updatedFeaturedLinks = [...state.featuredLinks, createEmptyFeaturedLink(newPosition)];
    const normalized = normalizeFeaturedLinks(updatedFeaturedLinks);
    return {
      featuredLinks: normalized,
      currentBioProfile: {
        ...state.currentBioProfile,
        draft_content: {
          ...state.currentBioProfile.draft_content,
          featuredLinks: normalized
        }
      },
      unsavedChanges: true
    };
  }),

  removeFeaturedLink: (position) => set((state) => {
    const filteredLinks = state.featuredLinks.filter(link => link.position !== position);
    const normalized = normalizeFeaturedLinks(filteredLinks);
    return {
      featuredLinks: normalized,
      currentBioProfile: {
        ...state.currentBioProfile,
        draft_content: {
          ...state.currentBioProfile.draft_content,
          featuredLinks: normalized
        }
      },
      unsavedChanges: true
    };
  }),

  // Actions - Curator Selection
  setCurators: (curators) => set({ curators }),
  
  setSelectedCurator: (curator) => {
    set({ selectedCurator: curator });
    
    // Update profile links when curator changes
    if (curator) {
      get().updateProfileLinks(curator);
      
      // Update bio profile curator_id
      get().updateBioProfile({ curator_id: curator.id });
    }
  },

  updateProfileLinks: (curator) => {
    const profileLinks = [];
    
    if (!curator) {
      set({ profileLinks: [] });
      return;
    }
    
    // Add legacy DSP URLs first (4 slots max)
    if (curator.spotify_url) {
      profileLinks.push({
        platform: 'spotify',
        label: 'Spotify',
        url: curator.spotify_url
      });
    }
    
    if (curator.apple_url) {
      profileLinks.push({
        platform: 'apple',
        label: 'Apple Music',
        url: curator.apple_url
      });
    }
    
    if (curator.tidal_url) {
      profileLinks.push({
        platform: 'tidal',
        label: 'Tidal',
        url: curator.tidal_url
      });
    }
    
    if (curator.bandcamp_url) {
      profileLinks.push({
        platform: 'bandcamp',
        label: 'Bandcamp',
        url: curator.bandcamp_url
      });
    }
    
    // Add modern social_links if there's still space (max 4 total)
    const remainingSlots = 4 - profileLinks.length;
    if (remainingSlots > 0 && curator.social_links && Array.isArray(curator.social_links)) {
      const socialLinksToAdd = curator.social_links.slice(0, remainingSlots);
      socialLinksToAdd.forEach(socialLink => {
        if (socialLink.url && socialLink.platform) {
          profileLinks.push({
            platform: socialLink.platform.toLowerCase(),
            label: socialLink.platform,
            url: socialLink.url
          });
        }
      });
    }
    
    // Build default visibility map (show all by default)
    const visibility = {};
    profileLinks.forEach(link => {
      const key = (link.platform || link.label || '').toLowerCase();
      if (key) visibility[key] = true;
    });

    set({ profileLinks, profileLinksVisibility: visibility });
  },

  // Profile link visibility controls
  toggleProfileLinkVisibility: (platform) => set((state) => {
    const key = platform.toLowerCase();
    const current = state.profileLinksVisibility?.[key] ?? true;
    const newVisibility = { ...state.profileLinksVisibility, [key]: !current };
    return {
      profileLinksVisibility: newVisibility,
      currentBioProfile: {
        ...state.currentBioProfile,
        display_settings: {
          ...state.currentBioProfile.display_settings,
          profileLinksVisibility: newVisibility
        }
      },
      unsavedChanges: true
    };
  }),

  setProfileLinkVisibility: (platform, visible) => set((state) => {
    const newVisibility = { ...state.profileLinksVisibility, [platform.toLowerCase()]: !!visible };
    return {
      profileLinksVisibility: newVisibility,
      currentBioProfile: {
        ...state.currentBioProfile,
        display_settings: {
          ...state.currentBioProfile.display_settings,
          profileLinksVisibility: newVisibility
        }
      },
      unsavedChanges: true
    };
  }),

  getHiddenProfileLinkTypes: () => {
    const vis = get().profileLinksVisibility || {};
    return Object.keys(vis).filter(k => vis[k] === false);
  },

  // Actions - Handle Validation
  setHandleValidation: (validation) => set({ handleValidation: validation }),

  updateHandle: async (handle) => {
    let cleanHandle = handle.toLowerCase().trim();
    
    // Final cleaning for storage: remove leading/trailing hyphens
    cleanHandle = cleanHandle.replace(/^-+|-+$/g, '');
    
    set((state) => ({
      currentBioProfile: { ...state.currentBioProfile, handle: cleanHandle },
      handleValidation: { ...state.handleValidation, isChecking: true },
      unsavedChanges: true
    }));

    // Update preview URL immediately for UX
    get().updatePreviewUrl(cleanHandle);

    // Debounced validation would be handled by component
    return cleanHandle;
  },

  // Actions - UI State
  setLoading: (isLoading) => set({ isLoading }),
  setSaving: (isSaving) => set({ isSaving }),
  setPublishing: (isPublishing) => set({ isPublishing }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  // Actions - Preview
  setPreviewMode: (mode) => set({ previewMode: mode }),
  
  updatePreviewUrl: (handle) => {
    if (!handle) return;
    // Environment-aware URL generation for previewing the published bio page
    // In development: open the backend-rendered page via raw API path (proxied by Vite)
    // In production: use the subdomain format https://{handle}.{VITE_BIO_DOMAIN}
    const isDev = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.env?.MODE !== 'production');
    const bioDomain = (import.meta.env?.VITE_BIO_DOMAIN || 'pil.bio').toLowerCase();
    const isLocalDomain = bioDomain === '127.0.0.1' || bioDomain === 'localhost';

    let previewUrl;
    if (isDev || isLocalDomain) {
      // Use same-origin so Vite proxy serves the backend HTML cleanly
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      previewUrl = `${origin}/api/v1/bio/${handle}`;
    } else {
      previewUrl = `https://${handle}.${bioDomain}`;
    }
    set({ previewUrl });
  },

  // Actions - Auto-save
  markAsSaved: () => set({ 
    unsavedChanges: false, 
    lastSavedAt: new Date().toISOString() 
  }),

  enableAutoSave: (callback, interval = 30000) => {
    const existingInterval = get().autoSaveInterval;
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const newInterval = setInterval(() => {
      const { unsavedChanges } = get();
      if (unsavedChanges && callback) {
        callback();
      }
    }, interval);

    set({ autoSaveInterval: newInterval });
  },

  disableAutoSave: () => {
    const interval = get().autoSaveInterval;
    if (interval) {
      clearInterval(interval);
      set({ autoSaveInterval: null });
    }
  },

  // Actions - Reset/Clear
  resetBioProfile: () => {
    const defaultProfile = {
      id: null,
      handle: '',
      curator_id: null,
      display_settings: { ...DEFAULT_DISPLAY_SETTINGS },
      theme_settings: { ...DEFAULT_THEME_SETTINGS },
      seo_metadata: {
        title: '',
        description: '',
        keywords: []
      },
      draft_content: {
        bio: null,
        customBio: '',
        featuredLinks: [
          createEmptyFeaturedLink(1),
          createEmptyFeaturedLink(2),
          createEmptyFeaturedLink(3)
        ]
      },
      is_published: false,
      version_number: 1
    };

    set({
      currentBioProfile: defaultProfile,
      featuredLinks: defaultProfile.draft_content.featuredLinks,
      selectedCurator: null,
      profileLinks: [],
      handleValidation: {
        isValid: true,
        isAvailable: true,
        isChecking: false,
        errors: [],
        suggestions: []
      },
      unsavedChanges: false,
      error: null,
      previewUrl: ''
    });
  },

  // Computed getters
  getCurrentThemePalette: () => {
    const { theme_settings } = get().currentBioProfile;
    
    if (theme_settings.customColors) {
      return {
        id: 'custom',
        name: 'Custom Theme',
        ...theme_settings.customColors
      };
    }

    return DEFAULT_THEME;
  },

  getEnabledFeaturedLinks: () => {
    return get().featuredLinks.filter(link => link.is_enabled);
  },

  getCompletedFeaturedLinks: () => {
    return get().featuredLinks.filter(link => {
      if (!link.is_enabled) return false;
      if (!link.title?.trim()) return false;

      if (link.link_type === 'playlist') {
        return Boolean(link.playlist_id);
      }

      return Boolean(link.url?.trim());
    });
  },

  isValidForSave: () => {
    const { currentBioProfile, selectedCurator, handleValidation } = get();
    return !!(
      currentBioProfile.handle?.trim() &&
      selectedCurator &&
      handleValidation.isValid &&
      handleValidation.isAvailable
    );
  },

  isValidForPublish: () => {
    const state = get();
    const isValidForSave = state.isValidForSave();
    const hasId = !!state.currentBioProfile.id;
    const enabledLinks = state.getEnabledFeaturedLinks().length;
    const customBio = state.currentBioProfile.draft_content?.customBio?.trim();
    
    // Debug logging
    if (typeof window !== 'undefined') {
      console.log('isValidForPublish debug:', {
        isValidForSave,
        hasId,
        profileId: state.currentBioProfile.id,
        enabledLinks,
        customBio,
        hasContent: enabledLinks > 0 || !!customBio
      });
    }
    
    return (
      isValidForSave &&
      hasId &&
      (enabledLinks > 0 || !!customBio)
    );
  },

  getPreviewData: () => {
    const { 
      currentBioProfile, 
      featuredLinks, 
      profileLinks, 
      selectedCurator 
    } = get();

    return {
      profile: currentBioProfile,
      featuredLinks: featuredLinks.filter(link => link.is_enabled),
      profileLinks,
      curator: selectedCurator,
      theme: get().getCurrentThemePalette()
    };
  },

  // Development helper
  __getFullState: () => get()
}));

export { useBioEditorStore, MAX_FEATURED_LINKS };
export default { useBioEditorStore };
