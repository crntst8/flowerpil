import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { Button, FormField, Input, Select, Stack } from '@modules/curator/components/ui/index.jsx';
import { CollapsibleSection } from './shared';
import { useAuthenticatedApi } from '../hooks/useAuthenticatedApi';

const SettingsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const SectionDescription = styled.p`
  margin: 0 0 ${theme.spacing.md} 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const ToggleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.md};
  background: rgba(255, 255, 255, 0.05);
  border: ${theme.borders.dashed} ${theme.colors.black[300]};
  margin-bottom: ${theme.spacing.sm};

  .toggle-info {
    flex: 1;

    .toggle-label {
      font-family: ${theme.fonts.mono};
      color: ${theme.colors.black};
      margin-bottom: ${theme.spacing.xs};
      font-weight: bold;
    }

    .toggle-description {
      font-size: ${theme.fontSizes.small};
      color: ${theme.colors.black[400]};
      line-height: 1.4;
    }
  }

  .toggle-control {
    display: flex;
    align-items: center;
    gap: ${theme.spacing.md};
  }
`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 50px;
  height: 26px;

  input {
    opacity: 0;
    width: 0;
    height: 0;

    &:checked + .slider {
      background-color: #4ade80;
    }

    &:checked + .slider:before {
      transform: translateX(24px);
    }
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${theme.colors.black[400]};
    transition: .3s;
    border-radius: 26px;

    &:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }
  }
`;

const StatusBadge = styled.span.withConfig({
  shouldForwardProp: (prop) => prop !== '$enabled'
})`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${props => props.$enabled ? '#4ade80' : '#f19500ff'};
  color: ${props => props.$enabled ? '#073e1bff' : '#5f3c05ff'};
  background: ${props => props.$enabled ? '#30f67846' : '#f1950046'};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 2px;
