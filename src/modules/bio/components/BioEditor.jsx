import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, Container, DashedBox, Button } from '@shared/styles/GlobalStyles';
import HandleInput from './HandleInput';
import FeaturedLinksManager from './FeaturedLinksManager';
import ProfileLinksDisplay from './ProfileLinksDisplay';
import ThemeCustomizer from './ThemeCustomizer';
import DisplaySettingsPanel from './DisplaySettingsPanel';
import BioPreviewModal from './BioPreviewModal';
import { useBioEditorStore } from '../store/bioEditorStore';
import * as bioService from '../services/bioService';
import { getPublicSiteBaseUrl, normalizePublicUrl } from '../utils/publicUrl';

const BioEditorContainer = styled.div`
  width: 100%;
  padding-bottom: 140px;
`;

const BioEditorGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.xl};
`;

const EditorPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;





const ActionBar = styled(DashedBox)`
  display: flex;
  gap: ${theme.spacing.md};
  justify-content: flex-end;
  flex-wrap: wrap;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    justify-content: stretch;
    
    button {
      flex: 1;
    }
  }
`;

const PinnedActionsBar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: ${theme.spacing.sm};
  padding: 0 ${theme.spacing.lg};
  z-index: 1200;
  pointer-events: none;
  display: flex;
  justify-content: center;
  align-items: stretch;
  flex-direction: column;
  gap: ${theme.spacing.sm};

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: 0 ${theme.spacing.md};
    bottom: ${theme.spacing.xs};
  }
`;

const PinnedActionsContent = styled.div`
  pointer-events: auto;
  margin: 0 auto;
  width: min(960px, 100%);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(24px);
  border: 2px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  box-shadow:
    0 18px 42px rgba(0, 0, 0, 0.18),
    0 6px 18px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.md};

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};
    gap: ${theme.spacing.sm};
    border-radius: 6px;
  }
`;

const PinnedActionsStatus = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$type' })`
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: center;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.medium};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 6px;
  border: 1px solid ${props =>
    props.$type === 'error' ? 'rgba(229, 62, 62, 0.4)' :
    props.$type === 'success' ? 'rgba(0, 158, 55, 0.4)' :
    'rgba(71, 159, 242, 0.35)'};
  background: ${props =>
    props.$type === 'error' ? 'rgba(255, 72, 66, 0.16)' :
    props.$type === 'success' ? 'rgba(146, 240, 184, 0.18)' :
    'rgba(255, 255, 255, 0.58)'};
  color: ${props =>
    props.$type === 'error' ? theme.colors.danger :
    props.$type === 'success' ? theme.colors.success :
    theme.colors.black};

  .hint {
    font-weight: ${theme.fontWeights.normal};
    opacity: 0.75;
  }
`;

const PinnedActionsButtons = styled.div`
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: ${theme.spacing.sm};

  button {
    flex: 1 1 160px;
    min-width: 140px;
    font-weight: ${theme.fontWeights.semibold};
    backdrop-filter: blur(4px);
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    button {
      flex: 1 1 120px;
    }
  }
