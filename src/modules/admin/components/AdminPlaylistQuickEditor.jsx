import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import {
  FieldLabel,
  FieldHint,
  ChipRow,
  Chip,
  ChipButton,
  ChipRemove,
} from '@shared/components/PlaylistDetailsLayout.jsx';
import { adminGet, adminPost, adminPut, adminDelete } from '../utils/adminApi.js';
import { useGenreCatalog } from '@shared/hooks/useGenreCatalog';
import { createGenreLookup, parseGenreTags } from '@shared/utils/genreUtils';
import ImageUpload from './ImageUpload.jsx';
import TrackList from './TrackList.jsx';
import ImportTools from './ImportTools.jsx';

const EditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  background: ${theme.colors.fpwhite};
  border-radius: 16px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
  padding: ${theme.spacing.xl};
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.06);
`;

const EditorHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${theme.spacing.md};
  padding-bottom: ${theme.spacing.md};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);

  h2 {
    margin: 0;
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: ${theme.fontSizes.large};
  }

  .subtitle {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: rgba(0, 0, 0, 0.6);
    margin-top: ${theme.spacing.xs};
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const CompactGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: ${theme.spacing.md};
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;
const Label = FieldLabel;

const Select = styled.select`
  width: 100%;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};
  color: ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  border-radius: 6px;

  &:focus {
    border-color: ${theme.colors.primary};
    outline: none;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};
  color: ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  min-height: 80px;
  resize: vertical;
  border-radius: 6px;

  &:focus {
    border-color: ${theme.colors.primary};
    outline: none;
  }
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.02);
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.06);
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: ${theme.fontSizes.medium};
  color: ${theme.colors.black};
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const TagContainer = styled(ChipRow)`
  align-items: center;
`;

const TagButton = ChipButton;

const GenreInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  border-radius: 6px;

  &:focus {
    border-color: ${theme.colors.primary};
    background: ${theme.colors.white};
    outline: none;
  }
`;

const InlineRow = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  align-items: center;
  flex-wrap: wrap;
`;

const GenreChip = Chip;

