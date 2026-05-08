import React, { useMemo, useRef, useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { Button } from '@modules/curator/components/ui';
import HandleInput from './HandleInput';
import FeaturedLinksManagerV2 from './FeaturedLinksManagerV2';
import ProfileLinksDisplay from './ProfileLinksDisplay';
import ThemeCustomizerV2 from './ThemeCustomizerV2';
import DisplaySettingsPanelV2 from './DisplaySettingsPanelV2';
import BioPreviewModal from './BioPreviewModal';
import { useBioEditorStore } from '../store/bioEditorStore';
import * as bioService from '../services/bioService';

const BioEditorContainer = styled.div`
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  overflow-x: hidden;
  padding: 0 ${theme.spacing.lg} calc(${theme.spacing.xxl} + ${theme.spacing.lg} + env(safe-area-inset-bottom));

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: 0 ${theme.spacing.sm} calc(${theme.spacing.xxl} + ${theme.spacing.md} + env(safe-area-inset-bottom));
    -webkit-overflow-scrolling: touch;
  }

  @supports (-webkit-touch-callout: none) {
    input,
    textarea,
    select {
      font-size: 16px;
    }
  }
`;

const TabNavigation = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  margin-bottom: ${theme.spacing.md};
  padding-bottom: ${theme.spacing.sm};
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  /* Hide scrollbar but keep functionality */
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const Tab = styled.button`
  flex: 0 0 auto;
  min-width: calc(${theme.spacing.xxl} * 2);
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: none;
  background: ${props => props.$active ? theme.colors.fpwhiteIn : 'transparent'};
  color: ${props => props.$active ? theme.colors.black : 'rgba(0, 0, 0, 0.6)'};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${props => props.$active ? '700' : '500'};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  border-bottom: 3px solid ${props => props.$active ? theme.colors.black : 'transparent'};
  transition: all 0.2s ease;
  position: relative;
  white-space: nowrap;
  min-height: ${theme.touchTarget.min};

  &:hover {
    background: rgba(0, 0, 0, 0.03);
    color: ${theme.colors.black};
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.black};
    outline-offset: -2px;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    font-size: ${theme.fontSizes.small};
    padding: ${theme.spacing.sm};
  }
`;

const TabPanel = styled.div`
  display: ${props => props.$active ? 'block' : 'none'};
  animation: ${props => props.$active ? 'fadeIn 0.3s ease' : 'none'};
  padding-top: ${theme.spacing.sm};

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(${theme.spacing.sm});
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ActionBar = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-top: ${theme.borders.solidThin} rgba(0, 0, 0, 0.1);
  padding: ${theme.spacing.sm} ${theme.spacing.md} calc(${theme.spacing.sm} + env(safe-area-inset-bottom));
  box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.08);
  z-index: 1000;

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.sm} ${theme.spacing.sm} calc(${theme.spacing.sm} + env(safe-area-inset-bottom));
  }

  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    background: ${theme.colors.fpwhite};
  }
`;

const ActionBarContent = styled.div`
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
  justify-content: space-between;

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    gap: ${theme.spacing.sm};
  }
`;

const ActionGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
    flex-direction: column;

    button {
      width: 100%;
      min-height: ${theme.touchTarget.min};
    }
  }
`;

const StatusMessage = styled.div`
  flex: 1;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${props => {
    if (props.$type === 'error') return theme.colors.danger;
    if (props.$type === 'success') return theme.colors.success;
    return 'rgba(0, 0, 0, 0.65)';
  }};
  padding: 0 ${theme.spacing.sm};

  @media (max-width: ${theme.breakpoints.mobile}) {
    text-align: center;
    padding: 0;
    order: -1;
    width: 100%;
  }
`;

const UnsavedIndicator = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  color: ${theme.colors.warning};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;

  &::before {
    content: '*';
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      animation: none;
    }
  }
`;

