import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button, Input, mediaQuery } from '@shared/styles/GlobalStyles';
import ArtworkManager from './ArtworkManager';
import { adminPut } from '../../admin/utils/adminApi.js';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from '@shared/components/Modal';

const TrackMetadataEditor = ({ track, onUpdate, onClose }) => {
  const [formData, setFormData] = useState({
    title: '',
    artist: '',
    album: '',
    year: '',
    duration: '',
    label: '',
    genre: '',
    spotify_id: '',
    apple_id: '',
    tidal_id: '',
    apple_music_url: '',
    tidal_url: '',
    bandcamp_url: '',
    soundcloud_url: '',
    isrc: '',
    explicit: false,
    popularity: '',
    preview_url: '',
    artwork_url: '',
    album_artwork_url: '',
    quote: '',
    custom_sources: [],
    deezer_preview_url: ''
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showArtworkManager, setShowArtworkManager] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    topline: true,
    metadata: true,
    streaming: true,
    artwork: false
  });

  useEffect(() => {
    if (track) {
      // Parse custom_sources if it's a JSON string
      let parsedCustomSources = [];
      if (track.custom_sources) {
        try {
          parsedCustomSources = typeof track.custom_sources === 'string'
            ? JSON.parse(track.custom_sources)
            : track.custom_sources;
        } catch (e) {
          console.error('Failed to parse custom_sources:', e);
        }
      }

      setFormData({
        title: track.title || '',
        artist: track.artist || '',
        album: track.album || '',
        year: track.year ? track.year.toString() : '',
        duration: track.duration || '',
        label: track.label || '',
        genre: track.genre || '',
        spotify_id: track.spotify_id || '',
        apple_id: track.apple_id || '',
        tidal_id: track.tidal_id || '',
        apple_music_url: track.apple_music_url || '',
        tidal_url: track.tidal_url || '',
        bandcamp_url: track.bandcamp_url || '',
        soundcloud_url: track.soundcloud_url || '',
        isrc: track.isrc || '',
        explicit: track.explicit || false,
        popularity: track.popularity ? track.popularity.toString() : '',
        preview_url: track.preview_url || '',
        artwork_url: track.artwork_url || '',
        album_artwork_url: track.album_artwork_url || '',
        quote: track.quote || '',
        custom_sources: Array.isArray(parsedCustomSources) ? parsedCustomSources : [],
        deezer_preview_url: track.deezer_preview_url || ''
      });
    }
  }, [track]);


  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const trackId = track?.id;
      const isPersistedTrack = typeof trackId === 'number' || /^\d+$/.test(String(trackId || '').trim());

      // Prepare data for API
      const updateData = {
        ...formData,
        year: formData.year ? parseInt(formData.year, 10) : null,
        popularity: formData.popularity ? parseInt(formData.popularity, 10) : null,
        explicit: Boolean(formData.explicit),
        apple_music_url: formData.apple_music_url?.trim() || null,
        tidal_url: formData.tidal_url?.trim() || null,
        bandcamp_url: formData.bandcamp_url?.trim() || null,
        soundcloud_url: formData.soundcloud_url?.trim() || null,
        preview_url: formData.preview_url?.trim() || null,
        artwork_url: formData.artwork_url?.trim() || null,
        album_artwork_url: formData.album_artwork_url?.trim() || null,
        custom_sources: formData.custom_sources.filter(src => src.url && src.name),
        deezer_preview_url: formData.deezer_preview_url?.trim() || null
      };

      if (!isPersistedTrack) {
        if (onUpdate) {
          onUpdate({
            ...track,
            ...updateData,
          });
        }
        if (onClose) onClose();
        return;
      }

      const result = await adminPut(`/api/v1/tracks/${trackId}`, updateData);
      if (onUpdate) onUpdate(result.data);

      if (onClose) {
        onClose();
      }

    } catch (error) {
      setError('Failed to update track: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [formData, track?.id, onUpdate, onClose]);

  const handleArtworkUpdate = useCallback((trackId, filename) => {
    setFormData(prev => ({
      ...prev,
      artwork_url: filename
    }));
  }, []);

  const handleRemovePreview = useCallback(async () => {
    if (!confirm('Are you sure you want to remove all preview URLs for this track?')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/tracks/${track.id}/preview`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      // Update form data to reflect removal
      setFormData(prev => ({
        ...prev,
        preview_url: '',
        deezer_preview_url: ''
      }));

      // Update track object to reflect removal (for display purposes)
      const updatedTrack = {
        ...track,
        deezer_preview_url: null,
        preview_confidence: null,
        preview_url: ''
      };

      if (onUpdate) {
        onUpdate(updatedTrack);
      }

    } catch (error) {
      setError('Failed to remove preview: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [track, onUpdate]);

  const clearError = useCallback(() => setError(null), []);
  const toggleSection = useCallback((section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  }, []);

  // Memoize track display info for performance
  const trackDisplayInfo = useMemo(() => ({
    title: formData.title || track?.title || '',
    artist: formData.artist || track?.artist || ''
  }), [formData.title, formData.artist, track?.title, track?.artist]);

  if (!track) return null;

  return (
    <ModalRoot
      isOpen={true}
      onClose={onClose}
      labelledBy="track-metadata-editor-title"
      closeOnBackdrop={!isLoading}
    >
      <StyledModalSurface>
        <StyledModalHeader>
          <HeaderContent>
            <ModalTitle id="track-metadata-editor-title">
              {trackDisplayInfo.title && trackDisplayInfo.artist 
                ? `${trackDisplayInfo.title} - ${trackDisplayInfo.artist}`
                : 'Metadata Editor'}
            </ModalTitle>
            <TrackIdBadge>ID: {track.id}</TrackIdBadge>
          </HeaderContent>
          <ModalCloseButton />
        </StyledModalHeader>

        {error && (
          <ErrorMessage>
            {error}
            <Button onClick={clearError} variant="text">×</Button>
          </ErrorMessage>
        )}

        <StyledModalBody>
          <EditorGrid>
            {/* Basic Information */}
            <Section>
              <SectionHeader onClick={() => toggleSection('topline')}>
                <SectionTitle>Topline</SectionTitle>
                <SectionToggle $expanded={expandedSections.topline}>▼</SectionToggle>
              </SectionHeader>
              {expandedSections.topline && (
              <SectionContent>
              
              <FormRow>
                <Input
                  type="text"
                  placeholder="Track Title *"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>
              
              <FormRow>
                <Input
                  type="text"
                  placeholder="Artist *"
                  value={formData.artist}
                  onChange={(e) => handleChange('artist', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>
              
              <FormRow>
                <Input
                  type="text"
                  placeholder="Album"
                  value={formData.album}
                  onChange={(e) => handleChange('album', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>
              
              <FormRow>
                <Input
                  type="number"
                  placeholder="Year"
                  value={formData.year}
                  onChange={(e) => handleChange('year', e.target.value)}
                  min="1900"
                  max={new Date().getFullYear()}
                  disabled={isLoading}
                />
                
                <Input
                  type="text"
                  placeholder="Duration (3:45)"
                  value={formData.duration}
                  onChange={(e) => handleChange('duration', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>
              </SectionContent>
              )}
            </Section>

            {/* Additional Metadata */}
            <Section>
              <SectionHeader onClick={() => toggleSection('metadata')}>
                <SectionTitle>Additional Metadata</SectionTitle>
                <SectionToggle $expanded={expandedSections.metadata}>▼</SectionToggle>
              </SectionHeader>
              {expandedSections.metadata && (
              <SectionContent>
              
              <FormRow>
                <Input
                  type="text"
                  placeholder="Record Label"
                  value={formData.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>
              
              <FormRow>
                <Input
                  type="text"
                  placeholder="Genre"
                  value={formData.genre}
                  onChange={(e) => handleChange('genre', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>
              
              <FormRow>
                <Input
                  type="text"
                  placeholder="ISRC Code"
                  value={formData.isrc}
                  onChange={(e) => handleChange('isrc', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>
              
              <FormRow>
                <Input
                  type="number"
                  placeholder="Popularity (0-100)"
                  value={formData.popularity}
                  onChange={(e) => handleChange('popularity', e.target.value)}
                  min="0"
                  max="100"
                  disabled={isLoading}
                />
              </FormRow>
              
              <FormRow>
                <CheckboxContainer>
                  <Checkbox
                    type="checkbox"
                    id="explicit"
                    checked={formData.explicit}
                    onChange={(e) => handleChange('explicit', e.target.checked)}
                    disabled={isLoading}
                  />
                  <CheckboxLabel htmlFor="explicit">Explicit Content</CheckboxLabel>
                </CheckboxContainer>
              </FormRow>
              </SectionContent>
              )}
            </Section>

            {/* Streaming Platform IDs */}
            <Section>
              <SectionHeader onClick={() => toggleSection('streaming')}>
                <SectionTitle>Streaming Platform IDs</SectionTitle>
                <SectionToggle $expanded={expandedSections.streaming}>▼</SectionToggle>
              </SectionHeader>
              {expandedSections.streaming && (
              <SectionContent>
              
              <FormRow>
                <Input
                  type="text"
                  placeholder="Spotify Track ID"
                  value={formData.spotify_id}
                  onChange={(e) => handleChange('spotify_id', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>

              <SectionTitle>Linked URLs</SectionTitle>
              <HelperNote>
                Manual overrides are ok here. Cross-linking jobs may replace these URLs later if a stronger match is found.
              </HelperNote>
              <UrlInputRow>
                <Input
                  type="url"
                  placeholder="Apple Music URL"
                  value={formData.apple_music_url}
                  onChange={(e) => handleChange('apple_music_url', e.target.value)}
                  disabled={isLoading}
                />
                <InlineButton
                  type="button"
                  onClick={() => formData.apple_music_url && window.open(formData.apple_music_url, '_blank')}
                  disabled={!formData.apple_music_url}
                >
                  Open
                </InlineButton>
              </UrlInputRow>

              <UrlInputRow>
                <Input
                  type="url"
                  placeholder="TIDAL URL"
                  value={formData.tidal_url}
                  onChange={(e) => handleChange('tidal_url', e.target.value)}
                  disabled={isLoading}
                />
                <InlineButton
                  type="button"
                  onClick={() => formData.tidal_url && window.open(formData.tidal_url, '_blank')}
                  disabled={!formData.tidal_url}
                >
                  Open
                </InlineButton>
              </UrlInputRow>

              <UrlInputRow>
                <Input
                  type="url"
                  placeholder="Deezer Preview URL"
                  value={formData.deezer_preview_url}
                  onChange={(e) => handleChange('deezer_preview_url', e.target.value)}
                  disabled={isLoading}
                />
                <InlineButton
                  type="button"
                  onClick={() => formData.deezer_preview_url && window.open(formData.deezer_preview_url, '_blank')}
                  disabled={!formData.deezer_preview_url}
                >
                  Open
                </InlineButton>
              </UrlInputRow>

              {/* Quote moved to separate editor (TrackQuoteEditor) for cleaner metadata editing */}

              <FormRow>
                <Input
                  type="text"
                  placeholder="Apple Music Track ID"
                  value={formData.apple_id}
                  onChange={(e) => handleChange('apple_id', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>
              
              <FormRow>
                <Input
                  type="text"
                  placeholder="Tidal Track ID"
                  value={formData.tidal_id}
                  onChange={(e) => handleChange('tidal_id', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>
              
              <UrlInputRow>
                <Input
                  type="url"
                  placeholder="Bandcamp Track URL"
                  value={formData.bandcamp_url}
                  onChange={(e) => handleChange('bandcamp_url', e.target.value)}
                  disabled={isLoading}
                />
                <InlineButton
                  type="button"
                  onClick={() => formData.bandcamp_url && window.open(formData.bandcamp_url, '_blank')}
                  disabled={!formData.bandcamp_url}
                >
                  Open
                </InlineButton>
              </UrlInputRow>

              <UrlInputRow>
                <Input
                  type="url"
                  placeholder="SoundCloud Track URL"
                  value={formData.soundcloud_url}
                  onChange={(e) => handleChange('soundcloud_url', e.target.value)}
                  disabled={isLoading}
                />
                <InlineButton
                  type="button"
                  onClick={() => formData.soundcloud_url && window.open(formData.soundcloud_url, '_blank')}
                  disabled={!formData.soundcloud_url}
                >
                  Open
                </InlineButton>
              </UrlInputRow>

              <SectionTitle style={{ marginTop: theme.spacing.md }}>Custom Sources</SectionTitle>
              <HelperNote>
                Add custom streaming sources (YouTube, Mixcloud, etc.)
              </HelperNote>
              {formData.custom_sources.map((source, index) => (
                <FormRow key={index}>
                  <Input
                    type="text"
                    placeholder="Platform name (e.g., YouTube)"
                    value={source.name}
                    onChange={(e) => {
                      const updated = [...formData.custom_sources];
                      updated[index].name = e.target.value;
                      handleChange('custom_sources', updated);
                    }}
                    disabled={isLoading}
                  />
                  <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                    <Input
                      type="url"
                      placeholder="URL"
                      value={source.url}
                      onChange={(e) => {
                        const updated = [...formData.custom_sources];
                        updated[index].url = e.target.value;
                        handleChange('custom_sources', updated);
                      }}
                      disabled={isLoading}
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        const updated = formData.custom_sources.filter((_, i) => i !== index);
                        handleChange('custom_sources', updated);
                      }}
                      disabled={isLoading}
                      variant="danger"
                      title="Remove source"
                    >
                      −
                    </Button>
                  </div>
                </FormRow>
              ))}
              <Button
                type="button"
                onClick={() => {
                  handleChange('custom_sources', [...formData.custom_sources, { name: '', url: '' }]);
                }}
                disabled={isLoading}
                variant="secondary"
              >
                + Add Custom Source
              </Button>

              <FormRow>
                <Input
                  type="url"
                  placeholder="Preview URL"
                  value={formData.preview_url}
                  onChange={(e) => handleChange('preview_url', e.target.value)}
                  disabled={isLoading}
                />
              </FormRow>
              
              {(track.deezer_preview_url || formData.preview_url) && (
                <FormRow>
                  <PreviewActions>
                    <PreviewInfo>
                      {track.deezer_preview_url && (
                        <div>
                          <strong>Deezer Preview:</strong> Available
                          {track.preview_confidence && (
                            <span> ({track.preview_confidence}% confidence)</span>
                          )}
                        </div>
                      )}
                      {formData.preview_url && (
                        <div>
                          <strong>Manual Preview:</strong> Set
                        </div>
                      )}
                    </PreviewInfo>
                    <Button
                      onClick={handleRemovePreview}
                      disabled={isLoading}
                      variant="danger"
                      title="Remove all preview URLs for this track"
                    >
                      Remove Preview
                    </Button>
                  </PreviewActions>
                </FormRow>
              )}
              </SectionContent>
              )}
            </Section>

            {/* Artwork Management */}
            <Section $highlight={showArtworkManager}>
              <SectionHeader onClick={() => toggleSection('artwork')}>
                <SectionTitle>Artwork Management</SectionTitle>
                <SectionToggle $expanded={expandedSections.artwork}>▼</SectionToggle>
              </SectionHeader>
              {expandedSections.artwork && (
              <SectionContent>

              <ArtworkPreviewSection>
                {!showArtworkManager && (
                  formData.artwork_url ? (
                    <ArtworkPreview>
                      <img
                        src={
                          formData.artwork_url.startsWith('http') || formData.artwork_url.startsWith('/uploads/') || formData.artwork_url.startsWith('uploads/')
                            ? formData.artwork_url.replace(/^uploads\//, '/uploads/')
                            : `/uploads/${formData.artwork_url}`
                        }
                        alt="Current track artwork"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                      <ArtworkPlaceholder style={{ display: 'none' }}>
                        ARTWORK NOT FOUND
                      </ArtworkPlaceholder>
                    </ArtworkPreview>
                  ) : (
                    <ArtworkPlaceholder>
                      NO ARTWORK
                    </ArtworkPlaceholder>
                  )
                )}

                <Button
                  onClick={() => setShowArtworkManager(!showArtworkManager)}
                  variant={showArtworkManager ? 'secondary' : 'primary'}
                  disabled={isLoading}
                >
                  {showArtworkManager ? 'Close Manager' : 'Manage Artwork'}
                </Button>
              </ArtworkPreviewSection>

              {showArtworkManager && (
                <ArtworkManagerWrapper>
                  <ArtworkManager
                    track={{ ...track, ...formData }}
                    onArtworkUpdate={handleArtworkUpdate}
                  />
                </ArtworkManagerWrapper>
              )}
              </SectionContent>
              )}
            </Section>
          </EditorGrid>
        </StyledModalBody>

        <StyledModalFooter>
          <SaveButtonWrapper>
          <Button onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>

          <Button
            onClick={handleSave}
            disabled={isLoading || !formData.title.trim() || !formData.artist.trim()}
            variant="primary"
          >
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
          </SaveButtonWrapper>
        </StyledModalFooter>
      </StyledModalSurface>
    </ModalRoot>
  );
};

// Styled Components
const StyledModalSurface = styled(ModalSurface)`
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  width: 100%;
  max-width: 900px;
  border: ${theme.borders.solidAct} rgba(0, 0, 0, 0.3);
  
  ${mediaQuery.mobile} {
    max-width: 100%;
    max-height: 100vh;
    border-radius: 0;
    margin: 0;
  }

  /* Override input styling for this modal */
  input, textarea, select {
    background: ${theme.colors.fpwhite} !important;
    color: ${theme.colors.black} !important;
    border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.4) !important;

    &:focus {
      border-color: rgba(0, 0, 0, 0.6) !important;
      background: rgba(177, 176, 176, 0.9) !important;
    }

    &::placeholder {
      color: rgba(31, 29, 29, 0.5) !important;
      opacity: 1 !important;
    }

    &:disabled {
      opacity: 0.6;
      background: rgba(255, 255, 255, 0.1) !important;
    }

    /* Fix select dropdown options */
    option {
      background: ${theme.colors.fpwhite} !important;
      color: ${theme.colors.black} !important;
    }
  }
`;

const StyledModalHeader = styled(ModalHeader)`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-bottom: ${theme.borders.solidAct} ${theme.colors.blackAct};
  position: sticky;
  top: 0;
  background: ${theme.colors.fpwhite};
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
  }

  h2 {
    font-family: ${theme.fonts.primary};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${theme.colors.black};
    font-size: ${theme.fontSizes.small};
    margin: 0;
  }
`;

const HeaderContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  flex: 1;
  min-width: 0;
`;

const TrackIdBadge = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(15, 23, 42, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ErrorMessage = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.md};
  background: rgba(220, 38, 127, 0.1);
  border: ${theme.borders.dashed} ${theme.colors.red};
  color: ${theme.colors.red};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.md};
`;

const StyledModalBody = styled(ModalBody)`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  max-height: calc(100vh - 180px);
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  
  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    max-height: calc(100vh - 120px);
  }
`;

const EditorGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  
  ${mediaQuery.mobile} {
    gap: ${theme.spacing.xs};
  }
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  border: ${theme.borders.solidThin} ${p => (p.$highlight ? theme.colors.primary : 'rgba(0, 0, 0, 0.12)')};
  background: ${p => (p.$highlight ? 'rgba(49, 130, 206, 0.03)' : '#ffffff')};
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all ${theme.transitions.fast};
  overflow: hidden;
  
  ${mediaQuery.mobile} {
    border-radius: 8px;
  }
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  cursor: pointer;
  user-select: none;
  background: rgba(0, 0, 0, 0.02);
  transition: background ${theme.transitions.fast};
  
  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
  
  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    min-height: 40px;
  }
`;

const SectionToggle = styled.span`
  font-size: ${theme.fontSizes.small};
  color: rgba(15, 23, 42, 0.5);
  transition: transform ${theme.transitions.fast};
  transform: rotate(${p => p.$expanded ? '0deg' : '-90deg'});
  
  ${mediaQuery.mobile} {
    font-size: ${theme.fontSizes.body};
  }
`;

const SectionContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  
  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    gap: ${theme.spacing.xxs || '4px'};
  }
