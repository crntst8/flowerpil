import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, MainBox, Button } from '@shared/styles/GlobalStyles';
import { useBioEditorStore, MAX_FEATURED_LINKS } from '../store/bioEditorStore';
import * as bioService from '../services/bioService';
import { normalizePublicUrl } from '../utils/publicUrl';

const LinksContainer = styled(MainBox)`
  padding: ${theme.spacing.md};
    box-shadow: 0 24px 48px -32px rgba(15, 14, 23, 0.5);
  background: linear-gradient(160deg, rgba(250, 249, 245, 0.96), rgba(234, 233, 228, 0.92));

`;

const SectionHeader = styled.div`
  margin-bottom: ${theme.spacing.md};
  
  h4 {
    margin: 0 0 ${theme.spacing.xs} 0;
    color: ${theme.colors.black};
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.medium};
  }
  
  p {
    margin: 0;
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    opacity: 0.7;
  }
`;

const LinksGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: 1fr; /* single column on mobile */

  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, minmax(0, 1fr)); /* exactly 2 per row */
  }
`;

const LinkContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'isEnabled' && prop !== 'position'
})`
  padding: ${theme.spacing.md};
  border: ${theme.borders.solid} ${props => 
    props.isEnabled ? 'rgba(0, 0, 0, 0.6)' : 'rgba(164, 50, 50, 0.3)'
  };
  background: ${props => 
    props.isEnabled ? 'rgba(185, 189, 203, 0.25)' : 'rgba(255, 255, 255, 0.02)'
  };
  position: relative;
  transition: all 0.2s ease;
  width: 100%;
    box-shadow: 0 24px 48px -32px rgba(15, 14, 23, 0.5);

  box-sizing: border-box;
  
  
  &:hover {
    border-color: ${props => 
      props.isEnabled ? 'rgba(76, 175, 80, 0.8)' : 'rgba(255, 255, 255, 0.5)'
    };
  }
`;

const ContainerHeader = styled.div`
  display: flex;
  justify-content: center;
  border-bottom: ${theme.borders.solidThin};
  margin-bottom: 10px;
  padding: 1px;
  
  
`;

const ContainerTitle = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.h4};
  letter-spacing: -0.9px;
  color: ${theme.colors.black};
  font-weight: light;
`;

const EnableToggle = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== 'isEnabled'
})`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${props => 
    props.isEnabled ? theme.colors.orange : 'rgba(255, 183, 0, 0.4)'
  };
  background: ${props => 
    props.isEnabled ? 'rgba(232, 186, 59, 0.1)' : 'transparent'
  };
  color: rgba(138, 95, 49, 1);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  
  &:hover {
    border-color: ${props => 
      props.isEnabled ? theme.colors.success : 'rgba(157, 98, 98, 0.6)'
    };
    background: ${props => 
      props.isEnabled ? 'rgba(173, 141, 78, 0.15)' : 'rgba(255, 255, 255, 0.05)'
    };
  }
`;

const FormField = styled.div`
  margin-bottom: ${theme.spacing.sm};
`;

const Label = styled.label`
  display: block;
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.xs};
  opacity: 0.8;
`;

const Input = styled.input.withConfig({
  shouldForwardProp: (prop) => prop !== 'disabled'
})`
  width: 100%;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.4);
  background: ${theme.colors.input};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  opacity: ${props => props.disabled ? 0.5 : 1};
  
  &::placeholder {
    color: rgba(86, 76, 76, 0.5);
  }
  
  &:focus {
    outline: none;
    border-color: black;

  }
  
  &:disabled {
    cursor: not-allowed;
  }
`;

const TextArea = styled.textarea.withConfig({
  shouldForwardProp: (prop) => prop !== 'disabled'
})`
  width: 100%;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.4);
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  min-height: 60px;
  resize: vertical;
  opacity: ${props => props.disabled ? 0.5 : 1};
  
  &::placeholder {
    color: rgba(93, 86, 86, 0.5);
  }
  
  &:focus {
    outline: none;
    border-color: black;
  }
  
  &:disabled {
    cursor: not-allowed;
  }
`;

const Select = styled.select.withConfig({
  shouldForwardProp: (prop) => prop !== 'disabled'
})`
  width: 100%;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} black;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  letter-spacing: -0.9px;
  font-size: ${theme.fontSizes.tiny};
  opacity: ${props => props.disabled ? 0.5 : 1};
  
  option {
    background: ${theme.colors.black};
    color: ${theme.colors.white};
  }
  
  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
  
  &:disabled {
    cursor: not-allowed;
  }
`;

const ImageUploadContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const FileInput = styled.input.withConfig({
  shouldForwardProp: (prop) => prop !== 'disabled'
})`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} black;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  opacity: ${props => props.disabled ? 0.5 : 1};
  
  &::file-selector-button {
    background: rgba(159, 152, 152, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: ${theme.colors.black};
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    margin-right: ${theme.spacing.sm};
    cursor: pointer;
  }
  
  &:disabled {
    cursor: not-allowed;
  }
`;

const ImagePreview = styled.div`
  width: 100%;
  height: 80px;
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
  position: relative;
  
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: cover;
  }
`;

const PreviewPlaceholder = styled.div`
  color: rgba(76, 64, 64, 0.5);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-align: center;
`;

const UploadOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(2px);
  display: ${props => props.show ? 'flex' : 'none'};
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.xs};
  z-index: 10;
`;

const UploadSpinner = styled.div`
  width: 24px;
  height: 24px;
  border: 2px solid rgba(71, 159, 242, 0.2);
  border-top-color: ${theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const UploadText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.primary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const DisabledOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  pointer-events: none;
`;

const LinkActions = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  margin-top: ${theme.spacing.sm};
    margin-bottom: ${theme.spacing.md};

`;

const RemoveButton = styled.button`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed} #ef4444;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  &:hover {
    background: rgba(239, 68, 68, 0.2);
  }
`;

const AddLinkSection = styled.div`
  margin-top: ${theme.spacing.lg};
  text-align: center;
`;

const AddButton = styled.button`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.dashed} rgba(76, 175, 80, 0.6);
  background: rgba(76, 175, 80, 0.1);
  color: #3bb869ff;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  &:hover {
    background: rgba(76, 175, 80, 0.2);
    border-color: #4ade80;
  }
`;

const WarningText = styled.p`
  margin: ${theme.spacing.sm} 0 0;
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.orange};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const LinkTypeSelect = styled.select`
  width: 100%;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} black;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.sm};
  
  option {
    background: ${theme.colors.fpwhiteIn};
    color: ${theme.colors.black};
  }
  
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
  }
