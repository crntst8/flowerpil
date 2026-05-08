import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchBootstrapData, getBootstrapSnapshot, primeBootstrapData } from '@shared/services/bootstrapService';
import { scheduleIdleTask, cancelIdleTask } from '@shared/utils/scheduler';

const SiteSettingsContext = createContext();
const envTesterFeedbackFlag = String(import.meta.env.VITE_FEATURE_TESTER_FEEDBACK || '').toLowerCase() === 'true';
const defaultSiteSettings = {
  hide_curator_type_sitewide: { enabled: false },
  tester_feedback_sitewide: { enabled: envTesterFeedbackFlag },
  show_top10_in_nav: { enabled: false },
  instagram_track_linking_enabled: { enabled: false },
  playlist_love_enabled: { enabled: true },
  playlist_comments_enabled: { enabled: true },
  open_signup_enabled: { enabled: false },
  analytics_settings: {
    data_retention_days: 365,
    enable_detailed_tracking: true,
    privacy_mode: false,
    anonymize_after_days: 90
  },
  meta_pixel_enabled: { enabled: false },
  meta_ads_enabled: { enabled: false },
  meta_require_admin_approval: { enabled: true },
  meta_pixel_mode: { mode: 'curator' },
  meta_global_pixel_id: { value: '' },
  meta_pixel_advanced_matching: { enabled: false }
};

export const useSiteSettings = () => {
  const context = useContext(SiteSettingsContext);
  if (!context) {
    throw new Error('useSiteSettings must be used within a SiteSettingsProvider');
  }
  return context;
};

// eslint-disable-next-line react/prop-types
export const SiteSettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(defaultSiteSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSiteSettingsFallback = useCallback(async () => {
    const response = await fetch('/api/v1/config/site-settings', {
      credentials: 'include',
      cache: 'no-store'
    });
    const data = await response.json();
    if (data.success && data.data) {
      return data.data;
    }
    throw new Error(data.error || 'Failed to load site settings');
  }, []);

  const loadSettings = useCallback(async ({ force = false, silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      let resolved = null;

      try {
        const bootstrapData = await fetchBootstrapData({ force });
        resolved = bootstrapData?.siteSettings || null;
      } catch (bootstrapError) {
        if (import.meta.env?.DEV) {
          console.warn('[SiteSettings] Bootstrap fetch failed, falling back to config endpoint', bootstrapError);
        }
      }

      if (!resolved) {
        resolved = await fetchSiteSettingsFallback();
      }

      if (resolved) {
        setSettings({
          ...defaultSiteSettings,
          ...resolved
        });
        primeBootstrapData({ siteSettings: resolved });
        setError(null);
      }
    } catch (err) {
      console.error('[SiteSettings] Failed to load site settings:', err);
      if (!silent) {
        setError(err.message || 'Failed to load site settings');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [fetchSiteSettingsFallback]);

  useEffect(() => {
    let cancelled = false;
    const snapshot = getBootstrapSnapshot();
    if (snapshot?.siteSettings) {
      setSettings({
        ...defaultSiteSettings,
        ...snapshot.siteSettings
      });
      setLoading(false);
    }

    const idleHandle = scheduleIdleTask(() => {
      if (!cancelled) {
        loadSettings({ silent: Boolean(snapshot?.siteSettings) });
      }
    }, { timeout: snapshot?.siteSettings ? 750 : 0 });

    // Listen for setting updates from admin panel
    const handleSettingsUpdate = (event) => {
      console.log('[SiteSettings] Settings update event received:', event.detail);
      loadSettings({ force: true });
    };

    window.addEventListener('site-settings-updated', handleSettingsUpdate);

    return () => {
      cancelled = true;
      cancelIdleTask(idleHandle);
      window.removeEventListener('site-settings-updated', handleSettingsUpdate);
    };
  }, [loadSettings]);

  const value = {
    settings,
    loading,
    error,
    // Helper methods
    shouldHideCuratorType: () => {
      const shouldHide = settings.hide_curator_type_sitewide?.enabled === true;
      console.log('[SiteSettings] shouldHideCuratorType:', shouldHide, 'settings:', settings);
      return shouldHide;
    },
    isTesterFeedbackEnabled: () => {
      const enabled = settings.tester_feedback_sitewide?.enabled === true;
      console.log('[SiteSettings] isTesterFeedbackEnabled:', enabled, 'settings:', settings);
      return enabled;
    },
    isTop10NavVisible: () => {
      return settings.show_top10_in_nav?.enabled === true;
    },
    isInstagramTrackLinkingEnabled: () => {
      return settings.instagram_track_linking_enabled?.enabled === true;
    },
    isPlaylistLoveEnabled: () => {
      return settings.playlist_love_enabled?.enabled === true;
    },
    isPlaylistCommentsEnabled: () => {
      return settings.playlist_comments_enabled?.enabled === true;
    },
    isOpenSignupEnabled: () => {
      return settings.open_signup_enabled?.enabled === true;
    },
    refreshSettings: async () => {
      await loadSettings({ force: true });
    }
  };

  return (
    <SiteSettingsContext.Provider value={value}>
      {children}
    </SiteSettingsContext.Provider>
  );
};

export default SiteSettingsContext;
