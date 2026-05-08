import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { useAuthenticatedApi } from '../hooks/useAuthenticatedApi';

const SettingsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const SettingsSection = styled(DashedBox)`
  padding: ${theme.spacing.md};

  .section-header {
    margin-bottom: ${theme.spacing.md};

    h3 {
      font-family: ${theme.fonts.mono};
      color: ${theme.colors.white};
      margin: 0 0 ${theme.spacing.xs} 0;
      font-size: ${theme.fontSizes.medium};
      text-transform: uppercase;
    }

    p {
      font-size: ${theme.fontSizes.small};
      color: ${theme.colors.black[400]};
      margin: 0;
      line-height: 1.4;
    }
  }
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
  border: ${theme.borders.dashed} ${props => props.$enabled ? '#1adf62ff' : '#f19500ff'};
  color: ${props => props.$enabled ? '#073e1bff' : '#5f3c05ff'};
    background: ${props => props.$enabled ? '#30f67846' : '#f19500ff'};

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
  margin-bottom: ${theme.spacing.md};
`;

const SuccessMessage = styled.div`
  color: #4ade80;
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} #4ade80;
  background: rgba(74, 222, 128, 0.1);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.md};
`;

const envTesterFeedbackFlag = String(import.meta.env.VITE_FEATURE_TESTER_FEEDBACK || '').toLowerCase() === 'true';
const DEFAULT_SETTINGS_STATE = {
  hide_curator_type_sitewide: { enabled: false },
  tester_feedback_sitewide: { enabled: envTesterFeedbackFlag },
  show_top10_in_nav: { enabled: false },
  instagram_track_linking_enabled: { enabled: false },
  playlist_love_enabled: { enabled: true },
  playlist_comments_enabled: { enabled: true }
};

const CONFIG_SPECS = [
  {
    key: 'tester_feedback_sitewide',
    defaultValue: { enabled: envTesterFeedbackFlag },
    description: 'Enable tester feedback widget and API access for tester accounts'
  },
  {
    key: 'hide_curator_type_sitewide',
    defaultValue: { enabled: false },
    description: 'Hide curator type display sitewide (except on CuratorProfilePage)'
  },
  {
    key: 'show_top10_in_nav',
    defaultValue: { enabled: false },
    description: 'Show Top 10 link in public navigation'
  },
  {
    key: 'instagram_track_linking_enabled',
    defaultValue: { enabled: false },
    description: 'Enable Instagram profile linking for playlist tracks'
  },
  {
    key: 'playlist_love_enabled',
    defaultValue: { enabled: true },
    description: 'Enable the playlist love button on public playlist pages'
  },
  {
    key: 'playlist_comments_enabled',
    defaultValue: { enabled: true },
    description: 'Enable the playlist comments section on public playlist pages'
  }
];

