import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { useBioEditorStore } from '../store/bioEditorStore';

const PreviewWrapper = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'mode'
})`
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 0 ${theme.spacing.md};
  
  ${props => props.mode === 'desktop' && `
    padding: 0 ${theme.spacing.xl};
  `}
`;

const PreviewContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'mode' && prop !== 'themeColors'
})`
  width: 100%;
  max-width: 600px;
  height: 100dvh;
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  background: ${props => props.themeColors?.background || '#000000'};
  color: ${props => props.themeColors?.text || '#ffffff'};
  font-family: 'Paper Mono', monospace;
  overflow: hidden;
  position: relative;
  padding: 0;
  word-wrap: break-word;
  display: flex;
  flex-direction: column;
  
  ${props => props.mode === 'mobile' && `
    max-width: 360px;
    height: calc(100dvh - 100px);
  `}
  
  ${props => props.mode === 'tablet' && `
    max-width: 390px;
    height: calc(100dvh - 80px);
  `}
  
  ${props => props.mode === 'desktop' && `
    max-width: 600px;
    height: 100dvh;
  `}
`;

const BioContainer = styled.div`
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  
  @media (max-width: 600px) {
    padding: 0.5rem;
  }
`;

const BioHeader = styled.header.withConfig({
  shouldForwardProp: (prop) => prop !== 'borderColor'
})`
  text-align: center;
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 0.5px dashed ${props => props.borderColor || 'rgba(255,255,255,0.3)'};
  
  @media (max-width: 600px) {
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
  }
`;

const PreviewUrl = styled.div`
  font-size: ${theme.fontSizes.small};
  opacity: 0.7;
  margin-bottom: ${theme.spacing.sm};
`;

const BioAvatar = styled.img.withConfig({
  shouldForwardProp: (prop) => prop !== 'borderColor'
})`
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  margin: 0 auto 1rem;
  border: 1px dashed ${props => props.borderColor || 'rgba(255,255,255,0.3)'};
  display: block;
`;

const BioName = styled.h1`
  font-size: clamp(1.5rem, 4vw, 2rem);
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-weight: bold;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
`;

const BioType = styled.div`
  font-size: 0.9rem;
  opacity: 0.7;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
`;

const BioLocation = styled.div`
  font-size: 0.8rem;
  opacity: 0.7;
  margin-bottom: 1rem;
`;

const BioDescription = styled.div`
  font-size: clamp(14px, 2vw, 16px);
  line-height: 1.6;
  margin-bottom: 1rem;
`;

const PreviewContent = styled.div`
  padding: ${theme.spacing.md};
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const SectionTitle = styled.h2`
  margin: 0 0 ${theme.spacing.md} 0;
  font-size: ${theme.fontSizes.medium};
  font-weight: normal;
  opacity: 0.9;
`;

const ProfileButtonsSection = styled.section`
  margin: 1rem 0;
  margin-top: auto;
  flex-shrink: 0;
`;

const ProfileButtonsGrid = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.25rem;
  
  @media (max-width: 600px) {
    gap: 0.125rem;
  }
`;

const ProfileButton = styled.a.withConfig({
  shouldForwardProp: (prop) => prop !== 'borderColor'
})`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: inherit;
  border: 0.5px dashed ${props => props.borderColor || 'rgba(255,255,255,0.3)'};
  padding: 0.5rem 0.25rem;
  text-align: center;
  transition: all 0.2s ease;
  cursor: pointer;
  flex: 1;
  min-width: 0;
  max-width: 80px;
  height: 80px;
  
  &:hover {
    border-color: currentColor;
    background: rgba(255,255,255,0.05);
  }
  
  @media (max-width: 600px) {
    padding: 0.25rem 0.125rem;
    max-width: 60px;
    height: 60px;
  }
`;

const ProfileButtonIcon = styled.div`
  width: 40px;
  height: 40px;
  margin-bottom: 0.125rem;
  opacity: 0.8;
  fill: currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  flex-shrink: 0;
  
  img {
    width: 90%;
    height: 90%;
    object-fit: contain;
  }
  
  @media (max-width: 600px) {
    width: 28px;
    height: 28px;
    font-size: 22px;
  }
`;

const ProfileButtonLabel = styled.span`
  font-size: 0.5rem;
  text-transform: uppercase;
  font-weight: bold;
  opacity: 0.7;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  
  @media (max-width: 600px) {
    font-size: 0.45rem;
  }
`;

const LinkIcon = styled.span`
  font-size: 24px;
`;

const FeaturedLinksSection = styled.section`
  margin: 2rem 0;
`;

const FeaturedLinkCard = styled.a.withConfig({
  shouldForwardProp: (prop) => prop !== 'borderColor'
})`
  display: block;
  text-decoration: none;
  color: inherit;
  border: 0.5px dashed ${props => props.borderColor || 'rgba(255,255,255,0.3)'};
  padding: 1.5rem;
  margin-bottom: 1rem;
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:hover {
    border-color: currentColor;
    background: rgba(255,255,255,0.05);
  }
  
  &:last-child {
    margin-bottom: 0;
  }
  
  @media (max-width: 600px) {
    padding: 1rem;
  }
`;

