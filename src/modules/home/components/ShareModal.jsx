import React from 'react';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { generateStoryImage } from '../utils/shareImageGenerator';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalCloseButton,
} from '@shared/components/Modal';

const ShareModal = ({ isOpen, onClose, item, platformLinks }) => {

  const handleShareToStory = async () => {
    try {
      // Generate the Instagram story image
      const imageBlob = await generateStoryImage(item, platformLinks);
      
      // Create URL for download
      const url = URL.createObjectURL(imageBlob);
      
      // Copy the track URL to clipboard for Instagram sharing
      const trackUrl = `${window.location.origin}/music/${item.id}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(trackUrl);
          console.log('Track URL copied to clipboard for Instagram sharing');
        } catch (clipboardError) {
          console.warn('Failed to copy URL to clipboard:', clipboardError);
        }
      }
      
      // Try to use native share API first (works on mobile)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([imageBlob], 'story.png', { type: 'image/png' })] })) {
        await navigator.share({
          files: [new File([imageBlob], `${item.artist_name} - ${item.title}.png`, { type: 'image/png' })],
          title: `${item.artist_name} - ${item.title}`,
          text: `Check out this new music! ${trackUrl}`
        });
      } else {
        // Fallback: trigger download and show URL
        const link = document.createElement('a');
        link.href = url;
        link.download = `${item.artist_name} - ${item.title} Story.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Show URL copied notification
        alert(`Image downloaded! Track URL copied to clipboard: ${trackUrl}`);
      }
      
      URL.revokeObjectURL(url);
      onClose();
    } catch (error) {
      console.error('Error sharing to story:', error);
      alert('Error generating image. Please try again.');
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      const imageBlob = await generateStoryImage(item, platformLinks);
      
      // Try to copy image to clipboard (works on modern browsers)
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': imageBlob
          })
        ]);
        alert('Image copied to clipboard!');
      } else {
        // Fallback: create temporary URL for manual copying
        const url = URL.createObjectURL(imageBlob);
        const img = new Image();
        img.src = url;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          canvas.toBlob(async (blob) => {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
              ]);
              alert('Image copied to clipboard!');
            } catch {
              alert('Unable to copy to clipboard. Please use "Share To Story" instead.');
            }
          });
          
          URL.revokeObjectURL(url);
        };
      }
      
      onClose();
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      alert('Error generating image. Please try again.');
    }
  };

  const handleCopyUrl = async () => {
    try {
      const trackUrl = `${window.location.origin}/music/${item.id}`;
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(trackUrl);
        alert('Track URL copied to clipboard!');
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = trackUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Track URL copied to clipboard!');
      }
      
      onClose();
    } catch (error) {
      console.error('Error copying URL:', error);
      alert('Error copying URL. Please try again.');
    }
  };

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="share-modal-title"
    >
      <StyledModalSurface>
        <StyledModalHeader>
          <ModalTitle id="share-modal-title">Share {item?.title || 'Item'}</ModalTitle>
          <ModalCloseButton />
        </StyledModalHeader>

        <StyledModalBody>
          <ShareOption onClick={handleShareToStory}>
            <ShareOptionIcon>📱</ShareOptionIcon>
            <div>
              <ShareOptionText>Share To Story</ShareOptionText>
              <ShareOptionDescription>Generate and save Instagram story image</ShareOptionDescription>
            </div>
          </ShareOption>

          <ShareOption onClick={handleCopyToClipboard}>
            <ShareOptionIcon>📋</ShareOptionIcon>
            <div>
              <ShareOptionText>Copy Image</ShareOptionText>
              <ShareOptionDescription>Copy story image to clipboard</ShareOptionDescription>
            </div>
          </ShareOption>

          <ShareOption onClick={handleCopyUrl}>
            <ShareOptionIcon>🔗</ShareOptionIcon>
            <div>
              <ShareOptionText>Copy URL</ShareOptionText>
              <ShareOptionDescription>Copy track link for sharing</ShareOptionDescription>
            </div>
          </ShareOption>
        </StyledModalBody>
      </StyledModalSurface>
    </ModalRoot>
  );
};

// Styled Components
const StyledModalSurface = styled(ModalSurface)`
  background: ${theme.colors.black};
  border: ${theme.borders.dashed} ${theme.colors.white};
  max-width: 400px;
  width: 100%;
  font-family: ${theme.fonts.mono};
`;

const StyledModalHeader = styled(ModalHeader)`
  padding: 20px;
  border-bottom: ${theme.borders.dashed} ${theme.colors.gray[300]};

  h2 {
    color: ${theme.colors.white};
    font-size: 18px;
    font-weight: 700;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const StyledModalBody = styled(ModalBody)`
  padding: 0;
`;

const ShareOption = styled.button`
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: ${theme.borders.dashed} ${theme.colors.gray[300]};
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
    background: rgba(255, 255, 255, 0.05);
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
  color: ${theme.colors.white};
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
`;

const ShareOptionDescription = styled.div`
  color: ${theme.colors.gray[400]};
  font-size: 12px;
  font-weight: 400;
`;

export default ShareModal;