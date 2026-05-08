import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { Button, Card, FormField, Input, Select, TextArea, tokens, mediaQuery } from '@modules/curator/components/ui';
import ResponsiveImage from '@shared/components/ResponsiveImage';
import { IMAGE_SIZES } from '@shared/utils/imageUtils';
import { useAuth } from '@shared/contexts/AuthContext';
import { useBioEditorStore, MAX_FEATURED_LINKS } from '../store/bioEditorStore';
import * as bioService from '../services/bioService';
import { normalizePublicUrl } from '../utils/publicUrl';

const LinksContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const SectionHeader = styled.div`
  margin-bottom: ${theme.spacing.md};

  h3 {
    margin: 0 0 ${theme.spacing.xs} 0;
    color: ${theme.colors.black};
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h3};
    font-weight: ${theme.fontWeights.bold};
  }

  p {
    margin: 0;
    font-size: ${theme.fontSizes.tiny};
    font-family: ${theme.fonts.mono};
    color: rgba(0, 0, 0, 0.6);
    line-height: 1.6;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
`;

const WarningText = styled.p`
  margin: ${theme.spacing.sm} 0 0;
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.warning};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const LinksList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const LinkCard = styled(Card)`
  padding: 0;
  overflow: hidden;
  opacity: ${props => props.$isEnabled ? 1 : 0.6};
  border-color: ${props => props.$isEnabled ? theme.colors.black : 'rgba(0, 0, 0, 0.2)'};
`;

const CardHeader = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  cursor: pointer;
  user-select: none;
  background: ${props => props.$expanded ? theme.colors.fpwhiteIn : theme.colors.fpwhite};
  border-bottom: ${props => props.$expanded ? `${theme.borders.solidThin} rgba(0, 0, 0, 0.2)` : 'none'};
  min-height: ${tokens.sizing.touchTargetComfortable};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm};
  }
`;

const CardIcon = styled.div`
  width: ${tokens.sizing.touchTargetComfortable};
  height: ${tokens.sizing.touchTargetComfortable};
  background: ${props => props.$hasImage ? theme.colors.fpwhite : 'rgba(0, 0, 0, 0.04)'};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border: ${theme.borders.solid} ${theme.colors.black};
`;

const CardIconImage = styled(ResponsiveImage)`
  width: 100%;
  height: 100%;
`;

const CardIconText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
`;

const CardInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const CardTitle = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.xs};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardSubtitle = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const CardActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-shrink: 0;

  ${mediaQuery.mobile} {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
`;

const CardContent = styled.div`
  padding: ${theme.spacing.lg};
  display: ${props => props.$expanded ? 'block' : 'none'};
  animation: ${props => props.$expanded ? 'slideDown 0.2s ease' : 'none'};

  @keyframes slideDown {
    from {
      opacity: 0;
      max-height: 0;
    }
    to {
      opacity: 1;
      max-height: calc(${theme.spacing.xxl} * 20);
    }
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const FormGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};

  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const FormRowFull = styled.div`
  grid-column: 1 / -1;
`;

const ImageUploadArea = styled.div`
  position: relative;
`;

const ImagePreview = styled.div`
  width: 100%;
  height: calc(${theme.spacing.xxl} * 4);
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.03);
  overflow: hidden;
  position: relative;

  @media (max-width: ${theme.breakpoints.mobile}) {
    height: calc(${theme.spacing.xxl} * 3.2);
  }
`;

const PreviewImage = styled(ResponsiveImage)`
  width: 100%;
  height: 100%;
`;

const ImagePlaceholder = styled.div`
  text-align: center;
  color: rgba(0, 0, 0, 0.45);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const UploadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.sm};
