import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { adminGet, adminPost, adminPut, adminDelete } from '../utils/adminApi';
import { theme, Button, Input, Select } from '@shared/styles/GlobalStyles';

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

const SubSectionTitle = styled.h4`
  font-family: ${theme.fonts.mono};
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-bottom: 1px black solid;
  padding-bottom: 1em;
  margin: 0 0 ${theme.spacing.md} 0;
`;

const CTACard = styled.div`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 8px;
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
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

const SettingsRow = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  align-items: center;
  flex-wrap: wrap;
`;

const initialFormState = {
  name: '',
  enabled: false,
  target_curator_id: '',
  variant_a_headline: '',
  variant_a_link: '',
  variant_a_cta_text: '',
  variant_b_headline: '',
  variant_b_link: '',
  variant_b_cta_text: '',
};

const QRCodeCTAManager = () => {
  const [ctas, setCtas] = useState([]);
  const [curators, setCurators] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingCta, setEditingCta] = useState(null);
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ctasRes, curatorsRes, analyticsRes] = await Promise.all([
        adminGet('/api/v1/admin/qr-ctas'),
        adminGet('/api/v1/curators'),
        adminGet('/api/v1/admin/qr-ctas/analytics?days=30')
      ]);

      if (ctasRes.success) {
        setCtas(ctasRes.data);
      } else {
        setMessage({ type: 'error', text: ctasRes.error || 'Failed to fetch CTAs' });
      }

      if (curatorsRes.success) {
        setCurators(curatorsRes.data);
      }

      if (analyticsRes.success) {
        setAnalytics(analyticsRes.data);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to fetch data' });
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

      let response;
      if (editingCta) {
        response = await adminPut(`/api/v1/admin/qr-ctas/${editingCta.id}`, formData);
      } else {
        response = await adminPost('/api/v1/admin/qr-ctas', formData);
      }

      if (response.success) {
        setMessage({ type: 'success', text: editingCta ? 'CTA updated successfully' : 'CTA created successfully' });
        setEditingCta(null);
        setFormData(initialFormState);
        await fetchData();
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to save CTA' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save CTA' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this CTA?')) {
      try {
        await adminDelete(`/api/v1/admin/qr-ctas/${id}`);
        setMessage({ type: 'success', text: 'CTA deleted successfully' });
        fetchData();
      } catch (err) {
        setMessage({ type: 'error', text: err.message || 'Failed to delete CTA' });
      }
    }
  };

  const startEditing = (cta) => {
    setEditingCta(cta);
    setFormData({
      name: cta.name || '',
      enabled: Boolean(cta.enabled),
      target_curator_id: cta.target_curator_id || '',
      variant_a_headline: cta.variant_a_headline || cta.headline || '',
      variant_a_link: cta.variant_a_link || cta.cta_link || '',
      variant_a_cta_text: cta.variant_a_cta_text || cta.cta_text || '',
      variant_b_headline: cta.variant_b_headline || cta.headline || '',
      variant_b_link: cta.variant_b_link || cta.cta_link || '',
      variant_b_cta_text: cta.variant_b_cta_text || cta.cta_text || '',
    });
  };

  const cancelEditing = () => {
    setEditingCta(null);
    setFormData(initialFormState);
  };

  if (loading) return <div>Loading QR Code CTAs...</div>;

  return (
    <PanelContainer>
      {/* Configuration Section */}
      <div>
        <SectionTitle>{editingCta ? 'Edit QR Code CTA' : 'Create QR Code CTA'}</SectionTitle>

        {message && (
          <Message $type={message.type} style={{ marginBottom: theme.spacing.md }}>
            {message.text}
          </Message>
        )}

        <SettingsRow style={{ marginBottom: theme.spacing.md }}>
          <FormGroup style={{ flex: 1 }}>
            <Label>Name (Internal)</Label>
            <Input
              value={formData.name}
              onChange={e => handleInputChange('name', e.target.value)}
              placeholder="e.g., Holiday Campaign 2025"
            />
          </FormGroup>
          <FormGroup>
            <Label>Target Curator</Label>
            <Select
              value={formData.target_curator_id}
              onChange={e => handleInputChange('target_curator_id', e.target.value)}
            >
              <option value="">Global (All Curators)</option>
              {curators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormGroup>
        </SettingsRow>

        <ToggleWrapper style={{ marginBottom: theme.spacing.lg }}>
          <ToggleLabel>Enable QR Code CTA</ToggleLabel>
          <Toggle
            checked={formData.enabled}
            onChange={e => handleInputChange('enabled', e.target.checked)}
          />
        </ToggleWrapper>

        <FormGrid>
          <VariantCard>
            <VariantLabel>Variant A (50% of users)</VariantLabel>
            <FormGroup>
              <Label>Headline</Label>
              <Input
                type="text"
                value={formData.variant_a_headline}
                onChange={e => handleInputChange('variant_a_headline', e.target.value)}
                placeholder="follow us for new music weekly"
              />
            </FormGroup>
            <FormGroup>
              <Label>Link URL</Label>
              <Input
                type="url"
                value={formData.variant_a_link}
                onChange={e => handleInputChange('variant_a_link', e.target.value)}
                placeholder="https://instagram.com/flowerpil"
              />
            </FormGroup>
            <FormGroup>
              <Label>CTA Button Text</Label>
              <Input
                type="text"
                value={formData.variant_a_cta_text}
                onChange={e => handleInputChange('variant_a_cta_text', e.target.value)}
                placeholder="Follow Now"
              />
            </FormGroup>
          </VariantCard>

          <VariantCard>
            <VariantLabel>Variant B (50% of users)</VariantLabel>
            <FormGroup>
              <Label>Headline</Label>
              <Input
                type="text"
                value={formData.variant_b_headline}
                onChange={e => handleInputChange('variant_b_headline', e.target.value)}
                placeholder="discover curated playlists every week"
              />
            </FormGroup>
            <FormGroup>
              <Label>Link URL</Label>
              <Input
                type="url"
                value={formData.variant_b_link}
                onChange={e => handleInputChange('variant_b_link', e.target.value)}
                placeholder="https://instagram.com/flowerpil"
              />
            </FormGroup>
            <FormGroup>
              <Label>CTA Button Text</Label>
              <Input
                type="text"
                value={formData.variant_b_cta_text}
                onChange={e => handleInputChange('variant_b_cta_text', e.target.value)}
                placeholder="Check it out"
              />
            </FormGroup>
          </VariantCard>
        </FormGrid>

        <ButtonGroup style={{ marginTop: theme.spacing.md }}>
          {editingCta && <Button onClick={cancelEditing}>Cancel</Button>}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : (editingCta ? 'Save Changes' : 'Create CTA')}
          </Button>
        </ButtonGroup>
      </div>

      {/* Analytics Section */}
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

      {/* Existing CTAs Section */}
      <div>
        <SubSectionTitle>Existing QR Code CTAs</SubSectionTitle>
        {ctas.length === 0 ? (
          <p>No QR Code CTAs configured yet.</p>
        ) : (
          ctas.map(cta => (
            <CTACard key={cta.id} style={{ marginBottom: theme.spacing.md }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ margin: 0, marginBottom: theme.spacing.xs }}>{cta.name}</h4>
                  <p style={{ margin: 0, fontSize: theme.fontSizes.small, color: 'rgba(0,0,0,0.6)' }}>
                    Status: {cta.enabled ? 'Enabled' : 'Disabled'} |
                    Target: {cta.target_curator_id ? curators.find(c => c.id === cta.target_curator_id)?.name : 'Global'}
                  </p>
                </div>
                <ButtonGroup>
                  <Button onClick={() => startEditing(cta)}>Edit</Button>
                  <Button onClick={() => handleDelete(cta.id)}>Delete</Button>
                </ButtonGroup>
              </div>
              <FormGrid>
                <div>
                  <Label style={{ marginBottom: theme.spacing.xs, display: 'block' }}>Variant A</Label>
                  <p style={{ margin: 0, fontSize: theme.fontSizes.small }}>
                    {cta.variant_a_headline || cta.headline || 'Not set'}
                  </p>
                </div>
                <div>
                  <Label style={{ marginBottom: theme.spacing.xs, display: 'block' }}>Variant B</Label>
                  <p style={{ margin: 0, fontSize: theme.fontSizes.small }}>
                    {cta.variant_b_headline || cta.headline || 'Not set'}
                  </p>
                </div>
              </FormGrid>
              <div style={{ fontSize: theme.fontSizes.small, color: 'rgba(0,0,0,0.5)' }}>
                Legacy stats: {cta.impressions || 0} impressions, {cta.clicks || 0} clicks
              </div>
            </CTACard>
          ))
        )}
      </div>
    </PanelContainer>
  );
};

export default QRCodeCTAManager;
