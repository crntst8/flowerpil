import React from 'react';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalCloseButton,
} from '@shared/components/Modal';
import { theme } from '@shared/styles/GlobalStyles';

const ImageSurface = styled(ModalSurface)`
  --modal-surface-gap: clamp(0.75rem, 2vw, 1rem);
  background: transparent;
  border: none;
  box-shadow: none;
  padding: clamp(0.5rem, 2vw, 1rem);
  align-items: center;

  @media (max-width: ${theme.breakpoints.tablet}) {
    padding: clamp(0.5rem, 3vw, 0.75rem);
    border-radius: 16px;
  }
`;

const ImageFrame = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const ModalImage = styled.img`
  width: 100%;
  height: auto;
  max-width: min(100%, 90vw);
  max-height: min(86vh, 960px);
  object-fit: contain;
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  border-radius: clamp(8px, 1vw, 14px);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
  background: rgba(0, 0, 0, 0.6);

  @media (max-width: ${theme.breakpoints.tablet}) {
    max-height: 82vh;
    border-radius: clamp(8px, 2vw, 12px);
  }
`;

const CloseButton = styled(ModalCloseButton)`
  background: rgba(12, 12, 12, 0.65);
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.65);
  color: ${theme.colors.white};
  backdrop-filter: blur(8px);

  &:hover {
    background: rgba(12, 12, 12, 0.85);
  }
`;

const ImageModal = ({ isOpen, onClose, src, alt }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      align="center"
      overlayProps={{
        $backdrop: 'rgba(0, 0, 0, 0.92)',
        $backdropBlur: 'blur(12px)',
        $padding: 'clamp(0.5rem, 2vw, 1rem)',
      }}
      labelledBy={alt ? undefined : 'image-modal-title'}
    >
      <ImageSurface
        size="lg"
        aria-label={alt ? `Artwork preview: ${alt}` : 'Artwork preview'}
        $maxWidth="min(1024px, 95vw)"
        $mobileWidth="100%"
        $radius="18px"
        $mobileRadius="18px"
      >
        <CloseButton aria-label="Close image modal" />
        <ImageFrame>
          <ModalImage src={src} alt={alt} loading="eager" />
        </ImageFrame>
      </ImageSurface>
    </ModalRoot>
  );
};

export default ImageModal;