const Alert = styled.div.withConfig({ shouldForwardProp: (prop) => !['$type'].includes(prop) })`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 8px;
  border: ${theme.borders.solidThin} ${({ $type }) =>
    $type === 'error' ? theme.colors.danger :
    $type === 'success' ? theme.colors.success :
    $type === 'warning' ? theme.colors.warning :
    theme.colors.primary
  };
  background: ${({ $type }) =>
    $type === 'error' ? 'rgba(229, 62, 62, 0.12)' :
    $type === 'success' ? 'rgba(76, 175, 80, 0.15)' :
    $type === 'warning' ? 'rgba(251, 191, 36, 0.15)' :
    'rgba(71, 159, 242, 0.15)'
  };
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const InfoBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: rgba(71, 159, 242, 0.15);
  border: ${theme.borders.solidThin} ${theme.colors.primary};
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const AdminPlaylistQuickEditor = ({
  playlistId,
  onSaved,
  onCancel
}) => {
  // State
  const [playlist, setPlaylist] = useState({
    title: '',
    curator_name: '',
    curator_type: 'artist',
    description: '',
    description_short: '',
    tags: '',
    image: '',
    spotify_url: '',
    apple_url: '',
    tidal_url: '',
    published: false,
  });
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  // Content flags/tags
  const [availableFlags, setAvailableFlags] = useState([]);
  const [selectedFlags, setSelectedFlags] = useState([]);
  const [loadingFlags, setLoadingFlags] = useState(false);

  // Genre tags
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [genreInput, setGenreInput] = useState('');
  const { catalog: genreCatalog } = useGenreCatalog();

  // Available genres from catalog
  const availableGenres = useMemo(() => {
    return (genreCatalog || []).map(category => ({
      value: category.id || '',
      label: category.label || category.id,
      color: category.color || '#8a8a8a',
    }));
  }, [genreCatalog]);

  const findGenreInfo = useCallback((tag) => {
    const genre = availableGenres.find(g => g.value === tag || g.label === tag);
    return genre || { value: tag, label: tag, color: '#8a8a8a' };
  }, [availableGenres]);

  // Load playlist data
  useEffect(() => {
    if (playlistId) {
      loadPlaylist();
    }
    // Always load content flags (for both new and existing playlists)
    loadContentFlags();
  }, [playlistId]);

  // Sync genres from playlist.tags
  useEffect(() => {
    const tags = parseGenreTags(playlist?.tags);
    if (JSON.stringify(tags) !== JSON.stringify(selectedGenres)) {
      setSelectedGenres(tags);
    }
  }, [playlist?.tags]);

  // Update playlist.tags when selectedGenres change
  useEffect(() => {
    const tagsString = selectedGenres.join(',');
    if (tagsString !== (playlist?.tags || '')) {
      setPlaylist(prev => ({ ...prev, tags: tagsString }));
    }
  }, [selectedGenres]);

  const loadPlaylist = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminGet(`/api/v1/playlists/${playlistId}`);
      const data = response.data;

      // Ensure all required fields have defaults
      setPlaylist({
        ...data,
        title: data.title || '',
        curator_name: data.curator_name || '',
        curator_type: data.curator_type || 'artist',
        description: data.description || '',
        description_short: data.description_short || '',
        tags: data.tags || '',
        image: data.image || '',
        spotify_url: data.spotify_url || '',
        apple_url: data.apple_url || '',
        tidal_url: data.tidal_url || '',
      });

      // Load tracks
      const tracksResponse = await adminGet(`/api/v1/tracks/playlist/${playlistId}`);
      setTracks(tracksResponse.data || []);

      // Load playlist flags
      if (data.id) {
        const flagsResponse = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${data.id}`);
        setSelectedFlags(flagsResponse.assignments || []);
      }
    } catch (err) {
      console.error('Error loading playlist:', err);
      setError(`Failed to load playlist: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadContentFlags = async () => {
    setLoadingFlags(true);
    try {
      const response = await adminGet('/api/v1/admin/site-admin/custom-flags');
      setAvailableFlags(response.flags || []);
    } catch (err) {
      console.error('Error loading content flags:', err);
    } finally {
      setLoadingFlags(false);
    }
  };

  const validate = () => {
    const errors = [];

    if (!playlist.title?.trim()) {
      errors.push('Title is required');
    }

    if (!playlist.curator_name?.trim()) {
      errors.push('Curator name is required');
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      setError('Please fix validation errors before saving');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const isUpdate = playlist.id;
      const url = isUpdate
        ? `/api/v1/playlists/${playlist.id}`
        : `/api/v1/playlists`;

      const requestData = {
        title: playlist.title.trim(),
        curator_name: playlist.curator_name.trim(),
        curator_type: playlist.curator_type || 'artist',
        description: playlist.description || '',
        description_short: playlist.description_short || '',
        tags: playlist.tags || '',
        image: playlist.image || '',
        published: !!playlist.published,
        spotify_url: playlist.spotify_url || '',
        apple_url: playlist.apple_url || '',
        tidal_url: playlist.tidal_url || '',
        tracks: tracks || [],
      };

      const response = isUpdate
        ? await adminPut(url, requestData)
        : await adminPost(url, requestData);

      const savedPlaylist = response.data;
      setPlaylist(savedPlaylist);
      setSuccess(isUpdate ? 'Playlist updated successfully' : 'Playlist created successfully');

      if (onSaved) {
        onSaved(savedPlaylist);
      }
    } catch (err) {
      console.error('Error saving playlist:', err);
      setError(`Failed to save playlist: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!playlist.id) {
      setError('Please save the playlist before publishing');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await adminPost(`/api/v1/playlists/${playlist.id}/publish`, {});
      setPlaylist(prev => ({ ...prev, published: true }));
      setSuccess('Playlist published successfully');
      if (onSaved) {
        onSaved({ ...playlist, published: true });
      }
    } catch (err) {
      console.error('Error publishing playlist:', err);
      setError(`Failed to publish: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFlag = async (flag) => {
    if (!playlist?.id) {
      setError('Please save the playlist before assigning content tags');
      return;
    }

    const isSelected = selectedFlags.some(f => f.id === flag.id);

    try {
      if (isSelected) {
        await adminDelete(`/api/v1/admin/site-admin/playlist-flags/${playlist.id}/${flag.id}`);
        setSelectedFlags(prev => prev.filter(f => f.id !== flag.id));
      } else {
        await adminPost('/api/v1/admin/site-admin/playlist-flags', {
          playlistId: playlist.id,
          flagId: flag.id
        });
        setSelectedFlags(prev => [...prev, flag]);
      }
    } catch (err) {
      console.error('Error toggling flag:', err);
      setError(`Failed to update content tag: ${err.message}`);
    }
  };

  const handleAddGenre = () => {
    const input = genreInput?.trim();
    if (!input || selectedGenres.length >= 3) return;

    const alreadySelected = selectedGenres.some(tag =>
      tag && tag.toLowerCase() === input.toLowerCase()
    );
    if (alreadySelected) {
      setGenreInput('');
      return;
    }

    setSelectedGenres(prev => [...prev, input]);
    setGenreInput('');
  };

  const handleRemoveGenre = (tag) => {
    setSelectedGenres(prev => prev.filter(t => t !== tag));
  };

  const handleTracksImport = (importedTracks) => {
    setTracks(prev => [...(prev || []), ...importedTracks]);
    setSuccess(`Imported ${importedTracks.length} track${importedTracks.length === 1 ? '' : 's'}`);
  };

  if (loading && playlistId) {
    return (
      <EditorContainer>
        <Alert $type="info">Loading playlist...</Alert>
      </EditorContainer>
    );
  }

  return (
    <EditorContainer>
      <EditorHeader>
        <div>
          <h2>
            {playlist.id ? 'Edit Playlist' : 'Create New Playlist'}
            {playlist.id && <InfoBadge>Admin Override Enabled</InfoBadge>}
          </h2>
          <div className="subtitle">
            {playlist.id ? `Editing playlist #${playlist.id}` : 'Quick admin editor for curator playlists'}
            {playlist.curator_name && ` • Curator: ${playlist.curator_name}`}
          </div>
        </div>
        <HeaderActions>
          {onCancel && (
            <Button onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            variant="primary"
          >
            {saving ? 'Saving...' : playlist.id ? 'Save Changes' : 'Create Playlist'}
          </Button>
          {playlist.id && !playlist.published && (
            <Button
              onClick={handlePublish}
              disabled={saving || loading}
              variant="success"
            >
              Publish
            </Button>
          )}
        </HeaderActions>
      </EditorHeader>

      {error && <Alert $type="error">{error}</Alert>}
      {success && <Alert $type="success">{success}</Alert>}
      {validationErrors.length > 0 && (
        <Alert $type="warning">
          <strong>Validation Errors:</strong>
          <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
            {validationErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Basic Info */}
      <Section>
        <SectionTitle>Basic Information</SectionTitle>
        <CompactGrid>
          <FieldGroup>
            <Label htmlFor="title" $required>
              Playlist Title
            </Label>
            <Input
              id="title"
              type="text"
              value={playlist.title || ''}
              onChange={(e) => setPlaylist(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter playlist title"
              disabled={saving}
              maxLength={200}
            />
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="curator_name" $required>
              Curator Name
            </Label>
            <Input
              id="curator_name"
              type="text"
              value={playlist.curator_name || ''}
              onChange={(e) => setPlaylist(prev => ({ ...prev, curator_name: e.target.value }))}
              placeholder="Enter curator name"
              disabled={saving}
              maxLength={200}
            />
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="curator_type">Curator Type</Label>
            <Select
              id="curator_type"
              value={playlist.curator_type || 'artist'}
              onChange={(e) => setPlaylist(prev => ({ ...prev, curator_type: e.target.value }))}
              disabled={saving}
            >
              <option value="artist">Artist</option>
              <option value="label">Label</option>
              <option value="collective">Collective</option>
              <option value="venue">Venue</option>
              <option value="radio">Radio</option>
              <option value="magazine">Magazine</option>
              <option value="other">Other</option>
            </Select>
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="description_short">Short Description</Label>
            <Input
              id="description_short"
              type="text"
              value={playlist.description_short || ''}
              onChange={(e) => setPlaylist(prev => ({ ...prev, description_short: e.target.value }))}
              placeholder="Brief one-line description"
              disabled={saving}
              maxLength={200}
            />
          </FieldGroup>
        </CompactGrid>

        <FieldGroup>
          <Label htmlFor="description">Full Description</Label>
          <TextArea
            id="description"
            value={playlist.description || ''}
            onChange={(e) => setPlaylist(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Detailed description of the playlist..."
            disabled={saving}
            maxLength={2000}
          />
        </FieldGroup>
      </Section>

      {/* Genres */}
      <Section>
        <SectionTitle>Genres (Max 3)</SectionTitle>
        <InlineRow>
          <GenreInput
            type="text"
            placeholder="Search or add genre"
            value={genreInput}
            onChange={(e) => setGenreInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddGenre();
              }
            }}
            disabled={saving || selectedGenres.length >= 3}
          />
          <Button
            onClick={handleAddGenre}
            disabled={saving || !genreInput.trim() || selectedGenres.length >= 3}
            size="small"
          >
            Add
          </Button>
        </InlineRow>
        {selectedGenres.length > 0 && (
          <TagContainer>
            {selectedGenres.map((tag, index) => {
              const genreInfo = findGenreInfo(tag);
              return (
                <GenreChip key={tag || index} $tone={genreInfo.color} $variant="outline">
                  {genreInfo.label || tag}
                  <ChipRemove
                    onClick={() => handleRemoveGenre(tag)}
                    aria-label={`Remove ${genreInfo.label || tag}`}
                    disabled={saving}
                  >
                    ×
                  </ChipRemove>
                </GenreChip>
              );
            })}
          </TagContainer>
        )}
        {selectedGenres.length === 0 && (
          <FieldHint>Add up to 3 genre tags to anchor discovery.</FieldHint>
        )}
      </Section>

      {/* Content Tags */}
      <Section>
        <SectionTitle>
          Content Tags
          <InfoBadge>Admin Feature</InfoBadge>
        </SectionTitle>
        {loadingFlags ? (
          <FieldHint>Loading content tags...</FieldHint>
        ) : availableFlags.length === 0 ? (
          <Alert $type="info">No content tags available. Contact site admin to create tags.</Alert>
        ) : (
          <>
            <TagContainer>
              {availableFlags.map((flag) => {
                const isSelected = selectedFlags.some(f => f.id === flag.id);
                return (
                  <TagButton
                    key={flag.id}
                    onClick={() => handleToggleFlag(flag)}
                    disabled={saving || !playlist?.id}
                    $tone={flag.color || theme.colors.primary}
                    $textTone={flag.text_color || theme.colors.white}
                    $selected={isSelected}
                  >
                    {flag.text}
                  </TagButton>
                );
              })}
            </TagContainer>
            {!playlist?.id && (
              <Alert $type="warning">Save the playlist first to assign content tags.</Alert>
            )}
          </>
        )}
      </Section>

      {/* Streaming URLs */}
      <Section>
        <SectionTitle>Streaming Platform URLs</SectionTitle>
        <CompactGrid>
          <FieldGroup>
            <Label htmlFor="spotify_url">Spotify URL</Label>
            <Input
              id="spotify_url"
              type="url"
              value={playlist.spotify_url || ''}
              onChange={(e) => setPlaylist(prev => ({ ...prev, spotify_url: e.target.value }))}
              placeholder="https://open.spotify.com/playlist/..."
              disabled={saving}
            />
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="apple_url">Apple Music URL</Label>
            <Input
              id="apple_url"
              type="url"
              value={playlist.apple_url || ''}
              onChange={(e) => setPlaylist(prev => ({ ...prev, apple_url: e.target.value }))}
              placeholder="https://music.apple.com/playlist/..."
              disabled={saving}
            />
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="tidal_url">Tidal URL</Label>
            <Input
              id="tidal_url"
              type="url"
              value={playlist.tidal_url || ''}
              onChange={(e) => setPlaylist(prev => ({ ...prev, tidal_url: e.target.value }))}
              placeholder="https://tidal.com/browse/playlist/..."
              disabled={saving}
            />
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="soundcloud_url">SoundCloud URL</Label>
            <Input
              id="soundcloud_url"
              type="url"
              value={playlist.soundcloud_url || ''}
              onChange={(e) => setPlaylist(prev => ({ ...prev, soundcloud_url: e.target.value }))}
              placeholder="https://soundcloud.com/..."
              disabled={saving}
            />
          </FieldGroup>
        </CompactGrid>
      </Section>

      {/* Cover Image */}
      <Section>
        <SectionTitle>Cover Image</SectionTitle>
        <ImageUpload
          currentImage={playlist?.image}
          onImageUpload={(imageUrl) => setPlaylist(prev => ({ ...prev, image: imageUrl }))}
          disabled={saving}
          uploadType="playlists"
          hideHeader={true}
          compact={true}
        />
      </Section>

      {/* Tracks */}
      <Section>
        <SectionTitle>Tracks ({tracks.length})</SectionTitle>
        <ImportTools
          onTracksImport={handleTracksImport}
          disabled={saving}
        />
        <TrackList
          tracks={tracks}
          onChange={setTracks}
          disabled={saving}
        />
      </Section>
    </EditorContainer>
  );
};

export default AdminPlaylistQuickEditor;
