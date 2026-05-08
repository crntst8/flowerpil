import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { generateCuratorStoryImage } from '../utils/curatorShareImageGenerator';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalCloseButton,
} from '@shared/components/Modal';

const CuratorShareModal = ({ isOpen, onClose, curator }) => {
  const [successMessage, setSuccessMessage] = useState(null);

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
  };

  const getCuratorUrl = () => `${window.location.origin}/curator/${encodeURIComponent(curator?.name || '')}`;

  const handleShareToStory = async () => {
    try {
      const imageBlob = await generateCuratorStoryImage(curator);
      const url = URL.createObjectURL(imageBlob);
      const curatorUrl = getCuratorUrl();

      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(curatorUrl);
        } catch (clipboardError) {
          console.warn('Curator share: failed to copy URL', clipboardError);
        }
      }

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([imageBlob], 'story.png', { type: 'image/png' })] })) {
        await navigator.share({
          files: [new File([imageBlob], `${curator?.name || 'curator'}-profile.png`, { type: 'image/png' })],
          title: `${curator?.name || 'Curator'} - flowerpil.io`,
          text: `${curator?.name || 'Curator'} on flowerpil.io\n${curatorUrl}`
        });
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `${curator?.name || 'curator'} - Instagram Story.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showSuccess('Image downloaded! Curator URL copied to clipboard');
      }

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Curator share: error generating story image', error);
      showSuccess('Error generating image. Please try again.');
    }
  };

  const handleCopyUrl = async () => {
    try {
      const curatorUrl = getCuratorUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(curatorUrl);
        showSuccess('Curator URL copied to clipboard!');
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = curatorUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showSuccess('Curator URL copied to clipboard!');
      }
    } catch (error) {
      console.error('Curator share: error copying URL', error);
      showSuccess('Error copying URL. Please try again.');
    }
  };

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="curator-share-modal-title"
    >
      <StyledModalSurface
        $size="sm"
        $background={theme.colors.black}
        $color={theme.colors.white}
        $border={`${theme.borders.solid} ${theme.colors.white}`}
        $radius="0"
      >
        <StyledModalHeader>
          <ModalTitle id="curator-share-modal-title">{curator?.name}</ModalTitle>
          <ModalCloseButton />
        </StyledModalHeader>

        <ModalContent>
          <ShareOption onClick={handleShareToStory}>
            <ShareOptionIcon src="/assets/playlist-actions/instagram.svg" alt="" aria-hidden="true" />
            <div>
              <ShareOptionText>Share To Instagram</ShareOptionText>
              <ShareOptionDescription>Generate and save Instagram story image</ShareOptionDescription>
            </div>
          </ShareOption>

          <ShareOption onClick={handleCopyUrl}>
            <ShareOptionIcon src="/assets/playlist-actions/link.png" alt="" aria-hidden="true" />
            <div>
              <ShareOptionText>Copy URL</ShareOptionText>
              <ShareOptionDescription>Copy curator profile link for sharing</ShareOptionDescription>
            </div>
          </ShareOption>
        </ModalContent>

        {successMessage && (
          <SuccessNotification>
            {successMessage}
          </SuccessNotification>
        )}
      </StyledModalSurface>
    </ModalRoot>
  );
};

const StyledModalSurface = styled(ModalSurface)`
  max-width: 400px;
  font-family: ${theme.fonts.primary};
  padding: 0;
  gap: 0;
  position: relative;
`;

const StyledModalHeader = styled(ModalHeader)`
  padding: 20px;
  border-bottom: ${theme.borders.dashed} ${theme.colors.black[300]};
  margin-bottom: 0;

  h2 {
    color: ${theme.colors.black};
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h2};
    font-weight: 700;
    text-transform: capitalize;
    letter-spacing: -1px;
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

const ShareOptionIcon = styled.img`
  width: 28px;
  height: 28px;
  opacity: 0.8;
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

export default CuratorShareModal;
