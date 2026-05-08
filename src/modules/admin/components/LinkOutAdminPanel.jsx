import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, Button, Input, Select } from '@shared/styles/GlobalStyles';
import { adminGet, adminPut } from '../utils/adminApi';

const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const SectionTitle = styled.h3`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h4};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 ${theme.spacing.md} 0;
`;

const FormGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  grid-template-columns: 1fr 1fr;

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const VariantCard = styled.div`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 8px;
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const VariantLabel = styled.h4`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
  color: ${theme.colors.black};
`;

const FormGroup = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const Label = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
`;

const HelperText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  letter-spacing: 0.05em;
`;

const ToggleWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
`;

const ToggleLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  flex: 1;
`;

const Toggle = styled.input.attrs({ type: 'checkbox' })`
  width: 48px;
  height: 24px;
  cursor: pointer;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
`;

const AnalyticsGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  margin-top: ${theme.spacing.md};
`;

const AnalyticCard = styled.div`
  background: rgba(0, 0, 0, 0.77);
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const AnalyticLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 1);
`;

const AnalyticValue = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.success};
`;

const AnalyticMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(51, 255, 0, 0.55);
`;

const Message = styled.div`
  padding: ${theme.spacing.md};
  background: ${({ $type }) => ($type === 'error' ? theme.colors.dangerBG : theme.colors.stateSaved)};
  border: ${({ $type }) => ($type === 'error' ? theme.borders.solid : theme.borders.dashed)} ${({ $type }) => ($type === 'error' ? theme.colors.danger : theme.colors.success)};
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${({ $type }) => ($type === 'error' ? theme.colors.danger : theme.colors.success)};
`;