const SiteDisplaySettings = () => {
  const { authenticatedFetch } = useAuthenticatedApi();

  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS_STATE }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load settings and ensure config exists in database
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/config/site-settings', {
        credentials: 'include',
        cache: 'no-store'
      });
      const data = await response.json();

      if (data.success && data.data) {
        const combinedSettings = {
          ...DEFAULT_SETTINGS_STATE,
          ...data.data
        };

        // Ensure configs exist in the database with defaults.
        // Only create on explicit 404 so transient failures never reset values.
        for (const spec of CONFIG_SPECS) {
          try {
            const adminResponse = await authenticatedFetch(`/api/v1/admin/system-config/${spec.key}`, {
              cache: 'no-store'
            });

            if (adminResponse.status === 404) {
              console.log(`[SiteDisplaySettings] Config ${spec.key} not found, creating with default.`);
              const createResponse = await authenticatedFetch(`/api/v1/admin/system-config/${spec.key}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  config_value: spec.defaultValue,
                  config_type: 'system',
                  description: spec.description
                })
              });

              const createData = await createResponse.json().catch(() => ({}));
              if (!createResponse.ok || !createData.success) {
                throw new Error(createData.error || `Failed to create ${spec.key}`);
              }

              combinedSettings[spec.key] = spec.defaultValue;
              continue;
            }

            const adminData = await adminResponse.json().catch(() => ({}));
            if (!adminResponse.ok || !adminData.success) {
              throw new Error(adminData.error || `Failed to load config ${spec.key}`);
            }

            const persistedValue = adminData?.data?.configuration?.config_value;
            if (persistedValue && typeof persistedValue === 'object') {
              combinedSettings[spec.key] = persistedValue;
            }
          } catch (initErr) {
            console.warn(`[SiteDisplaySettings] Failed to load config ${spec.key}:`, initErr);
          }
        }

        setSettings(combinedSettings);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load settings');
      console.error('Failed to load site settings:', err);
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  // Update setting
  const updateSetting = async (key, value) => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await authenticatedFetch(`/api/v1/admin/system-config/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_value: value,
          config_type: 'system'
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to update setting');
      }

      // Update local state
      setSettings(prev => ({
        ...prev,
        [key]: value
      }));

      // Trigger a global refresh event so SiteSettingsContext can update
      window.dispatchEvent(new CustomEvent('site-settings-updated', {
        detail: { key, value }
      }));

      setSuccess('Setting updated successfully. Refresh the page to see changes across the site.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(`Failed to update setting: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Toggle curator type visibility
  const toggleCuratorTypeVisibility = async () => {
    const currentValue = settings.hide_curator_type_sitewide?.enabled || false;
    await updateSetting('hide_curator_type_sitewide', {
      enabled: !currentValue
    });
  };

  const toggleTesterFeedback = async () => {
    const currentValue = settings.tester_feedback_sitewide?.enabled || false;
    await updateSetting('tester_feedback_sitewide', {
      enabled: !currentValue
    });
  };

  const toggleShowTop10InNav = async () => {
    const currentValue = settings.show_top10_in_nav?.enabled || false;
    await updateSetting('show_top10_in_nav', {
      enabled: !currentValue
    });
  };

  const toggleInstagramTrackLinking = async () => {
    const currentValue = settings.instagram_track_linking_enabled?.enabled || false;
    await updateSetting('instagram_track_linking_enabled', {
      enabled: !currentValue
    });
  };

  const togglePlaylistLove = async () => {
    const currentValue = settings.playlist_love_enabled?.enabled || false;
    await updateSetting('playlist_love_enabled', {
      enabled: !currentValue
    });
  };

  const togglePlaylistComments = async () => {
    const currentValue = settings.playlist_comments_enabled?.enabled || false;
    await updateSetting('playlist_comments_enabled', {
      enabled: !currentValue
    });
  };

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <SettingsContainer>
      <SettingsSection>


        {error && <ErrorMessage>{error}</ErrorMessage>}
        {success && <SuccessMessage>{success}</SuccessMessage>}

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Enable Tester Feedback Widget</div>
            <div className="toggle-description">
              When enabled, tester accounts see the floating feedback widget. API collection honours this toggle.
            </div>
          </div>

          <div className="toggle-control">
            <StatusBadge $enabled={settings.tester_feedback_sitewide?.enabled}>
              {settings.tester_feedback_sitewide?.enabled ? 'Enabled' : 'Disabled'}
            </StatusBadge>

            <ToggleSwitch>
              <input
                type="checkbox"
                checked={settings.tester_feedback_sitewide?.enabled || false}
                onChange={toggleTesterFeedback}
                disabled={loading || saving}
              />
              <span className="slider"></span>
            </ToggleSwitch>
          </div>
        </ToggleRow>

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Hide Curator Type Display Sitewide</div>

          </div>

          <div className="toggle-control">
            <StatusBadge $enabled={settings.hide_curator_type_sitewide?.enabled}>
              {settings.hide_curator_type_sitewide?.enabled ? 'Hidden' : 'Visible'}
            </StatusBadge>

            <ToggleSwitch>
              <input
                type="checkbox"
                checked={settings.hide_curator_type_sitewide?.enabled || false}
                onChange={toggleCuratorTypeVisibility}
                disabled={loading || saving}
              />
              <span className="slider"></span>
            </ToggleSwitch>
          </div>
        </ToggleRow>

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Show Top 10 in Navigation</div>
            <div className="toggle-description">
              When enabled, shows &quot;Top 10&quot; link in the public navigation menu.
            </div>
          </div>

          <div className="toggle-control">
            <StatusBadge $enabled={settings.show_top10_in_nav?.enabled}>
              {settings.show_top10_in_nav?.enabled ? 'Visible' : 'Hidden'}
            </StatusBadge>

            <ToggleSwitch>
              <input
                type="checkbox"
                checked={settings.show_top10_in_nav?.enabled || false}
                onChange={toggleShowTop10InNav}
                disabled={loading || saving}
              />
              <span className="slider"></span>
            </ToggleSwitch>
          </div>
        </ToggleRow>

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Enable Instagram Track Linking</div>
            <div className="toggle-description">
              When enabled, curators can link Instagram profiles for track artists from the tracks editor.
            </div>
          </div>

          <div className="toggle-control">
            <StatusBadge $enabled={settings.instagram_track_linking_enabled?.enabled}>
              {settings.instagram_track_linking_enabled?.enabled ? 'Enabled' : 'Disabled'}
            </StatusBadge>

            <ToggleSwitch>
              <input
                type="checkbox"
                checked={settings.instagram_track_linking_enabled?.enabled || false}
                onChange={toggleInstagramTrackLinking}
                disabled={loading || saving}
              />
              <span className="slider"></span>
            </ToggleSwitch>
          </div>
        </ToggleRow>

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Enable Playlist Love Button</div>
            <div className="toggle-description">
              When enabled, listeners can love playlists from public playlist pages.
            </div>
          </div>

          <div className="toggle-control">
            <StatusBadge $enabled={settings.playlist_love_enabled?.enabled}>
              {settings.playlist_love_enabled?.enabled ? 'Enabled' : 'Disabled'}
            </StatusBadge>

            <ToggleSwitch>
              <input
                type="checkbox"
                checked={settings.playlist_love_enabled?.enabled || false}
                onChange={togglePlaylistLove}
                disabled={loading || saving}
              />
              <span className="slider"></span>
            </ToggleSwitch>
          </div>
        </ToggleRow>

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Enable Playlist Comments</div>
            <div className="toggle-description">
              When enabled, the comments and replies section appears on public playlist pages.
            </div>
          </div>

          <div className="toggle-control">
            <StatusBadge $enabled={settings.playlist_comments_enabled?.enabled}>
              {settings.playlist_comments_enabled?.enabled ? 'Enabled' : 'Disabled'}
            </StatusBadge>

            <ToggleSwitch>
              <input
                type="checkbox"
                checked={settings.playlist_comments_enabled?.enabled || false}
                onChange={togglePlaylistComments}
                disabled={loading || saving}
              />
              <span className="slider"></span>
            </ToggleSwitch>
          </div>
        </ToggleRow>

        <div style={{ marginTop: theme.spacing.md }}>
          <Button onClick={loadSettings} disabled={loading} size="small">
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </SettingsSection>
    </SettingsContainer>
  );
};

export default SiteDisplaySettings;