const FeaturedLinkImage = styled.img.withConfig({
  shouldForwardProp: (prop) => prop !== 'borderColor'
})`
  width: 60px;
  height: 60px;
  object-fit: cover;
  float: left;
  margin-right: 1rem;
  border: 0.5px dashed ${props => props.borderColor || 'rgba(255,255,255,0.3)'};
  
  @media (max-width: 600px) {
    width: 50px;
    height: 50px;
  }
`;

const FeaturedLinkContent = styled.div`
  overflow: hidden;
`;

const FeaturedLinkTitle = styled.div`
  font-weight: bold;
  font-size: 1rem;
  margin-bottom: 0.25rem;
  text-transform: uppercase;
`;

const FeaturedLinkDescription = styled.div`
  font-size: 0.9rem;
  opacity: 0.8;
  line-height: 1.4;
`;

const EmptyState = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'borderColor'
})`
  padding: ${theme.spacing.xl};
  text-align: center;
  opacity: 0.5;
  font-size: ${theme.fontSizes.small};
  border: ${theme.borders.dashed} ${props => props.borderColor || theme.colors.gray[300]};
  margin: ${theme.spacing.md} 0;
`;

const ViewCounter = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'borderColor'
})`
  margin-top: ${theme.spacing.lg};
  padding-top: ${theme.spacing.md};
  border-top: ${theme.borders.dashed} ${props => props.borderColor || theme.colors.gray[300]};
  text-align: center;
  font-size: ${theme.fontSizes.small};
  opacity: 0.6;
`;

const BioFooter = styled.footer.withConfig({
  shouldForwardProp: (prop) => prop !== 'borderColor'
})`
  margin-top: auto;
  padding: 1rem 0;
  border-top: 0.5px dashed ${props => props.borderColor || 'rgba(255,255,255,0.3)'};
  text-align: center;
  opacity: 0.6;
  flex-shrink: 0;
  
  a {
    color: inherit;
    text-decoration: none;
    
    &:hover {
      opacity: 1;
    }
  }
`;

const PreviewBadge = styled.div`
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(255, 193, 7, 0.85);
  color: ${theme.colors.black};
  padding: 2px 6px;
  border-radius: 2px;
  font-size: ${theme.fontSizes.tiny};
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  z-index: 2;
  pointer-events: none;
`;

// Note: icons are rendered by the server HTML inside the iframe

const PreviewFrame = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  overflow: hidden;
`;

const Iframe = styled.iframe`
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
`;

const BioPreview = ({ mode = 'desktop' }) => {
  const {
    currentBioProfile,
    selectedCurator,
    profileLinks,
    featuredLinks,
    previewUrl,
    getCurrentThemePalette,
    getEnabledFeaturedLinks
  } = useBioEditorStore();

  const themePalette = getCurrentThemePalette();
  const handle = currentBioProfile?.handle;

  // Build a stable cache-buster that only changes when handle or theme changes
  const themeString = useMemo(() => {
    try {
      return JSON.stringify(currentBioProfile?.theme_settings || {});
    } catch {
      return '';
    }
  }, [currentBioProfile?.theme_settings]);

  const [cacheBuster, setCacheBuster] = useState(Date.now());
  useEffect(() => {
    // Update on handle or theme changes only
    setCacheBuster(Date.now());
  }, [handle, themeString]);

  // Provide theme_settings override for dev preview (server accepts this when preview=1)
  const themeParam = themeString ? `&theme_settings=${encodeURIComponent(themeString)}` : '';
  const iframeSrc = handle && previewUrl ? `${previewUrl}?preview=1${themeParam}&v=${cacheBuster}` : '';
  
  if (!selectedCurator) {
    return (
      <PreviewWrapper mode={mode}>
        <PreviewContainer mode={mode} themeColors={themePalette}>
          <PreviewNote>PREVIEW</PreviewNote>
          <BioContainer>
            <EmptyState borderColor={themePalette.border}>
              Select a curator to see preview
            </EmptyState>
          </BioContainer>
        </PreviewContainer>
      </PreviewWrapper>
    );
  }

  return (
    <PreviewWrapper mode={mode}>
      <PreviewContainer mode={mode} themeColors={themePalette}>
        {iframeSrc ? (
          <>
            <PreviewFrame>
              <Iframe src={iframeSrc} title={`bio-preview-${handle}`} />
            </PreviewFrame>
            <PreviewBadge>preview</PreviewBadge>
          </>
        ) : (
          <BioContainer>
            <EmptyState borderColor={themePalette.border}>Enter a handle to preview</EmptyState>
          </BioContainer>
        )}
      </PreviewContainer>
    </PreviewWrapper>
  );
};

export default BioPreview;
