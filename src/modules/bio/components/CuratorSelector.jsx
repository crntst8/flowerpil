import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox } from '@shared/styles/GlobalStyles';
import { useBioEditorStore } from '../store/bioEditorStore';
import * as bioService from '../services/bioService';

const CuratorContainer = styled(DashedBox)`
  padding: ${theme.spacing.md};
`;

const SectionHeader = styled.div`
  margin-bottom: ${theme.spacing.md};
  
  h4 {
    margin: 0 0 ${theme.spacing.xs} 0;
    color: ${theme.colors.white};
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.medium};
  }
  
  p {
    margin: 0;
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.white};
    opacity: 0.7;
  }
`;

const SelectContainer = styled.div`
  position: relative;
  margin-bottom: ${theme.spacing.md};
`;

const CuratorSelect = styled.select.withConfig({
  shouldForwardProp: (prop) => prop !== 'isLoading'
})`
  width: 100%;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.7);
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: ${props => props.isLoading ? 'wait' : 'pointer'};
  
  option {
    background: ${theme.colors.black};
    color: ${theme.colors.white};
    
    &:disabled {
      color: rgba(255, 255, 255, 0.5);
      font-style: italic;
    }
  }
  
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CuratorPreview = styled.div`
  padding: ${theme.spacing.sm};
  background: rgba(255, 255, 255, 0.05);
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.2);
  margin-bottom: ${theme.spacing.md};
`;

const PreviewHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.sm};
`;

const CuratorAvatar = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'hasImage'
})`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${props => props.hasImage ? 'transparent' : 'rgba(255, 255, 255, 0.1)'};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const AvatarPlaceholder = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(255, 255, 255, 0.5);
`;

const CuratorInfo = styled.div`
  flex: 1;
`;

const CuratorName = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  font-weight: 500;
`;

const CuratorType = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  opacity: 0.7;
  text-transform: capitalize;
`;

const ProfileLinksPreview = styled.div`
  margin-top: ${theme.spacing.sm};
`;

const ProfileLinksHeader = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  opacity: 0.7;
  margin-bottom: ${theme.spacing.xs};
`;

const ProfileLinksList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
`;

const ProfileLinkItem = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'linkType'
})`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  background: ${props => 
    props.linkType === 'streaming' ? 'rgba(76, 175, 80, 0.1)' :
    props.linkType === 'professional' ? 'rgba(33, 150, 243, 0.1)' :
    props.linkType === 'social' ? 'rgba(156, 39, 176, 0.1)' :
    'rgba(255, 255, 255, 0.1)'
  };
  border: ${theme.borders.dashed} ${props => 
    props.linkType === 'streaming' ? 'rgba(76, 175, 80, 0.3)' :
    props.linkType === 'professional' ? 'rgba(33, 150, 243, 0.3)' :
    props.linkType === 'social' ? 'rgba(156, 39, 176, 0.3)' :
    'rgba(255, 255, 255, 0.3)'
  };
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
`;

const LinkIcon = styled.span`
  font-size: 12px;
`;

const LinkLabel = styled.span`
  text-transform: capitalize;
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.md};
  text-align: center;
  color: ${theme.colors.white};
  opacity: 0.5;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.2);
`;

const LoadingState = styled.div`
  padding: ${theme.spacing.sm};
  text-align: center;
  color: ${theme.colors.white};
  opacity: 0.7;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const ErrorState = styled.div`
  padding: ${theme.spacing.sm};
  color: ${theme.colors.danger};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

import PlatformIcon from '@shared/components/PlatformIcon';

