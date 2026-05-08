import React, { useState, useEffect } from 'react';
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

const DEFAULT_SETTINGS_STATE = {
  open_signup_enabled: { enabled: false }
};

const CONFIG_SPECS = [
  {
    key: 'open_signup_enabled',
    defaultValue: { enabled: false },
    description: 'Enable open signup without referral codes'
  }
];

const SignupsSettings = () => {
  const { authenticatedFetch } = useAuthenticatedApi();

  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS_STATE }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/config/site-settings');
      const data = await response.json();

      if (data.success && data.data) {
        const combinedSettings = {
          ...DEFAULT_SETTINGS_STATE,
          ...data.data
        };
        setSettings(combinedSettings);

        // Ensure configs exist in the database with defaults
        for (const spec of CONFIG_SPECS) {
          try {
            const adminResponse = await authenticatedFetch(`/api/v1/admin/system-config/${spec.key}`);
            const adminData = await adminResponse.json().catch(() => ({}));
            if (!adminResponse.ok || !adminData.success) {
              throw new Error(`Config ${spec.key} missing`);
            }
          } catch (initErr) {
            console.log(`[SignupsSettings] Config ${spec.key} not found, creating with default.`);
            try {
              await authenticatedFetch(`/api/v1/admin/system-config/${spec.key}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  config_value: spec.defaultValue,
                  config_type: 'system',
                  description: spec.description
                })
              });
              console.log(`[SignupsSettings] Config ${spec.key} created successfully.`);
            } catch (createErr) {
              console.warn(`[SignupsSettings] Failed to create config ${spec.key}:`, createErr);
            }
          }
        }
      }
      setError(null);
    } catch (err) {
      setError('Failed to load settings');
      console.error('Failed to load signup settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key, value) => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await authenticatedFetch(`/api/v1/admin/system-config/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_value: value,
          config_type: 'system'
        })
      });

      setSettings(prev => ({
        ...prev,
        [key]: value
      }));

      // Trigger a global refresh event so SiteSettingsContext can update
      window.dispatchEvent(new CustomEvent('site-settings-updated', {
        detail: { key, value }
      }));

      setSuccess('Setting updated successfully.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(`Failed to update setting: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleOpenSignup = async () => {
    const currentValue = settings.open_signup_enabled?.enabled || false;
    await updateSetting('open_signup_enabled', {
      enabled: !currentValue
    });
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const isOpenSignupEnabled = settings.open_signup_enabled?.enabled || false;

  return (
    <SettingsContainer>
      <SettingsSection>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {success && <SuccessMessage>{success}</SuccessMessage>}

        <ToggleRow>
          <div className="toggle-info">
            <div className="toggle-label">Enable Open Signup</div>
            <div className="toggle-description">
              When enabled, users can sign up without a referral code. The referral code field will be hidden from the signup form.
            </div>
          </div>

          <div className="toggle-control">
            <StatusBadge $enabled={isOpenSignupEnabled}>
              {isOpenSignupEnabled ? 'Open' : 'Invite Only'}
            </StatusBadge>

            <ToggleSwitch>
              <input
                type="checkbox"
                checked={isOpenSignupEnabled}
                onChange={toggleOpenSignup}
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

export default SignupsSettings;