`;

const FeaturedLinksManager = () => {
  const {
    featuredLinks,
    updateFeaturedLink,
    toggleFeaturedLink,
    addFeaturedLink,
    removeFeaturedLink,
    selectedCurator
  } = useBioEditorStore();

  const [uploadingImages, setUploadingImages] = useState({});
  const [curatorPlaylists, setCuratorPlaylists] = useState([]);

  // Load curator playlists when selected curator changes
  useEffect(() => {
    const loadCuratorPlaylists = async () => {
      if (!selectedCurator?.id) return;

      try {
        const response = await fetch(`/api/v1/playlists?curator_id=${selectedCurator.id}`);
        const data = response.ok ? await response.json() : { data: [] };
        setCuratorPlaylists(Array.isArray(data.data) ? data.data : []);
      } catch (error) {
        console.error('Error loading curator playlists:', error);
        setCuratorPlaylists([]);
      }
    };

    loadCuratorPlaylists();
  }, [selectedCurator?.id]);

  const handleFieldChange = (position, field, value) => {
    updateFeaturedLink(position, { [field]: value });
  };

  const handleToggleLink = (position) => {
    toggleFeaturedLink(position);
  };

  const handleImageUpload = async (position, file) => {
    if (!file) return;

    // Validate file
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
      // Upload to server and get permanent URL
      const result = await bioService.uploadBioImage(file);
      
      // Use the primary_url from the upload result
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

  const getLinkTypeOptions = () => [
    { value: 'url', label: 'External Link' },
    { value: 'playlist', label: 'Playlist' }
  ];

  const renderLinkContainer = (link) => {
    const isDisabled = !link.is_enabled;
    const isUploading = uploadingImages[link.position];

    return (
      
      <LinkContainer
      
        key={link.position}
        position={link.position}
        isEnabled={link.is_enabled}
      >
        
        <ContainerHeader>
          
      {/* Remove button */}
        <LinkActions>
                  <EnableToggle
            isEnabled={link.is_enabled}
            onClick={() => handleToggleLink(link.position)}
          >
            {link.is_enabled ? 'HIDE FROM BIO' : 'SHOW'}
          </EnableToggle>
          <RemoveButton
            onClick={() => removeFeaturedLink(link.position)}
            disabled={isDisabled}
            title="Remove this featured link"
          >
            DELETE
          </RemoveButton>
          
        </LinkActions>
        </ContainerHeader>

        <FormField>
          <Label>Link Type</Label>
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
            disabled={isDisabled}
          >
            {getLinkTypeOptions().map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>

        {/* Dynamic Title Field - dropdown for playlist/show/release, text input for others */}
        <FormField>
          <Label>Title *</Label>
          {link.link_type === 'playlist' && curatorPlaylists.length > 0 ? (
            <LinkTypeSelect
              value={link.playlist_id || ''}
              onChange={(e) => {
                const selectedPlaylist = curatorPlaylists.find(p => p.id === parseInt(e.target.value, 10));
                const playlistId = parseInt(e.target.value);
                const playlistUrl = selectedPlaylist?.id
                  ? normalizePublicUrl(`/playlists/${selectedPlaylist.id}`)
                  : '';

                // Update all playlist fields in one batch to ensure consistency
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
              disabled={isDisabled}
            >
              <option value="">Select a playlist...</option>
              {curatorPlaylists.map(playlist => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.title}
                </option>
              ))}
            </LinkTypeSelect>
          ) : (
            <Input
              type="text"
              value={link.title || ''}
              onChange={(e) => handleFieldChange(link.position, 'title', e.target.value)}
              placeholder="Link title"
              disabled={isDisabled}
              maxLength={100}
            />
          )}
        </FormField>

        <FormField>
          <Label>Description</Label>
          <TextArea
            value={link.description || ''}
            onChange={(e) => handleFieldChange(link.position, 'description', e.target.value)}
            placeholder="Optional description"
            disabled={isDisabled}
            maxLength={200}
          />
        </FormField>

        {/* URL Field - read-only for playlist/show/release, editable for url type */}
        <FormField>
          <Label>URL *</Label>
          <Input
            type="url"
            value={link.url || ''}
            onChange={(e) => handleFieldChange(link.position, 'url', e.target.value)}
            placeholder={link.link_type === 'url' ? "https://example.com" : "Auto-generated from selection"}
            disabled={isDisabled || link.link_type === 'playlist'}
            readOnly={link.link_type === 'playlist'}
          />
        </FormField>

        <FormField>
          <Label>
            Image 
            {link.link_type === 'playlist' && link.image_url ? 
              ' (Auto-loaded)' : ' (Optional)'}
          </Label>
          {link.link_type === 'playlist' && link.image_url && (
            <div style={{ 
              fontSize: '11px', 
              color: 'rgba(76, 175, 80, 0.8)', 
              marginBottom: '4px',
              fontFamily: 'monospace'
            }}>
              Image automatically loaded from {link.link_type}. Upload to override.
            </div>
          )}
          <ImageUploadContainer>
            <FileInput
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(link.position, e.target.files[0])}
              disabled={isDisabled || isUploading}
            />
            <ImagePreview>
              {link.image_url ? (
                <>
                  <img src={link.image_url} alt={link.title || 'Link preview'} />
                  <UploadOverlay show={isUploading}>
                    <UploadSpinner />
                    <UploadText>Uploading...</UploadText>
                  </UploadOverlay>
                </>
              ) : isUploading ? (
                <UploadOverlay show={true}>
                  <UploadSpinner />
                  <UploadText>Uploading...</UploadText>
                </UploadOverlay>
              ) : (
                <PreviewPlaceholder>No image</PreviewPlaceholder>
              )}
            </ImagePreview>
          </ImageUploadContainer>
        </FormField>

  

        {isDisabled && (
          <DisabledOverlay>
            Press SHOW to re-enable this container
          </DisabledOverlay>
        )}
        
      </LinkContainer>
    );
  };

  return (
    <LinksContainer>
      <SectionHeader>
        <h4>Featured Links</h4>
        <p>The first three links display with images. Additional links use a condensed layout without previews.</p>
      </SectionHeader>

      <LinksGrid>
        {featuredLinks.map(renderLinkContainer)}
      </LinksGrid>
      
      <AddLinkSection>
        <AddButton onClick={addFeaturedLink} disabled={featuredLinks.length >= MAX_FEATURED_LINKS}>
          + Add Featured Link ({featuredLinks.length}/{MAX_FEATURED_LINKS})
        </AddButton>
        {featuredLinks.length >= 3 && (
          <WarningText>
            More than three links switches the public page to a condensed layout.
          </WarningText>
        )}
      </AddLinkSection>
    </LinksContainer>
  );
};

export default FeaturedLinksManager;