`;

const Spinner = styled.div`
  width: ${tokens.spacing[8]};
  height: ${tokens.spacing[8]};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.1);
  border-top-color: ${theme.colors.black};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const UploadActions = styled.div`
  margin-top: ${theme.spacing.sm};
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const FeaturedLinksManagerV2 = () => {
  const { authenticatedFetch } = useAuth();
  const {
    featuredLinks,
    updateFeaturedLink,
    toggleFeaturedLink,
    addFeaturedLink,
    removeFeaturedLink,
    selectedCurator
  } = useBioEditorStore();

  const [expandedLink, setExpandedLink] = useState(null);
  const [uploadingImages, setUploadingImages] = useState({});
  const [curatorPlaylists, setCuratorPlaylists] = useState([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [playlistsError, setPlaylistsError] = useState('');

  // Load curator playlists
  useEffect(() => {
    if (!selectedCurator?.id) {
      setCuratorPlaylists([]);
      setPlaylistsLoading(false);
      setPlaylistsError('');
      return undefined;
    }

    const controller = new AbortController();

    const loadCuratorPlaylists = async () => {
      setPlaylistsLoading(true);
      setPlaylistsError('');

      try {
        const response = await authenticatedFetch(`/api/v1/playlists?curator_id=${selectedCurator.id}`, {
          method: 'GET',
          signal: controller.signal
        });
        const data = response.ok ? await response.json() : { data: [] };
        setCuratorPlaylists(Array.isArray(data.data) ? data.data : []);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('Error loading curator playlists:', error);
        setCuratorPlaylists([]);
        setPlaylistsError('Unable to load playlists right now.');
      } finally {
        setPlaylistsLoading(false);
      }
    };

    loadCuratorPlaylists();

    return () => controller.abort();
  }, [authenticatedFetch, selectedCurator?.id]);

  const handleFieldChange = (position, field, value) => {
    updateFeaturedLink(position, { [field]: value });
  };

  const handleToggleLink = (position) => {
    toggleFeaturedLink(position);
  };

  const handleImageUpload = async (position, file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size must be less than 5MB');
      return;
    }

    setUploadingImages(prev => ({ ...prev, [position]: true }));

    try {
      const result = await bioService.uploadBioImage(file);

      if (result.success && result.data?.primary_url) {
        handleFieldChange(position, 'image_url', result.data.primary_url);
      } else {
        throw new Error('Upload successful but no URL returned');
      }

    } catch (error) {
      console.error('Image upload failed:', error);
      alert(`Image upload failed: ${error.message}. Please try again.`);
      handleFieldChange(position, 'image_url', null);
    } finally {
      setUploadingImages(prev => ({ ...prev, [position]: false }));
    }
  };

  const toggleExpanded = (position) => {
    setExpandedLink(expandedLink === position ? null : position);
  };

  const renderLinkCard = (link) => {
    const isExpanded = expandedLink === link.position;
    const isUploading = uploadingImages[link.position];
    const displayTitle = link.title || `Link ${link.position}`;
    let displaySubtitle = link.link_type || 'Not configured';
    if (link.url) {
      try {
        displaySubtitle = new URL(link.url).hostname;
      } catch {
        displaySubtitle = 'Invalid URL';
      }
    }

    return (
      <LinkCard key={link.position} $isEnabled={link.is_enabled}>
        <CardHeader
          $expanded={isExpanded}
          onClick={() => toggleExpanded(link.position)}
          role="button"
          aria-expanded={isExpanded}
        >
          <CardIcon $hasImage={!!link.image_url}>
            {link.image_url ? (
              <CardIconImage
                src={link.image_url}
                alt={displayTitle}
                sizes={IMAGE_SIZES.THUMBNAIL_SMALL}
                loading="lazy"
              />
            ) : (
              <CardIconText>Link</CardIconText>
            )}
          </CardIcon>

          <CardInfo>
            <CardTitle>{displayTitle}</CardTitle>
            <CardSubtitle>{displaySubtitle}</CardSubtitle>
          </CardInfo>

          <CardActions onClick={(e) => e.stopPropagation()}>
            <Button
              onClick={() => handleToggleLink(link.position)}
              title={link.is_enabled ? 'Hide from bio' : 'Show on bio'}
              $variant={link.is_enabled ? 'secondary' : 'default'}
              $size="sm"
              aria-pressed={link.is_enabled}
            >
              {link.is_enabled ? 'Shown' : 'Hidden'}
            </Button>
            <Button
              onClick={() => removeFeaturedLink(link.position)}
              title="Delete link"
              $variant="dangerOutline"
              $size="sm"
            >
              Remove
            </Button>
            <Button
              onClick={() => toggleExpanded(link.position)}
              title={isExpanded ? 'Collapse' : 'Edit'}
              $variant="ghost"
              $size="sm"
            >
              {isExpanded ? 'Collapse' : 'Edit'}
            </Button>
          </CardActions>
        </CardHeader>

        <CardContent $expanded={isExpanded}>
          <FormGrid>
            <FormField label="Link Type">
              <Select
                value={link.link_type || 'url'}
                onChange={(e) => {
                  const newLinkType = e.target.value;
                  handleFieldChange(link.position, 'link_type', newLinkType);

                  if (newLinkType !== 'playlist') {
                    handleFieldChange(link.position, 'playlist_id', null);
                  }

                  if (newLinkType === 'url') {
                    handleFieldChange(link.position, 'image_url', null);
                    handleFieldChange(link.position, 'title', link.title || '');
                    handleFieldChange(link.position, 'url', link.url || '');
                  }
                }}
                disabled={!link.is_enabled}
              >
                <option value="url">External Link</option>
                <option value="playlist">Playlist</option>
              </Select>
            </FormField>

            {link.link_type === 'playlist' && curatorPlaylists.length > 0 ? (
              <FormField
                label="Select Playlist"
                required
                helper={playlistsLoading ? 'Loading playlists...' : ''}
                error={playlistsError || ''}
              >
                <Select
                  value={link.playlist_id || ''}
                  onChange={(e) => {
                    const selectedPlaylist = curatorPlaylists.find(p => p.id === parseInt(e.target.value, 10));
                    const playlistId = parseInt(e.target.value);
                    const playlistUrl = selectedPlaylist?.id
                      ? normalizePublicUrl(`/playlists/${selectedPlaylist.id}`)
                      : '';

                    handleFieldChange(link.position, 'playlist_id', playlistId);
                    handleFieldChange(link.position, 'link_type', 'playlist');
                    handleFieldChange(link.position, 'title', selectedPlaylist?.title || '');
                    handleFieldChange(link.position, 'url', playlistUrl);

                    const imageCandidate = [
                      selectedPlaylist?.image,
                      selectedPlaylist?.cover_image,
                      selectedPlaylist?.hero_image,
                      selectedPlaylist?.square_image,
                      selectedPlaylist?.header_image
                    ].find(Boolean);

                    handleFieldChange(link.position, 'image_url', imageCandidate || null);
                  }}
                  disabled={!link.is_enabled || playlistsLoading}
                >
                  <option value="">Select a playlist...</option>
                  {curatorPlaylists.map(playlist => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.title}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField label="Title" required>
                <Input
                  type="text"
                  value={link.title || ''}
                  onChange={(e) => handleFieldChange(link.position, 'title', e.target.value)}
                  placeholder="Link title"
                  disabled={!link.is_enabled}
                  maxLength={100}
                />
              </FormField>
            )}

            {link.link_type === 'playlist' && curatorPlaylists.length === 0 && (
              <FormRowFull>
                <FormField
                  label="Playlist"
                  helper={playlistsLoading ? 'Loading playlists...' : 'No playlists available yet.'}
                  error={playlistsError || ''}
                >
                  <Input
                    type="text"
                    value={playlistsLoading ? 'Loading playlists...' : 'No playlists available'}
                    disabled
                  />
                </FormField>
              </FormRowFull>
            )}

            <FormRowFull>
              <FormField label="Description">
                <TextArea
                  value={link.description || ''}
                  onChange={(e) => handleFieldChange(link.position, 'description', e.target.value)}
                  placeholder="Optional description"
                  disabled={!link.is_enabled}
                  maxLength={200}
                />
              </FormField>
            </FormRowFull>

            <FormRowFull>
              <FormField label="URL" required>
                <Input
                  type="url"
                  value={link.url || ''}
                  onChange={(e) => handleFieldChange(link.position, 'url', e.target.value)}
                  placeholder={link.link_type === 'url' ? "https://example.com" : "Auto-generated from selection"}
                  disabled={!link.is_enabled || link.link_type === 'playlist'}
                  readOnly={link.link_type === 'playlist'}
                />
              </FormField>
            </FormRowFull>

            <FormRowFull>
              <FormField
                label={`Image ${link.link_type === 'playlist' && link.image_url ? '(Auto-loaded)' : '(Optional)'}`}
              >
                <ImageUploadArea>
                  <ImagePreview aria-busy={isUploading}>
                    {link.image_url ? (
                      <PreviewImage
                        src={link.image_url}
                        alt={link.title || 'Link preview'}
                        sizes={IMAGE_SIZES.CARD_MEDIUM}
                        loading="lazy"
                      />
                    ) : (
                      <ImagePlaceholder>No image</ImagePlaceholder>
                    )}
                    {isUploading && (
                      <UploadingOverlay>
                        <Spinner />
                        <div>Uploading...</div>
                      </UploadingOverlay>
                    )}
                  </ImagePreview>
                  <UploadActions>
                    <Button
                      as="label"
                      $variant="secondary"
                      $size="sm"
                      disabled={!link.is_enabled || isUploading}
                    >
                      Upload image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(link.position, e.target.files[0])}
                        disabled={!link.is_enabled || isUploading}
                        style={{ display: 'none' }}
                      />
                    </Button>
                    {link.image_url && (
                      <Button
                        $variant="ghost"
                        $size="sm"
                        onClick={() => handleFieldChange(link.position, 'image_url', null)}
                        disabled={!link.is_enabled || isUploading}
                      >
                        Remove image
                      </Button>
                    )}
                  </UploadActions>
                </ImageUploadArea>
              </FormField>
            </FormRowFull>
          </FormGrid>
        </CardContent>
      </LinkCard>
    );
  };

  return (
    <LinksContainer>
      <SectionHeader>
        <h3>Featured Links</h3>
        <p>Add featured links to highlight on your bio page. The first three display with images; additional links use a condensed layout without previews.</p>
      </SectionHeader>

      <LinksList>
        {featuredLinks.map(renderLinkCard)}
      </LinksList>

      <div style={{ marginTop: theme.spacing.md }}>
        <Button
          onClick={addFeaturedLink}
          disabled={featuredLinks.length >= MAX_FEATURED_LINKS}
          $variant="secondary"
          $size="md"
          $fullWidth
        >
          Add Featured Link ({featuredLinks.length}/{MAX_FEATURED_LINKS})
        </Button>
        {featuredLinks.length >= 3 && (
          <WarningText>
            More than three featured links switches the public page to a condensed layout without images.
          </WarningText>
        )}
      </div>
    </LinksContainer>
  );
};

export default FeaturedLinksManagerV2;
