import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminPut } from '../../utils/adminApi';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
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
  font-weight: ${theme.fontWeights.bold};
`;

const StyledInput = styled(Input)`
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.primary};
`;

const StyledSelect = styled.select`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.base};
  background: ${theme.colors.fpwhite};
  cursor: pointer;
`;

const TextArea = styled.textarea`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.base};
  min-height: 60px;
  resize: vertical;
`;

const EnableToggle = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
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

const VariantGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${theme.spacing.md};

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

const ButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
`;

const LoadingMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  padding: ${theme.spacing.md};
`;

const Description = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  margin: 0;
`;

/**
 * GlobalConfig - Configure the default end-scroll behavior
 * This applies to all playlists unless overridden by tag-based or per-playlist rules
 */
const GlobalConfig = ({ onStatusChange }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    enabled: true,
    cta_text: 'Explore More Playlists',
    ab_testing_enabled: false,
    variant_a_cta: 'Discover Similar Playlists',
    variant_b_cta: 'Find More to Explore',
    sort_order: 'recent',
    max_playlists: 10
  });

  // Fetch global configuration on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const response = await adminGet('/api/v1/admin/end-scroll/config');
        const data = response?.data ?? response;

        // Find global config (playlist_id = null and tag_id = null)
        const globalConfig = Array.isArray(data) ? data.find(c => !c.playlist_id && !c.tag_id) : null;

        if (globalConfig) {
          setConfig(globalConfig);
          setFormData({
            enabled: globalConfig.enabled,
            cta_text: globalConfig.cta_text,
            ab_testing_enabled: globalConfig.ab_testing_enabled,
            variant_a_cta: globalConfig.variant_a_cta || '',
            variant_b_cta: globalConfig.variant_b_cta || '',
            sort_order: globalConfig.sort_order,
            max_playlists: globalConfig.max_playlists
          });
        }
      } catch (err) {
        console.error('Error fetching global config:', err);
        onStatusChange('error', 'Failed to load global configuration');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [onStatusChange]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        playlist_id: null,
        tag_id: null,
        ...formData
      };

      if (config?.id) {
        // Update existing
        await adminPut(`/api/v1/admin/end-scroll/config/${config.id}`, payload);
        setConfig({ ...config, ...payload });
        onStatusChange('success', 'Global configuration updated successfully');
      } else {
        // Create new
        const result = await adminPost('/api/v1/admin/end-scroll/config', payload);
        const newId = result?.data?.id;
        setConfig({ id: newId, ...payload });
        onStatusChange('success', 'Global configuration created successfully');
      }
    } catch (err) {
      console.error('Error saving global config:', err);
      onStatusChange('error', err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingMessage>Loading global configuration…</LoadingMessage>;
  }

  return (
    <Container as="form" onSubmit={handleSave}>
      <FormSection>
        <EnableToggle>
          <ToggleLabel>Enable End Scroll</ToggleLabel>
          <Toggle
            name="enabled"
            checked={formData.enabled}
            onChange={handleInputChange}
          />
        </EnableToggle>
      </FormSection>

      {formData.enabled && (
        <>
          <FormSection>
            <FormGroup>
              <Label>CTA Text (Default)</Label>
              <Description>Default call-to-action text when A/B testing is disabled</Description>
              <StyledInput
                type="text"
                name="cta_text"
                value={formData.cta_text}
                onChange={handleInputChange}
                placeholder="e.g., Explore More Playlists"
              />
            </FormGroup>

            <FormGroup>
              <Label>Sort Order</Label>
              <Description>How to order related playlists</Description>
              <StyledSelect
                name="sort_order"
                value={formData.sort_order}
                onChange={handleInputChange}
              >
                <option value="recent">Recent (by publish date)</option>
                <option value="popular">Popular (by view count)</option>
                <option value="random">Random</option>
              </StyledSelect>
            </FormGroup>

            <FormGroup>
              <Label>Max Playlists to Display</Label>
              <Description>Maximum number of related playlists shown</Description>
              <StyledInput
                type="number"
                name="max_playlists"
                value={formData.max_playlists}
                onChange={handleInputChange}
                min="1"
                max="50"
              />
            </FormGroup>
          </FormSection>

          <FormSection>
            <EnableToggle>
              <ToggleLabel>Enable A/B Testing</ToggleLabel>
              <Toggle
                name="ab_testing_enabled"
                checked={formData.ab_testing_enabled}
                onChange={handleInputChange}
              />
            </EnableToggle>
          </FormSection>

          {formData.ab_testing_enabled && (
            <VariantGrid>
              <VariantCard>
                <VariantLabel>Variant A CTA</VariantLabel>
                <FormGroup>
                  <Label>CTA Text</Label>
                  <StyledInput
                    type="text"
                    name="variant_a_cta"
                    value={formData.variant_a_cta}
                    onChange={handleInputChange}
                    placeholder="e.g., Discover Similar Playlists"
                  />
                </FormGroup>
              </VariantCard>

              <VariantCard>
                <VariantLabel>Variant B CTA</VariantLabel>
                <FormGroup>
                  <Label>CTA Text</Label>
                  <StyledInput
                    type="text"
                    name="variant_b_cta"
                    value={formData.variant_b_cta}
                    onChange={handleInputChange}
                    placeholder="e.g., Find More to Explore"
                  />
                </FormGroup>
              </VariantCard>
            </VariantGrid>
          )}
        </>
      )}

      <ButtonGroup>
        <Button
          type="submit"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Configuration'}
        </Button>
      </ButtonGroup>
    </Container>
  );
};

export default GlobalConfig;