`;

import { getPlatformEmoji } from '@shared/components/PlatformIcon';

// Platform icon mapping for preview
const getPlatformIcon = (platform) => {
  return getPlatformEmoji(platform);
};

// Generate standalone HTML for preview
const generatePreviewHTML = (data) => {
  const { profile, curator, profileLinks, featuredLinks, themePalette } = data;
  const displaySettings = profile.display_settings || {};
  const publicBaseUrl = getPublicSiteBaseUrl();
  
  const profilePictureHTML = displaySettings.showProfilePicture && curator.profile_image ? `
    <div style="
      width: 110px;
      height: 110px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      margin: 1rem auto;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.04);
      box-shadow:
        0 18px 38px -24px rgba(0, 0, 0, 0.9),
        0 24px 60px -32px rgba(0, 0, 0, 0.8),
        inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    ">
      <img src="${curator.profile_image}" alt="${curator.name}" style="width: 100%; height: 100%; object-fit: cover;" />
    </div>
  ` : '';

  const featuredLinksHTML = displaySettings.showFeaturedLinks && featuredLinks.length > 0 ? `
    <div style="margin: 1.25rem 0.75rem 0;">
      ${featuredLinks.map(link => {
        const normalizedUrl = link.url ? normalizePublicUrl(link.url) : '';
        const href = normalizedUrl || '#';
        const isInternal = normalizedUrl && normalizedUrl.startsWith(publicBaseUrl);
        const linkTarget = isInternal ? '_self' : '_blank';
        const linkRel = isInternal ? '' : 'noopener noreferrer';
        const displayUrl = normalizedUrl
          ? normalizedUrl.replace(/^https?:\/\//, '').replace(/^www\./, '')
          : '';

        return `
        <a href="${href}" target="${linkTarget}"${linkRel ? ` rel="${linkRel}"` : ''} style="
          display: flex;
          gap: 1rem;
          align-items: center;
          padding: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.35);
          margin-bottom: 1rem;
          text-decoration: none;
          color: inherit;
          border-radius: 12px;
          box-shadow:
            0 8px 22px -18px rgba(0, 0, 0, 0.9),
            0 16px 38px -28px rgba(0, 0, 0, 0.75),
            inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        ">
          ${link.image_url ? `
            <div style="
              width: 80px;
              height: 80px;
              border-radius: 12px;
              border: 1px solid rgba(255, 255, 255, 0.15);
              overflow: hidden;
              background: rgba(255, 255, 255, 0.05);
              flex-shrink: 0;
              box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
            ">
              <img src="${link.image_url}" alt="${link.title}" style="width: 100%; height: 100%; object-fit: cover; object-position: center; display: block;" />
            </div>
          ` : ''}
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
            <h3 style="margin: 0 0 0.25rem 0; font-size: 0.9rem; font-weight: 700; letter-spacing: 0.02em;">${link.title}</h3>
            ${link.description ? `<p style="margin: 0 0 0.35rem 0; font-size: 0.75rem; opacity: 0.82; line-height: 1.4;">${link.description}</p>` : ''}
            ${displayUrl ? `<div style="font-size: 0.7rem; opacity: 0.55; letter-spacing: 0.04em; text-transform: uppercase;">${displayUrl}</div>` : ''}
          </div>
        </a>
        `;
      }).join('')}
    </div>
  ` : '';

  // Social links section with home button - matches live preview exactly
  const socialLinksHTML = `
    <div style="
      display: flex;
      justify-content: space-between;
      gap: 0.25rem;
    ">
      ${displaySettings.showSocialLinks && profileLinks && profileLinks.length > 0 ? 
        profileLinks.map(link => `
          <a href="${normalizePublicUrl(link.url)}" target="_blank" rel="noopener noreferrer" style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-decoration: none;
            color: inherit;
            border: 0.5px dashed rgba(255,255,255,0.3);
            padding: 0.5rem 0.25rem;
            text-align: center;
            flex: 1;
            min-width: 0;
            max-width: 80px;
            height: 80px;
          ">
            <div style="
              width: 40px;
              height: 40px;
              margin-bottom: 0.125rem;
              opacity: 0.8;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 32px;
              flex-shrink: 0;
            ">
              ${getPlatformIcon(link.platform)}
            </div>
            <span style="
              font-size: 0.5rem;
              text-transform: uppercase;
              font-weight: bold;
              opacity: 0.7;
              line-height: 1;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 100%;
            ">${link.platform}</span>
          </a>
        `).join('') : ''
      }
      
      <!-- Home button always included -->
      <a href="${normalizePublicUrl(`/curator/${profile.handle || 'preview'}`)}" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        color: inherit;
        border: 1px solid rgba(255,255,255,0.18);
        padding: 0.5rem 0.25rem;
        text-align: center;
        flex: 1;
        min-width: 0;
        max-width: 80px;
        height: 80px;
        border-radius: 10px;
        box-shadow:
          0 8px 20px -18px rgba(0, 0, 0, 0.85),
          inset 0 0 0 1px rgba(255, 255, 255, 0.04);
      ">
        <div style="
          width: 40px;
          height: 40px;
          margin-bottom: 0.125rem;
          opacity: 0.8;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <img src="/logo.png" alt="Flowerpil" style="width: 90%; height: 90%; object-fit: contain;" />
        </div>
        <span style="
          font-size: 0.5rem;
          text-transform: uppercase;
          font-weight: bold;
          opacity: 0.7;
          line-height: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        ">Home</span>
      </a>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${profile.handle || curator.name} - pil.bio Preview</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="preload" href="/fonts/PaperMono-Regular.woff2" as="font" type="font/woff2" crossorigin>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          background: ${themePalette.background || '#000000'}; 
          color: ${themePalette.text || '#ffffff'}; 
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
        }
        .container {
          width: 100%;
          max-width: 640px;
          min-height: 90vh;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.48);
          box-shadow:
            0 36px 70px -48px rgba(0, 0, 0, 0.85),
            0 32px 80px -60px rgba(0, 0, 0, 0.9),
            inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        }
        .header {
          padding: 1.25rem 1rem 0.85rem;
          text-align: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
        }
        .title {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-weight: 700;
          font-size: 1.5rem;
          margin: 0 0 0.25rem 0;
          line-height: 1.2;
        }
        .type {
          font-family: 'Paper Mono', monospace;
          font-size: 0.75rem;
          opacity: 0.75;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.2rem 0.5rem;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.05);
          border-radius: 999px;
        }
        .bio {
          font-family: 'Paper Mono', monospace;
          font-size: 0.875rem;
          opacity: 0.9;
          line-height: 1.4;
          max-width: 600px;
          margin: 0.5rem auto 0;
        }
        .location {
          font-family: 'Paper Mono', monospace;
          font-size: 0.75rem;
          opacity: 0.7;
          margin-top: 0.25rem;
        }
        .content {
          padding: 1.2rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .footer {
          padding: 0.75rem 0;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          text-align: center;
          font-size: 0.75rem;
          opacity: 0.7;
          margin-top: auto;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
        }
        .close-button {
          position: fixed;
          top: 1rem;
          right: 1rem;
          background: rgba(0, 0, 0, 0.8);
          color: black;
          border: 1px dashed rgba(255, 255, 255, 0.3);
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-family: 'Paper Mono', monospace;
          font-size: 0.875rem;
          z-index: 1000;
          transition: all 0.2s ease;
        }
        .close-button:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: white;
        }
      </style>
    </head>
    <body>
      <div class="close-button" onclick="window.close()">× Close</div>
      <div class="container">
        <div class="header">
          ${profilePictureHTML}
          <div class="type">${curator.profile_type || 'Curator'}</div>
          <h1 class="title">${curator.name}</h1>
          ${displaySettings.showBio && (profile.draft_content?.customBio || curator.bio_short) ? `
            <div class="bio">${profile.draft_content?.customBio || curator.bio_short}</div>
          ` : ''}
          ${displaySettings.showLocation && curator.location ? `
            <div class="location">${curator.location}</div>
          ` : ''}
        </div>
        <div class="content">
          ${featuredLinksHTML}
          ${socialLinksHTML}
        </div>
        <div class="footer">
          <div>
            Powered by <a href="https://pil.bio" target="_blank" rel="noopener noreferrer">pil.bio</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