`;

const SectionTitle = styled.h4`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
  color: ${theme.colors.black};
  opacity: 0.9;
  line-height: 1.2;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${theme.spacing.xs};
  align-items: start;
  margin-bottom: ${theme.spacing.xs};
  
  &:last-child {
    margin-bottom: 0;
  }
  
  &:has(input[type="text"]:only-child),
  &:has(input[type="url"]:only-child),
  &:has(input[type="number"]:only-child) {
    grid-template-columns: 1fr;
  }
  
  &:has(button:only-of-type) {
    grid-template-columns: 1fr;
  }
  
  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.xxs || '4px'};
    margin-bottom: ${theme.spacing.xxs || '4px'};
    
    button {
      width: 100%;
      min-height: 40px;
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
    }
  }
  
  input {
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    min-height: 36px;
    background: ${theme.colors.focusoutText || theme.colors.fpwhite};
    
    &:focus {
      background: ${theme.colors.focusinText || 'rgba(177, 176, 176, 0.9)'};
    }
    
    &:disabled {
      opacity: 1;
      background: rgba(0, 0, 0, 0.04);
      color: ${theme.colors.black};
      cursor: not-allowed;
      border-color: rgba(0, 0, 0, 0.2);
    }
    
    ${mediaQuery.mobile} {
      min-height: 40px;
      font-size: 16px;
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
    }
  }