const LinkOutAdminPanel = () => {
  const [config, setConfig] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [formData, setFormData] = useState({
    variantAHeadline: '',
    variantALink: '',
    variantBHeadline: '',
    variantBLink: '',
    enabled: false,
    signupMode: 'link',
    targetPlaylistId: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [configRes, analyticsRes] = await Promise.all([
        adminGet('/api/v1/admin/linkout/config'),
        adminGet('/api/v1/admin/linkout/analytics?days=30')
      ]);

      if (configRes.success) {
        setConfig(configRes.data);
        setFormData({
          variantAHeadline: configRes.data.variant_a_headline || '',
          variantALink: configRes.data.variant_a_link || '',
          variantBHeadline: configRes.data.variant_b_headline || '',
          variantBLink: configRes.data.variant_b_link || '',
          enabled: Boolean(configRes.data.enabled),
          signupMode: configRes.data.signup_mode || 'link',
          targetPlaylistId: configRes.data.target_playlist_id ?? ''
        });
      }

      if (analyticsRes.success) {
        setAnalytics(analyticsRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch linkout data:', error);
      setMessage({ type: 'error', text: 'Failed to load linkout configuration' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setMessage(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const response = await adminPut('/api/v1/admin/linkout/config', formData);

      if (response.success) {
        setMessage({ type: 'success', text: 'Link-out configuration saved successfully' });
        await fetchData(); // Refresh data
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to save configuration' });
      }
    } catch (error) {
      console.error('Failed to save linkout config:', error);
      setMessage({ type: 'error', text: 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div>Loading link-out configuration...</div>;
  }

  return (
    <PanelContainer>
      <div>
        <SectionTitle>Link-Out Modal Configuration</SectionTitle>

        <ToggleWrapper>
          <ToggleLabel>Enable link-out modal</ToggleLabel>
          <Toggle
            checked={formData.enabled}
            onChange={(e) => handleInputChange('enabled', e.target.checked)}
          />
        </ToggleWrapper>

        {message && (
          <Message $type={message.type} style={{ marginTop: theme.spacing.md }}>
            {message.text}
          </Message>
        )}

        <FormGrid style={{ marginTop: theme.spacing.lg, gridTemplateColumns: '1fr' }}>
          <VariantCard>
            <VariantLabel>Signup Mode</VariantLabel>
            <FormGroup>
              <Label>Mode</Label>
              <Select
                value={formData.signupMode}
                onChange={(e) => handleInputChange('signupMode', e.target.value)}
              >
                <option value="link">Default link</option>
                <option value="contextual">Contextual playlist</option>
                <option value="target">Target playlist</option>
              </Select>
              <HelperText>Choose how the CTA routes visitors to curator signup.</HelperText>
            </FormGroup>
            <FormGroup>
              <Label>Target Playlist ID</Label>
              <Input
                type="number"
                value={formData.targetPlaylistId}
                onChange={(e) => handleInputChange('targetPlaylistId', e.target.value)}
                placeholder="Playlist ID"
                disabled={formData.signupMode !== 'target'}
              />
              <HelperText>Used when signup mode is set to target.</HelperText>
            </FormGroup>
          </VariantCard>
        </FormGrid>

        <FormGrid style={{ marginTop: theme.spacing.lg }}>
          <VariantCard>
            <VariantLabel>Variant A (50% of users)</VariantLabel>
            <FormGroup>
              <Label>Headline</Label>
              <Input
                type="text"
                value={formData.variantAHeadline}
                onChange={(e) => handleInputChange('variantAHeadline', e.target.value)}
                placeholder="want to know when we publish new playlists?"
              />
            </FormGroup>
            <FormGroup>
              <Label>Link URL</Label>
              <Input
                type="url"
                value={formData.variantALink}
                onChange={(e) => handleInputChange('variantALink', e.target.value)}
                placeholder="https://instagram.com/flowerpil"
              />
            </FormGroup>
          </VariantCard>

          <VariantCard>
            <VariantLabel>Variant B (50% of users)</VariantLabel>
            <FormGroup>
              <Label>Headline</Label>
              <Input
                type="text"
                value={formData.variantBHeadline}
                onChange={(e) => handleInputChange('variantBHeadline', e.target.value)}
                placeholder="find new music every week"
              />
            </FormGroup>
            <FormGroup>
              <Label>Link URL</Label>
              <Input
                type="url"
                value={formData.variantBLink}
                onChange={(e) => handleInputChange('variantBLink', e.target.value)}
                placeholder="https://instagram.com/flowerpil"
              />
            </FormGroup>
          </VariantCard>
        </FormGrid>

        <ButtonGroup style={{ marginTop: theme.spacing.md }}>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </ButtonGroup>
      </div>

      {analytics && (
        <div>
          <SectionTitle>A/B Test Analytics (Last 30 Days)</SectionTitle>

          <div style={{ marginBottom: theme.spacing.lg }}>
            <Label style={{ marginBottom: theme.spacing.sm, display: 'block' }}>Variant A Performance</Label>
            <AnalyticsGrid>
              <AnalyticCard>
                <AnalyticLabel>Impressions</AnalyticLabel>
                <AnalyticValue>{analytics.variantA.impressions}</AnalyticValue>
              </AnalyticCard>
              <AnalyticCard>
                <AnalyticLabel>Click-through rate</AnalyticLabel>
                <AnalyticValue>{analytics.variantA.clickThroughRate}%</AnalyticValue>
                <AnalyticMeta>{analytics.variantA.clicks} clicks</AnalyticMeta>
              </AnalyticCard>
              <AnalyticCard>
                <AnalyticLabel>Dismissal rate</AnalyticLabel>
                <AnalyticValue>{analytics.variantA.dismissalRate}%</AnalyticValue>
                <AnalyticMeta>{analytics.variantA.dismissals} dismissals</AnalyticMeta>
              </AnalyticCard>
              {analytics.variantA.avgTimeToClick && (
                <AnalyticCard>
                  <AnalyticLabel>Avg time to click</AnalyticLabel>
                  <AnalyticValue>{(analytics.variantA.avgTimeToClick / 1000).toFixed(1)}s</AnalyticValue>
                </AnalyticCard>
              )}
            </AnalyticsGrid>
          </div>

          <div>
            <Label style={{ marginBottom: theme.spacing.sm, display: 'block' }}>Variant B Performance</Label>
            <AnalyticsGrid>
              <AnalyticCard>
                <AnalyticLabel>Impressions</AnalyticLabel>
                <AnalyticValue>{analytics.variantB.impressions}</AnalyticValue>
              </AnalyticCard>
              <AnalyticCard>
                <AnalyticLabel>Click-through rate</AnalyticLabel>
                <AnalyticValue>{analytics.variantB.clickThroughRate}%</AnalyticValue>
                <AnalyticMeta>{analytics.variantB.clicks} clicks</AnalyticMeta>
              </AnalyticCard>
              <AnalyticCard>
                <AnalyticLabel>Dismissal rate</AnalyticLabel>
                <AnalyticValue>{analytics.variantB.dismissalRate}%</AnalyticValue>
                <AnalyticMeta>{analytics.variantB.dismissals} dismissals</AnalyticMeta>
              </AnalyticCard>
              {analytics.variantB.avgTimeToClick && (
                <AnalyticCard>
                  <AnalyticLabel>Avg time to click</AnalyticLabel>
                  <AnalyticValue>{(analytics.variantB.avgTimeToClick / 1000).toFixed(1)}s</AnalyticValue>
                </AnalyticCard>
              )}
            </AnalyticsGrid>
          </div>
        </div>
      )}
    </PanelContainer>
  );
};

export default LinkOutAdminPanel;
