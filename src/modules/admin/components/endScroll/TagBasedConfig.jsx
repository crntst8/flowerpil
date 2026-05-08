import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminPut, adminDelete } from '../../utils/adminApi';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const ConfigList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ConfigCard = styled.div`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 8px;
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const ConfigHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: ${theme.spacing.sm};
  border-bottom: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
`;

const TagName = styled.h4`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.base};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
  color: ${theme.colors.black};
`;

const ConfigDetails = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.md};
`;

const DetailItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const DetailLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.6);
`;

const DetailValue = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.base};
  color: ${theme.colors.black};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
`;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
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

const EmptyState = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  color: rgba(0, 0, 0, 0.6);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const LoadingMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  padding: ${theme.spacing.md};
`;

/**
 * TagBasedConfig - Create rules for playlists with specific tags/flags
 */
const TagBasedConfig = ({ onStatusChange }) => {
  const [configs, setConfigs] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    tag_id: '',
    cta_text: 'Explore More Playlists',
    sort_order: 'recent',
    max_playlists: 10
  });

  // Fetch tag-based configs and available tags
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Use allSettled for graceful degradation when either endpoint fails
        const results = await Promise.allSettled([
          adminGet('/api/v1/admin/end-scroll/config'),
          adminGet('/api/v1/admin/site-admin/custom-flags') // Fetch available tags
        ]);

        const [configsResult, tagsResult] = results;

        // Handle configs (primary data)
        const configsData = configsResult.status === 'fulfilled'
          ? (configsResult.value?.data ?? configsResult.value)
          : null;

        const tagBasedConfigs = Array.isArray(configsData)
          ? configsData.filter(c => c.tag_id && !c.playlist_id)
          : [];
        setConfigs(tagBasedConfigs);

        // Handle tags (supporting data)
        const tagsData = tagsResult.status === 'fulfilled'
          ? (tagsResult.value?.data ?? tagsResult.value)
          : null;
        setTags(tagsData?.flags || []);

        // Provide appropriate feedback based on what succeeded/failed
        if (configsResult.status === 'rejected' && tagsResult.status === 'rejected') {
          // Both failed - show error
          onStatusChange('error', 'Failed to load configurations and tags');
        } else if (configsResult.status === 'rejected') {
          // Config failed - this is critical
          onStatusChange('error', 'Failed to load configurations');
        } else if (tagsResult.status === 'rejected') {
          // Tags failed - still show warning but allow use of configs without tag selection
          onStatusChange('warning', 'Loaded configurations but could not fetch available tags');
        }
      } catch (err) {
        // Catch any other unexpected errors
        console.error('Error fetching data:', err);
        onStatusChange('error', 'An unexpected error occurred while loading configurations');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [onStatusChange]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    if (!formData.tag_id) {
      onStatusChange('error', 'Please select a tag');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tag_id: parseInt(formData.tag_id),
        playlist_id: null,
        enabled: true,
        ...formData
      };

      const result = await adminPost('/api/v1/admin/end-scroll/config', payload);
      const newId = result?.data?.id;
      setConfigs([...configs, { id: newId, ...payload }]);
      setFormData({
        tag_id: '',
        cta_text: 'Explore More Playlists',
        sort_order: 'recent',
        max_playlists: 10
      });
      onStatusChange('success', 'Tag-based configuration created successfully');
    } catch (err) {
      console.error('Error creating config:', err);
      onStatusChange('error', err.message || 'Failed to create configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this configuration?')) return;

    try {
      await adminDelete(`/api/v1/admin/end-scroll/config/${id}`);
      setConfigs(configs.filter(c => c.id !== id));
      onStatusChange('success', 'Configuration deleted successfully');
    } catch (err) {
      console.error('Error deleting config:', err);
      onStatusChange('error', err.message || 'Failed to delete configuration');
    }
  };

  const getTagName = (tagId) => {
    const tag = tags.find(t => t.id === tagId);
    return tag?.text || `Tag #${tagId}`;
  };

  if (loading) {
    return <LoadingMessage>Loading tag-based configurations…</LoadingMessage>;
  }

  return (
    <Container>
      <FormSection as="form" onSubmit={handleCreate}>
        <h3 style={{ margin: '0 0 0.5em 0', fontFamily: theme.fonts.mono, fontSize: theme.fontSizes.small }}>
          Create New Tag-Based Rule
        </h3>

        <FormGroup>
          <Label>Select Tag</Label>
          <StyledSelect
            name="tag_id"
            value={formData.tag_id}
            onChange={handleInputChange}
            required
          >
            <option value="">-- Choose a tag --</option>
            {tags.map(tag => (
              <option key={tag.id} value={tag.id}>
                {tag.text}
              </option>
            ))}
          </StyledSelect>
        </FormGroup>

        <FormGroup>
          <Label>CTA Text</Label>
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
          <StyledSelect
            name="sort_order"
            value={formData.sort_order}
            onChange={handleInputChange}
          >
            <option value="recent">Recent</option>
            <option value="popular">Popular</option>
            <option value="random">Random</option>
          </StyledSelect>
        </FormGroup>

        <FormGroup>
          <Label>Max Playlists</Label>
          <StyledInput
            type="number"
            name="max_playlists"
            value={formData.max_playlists}
            onChange={handleInputChange}
            min="1"
            max="50"
          />
        </FormGroup>

        <Button
          type="submit"
          disabled={saving}
        >
          {saving ? 'Creating…' : 'Create Rule'}
        </Button>
      </FormSection>

      {configs.length === 0 ? (
        <EmptyState>No tag-based rules configured yet</EmptyState>
      ) : (
        <ConfigList>
          {configs.map(config => (
            <ConfigCard key={config.id}>
              <ConfigHeader>
                <TagName>{getTagName(config.tag_id)}</TagName>
                <Button
                  onClick={() => handleDelete(config.id)}
                  style={{ background: theme.colors.danger, padding: '4px 8px', fontSize: '12px' }}
                >
                  Delete
                </Button>
              </ConfigHeader>

              <ConfigDetails>
                <DetailItem>
                  <DetailLabel>CTA Text</DetailLabel>
                  <DetailValue>{config.cta_text}</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Sort Order</DetailLabel>
                  <DetailValue>{config.sort_order}</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Max Playlists</DetailLabel>
                  <DetailValue>{config.max_playlists}</DetailValue>
                </DetailItem>
              </ConfigDetails>
            </ConfigCard>
          ))}
        </ConfigList>
      )}
    </Container>
  );
};

export default TagBasedConfig;
