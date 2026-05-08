import React, { useState } from 'react';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { generateTrackStoryImage } from '../../home/utils/shareImageGenerator';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalCloseButton,
} from '@shared/components/Modal';

const TrackShareModal = ({ isOpen, onClose, track, playlist, platformLinks = {}, shareUrl }) => {
  const [view, setView] = useState('menu'); // 'menu' | 'embed'
  const [embedSize, setEmbedSize] = useState('large'); // 'large' | 'small'

  if (!track) return null;

  const safeShareUrl = shareUrl || `${window.location.origin}/track/${track.id}`;
  const embedBase = typeof window !== 'undefined' ? window.location.origin : '';
  const embedParams = `bg=%23dbdbda&text=%23000000&accent=%23438eff&variant=${embedSize}`;
  const embedSrc = `${embedBase}/embed/track/${track.id}?${embedParams}`;

  const handleEmbedCode = async () => {
    try {
      const width = embedSize === 'large' ? '100%' : '100%';
      const height = embedSize === 'large' ? '120' : '180'; // Approx heights
      const embedCode = `<iframe src="${embedSrc}" width="${width}" height="${height}" frameborder="0" style="border:0;max-width:100%;" allow="autoplay; clipboard-write" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" loading="lazy"></iframe>`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(embedCode);
        alert('Embed code copied to clipboard!');
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = embedCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Embed code copied to clipboard!');
      }
    } catch (error) {
      console.error('Error copying embed code:', error);
      alert('Error copying embed code. Please try again.');
    }
  };

  const handleShareToStory = async () => {
    try {
      const imageBlob = await generateTrackStoryImage(track, platformLinks);
      const url = URL.createObjectURL(imageBlob);

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(safeShareUrl);
        } catch (clipboardError) {
          console.warn('TrackShareModal: Failed to copy share URL before story share', clipboardError);
        }
      }

      if (navigator.share && navigator.canShare?.({ files: [new File([imageBlob], 'track-story.png', { type: 'image/png' })] })) {
        await navigator.share({
          files: [new File([imageBlob], `${track.artist ? `${track.artist} - ` : ''}${track.title}.png`, { type: 'image/png' })],
          title: track.title,
          text: `${track.artist ? `${track.artist} – ` : ''}${track.title}\n${safeShareUrl}`,
        });
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `${track.artist ? `${track.artist} - ` : ''}${track.title} Story.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert(`Image downloaded! Share URL copied to clipboard: ${safeShareUrl}`);
      }

      URL.revokeObjectURL(url);
      onClose();
    } catch (error) {
      console.error('TrackShareModal: Error sharing to story', error);
      alert('Unable to generate story image right now. Please try again.');
    }
  };

  const handleCopyUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(safeShareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = safeShareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      alert('Share link copied to clipboard!');
      onClose();
    } catch (error) {
      console.error('TrackShareModal: Error copying share URL', error);
      alert('Unable to copy the share link.');
    }
  };

  const trackSummary = playlist
    ? `${track.artist ? `${track.artist} – ` : ''}${track.title} (from ${playlist.title})`
    : `${track.artist ? `${track.artist} – ` : ''}${track.title}`;

  // Embed Preview URL
  const embedPreviewSrc = embedSrc;
  const embedHeight = embedSize === 'large' ? '120px' : '180px';

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="track-share-modal-title"
    >
      <StyledModalSurface $size="sm" $embedView={view === 'embed'}>
        <StyledModalHeader>
          <HeaderContent>
            {view === 'embed' && (
              <BackButton onClick={() => setView('menu')}>← Back</BackButton>
            )}
            <ModalTitle id="track-share-modal-title">
              {view === 'embed' ? 'Embed Track' : 'Share this track'}
            </ModalTitle>
          </HeaderContent>
          <ModalCloseButton />
        </StyledModalHeader>

        <StyledModalBody>
          {view === 'menu' ? (
            <>
              <TrackSummary>{trackSummary}</TrackSummary>
              <ActionList>
                <ShareAction onClick={handleShareToStory}>
                  <ActionIcon>
                    <img src="/icons/instagram.png" alt="Instagram" />
                  </ActionIcon>
                  <ActionText>
                    <ActionHeading>Download & Share</ActionHeading>
                    <ActionSubheading>Download story graphic + copy link</ActionSubheading>
                  </ActionText>
                </ShareAction>

                <ShareAction onClick={handleCopyUrl}>
                  <ActionIcon>
                    <img src="/assets/playlist-actions/link.png" alt="Link" />
                  </ActionIcon>
                  <ActionText>
                    <ActionHeading>Copy track URL</ActionHeading>
                    <ActionSubheading>{safeShareUrl}</ActionSubheading>
                  </ActionText>
                </ShareAction>

                <ShareAction onClick={() => setView('embed')}>
                  <ActionIcon>
                    <img src="/icons/embed.png" alt="Embed" />
                  </ActionIcon>
                  <ActionText>
                    <ActionHeading>Embed Code</ActionHeading>
                    <ActionSubheading>Get HTML code for websites</ActionSubheading>
                  </ActionText>
                </ShareAction>
              </ActionList>
            </>
          ) : (
            <EmbedView>
              <EmbedControls>
                <SizeLabel>Size:</SizeLabel>
                <SizeButtonGroup>
                  <SizeButton 
                    $active={embedSize === 'large'}
                    onClick={() => setEmbedSize('large')}
                  >
                    Large
                  </SizeButton>
                  <SizeButton 
                    $active={embedSize === 'small'}
                    onClick={() => setEmbedSize('small')}
                  >
                    Small
                  </SizeButton>
                </SizeButtonGroup>
              </EmbedControls>

              <PreviewContainer>
                <PreviewLabel>Preview</PreviewLabel>
                <iframe 
                  src={embedPreviewSrc}
                  width="100%" 
                  height={embedHeight}
                  frameBorder="0" 
                  style={{ border: '0', maxWidth: '100%', overflow: 'hidden' }} 
                  title="Track Embed Preview"
                />
              </PreviewContainer>

              <CopyCodeButton onClick={handleEmbedCode}>
                Copy Embed Code
              </CopyCodeButton>
            </EmbedView>
          )}
        </StyledModalBody>
      </StyledModalSurface>
    </ModalRoot>
  );
};

const StyledModalSurface = styled(ModalSurface).withConfig({
  shouldForwardProp: (prop) => prop !== '$embedView'
})`
  max-width: ${props => props.$embedView ? '720px' : '480px'};
  font-family: ${theme.fonts.primary};
  transition: max-width 0.2s ease;
`;

const StyledModalHeader = styled(ModalHeader)`
  padding: ${theme.spacing.md} ${theme.spacing.md};
  border-bottom: ${theme.borders.solidThin} ${theme.colors.black};
`;

const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  
  h2 {
    font-size: ${theme.fontSizes.h5};
    text-transform: uppercase;
    font-weight: bold;
    letter-spacing: 0.08em;
    color: black;
    opacity: 0.8;
  }
`;

const BackButton = styled.button`
  background: none;
  border: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  text-transform: uppercase;
  padding: 0;
  
  &:hover {
    text-decoration: underline;
  }
`;

const StyledModalBody = styled(ModalBody)`
  padding: ${theme.spacing.ModalCloseButton};
  gap: ${theme.spacing.sm};
`;

const TrackSummary = styled.p`
  margin: 0;
  font-size: ${theme.fontSizes.h4};
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: bold;
`;

const ActionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const ShareAction = styled.button`
  display: grid;
  grid-template-columns: 48px 1fr;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: transform ${theme.transitions.fast}, box-shadow ${theme.transitions.fast};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.2);
  }

  ${mediaQuery.mobile} {
    grid-template-columns: 40px 1fr;
  }
`;

const ActionIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }
`;

const ActionText = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ActionHeading = styled.span`
  font-size: ${theme.fontSizes.h4};
  font-weight: bold;
  text-transform: Uppercase;
  letter-spacing: 0.01em;