const BioEditorV2 = () => {
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
    setSelectedCurator,
    lastSavedAt
  } = useBioEditorStore();

  const [activeTab, setActiveTab] = useState('links');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const statusTimerRef = useRef(null);

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
      loadProfileData(handle);
    }
  }, [currentBioProfile, setCurrentBioProfile, setLoading, setError, setSelectedCurator]);

  const showStatus = (type, message) => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
    }
    setStatus({ type, message });
    statusTimerRef.current = setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const handleSaveDraft = async () => {
    if (!isValidForSave()) {
      showStatus('error', 'Please complete all required fields');
      return;
    }

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

  // Auto-save setup
  useEffect(() => {
    const autoSaveCallback = () => {
      if (isValidForSave() && unsavedChanges) {
        handleSaveDraft();
      }
    };

    enableAutoSave(autoSaveCallback, 30000);

    return () => {
      disableAutoSave();
    };
  }, [enableAutoSave, disableAutoSave, unsavedChanges, isValidForSave]);

  useEffect(() => {
    if (error) {
      showStatus('error', error);
    }
  }, [error]);

  useEffect(() => () => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
    }
  }, []);

  const tabs = useMemo(() => ([
    { id: 'links', label: 'Links' },
    { id: 'design', label: 'Design' },
    { id: 'settings', label: 'Settings' }
  ]), []);

  const lastSavedLabel = useMemo(() => {
    if (!lastSavedAt) return '';
    const date = new Date(lastSavedAt);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }, [lastSavedAt]);

  return (
    <BioEditorContainer>
      {/* Handle Input - Always visible at top */}
      <div style={{ marginBottom: theme.spacing.lg }}>
        <HandleInput />
      </div>

      {/* Tab Navigation */}
      <TabNavigation role="tablist" aria-label="Bio editor sections">
        {tabs.map(tab => (
          <Tab
            key={tab.id}
            $active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
            role="tab"
            id={`bio-tab-${tab.id}`}
            aria-controls={`bio-panel-${tab.id}`}
          >
            {tab.label}
          </Tab>
        ))}
      </TabNavigation>

      {/* Tab Panels */}
      <TabPanel $active={activeTab === 'links'} role="tabpanel" id="bio-panel-links" aria-labelledby="bio-tab-links">
        <FeaturedLinksManagerV2 />
        <div style={{ marginTop: theme.spacing.lg }}>
          <ProfileLinksDisplay />
        </div>
      </TabPanel>

      <TabPanel $active={activeTab === 'design'} role="tabpanel" id="bio-panel-design" aria-labelledby="bio-tab-design">
        <ThemeCustomizerV2 />
      </TabPanel>

      <TabPanel $active={activeTab === 'settings'} role="tabpanel" id="bio-panel-settings" aria-labelledby="bio-tab-settings">
        <DisplaySettingsPanelV2 />
      </TabPanel>

      {/* Single Action Bar */}
      <ActionBar>
        <ActionBarContent>
          <StatusMessage $type={status.type} aria-live="polite">
            {status.message || (
              <>
                {isSaving && 'Saving draft...'}
                {!isSaving && isLoading && 'Working...'}
                {!isSaving && !isLoading && unsavedChanges && <UnsavedIndicator>Unsaved changes</UnsavedIndicator>}
                {!isSaving && !isLoading && !unsavedChanges && lastSavedLabel && `Saved ${lastSavedLabel}`}
                {!isSaving && !isLoading && !unsavedChanges && !lastSavedLabel && 'All changes saved'}
              </>
            )}
          </StatusMessage>

          <ActionGroup>
            <Button
              onClick={() => setShowPreviewModal(true)}
              disabled={isLoading}
              $variant="secondary"
              $size="md"
            >
              Preview
            </Button>
            <Button
              onClick={handleSaveDraft}
              disabled={isLoading || isSaving || !isValidForSave()}
              $variant="primary"
              $size="md"
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button
              onClick={handlePublish}
              disabled={isLoading || isSaving || !isValidForPublish()}
              $variant="success"
              $size="md"
            >
              {isLoading ? 'Publishing...' : 'Publish'}
            </Button>
          </ActionGroup>
        </ActionBarContent>
      </ActionBar>

      <BioPreviewModal isOpen={showPreviewModal} onClose={() => setShowPreviewModal(false)} />
    </BioEditorContainer>
  );
};

export default BioEditorV2;