`;

const ErrorMessage = styled.div`
  color: #ef4444;
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} #ef4444;
  background: rgba(239, 68, 68, 0.1);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const SuccessMessage = styled.div`
  color: #4ade80;
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} #4ade80;
  background: rgba(74, 222, 128, 0.1);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const FieldRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: ${theme.spacing.sm};
  align-items: end;

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

const DEFAULT_ANALYTICS_SETTINGS = {
  data_retention_days: 365,
  enable_detailed_tracking: true,
  privacy_mode: false,
  anonymize_after_days: 90
};

const DEFAULT_SETTINGS_STATE = {
  meta_pixel_enabled: { enabled: false },
  meta_ads_enabled: { enabled: false },
  meta_require_admin_approval: { enabled: true },
  meta_pixel_mode: { mode: 'curator' },
  meta_global_pixel_id: { value: '' },
  meta_pixel_advanced_matching: { enabled: false },
  analytics_settings: { ...DEFAULT_ANALYTICS_SETTINGS }
};

const CONFIG_SPECS = [
  {
    key: 'meta_pixel_enabled',
    defaultValue: { enabled: false },
    type: 'analytics',
    description: 'Enable Meta Pixel tracking on the public site'
  },
  {
    key: 'meta_ads_enabled',
    defaultValue: { enabled: false },
    type: 'analytics',
    description: 'Enable Meta Ads integrations for curators'
  },
  {
    key: 'meta_require_admin_approval',
    defaultValue: { enabled: true },
    type: 'analytics',
    description: 'Require admin approval before Meta OAuth is allowed'
  },
  {
    key: 'meta_pixel_mode',
    defaultValue: { mode: 'curator' },
    type: 'analytics',
    description: 'Meta Pixel routing mode'
  },
  {
    key: 'meta_global_pixel_id',
    defaultValue: { value: '' },
    type: 'analytics',
    description: 'Global Meta Pixel ID for platform-wide tracking'
  },
  {
    key: 'meta_pixel_advanced_matching',
    defaultValue: { enabled: false },
    type: 'analytics',
    description: 'Enable advanced matching for Meta Pixel'
  },
  {
    key: 'analytics_settings',
    defaultValue: { ...DEFAULT_ANALYTICS_SETTINGS },
    type: 'analytics',
    description: 'Analytics and privacy settings'
  }
];

const MetaSettings = () => {
  const { authenticatedFetch } = useAuthenticatedApi();
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS_STATE }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [globalPixelInput, setGlobalPixelInput] = useState('');

  const analyticsSettings = useMemo(() => ({
    ...DEFAULT_ANALYTICS_SETTINGS,
    ...(settings.analytics_settings || {})
  }), [settings.analytics_settings]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/config/site-settings');
      const data = await response.json();

      if (data.success && data.data) {
        const combinedSettings = {
          ...DEFAULT_SETTINGS_STATE,
          ...data.data,
          analytics_settings: {
            ...DEFAULT_ANALYTICS_SETTINGS,
            ...(data.data.analytics_settings || {})
          }
        };
        setSettings(combinedSettings);
        setGlobalPixelInput(combinedSettings.meta_global_pixel_id?.value || '');

        for (const spec of CONFIG_SPECS) {
          try {
            const adminResponse = await authenticatedFetch(`/api/v1/admin/system-config/${spec.key}`);
            const adminData = await adminResponse.json().catch(() => ({}));
            if (!adminResponse.ok || !adminData.success) {
              throw new Error(`Config ${spec.key} missing`);
            }
          } catch (initErr) {
            console.log(`[MetaSettings] Config ${spec.key} not found, creating with default.`);
            try {
              await authenticatedFetch(`/api/v1/admin/system-config/${spec.key}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  config_value: spec.defaultValue,
                  config_type: spec.type,
                  description: spec.description
                })
              });
              console.log(`[MetaSettings] Config ${spec.key} created successfully.`);
            } catch (createErr) {
              console.warn(`[MetaSettings] Failed to create config ${spec.key}:`, createErr);
            }
          }
        }
      }
      setError(null);
    } catch (err) {
      setError('Failed to load Meta settings');
      console.error('Failed to load Meta settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateSetting = async (key, value, configType = 'analytics') => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await authenticatedFetch(`/api/v1/admin/system-config/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_value: value,
          config_type: configType
        })
      });

      setSettings(prev => ({
        ...prev,
        [key]: value
      }));

      window.dispatchEvent(new CustomEvent('site-settings-updated', {
        detail: { key, value }
      }));

      setSuccess('Meta settings updated.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError('Failed to update Meta settings');
      console.error('Failed to update Meta settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (key) => async (event) => {
    const enabled = event.target.checked;
    await updateSetting(key, { enabled });
  };

  const handlePixelModeChange = async (event) => {
    await updateSetting('meta_pixel_mode', { mode: event.target.value });
  };

  const handleSaveGlobalPixel = async () => {
    const trimmed = globalPixelInput.trim();
    await updateSetting('meta_global_pixel_id', { value: trimmed });
  };

  const handlePrivacyToggle = async (event) => {
    const nextSettings = {
      ...analyticsSettings,
      privacy_mode: event.target.checked
    };
    await updateSetting('analytics_settings', nextSettings);
  };

  if (loading) {
    return <SectionDescription>Loading Meta settings…</SectionDescription>;
  }

  return (
    <SettingsContainer>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      <CollapsibleSection title="Pixel Tracking" defaultCollapsed={false}>
        <SectionDescription>
          Control Pixel script loading, routing, and the global pixel ID for platform-wide events.
        </SectionDescription>

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Meta Pixel Enabled</div>
            <div className="toggle-description">Gate all Meta Pixel tracking on the public site.</div>
          </div>
          <div className="toggle-control">
            <StatusBadge $enabled={settings.meta_pixel_enabled?.enabled}>
              {settings.meta_pixel_enabled?.enabled ? 'enabled' : 'disabled'}
            </StatusBadge>
            <ToggleSwitch>
              <input
                type="checkbox"
                checked={settings.meta_pixel_enabled?.enabled === true}
                onChange={handleToggle('meta_pixel_enabled')}
                disabled={saving}
              />
              <span className="slider" />
            </ToggleSwitch>
          </div>
        </ToggleRow>

        <Stack $gap={3}>
          <FormField label="Pixel Routing Mode" helper="Curator uses curator pixel, Global uses platform pixel, Both fires to both.">
            <Select
              value={settings.meta_pixel_mode?.mode || 'curator'}
              onChange={handlePixelModeChange}
              disabled={saving}
            >
              <option value="curator">Curator</option>
              <option value="global">Global</option>
              <option value="both">Both</option>
            </Select>
          </FormField>

          <FieldRow>
            <FormField
              label="Global Pixel ID"
              helper="Only used when pixel mode is global or both."
            >
              <Input
                value={globalPixelInput}
                onChange={(event) => setGlobalPixelInput(event.target.value)}
                placeholder="123456789012345"
                disabled={saving}
              />
            </FormField>
            <Button
              $variant="primary"
              $size="sm"
              onClick={handleSaveGlobalPixel}
              disabled={saving}
            >
              Save Pixel ID
            </Button>
          </FieldRow>
        </Stack>

        <ToggleRow style={{ marginTop: theme.spacing.md }}>
          <div className="toggle-info">
            <div className="toggle-label">Advanced Matching</div>
            <div className="toggle-description">Enable advanced matching payloads for Pixel events.</div>
          </div>
          <div className="toggle-control">
            <StatusBadge $enabled={settings.meta_pixel_advanced_matching?.enabled}>
              {settings.meta_pixel_advanced_matching?.enabled ? 'enabled' : 'disabled'}
            </StatusBadge>
            <ToggleSwitch>
              <input
                type="checkbox"
                checked={settings.meta_pixel_advanced_matching?.enabled === true}
                onChange={handleToggle('meta_pixel_advanced_matching')}
                disabled={saving}
              />
              <span className="slider" />
            </ToggleSwitch>
          </div>
        </ToggleRow>
      </CollapsibleSection>

      <CollapsibleSection title="Ads Controls" defaultCollapsed>
        <SectionDescription>
          Enable Meta ads flows and control whether curator OAuth requires admin approval.
        </SectionDescription>

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Meta Ads Enabled</div>
            <div className="toggle-description">Unlock Meta Ads setup flows for curators.</div>
          </div>
          <div className="toggle-control">
            <StatusBadge $enabled={settings.meta_ads_enabled?.enabled}>
              {settings.meta_ads_enabled?.enabled ? 'enabled' : 'disabled'}
            </StatusBadge>
            <ToggleSwitch>
              <input
                type="checkbox"
                checked={settings.meta_ads_enabled?.enabled === true}
                onChange={handleToggle('meta_ads_enabled')}
                disabled={saving}
              />
              <span className="slider" />
            </ToggleSwitch>
          </div>
        </ToggleRow>

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Require Admin Approval</div>
            <div className="toggle-description">Block Meta OAuth connections until approved by an admin.</div>
          </div>
          <div className="toggle-control">
            <StatusBadge $enabled={settings.meta_require_admin_approval?.enabled}>
              {settings.meta_require_admin_approval?.enabled ? 'enabled' : 'disabled'}
            </StatusBadge>
            <ToggleSwitch>
              <input
                type="checkbox"
                checked={settings.meta_require_admin_approval?.enabled === true}
                onChange={handleToggle('meta_require_admin_approval')}
                disabled={saving}
              />
              <span className="slider" />
            </ToggleSwitch>
          </div>
        </ToggleRow>
      </CollapsibleSection>

      <CollapsibleSection title="Privacy Gate" defaultCollapsed>
        <SectionDescription>
          Disable Pixel and CAPI delivery by toggling analytics privacy mode.
        </SectionDescription>

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Privacy Mode</div>
            <div className="toggle-description">Suppress all analytics and Meta tracking when enabled.</div>
          </div>
          <div className="toggle-control">
            <StatusBadge $enabled={analyticsSettings.privacy_mode}>
              {analyticsSettings.privacy_mode ? 'enabled' : 'disabled'}
            </StatusBadge>
            <ToggleSwitch>
              <input
                type="checkbox"
                checked={analyticsSettings.privacy_mode === true}
                onChange={handlePrivacyToggle}
                disabled={saving}
              />
              <span className="slider" />
            </ToggleSwitch>
          </div>
        </ToggleRow>
      </CollapsibleSection>
    </SettingsContainer>
  );
};

export default MetaSettings;
