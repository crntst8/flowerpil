import React, { useState, lazy } from 'react';
import styled, { keyframes } from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { generatePlaylistStoryImage } from '../../home/utils/shareImageGenerator';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalCloseButton,
} from '@shared/components/Modal';

const QRCodeModal = lazy(() => import('@shared/components/QRCode/QRCodeModal'));

const PlaylistShareModal = ({ isOpen, onClose, playlist, platformLinks, tracks }) => {
  const [successMessage, setSuccessMessage] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [view, setView] = useState('menu'); // 'menu' | 'embed'
  const [embedSize, setEmbedSize] = useState('large'); // 'large' | 'small'

  const playlistUrl = `${window.location.origin}/playlists/${playlist.id}`;
  const qrPlaylistUrl = `${window.location.origin}/playlists/${playlist.id}?ref=qr`;
  const embedBase = typeof window !== 'undefined' ? window.location.origin : '';
  const embedParams = `bg=%23dbdbda&text=%23000000&accent=%23438eff&variant=${embedSize}`;
  const embedSrc = `${embedBase}/embed/playlist/${playlist.id}?${embedParams}`;

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000); // Disappear after 3 seconds
  };

  const handleShareToStory = async () => {
    try {
      // Generate the Instagram story image for playlist
      const imageBlob = await generatePlaylistStoryImage(playlist, platformLinks);
      
      // Create URL for download
      const url = URL.createObjectURL(imageBlob);
      
      // Copy the playlist URL to clipboard for Instagram sharing
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(playlistUrl);
          console.log('Playlist URL copied to clipboard for Instagram sharing');
        } catch (clipboardError) {
          console.warn('Failed to copy URL to clipboard:', clipboardError);
        }
      }
      
      // Try to use native share API first (works on mobile)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([imageBlob], 'story.png', { type: 'image/png' })] })) {
        await navigator.share({
          files: [new File([imageBlob], `${playlist.curator_name} - ${playlist.title}.png`, { type: 'image/png' })],
          title: `${playlist.curator_name} - ${playlist.title}`,
          text: `Check out "${playlist.title}" curated by ${playlist.curator_name}! ${playlistUrl}`
        });
      } else {
        // Fallback: trigger download and show URL
        const link = document.createElement('a');
        link.href = url;
        link.download = `${playlist.curator_name} - ${playlist.title} Story.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Show URL copied notification
        showSuccess('Image downloaded! Playlist URL copied to clipboard');
      }

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error sharing to story:', error);
      showSuccess('Error generating image. Please try again.');
    }
  };

  const handleCopyUrl = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(playlistUrl);
        showSuccess('Playlist URL copied to clipboard!');
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = playlistUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess('Playlist URL copied to clipboard!');
      }
    } catch (error) {
      console.error('Error copying URL:', error);
      showSuccess('Error copying URL. Please try again.');
    }
  };

  const handleEmbedCode = async () => {
    try {
      const height = embedSize === 'large' ? '420' : '600';
      const embedCode = `<iframe src="${embedSrc}" width="100%" height="${height}" frameborder="0" style="border:0;max-width:100%;" allow="autoplay; clipboard-write" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" loading="lazy"></iframe>`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(embedCode);
        showSuccess('Embed code copied to clipboard!');
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = embedCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess('Embed code copied to clipboard!');
      }
    } catch (error) {
      console.error('Error copying embed code:', error);
      showSuccess('Error copying embed code. Please try again.');
    }
  };

  const handleCopyTracklist = async () => {
    try {
      if (!tracks || tracks.length === 0) {
        showSuccess('No tracks available to copy.');
        return;
      }

      const tracklist = tracks.map((track) =>
        track.artist && track.title
          ? `${track.artist} - ${track.title}`
          : track.title || 'Untitled Track'
      ).join('\n');

      const playlistText = `${playlist.title}\nCurated by ${playlist.curator_name}\n\n${tracklist}`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(playlistText);
        showSuccess('Tracklist copied to clipboard!');
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = playlistText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess('Tracklist copied to clipboard!');
      }
    } catch (error) {
      console.error('Error copying tracklist:', error);
      showSuccess('Error copying tracklist. Please try again.');
    }
  };

  // Embed Preview URL
  const embedPreviewSrc = embedSrc;
  const embedHeight = embedSize === 'large' ? '350px' : '450px';

  return (
    <>
      <ModalRoot
        isOpen={isOpen}
        onClose={onClose}
        labelledBy="playlist-share-modal-title"
      >
        <StyledModalSurface
          $size="sm"
          $embedView={view === 'embed'}
          $background={theme.colors.black}
          $color={theme.colors.white}
          $border={`${theme.borders.solid} ${theme.colors.white}`}
          $radius="0"
        >
          <StyledModalHeader>
            <HeaderContent>
              {view === 'embed' && (
                <BackButton onClick={() => setView('menu')}>← Back</BackButton>
              )}
              <ModalTitle id="playlist-share-modal-title">
                {view === 'embed' ? 'Embed Playlist' : playlist.title}
              </ModalTitle>
            </HeaderContent>
            <ModalCloseButton />
          </StyledModalHeader>

          <ModalContent>
            {view === 'menu' ? (
              <>
                <ShareOption onClick={handleShareToStory}>
                  <ShareOptionIcon>📱</ShareOptionIcon>
                  <div>
                    <ShareOptionText>Share To Instagram</ShareOptionText>
                    <ShareOptionDescription>Generate and save Instagram story image</ShareOptionDescription>
                  </div>
                </ShareOption>

                <ShareOption onClick={() => setShowQrModal(true)}>
                  <ShareOptionIcon>🔳</ShareOptionIcon>
                  <div>
                    <ShareOptionText>Show QR Code</ShareOptionText>
                    <ShareOptionDescription>Display a QR code for easy scanning</ShareOptionDescription>
                  </div>
                </ShareOption>

                <ShareOption onClick={handleCopyUrl}>
                  <ShareOptionIcon>🔗</ShareOptionIcon>
                  <div>
                    <ShareOptionText>Copy URL</ShareOptionText>
                    <ShareOptionDescription>Copy playlist link for sharing</ShareOptionDescription>
                  </div>
                </ShareOption>

                <ShareOption onClick={handleCopyTracklist}>
                  <ShareOptionIcon>📝</ShareOptionIcon>
                  <div>
                    <ShareOptionText>Copy Tracklist</ShareOptionText>
                    <ShareOptionDescription>Copy track listing as text (different from URL)</ShareOptionDescription>
                  </div>
                </ShareOption>

                <ShareOption onClick={() => setView('embed')}> 
                  <ShareOptionIcon>📄</ShareOptionIcon>
                  <div>
                    <ShareOptionText>Embed Code</ShareOptionText>
                    <ShareOptionDescription>Copy HTML iframe for websites</ShareOptionDescription>
                  </div>
                </ShareOption>
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
                    title="Playlist Embed Preview"
                  />
                </PreviewContainer>

                <CopyCodeButton onClick={handleEmbedCode}>
                  Copy Embed Code
                </CopyCodeButton>
              </EmbedView>
            )}
          </ModalContent>

          {successMessage && (
            <SuccessNotification>
              {successMessage}
            </SuccessNotification>
          )}
        </StyledModalSurface>
      </ModalRoot>
      {showQrModal && (
        <React.Suspense fallback={<div>Loading...</div>}>
          <QRCodeModal
            url={qrPlaylistUrl}
            onClose={() => setShowQrModal(false)}
            title={playlist.title}
          />
        </React.Suspense>
      )}
    </>
  );
};


