import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { useBioEditorStore } from '../store/bioEditorStore';
import {
  ModalRoot,
  ModalSurface,
  ModalCloseButton,
} from '@shared/components/Modal';

const StyledModalSurface = styled(ModalSurface)`
  position: relative;
  width: min(640px, 96vw);
  height: min(90vh, 96vh);
  background: #0b0b0b;
  border: ${theme.borders.solid} ${theme.colors.black};
  display: flex;
  flex-direction: column;
  padding: 0;
`;

const PreviewLoading = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.7);
  color: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const Spinner = styled.div`
  width: calc(${theme.spacing.lg} + ${theme.spacing.sm});
  height: calc(${theme.spacing.lg} + ${theme.spacing.sm});
  border: ${theme.borders.solid} rgba(255, 255, 255, 0.2);
  border-top-color: ${theme.colors.fpwhite};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const Iframe = styled.iframe`
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
`;

const BioPreviewModal = ({ isOpen, onClose }) => {
  const {
    currentBioProfile,
    previewUrl,
    getHiddenProfileLinkTypes
  } = useBioEditorStore();

  const handle = currentBioProfile?.handle;

  const themeString = useMemo(() => {
    try { return JSON.stringify(currentBioProfile?.theme_settings || {}); } catch { return ''; }
  }, [currentBioProfile?.theme_settings]);

  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  useEffect(() => { setCacheBuster(Date.now()); }, [handle, themeString]);

  const themeParam = themeString ? `&theme_settings=${encodeURIComponent(themeString)}` : '';
  const hidden = (getHiddenProfileLinkTypes && getHiddenProfileLinkTypes()) || [];
  const hiddenParam = hidden.length ? `&hidden_profile_links=${encodeURIComponent(hidden.join(','))}` : '';
  const src = isOpen && handle && previewUrl
    ? `${previewUrl}?preview=1${themeParam}${hiddenParam}&v=${cacheBuster}`
    : '';

  useEffect(() => {
    if (src) {
      setIsLoadingPreview(true);
    }
  }, [src]);

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="bio-preview-title"
    >
      <StyledModalSurface>
        <ModalCloseButton />
        {src ? (
          <>
            <Iframe
              src={src}
              title={`bio-preview-modal-${handle}`}
              loading="eager"
              onLoad={() => setIsLoadingPreview(false)}
            />
            {isLoadingPreview && (
              <PreviewLoading>
                <Spinner />
                Loading preview...
              </PreviewLoading>
            )}
          </>
        ) : null}
      </StyledModalSurface>
    </ModalRoot>
  );
};

export default BioPreviewModal;
