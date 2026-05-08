import { useEffect } from 'react';
import { useSiteSettings } from '@shared/contexts/SiteSettingsContext';
import { useConsent } from '@shared/contexts/ConsentContext';
import metaPixel from '@shared/utils/metaPixel';

const MetaPixelManager = () => {
  const { settings } = useSiteSettings();
  const { status: consentStatus } = useConsent();

  const privacyMode = settings.analytics_settings?.privacy_mode === true;
  const enabled = settings.meta_pixel_enabled?.enabled === true && !privacyMode;
  const mode = settings.meta_pixel_mode?.mode || 'curator';
  const globalPixelId = settings.meta_global_pixel_id?.value || '';
  const advancedMatchingEnabled = settings.meta_pixel_advanced_matching?.enabled === true;

  useEffect(() => {
    metaPixel.configureMetaPixel({
      enabled,
      consentStatus,
      mode,
      globalPixelId,
      curatorPixelId: '',
      advancedMatching: advancedMatchingEnabled ? {} : null
    });
  }, [enabled, consentStatus, mode, globalPixelId, advancedMatchingEnabled]);

  return null;
};

export default MetaPixelManager;
