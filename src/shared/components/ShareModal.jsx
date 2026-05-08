import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalCloseButton,
} from '@shared/components/Modal';
import { theme } from '@shared/styles/GlobalStyles';

const ShareSurface = styled(ModalSurface)`
  --modal-surface-padding: clamp(1.5rem, 4vw, 2rem);
  --modal-surface-gap: clamp(1rem, 3vw, 1.5rem);
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: clamp(12px, 1.5vw, 18px);
  max-width: 520px;
  width: 100%;
`;

const Header = styled(ModalHeader)`
  margin-bottom: 0;
`;

const Subtitle = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  margin: 0;
  line-height: 1.6;
`;

const Body = styled(ModalBody)`
  overflow: visible;
`;

const URLContainer = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-top: ${theme.spacing.md};

  @media (max-width: 480px) {
    flex-direction: column;
  }
`;

const URLInput = styled.input`
  flex: 1;
  padding: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 8px;
  background: ${theme.colors.gray[100]};
  color: ${theme.colors.black};
  outline: none;
  transition: border ${theme.transitions.fast};

  &:focus {
    border-color: ${theme.colors.black};
    background: ${theme.colors.gray[200]};
  }
`;

const PrimaryButton = styled.button`
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  background: ${theme.colors.black};
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: transform ${theme.transitions.fast}, background ${theme.transitions.fast};

  &:hover {
    transform: translateY(-1px);
    background: ${theme.colors.gray[800]};
  }

  &:active {
    transform: translateY(0);
  }
`;

const SecondaryButton = styled.button`
  width: 100%;
  padding: ${theme.spacing.md};
  margin-top: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  background: transparent;
  border: ${theme.borders.dashed} ${theme.colors.gray[400]};
  border-radius: 12px;
  cursor: pointer;
  transition: background ${theme.transitions.fast}, border ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.gray[100]};
    border-color: ${theme.colors.black};
  }

  &:active {
    transform: scale(0.99);
  }
`;

const Toast = styled.div`
  position: fixed;
  bottom: clamp(2rem, 4vw, 3rem);
  left: 50%;
  transform: translateX(-50%);
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  background: ${theme.colors.black};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 12px;
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.35);
  z-index: 1500;
  animation: fade-in 0.2s ease;

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translate(-50%, 16px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
`;

const CloseButton = styled(ModalCloseButton)`
  background: rgba(0, 0, 0, 0.07);
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.35);
  color: ${theme.colors.black};

  &:hover {
    background: rgba(0, 0, 0, 0.12);
  }
`;

export default function ShareModal({ isOpen, onClose, url, title = 'Share' }) {
  const [showToast, setShowToast] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [url]);

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({
        title,
        url,
      });
    } catch (error) {
      console.log('Share cancelled or failed:', error);
    }
  }, [title, url]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <ModalRoot
        isOpen={isOpen}
        onClose={onClose}
        align="center"
        labelledBy="share-modal-title"
        overlayProps={{
          $backdrop: 'rgba(0, 0, 0, 0.65)',
          $backdropBlur: 'blur(10px)',
        }}
      >
        <ShareSurface size="sm">
          <CloseButton aria-label="Close share modal" />
          <Header>
            <ModalTitle id="share-modal-title">{title}</ModalTitle>
          </Header>

          <Body as="section" aria-labelledby="share-modal-title">
            <Subtitle>Share this link with anyone to let them view this content.</Subtitle>
            <URLContainer>
              <URLInput
                type="text"
                value={url}
                readOnly
                onClick={(e) => e.target.select()}
                aria-label="Shareable URL"
              />
              <PrimaryButton type="button" onClick={handleCopyLink}>
                Copy
              </PrimaryButton>
            </URLContainer>
          </Body>

          {canShare && (
            <ModalFooter>
              <SecondaryButton type="button" onClick={handleNativeShare}>
                Share via...
              </SecondaryButton>
            </ModalFooter>
          )}
        </ShareSurface>
      </ModalRoot>

      {showToast && <Toast role="status">Link copied!</Toast>}
    </>
  );
}