`;

const ActionSubheading = styled.span`
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.04em;
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  word-break: break-word;
`;

// Embed View Components
const EmbedView = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const EmbedControls = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SizeLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: bold;
  text-transform: uppercase;
`;

const SizeButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
`;

const SizeButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$active'
})
`
  padding: 6px 12px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  background: ${props => props.$active ? theme.colors.black : 'transparent'};
  color: ${props => props.$active ? theme.colors.white : theme.colors.black};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  cursor: pointer;
  text-transform: uppercase;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.$active ? theme.colors.black : 'rgba(0,0,0,0.1)'};
  }
`;

const PreviewContainer = styled.div`
  border: ${theme.borders.dashed} ${theme.colors.gray[400]};
  padding: ${theme.spacing.md};
  background: rgba(0,0,0,0.02);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  align-items: center;
`;

const PreviewLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[600]};
  text-transform: uppercase;
  align-self: flex-start;
`;

const CopyCodeButton = styled.button`
  padding: ${theme.spacing.md};
  background: ${theme.colors.black};
  color: ${theme.colors.white};
  border: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  cursor: pointer;
  width: 100%;
  transition: opacity 0.2s;
  
  &:hover {
    opacity: 0.9;
  }
  
  &:active {
    opacity: 0.8;
  }
`;

export default TrackShareModal;