const BioEditor = () => {
  const {
    currentBioProfile,
    isLoading,
    isSaving,
    error,
    unsavedChanges,
    setLoading,
    setSaving,
    setError,
    clearError,
    markAsSaved,
    enableAutoSave,
    disableAutoSave,
    isValidForSave,
    isValidForPublish,
    setCurrentBioProfile,
    setSelectedCurator
  } = useBioEditorStore();

  const [status, setStatus] = useState({ type: '', message: '' });

  // Load profile from URL parameters
  useEffect(() => {
    const loadProfileData = async (rawHandle) => {
      try {
        const normalizedHandle = (rawHandle || '').trim().toLowerCase();
        if (!normalizedHandle) {
          setError('Missing bio handle');
          return;
        }

        setLoading(true);

        const data = await bioService.getBioProfileByHandle(normalizedHandle);
        const profile = data?.profile;

        if (profile) {
          setCurrentBioProfile(profile);

          const { curators: availableCurators } = useBioEditorStore.getState();
          const fallbackCurator = availableCurators?.find?.((curator) => curator.id === profile.curator_id);
          const curator = fallbackCurator || data?.curator || null;

          if (curator) {
            setSelectedCurator(curator);
          }

          console.log('BioEditor: Loaded profile data for handle:', normalizedHandle);
        } else {
          setError(`Bio profile '${normalizedHandle}' not found`);
        }
      } catch (error) {
        console.error('Failed to load bio profile:', error);
        setError(`Failed to load profile: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    const urlParams = new URLSearchParams(window.location.search);
    const handle = urlParams.get('handle');
    
    if (handle && (!currentBioProfile || currentBioProfile.handle !== handle)) {
      console.log('BioEditor: Loading profile for handle:', handle);
      loadProfileData(handle);
    }
  }, [currentBioProfile, setCurrentBioProfile, setLoading, setError, setSelectedCurator]);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const handleSaveDraft = async () => {
    if (!isValidForSave()) {
      showStatus('error', 'Please complete all required fields');
      return;
    }

    // Additional safety check for curator_id
    if (!currentBioProfile.curator_id) {
      showStatus('error', 'Please select a curator first');
      return;
    }

    setSaving(true);
    try {
      let result;
      if (currentBioProfile.id) {
        result = await bioService.updateBioProfile(currentBioProfile.id, currentBioProfile);
      } else {
        result = await bioService.createBioProfile(currentBioProfile);
      }

      const { setCurrentBioProfile, featuredLinks: latestFeaturedLinks } = useBioEditorStore.getState();
      const rawProfile = result.profile || result;

      // Preserve locally edited featured links to avoid clearing in-flight edits
      let draftContent = rawProfile?.draft_content || {};
      if (typeof draftContent === 'string') {
        try {
          draftContent = JSON.parse(draftContent || '{}');
        } catch (_) {
          draftContent = {};
        }
      }

      const mergedProfile = {
        ...rawProfile,
        draft_content: {
          ...(draftContent || {}),
          featuredLinks: latestFeaturedLinks || []
        }
      };

      setCurrentBioProfile(mergedProfile);
      markAsSaved();
      showStatus('success', 'Draft saved successfully');
    } catch (err) {
      showStatus('error', `Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!isValidForPublish()) {
      showStatus('error', 'Please complete all required fields and save draft first');
      return;
    }

    setLoading(true);
    try {
      await bioService.publishBioProfile(currentBioProfile.id);
      showStatus('success', 'Bio page published successfully');
    } catch (err) {
      showStatus('error', `Failed to publish: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    const { resetBioProfile } = useBioEditorStore.getState();
    resetBioProfile();
    clearError();
    showStatus('success', 'Editor reset');
  };

  // Auto-save setup
  useEffect(() => {
    const autoSaveCallback = () => {
      if (isValidForSave() && unsavedChanges) {
        handleSaveDraft();
      }
    };

    enableAutoSave(autoSaveCallback, 30000); // Auto-save every 30 seconds

    return () => {
      disableAutoSave();
    };
  }, [enableAutoSave, disableAutoSave, unsavedChanges, isValidForSave]);

  useEffect(() => {
    if (error) {
      showStatus('error', error);
    }
  }, [error]);

  const [showPreviewModal, setShowPreviewModal] = useState(false);

  return (
    <BioEditorContainer>
      <BioEditorGrid>
        <EditorPanel>
          <HandleInput />
          <FeaturedLinksManager />
          <ProfileLinksDisplay />
          <DisplaySettingsPanel />
          <ThemeCustomizer />
        </EditorPanel>
      </BioEditorGrid>

      <ActionBar>
        <Button 
          onClick={handleSaveDraft}
          disabled={isLoading || isSaving || !isValidForSave()}
          variant="primary"
        >
          {isSaving ? 'Saving...' : 'Save Draft'}
          {unsavedChanges && !isSaving && ' *'}
        </Button>
        
        <Button 
          onClick={handlePublish}
          disabled={isLoading || isSaving || !isValidForPublish()}
          variant="success"
        >
          Publish
        </Button>
      </ActionBar>

      <PinnedActionsBar>
        <PinnedActionsContent>
          <PinnedActionsStatus $type={status.type}>
            {status.message && <span>{status.message}</span>}
            <span className="hint">Press Save to capture edits, then Publish to push the bio live.</span>
          </PinnedActionsStatus>
          <PinnedActionsButtons>
            <Button 
              onClick={() => setShowPreviewModal(true)}
              disabled={false}
            >
              Preview
            </Button>
            <Button 
              onClick={handleSaveDraft}
              disabled={isLoading || isSaving || !isValidForSave()}
              variant="primary"
            >
              {isSaving ? 'Saving…' : `Save Draft${unsavedChanges && !isSaving ? ' *' : ''}`}
            </Button>
            <Button 
              onClick={handlePublish}
              disabled={isLoading || isSaving || !isValidForPublish()}
              variant="success"
            >
              {isLoading ? 'Publishing…' : 'Publish'}
            </Button>
            <Button 
              onClick={handleReset}
              disabled={isLoading || isSaving}
              variant="danger"
            >
              Reset
            </Button>
          </PinnedActionsButtons>
        </PinnedActionsContent>
      </PinnedActionsBar>

      <BioPreviewModal isOpen={showPreviewModal} onClose={() => setShowPreviewModal(false)} />
    </BioEditorContainer>
  );
};

export default BioEditor;
