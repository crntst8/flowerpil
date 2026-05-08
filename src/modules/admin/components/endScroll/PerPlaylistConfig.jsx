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

const PlaylistName = styled.h4`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.base};
  margin: 0;
  color: ${theme.colors.black};
`;

const PlaylistMeta = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  margin: 0;
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

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
`;

const SearchGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${theme.spacing.md};

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
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

const SearchResults = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
`;

const SearchResult = styled.div`
  padding: ${theme.spacing.sm};
  border-bottom: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  &:last-child {
    border-bottom: none;
  }
`;

const ResultTitle = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.base};
  margin: 0;
  color: ${theme.colors.black};
`;

const ResultMeta = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  margin: 2px 0 0 0;
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
 * PerPlaylistConfig - Override end-scroll behavior for specific playlists
 */
const PerPlaylistConfig = ({ onStatusChange }) => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [formData, setFormData] = useState({
    playlist_search: '',
    cta_text: 'Explore More Playlists',
    manual_playlist_ids: '',
    sort_order: 'recent',
    max_playlists: 10
  });

  // Fetch per-playlist configs
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await adminGet('/api/v1/admin/end-scroll/config');
        const data = response?.data ?? response;
        const perPlaylistConfigs = Array.isArray(data)
          ? data.filter(c => c.playlist_id && !c.tag_id)
          : [];
        setConfigs(perPlaylistConfigs);
      } catch (err) {
        console.error('Error fetching configs:', err);
        onStatusChange('error', 'Failed to load per-playlist configurations');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [onStatusChange]);

  const handleSearchPlaylist = async (query) => {
    setFormData(prev => ({ ...prev, playlist_search: query }));

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const data = await adminGet(`/api/v1/playlists/search?q=${encodeURIComponent(query)}`);
      setSearchResults(Array.isArray(data) ? data.slice(0, 5) : []);
    } catch (err) {
      console.error('Error searching playlists:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectPlaylist = (playlist) => {
    setSelectedPlaylist(playlist);
    setFormData(prev => ({
      ...prev,
      playlist_search: playlist.title
    }));
    setSearchResults([]);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    if (!selectedPlaylist) {
      onStatusChange('error', 'Please select a playlist');
      return;
    }

    setSaving(true);
    try {
      // Parse manual_playlist_ids if provided
      let manualIds = null;
      if (formData.manual_playlist_ids.trim()) {
        try {
          manualIds = formData.manual_playlist_ids.split(',').map(id => parseInt(id.trim())).filter(Boolean);
        } catch (err) {
          onStatusChange('error', 'Invalid playlist IDs format');
          setSaving(false);
          return;
        }
      }

      const payload = {
        playlist_id: selectedPlaylist.id,
        tag_id: null,
        enabled: true,
        cta_text: formData.cta_text,
        manual_playlist_ids: manualIds ? JSON.stringify(manualIds) : null,
        sort_order: formData.sort_order,
        max_playlists: parseInt(formData.max_playlists)
      };

      const result = await adminPost('/api/v1/admin/end-scroll/config', payload);
      const newId = result?.data?.id;
      setConfigs([...configs, { id: newId, ...payload }]);
      setFormData({
        playlist_search: '',
        cta_text: 'Explore More Playlists',
        manual_playlist_ids: '',
        sort_order: 'recent',
        max_playlists: 10
      });
      setSelectedPlaylist(null);
      onStatusChange('success', 'Per-playlist configuration created successfully');
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

  if (loading) {
    return <LoadingMessage>Loading per-playlist configurations…</LoadingMessage>;
  }

  return (
    <Container>
      <FormSection as="form" onSubmit={handleCreate}>
        <h3 style={{ margin: '0 0 0.5em 0', fontFamily: theme.fonts.mono, fontSize: theme.fontSizes.small }}>
          Create Per-Playlist Override
        </h3>

        <SearchGrid>
          <FormGroup style={{ position: 'relative' }}>
            <Label>Search Playlists</Label>
            <StyledInput
              type="text"
              placeholder="Type playlist name..."
              value={formData.playlist_search}
              onChange={(e) => handleSearchPlaylist(e.target.value)}
              required={!selectedPlaylist}
            />
            {searchResults.length > 0 && (
              <SearchResults>
                {searchResults.map(playlist => (
                  <SearchResult
                    key={playlist.id}
                    onClick={() => handleSelectPlaylist(playlist)}
                  >
                    <ResultTitle>{playlist.title}</ResultTitle>
                    <ResultMeta>by {playlist.curator_name} • {playlist.track_count} tracks</ResultMeta>
                  </SearchResult>
                ))}
              </SearchResults>
            )}
          </FormGroup>

          <FormGroup style={{ justifyContent: 'flex-end' }}>
            {selectedPlaylist && (
              <Button
                type="button"
                onClick={() => {
                  setSelectedPlaylist(null);
                  setFormData(prev => ({ ...prev, playlist_search: '' }));
                }}
                style={{ background: theme.colors.danger, padding: '8px 16px' }}
              >
                Clear Selection
              </Button>
            )}
          </FormGroup>
        </SearchGrid>

        {selectedPlaylist && (
          <DetailItem style={{ padding: `${theme.spacing.sm}`, background: 'rgba(0, 200, 0, 0.1)', borderRadius: '4px' }}>
            <DetailValue>✓ Selected: {selectedPlaylist.title}</DetailValue>
          </DetailItem>
        )}

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
          <Label>Manual Playlist IDs (Optional)</Label>
          <StyledInput
            type="text"
            name="manual_playlist_ids"
            value={formData.manual_playlist_ids}
            onChange={handleInputChange}
            placeholder="e.g., 123,456,789 (comma-separated)"
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
          disabled={saving || !selectedPlaylist}
        >
          {saving ? 'Creating…' : 'Create Override'}
        </Button>
      </FormSection>

      {configs.length === 0 ? (
        <EmptyState>No per-playlist overrides configured yet</EmptyState>
      ) : (
        <ConfigList>
          {configs.map(config => (
            <ConfigCard key={config.id}>
              <ConfigHeader>
                <div>
                  <PlaylistName>{config.playlist_title || `Playlist #${config.playlist_id}`}</PlaylistName>
                  <PlaylistMeta>ID: {config.playlist_id}</PlaylistMeta>
                </div>
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

export default PerPlaylistConfig;