const CuratorSelector = () => {
  const {
    curators,
    selectedCurator,
    profileLinks,
    setCurators,
    setSelectedCurator
  } = useBioEditorStore();

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [error, setError] = useState(null);
  const [existingBioProfiles, setExistingBioProfiles] = useState([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);

  // Load curators on mount
  useEffect(() => {
    const loadCurators = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch curators from existing API endpoint
        const response = await fetch('/api/v1/curators', { credentials: 'include' });
        if (!response.ok) {
          throw new Error('Failed to load curators');
        }
        
        const result = await response.json();
        setCurators(result.data || []);
      } catch (err) {
        setError(err.message);
        console.error('Failed to load curators:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const loadExistingBioProfiles = async () => {
      setIsLoadingProfiles(true);
      try {
        // Load existing bio profiles from admin API
        const response = await fetch('/api/v1/admin/bio-pages');
        if (response.ok) {
          const result = await response.json();
          setExistingBioProfiles(result.data?.bio_pages || []);
        }
      } catch (err) {
        console.error('Failed to load existing bio profiles:', err);
      } finally {
        setIsLoadingProfiles(false);
      }
    };

    if (curators.length === 0) {
      loadCurators();
    }
    loadExistingBioProfiles();
  }, [curators.length, setCurators]);

  // Update profile links when curator changes
  useEffect(() => {
    const { updateProfileLinks } = useBioEditorStore.getState();
    updateProfileLinks(selectedCurator);
    setIsLoadingLinks(false);
  }, [selectedCurator]);

  const handleCuratorChange = (e) => {
    const curatorId = parseInt(e.target.value, 10);
    const curator = curators.find(c => c.id === curatorId);
    setSelectedCurator(curator || null);
  };

  const loadExistingBioProfile = async (handle) => {
    try {
      const { setCurrentBioProfile } = useBioEditorStore.getState();
      const data = await bioService.getBioProfileByHandle(handle);
      const profile = data?.profile;

      if (profile) {
        setCurrentBioProfile(profile);

        const curator =
          curators.find((c) => c.id === profile.curator_id) ||
          data?.curator ||
          null;

        if (curator) {
          setSelectedCurator(curator);
        }
      }
    } catch (error) {
      console.error('Failed to load bio profile:', error);
      setError(`Failed to load profile: ${error.message}`);
    }
  };

  const renderProfileLinks = () => {
    if (isLoadingLinks) {
      return <LoadingState>Loading profile links...</LoadingState>;
    }

    if (!profileLinks || profileLinks.length === 0) {
      return (
        <EmptyState>
          No profile links available for this curator
        </EmptyState>
      );
    }

    return (
      <ProfileLinksList>
        {profileLinks.map((link, index) => (
          <ProfileLinkItem key={index} linkType={link.category}>
            <LinkIcon>
              <PlatformIcon platform={link.platform} size={20} />
            </LinkIcon>
            <LinkLabel>{link.label}</LinkLabel>
          </ProfileLinkItem>
        ))}
      </ProfileLinksList>
    );
  };

  return (
    <CuratorContainer>
      <SectionHeader>
        <h4>Select Curator</h4>
        <p>Choose the curator this bio page represents</p>
      </SectionHeader>

      {error && (
        <ErrorState>
          Error loading curators: {error}
        </ErrorState>
      )}

      <SelectContainer>
        <CuratorSelect
          value={selectedCurator?.id || ''}
          onChange={handleCuratorChange}
          isLoading={isLoading}
          disabled={isLoading}
        >
          <option value="" disabled>
            {isLoading ? 'Loading curators...' : 'Select a curator'}
          </option>
          {curators.map((curator) => (
            <option key={curator.id} value={curator.id}>
              {curator.name} ({curator.profile_type || 'Unknown'})
            </option>
          ))}
        </CuratorSelect>
      </SelectContainer>

      {selectedCurator && (
        <CuratorPreview>
          <PreviewHeader>
            <CuratorAvatar hasImage={!!selectedCurator.profile_image}>
              {selectedCurator.profile_image ? (
                <img 
                  src={selectedCurator.profile_image} 
                  alt={selectedCurator.name}
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <AvatarPlaceholder>
                  {selectedCurator.name?.charAt(0)?.toUpperCase() || '?'}
                </AvatarPlaceholder>
              )}
            </CuratorAvatar>
            <CuratorInfo>
              <CuratorName>{selectedCurator.name}</CuratorName>
              <CuratorType>{selectedCurator.profile_type || 'Curator'}</CuratorType>
            </CuratorInfo>
          </PreviewHeader>

          <ProfileLinksPreview>
            <ProfileLinksHeader>
              Profile Links (will appear as buttons):
            </ProfileLinksHeader>
            {renderProfileLinks()}
          </ProfileLinksPreview>
        </CuratorPreview>
      )}

      {/* Existing Bio Profiles Section */}
      {existingBioProfiles.length > 0 && (
        <div>
          <SectionHeader>
            <h4>Load Existing Bio Profile</h4>
            <p>Load a previously created bio profile for editing</p>
          </SectionHeader>
          
          {isLoadingProfiles ? (
            <LoadingState>Loading existing bio profiles...</LoadingState>
          ) : (
            <SelectContainer>
              <CuratorSelect 
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    loadExistingBioProfile(e.target.value);
                  }
                }}
              >
                <option value="">Select existing bio profile...</option>
                {existingBioProfiles.map((profile) => (
                  <option key={profile.handle} value={profile.handle}>
                    {profile.handle} - {profile.curator_name} {profile.is_published ? '(Published)' : '(Draft)'}
                  </option>
                ))}
              </CuratorSelect>
            </SelectContainer>
          )}
        </div>
      )}
    </CuratorContainer>
  );
};

export default CuratorSelector;