`;

const UrlInputRow = styled.div`
  display: flex;
  align-items: stretch;
  gap: 0;
  margin-bottom: ${theme.spacing.xs};
  position: relative;
  
  &:last-child {
    margin-bottom: 0;
  }
  
  input {
    flex: 1;
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    padding-right: 60px;
    min-height: 36px;
    border-right: none;
    border-radius: 0;
    background: ${theme.colors.focusoutText};
    
    &:focus {
      border-right: none;
      background: ${theme.colors.intext || theme.colors.focusinText};
    }
    
    &:disabled {
      opacity: 1;
      background: rgba(0, 0, 0, 0.04);
      color: ${theme.colors.black};
      cursor: not-allowed;
      border-color: rgba(0, 0, 0, 0.2);
    }
    
    ${mediaQuery.mobile} {
      min-height: 40px;
      font-size: 16px;
      padding-right: 55px;
    }
  }
`;

const InlineButton = styled(Button)`
  flex-shrink: 0;
  width: auto;
  min-width: 55px;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  min-height: 36px;
  border-left: none;
  border-radius: 0;
  font-size: ${theme.fontSizes.tiny};
  white-space: nowrap;
  
  &:hover:not(:disabled) {
    border-left: none;
  }
  
  &:disabled {
    opacity: 0.4;
    background: rgba(0, 0, 0, 0.08);
    box-shadow: none;
    cursor: not-allowed;
    border-left: none;
  }
  
  ${mediaQuery.mobile} {
    min-height: 40px;
    min-width: 50px;
    padding: ${theme.spacing.xs};
    font-size: ${theme.fontSizes.tiny};
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  resize: vertical;
  min-height: 100px;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.black[300]};
  background: ${theme.colors.black[50]};
  color: ${theme.colors.white};
  font-family: ${theme.fonts.sans};
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  grid-column: 1 / -1;
`;

const Checkbox = styled.input`
  appearance: none;
  width: 16px;
  height: 16px;
  border: ${theme.borders.solidAct} rgba(0, 0, 0, 0.4);
  background: rgba(167, 167, 167, 0.7);
  cursor: pointer;
  
  &:checked {
    background: ${theme.colors.primary};
    border-color: ${theme.colors.primary};
    position: relative;
  }
  
  &:checked::after {
    content: '✓';
    position: absolute;
    top: -2px;
    left: 2px;
    color: ${theme.colors.black};
    font-size: 12px;
    font-weight: bold;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CheckboxLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  cursor: pointer;
`;

const ArtworkPreviewSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.md};
`;

const ArtworkPreview = styled.div`
  width: 140px;
  height: 140px;
  border: ${theme.borders.solid} ${theme.colors.black[300]};
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100px;
    height: 100px;
  }
`;

const ArtworkPlaceholder = styled.div`
  width: 140px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
  text-transform: uppercase;
  text-align: center;
  line-height: 1.2;
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  background: ${theme.colors.gray[50]};

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100px;
    height: 100px;
    font-size: ${theme.fontSizes.tiny};
  }
`;

const ArtworkManagerWrapper = styled.div`
  margin-top: ${theme.spacing.lg};
  padding-top: ${theme.spacing.lg};
  border-top: ${theme.borders.dashed} ${theme.colors.gray[300]};
`;

const StyledModalFooter = styled(ModalFooter)`
  display: flex;
  justify-content: flex-end;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-top: ${theme.borders.solid} ${theme.colors.black[200]};
  position: sticky;
  bottom: 0;
  background: ${theme.colors.fpwhite};
  z-index: 10;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
  
  ${mediaQuery.mobile} {
    flex-direction: row;
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    gap: ${theme.spacing.xs};
    
    button {
      flex: 1;
      min-height: 36px;
      padding: ${theme.spacing.xs} ${theme.spacing.sm};
      font-size: ${theme.fontSizes.small};
    }
  }
`;

const SaveButtonWrapper = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
  
  ${mediaQuery.mobile} {
    width: 100%;
    gap: ${theme.spacing.xs};
  }
`;

const PreviewActions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.md};
  grid-column: 1 / -1;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: stretch;
    gap: ${theme.spacing.sm};
  }
`;

const PreviewInfo = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  
  div {
    margin-bottom: ${theme.spacing.xs};
    
    &:last-child {
      margin-bottom: 0;
    }
  }
  
  strong {
    color: ${theme.colors.black};
    opacity: 0.8;
  }
  
  span {
    opacity: 0.7;
  }
`;

const HelperNote = styled.p`
  margin: 0 0 ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.04em;
  color: rgba(15, 23, 42, 0.6);
  line-height: 1.4;
`;

export default TrackMetadataEditor;