// Styled Components
const StyledModalSurface = styled(ModalSurface).withConfig({
  shouldForwardProp: (prop) => prop !== '$embedView'
})`
  max-width: ${props => props.$embedView ? '720px' : '400px'};
  font-family: ${theme.fonts.primary};
  padding: 0;
  gap: 0;
  position: relative;
  transition: max-width 0.2s ease;
`;

const StyledModalHeader = styled(ModalHeader)`
  padding: 20px;
  border-bottom: ${theme.borders.dashed} ${theme.colors.black[300]};
  margin-bottom: 0;
`;

const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  gap: 15px;
  
  h2 {
    color: ${theme.colors.black};
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h2};
    font-weight: 700;
    text-transform: Capitalize;
    letter-spacing: -1px;
  }
`;

const BackButton = styled.button`
  background: none;
  border: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  cursor: pointer;
  text-transform: uppercase;
  padding: 0;
  
  &:hover {
    text-decoration: underline;
  }
`;

const ModalContent = styled.div`
  padding: 0;
`;

const ShareOption = styled.button`
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: ${theme.borders.dashed} ${theme.colors.black[300]};
  padding: 20px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 15px;
  transition: background 0.2s ease;
  
  &:last-child {
    border-bottom: none;
  }
  
  &:hover {
    background: rgba(255, 255, 255, 0.57);
  }
  
  &:active {
    background: rgba(255, 255, 255, 0.1);
  }
`;

const ShareOptionIcon = styled.span`
  font-size: 24px;
  width: 30px;
  text-align: center;
`;

const ShareOptionText = styled.div`
  color: ${theme.colors.black};
  font-size: ${theme.fontSizes.h3};
  font-weight: 700;
  text-transform: capitalize;
  letter-spacing: -1px;
  margin-bottom: 4px;
`;

const ShareOptionDescription = styled.div`
  color: ${theme.colors.black};
  font-weight: 400;
  font-size: calc(${theme.fontSizes.h3}*0.55);
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const SuccessNotification = styled.div`
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-radius: 4px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  animation: ${fadeIn} 0.3s ease;
  z-index: 1000;
  max-width: 90%;
  text-align: center;
`;

// Embed View Components (Reused/Adapted)
const EmbedView = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 20px;
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
  color: ${theme.colors.black};
`;

const SizeButtonGroup = styled.div`
  display: flex;
  gap: 10px;
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
  border: ${theme.borders.dashed} ${theme.colors.black[300]};
  padding: 20px;
  background: rgba(0,0,0,0.02);
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
`;

const PreviewLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  opacity: 0.6;
  text-transform: uppercase;
  align-self: flex-start;
`;

const CopyCodeButton = styled.button`
  padding: 15px;
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

export default PlaylistShareModal;
