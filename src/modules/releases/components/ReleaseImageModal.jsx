import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.95);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing[4]};
`;

const ModalContent = styled.div`
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const FullImage = styled.img`
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
`;

const Attribution = styled.p`
  color: ${theme.colors.fpwhite};
  font-size: ${theme.fontSizes.sm};
  opacity: 0.7;
  margin-top: ${theme.spacing[3]};
  text-align: center;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: ${theme.spacing[3]};
  margin-top: ${theme.spacing[4]};
`;

const Button = styled.button`
  background: transparent;
  border: 1px dashed rgba(255,255,255,0.3);
  color: ${theme.colors.fpwhite};
  padding: ${theme.spacing[2]} ${theme.spacing[4]};
  font-size: ${theme.fontSizes.sm};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: rgba(255,255,255,0.1);
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: ${theme.spacing[4]};
  right: ${theme.spacing[4]};
  background: transparent;
  border: none;
  color: ${theme.colors.fpwhite};
  font-size: ${theme.fontSizes['2xl']};
  cursor: pointer;
  padding: ${theme.spacing[2]};
  line-height: 1;

  &:hover {
    opacity: 0.7;
  }
`;

const ReleaseImageModal = ({ image, onClose }) => {
  if (!image) return null;

  const handleDownload = () => {
    // Create a temporary link to trigger download
    const link = document.createElement('a');
    link.href = image.url;
    link.download = image.attribution || 'press-image';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <ModalOverlay onClick={handleOverlayClick}>
      <CloseButton onClick={onClose}>×</CloseButton>
      <ModalContent>
        <FullImage src={image.url} alt={image.attribution || 'Press image'} />
        {image.attribution && (
          <Attribution>Photo: {image.attribution}</Attribution>
        )}
        <ButtonRow>
          {image.allow_download !== 0 && (
            <Button onClick={handleDownload}>Download</Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </ButtonRow>
      </ModalContent>
    </ModalOverlay>
  );
};

export default ReleaseImageModal;
