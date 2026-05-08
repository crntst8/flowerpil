/**
 * Top10PublishSuccessModal Component
 *
 * Success modal displayed on published page after publishing a Top 10 playlist.
 * Features:
 * - Animated success icon with bounce effect
 * - Display published URL
 * - "Copy URL" button with loading/success states
 * - "Share to Instagram" button
 * - CTA about referral code
 * - Auto-focus on primary action
 *
 * Design: Brutalist aesthetic with animated success feedback
 */

import React, { useRef, useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalBody,
  ModalCloseButton,
} from '@shared/components/Modal';
import { Button } from '@modules/curator/components/ui';
import { theme } from '@shared/styles/GlobalStyles';

// Success animation - smooth fade and scale
const successAnimation = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.95);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
`;

// Check mark animation
const checkmarkAnimation = keyframes`
  0% {
    stroke-dashoffset: 100;
  }
  100% {
    stroke-dashoffset: 0;
  }
`;

// Container with animation
const SuccessContainer = styled.div`
  animation: ${successAnimation} 0.4s ease-out;
  text-align: center;
  padding: 1.5rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
`;

// Success icon with checkmark
const SuccessIcon = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto;
  background: ${theme.colors.success};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 36px;
    height: 36px;

    path {
      stroke-dasharray: 100;
      stroke-dashoffset: 100;
      animation: ${checkmarkAnimation} 0.5s ease-out 0.15s forwards;
    }
  }
`;

const SuccessTitle = styled.h2`
  font-family: ${theme.fonts.primary};
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  margin: 0;
  color: ${theme.colors.black};
`;

const SuccessMessage = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: 0.9375rem;
  line-height: 1.5;
  margin: 0;
  color: rgba(0, 0, 0, 0.6);
  max-width: 320px;
`;

const URLDisplay = styled.div`
  padding: 0.625rem 0.875rem;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
  font-family: ${theme.fonts.mono};
  font-size: 0.8125rem;
  word-break: break-all;
  color: rgba(0, 0, 0, 0.7);
  max-width: 100%;
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  width: 100%;
  max-width: 280px;
  margin-top: 0.25rem;

  @media (max-width: 375px) {
    max-width: 100%;
  }
`;

const CloseHint = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: 0.8125rem;
  color: rgba(0, 0, 0, 0.4);
  margin: 0.5rem 0 0 0;
`;

const Divider = styled.div`
  width: 40px;
  height: 1px;
  background: rgba(0, 0, 0, 0.1);
  margin: 0.5rem 0;
`;

const CTASection = styled.div`
  text-align: center;
  max-width: 320px;
`;

const CTAHeader = styled.h3`
  font-family: ${theme.fonts.primary};
  font-size: 0.9375rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0 0 0.375rem 0;
  color: ${theme.colors.black};
`;

const CTAText = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: 0.875rem;
  letter-spacing: -0.01em;
  line-height: 1.5;
  margin: 0;
  color: rgba(0, 0, 0, 0.6);

  a {
    color: ${theme.colors.black};
    text-decoration: underline;
    text-underline-offset: 2px;

    &:hover {
      color: ${theme.colors.success};
    }
  }
`;

const Top10PublishSuccessModal = ({ isOpen, onClose, slug, onShareToInstagram }) => {
  const primaryButtonRef = useRef(null);
  const [copyStatus, setCopyStatus] = useState('idle'); // 'idle' | 'copying' | 'copied'

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/top10/${slug}`
    : `https://flowerpil.com/top10/${slug}`;

  const handleCopyURL = async () => {
    setCopyStatus('copying');

    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyStatus('copied');

      // Reset after 2 seconds
      setTimeout(() => {
        setCopyStatus('idle');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
      // Fallback: select the URL text
      setCopyStatus('idle');
    }
  };

  const handleShareToInstagram = () => {
    if (onShareToInstagram) {
      onShareToInstagram();
    }
  };

  // Auto-focus primary button when modal opens
  useEffect(() => {
    if (isOpen && primaryButtonRef.current) {
      // Small delay to ensure modal animation completes
      setTimeout(() => {
        primaryButtonRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!slug) {
    return null;
  }

  return (
    <ModalRoot isOpen={isOpen} onClose={onClose}>
      <ModalSurface $size="md">
        <ModalCloseButton />
        <ModalBody>
          <SuccessContainer>
            <SuccessIcon>
              <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M14 27L22 35L38 19"
                  stroke="white"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </SuccessIcon>

            <SuccessTitle>Your Top 10 is live</SuccessTitle>

            <SuccessMessage>
              Share it with friends
            </SuccessMessage>

            <URLDisplay>{publicUrl}</URLDisplay>

            <ButtonGroup>
              <Button
                ref={primaryButtonRef}
                onClick={handleCopyURL}
                $variant="primary"
                $fullWidth
                disabled={copyStatus === 'copying'}
              >
                {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'copying' ? 'Copying...' : 'Copy URL'}
              </Button>

              <Button
                onClick={handleShareToInstagram}
                $variant="secondary"
                $fullWidth
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <img
                  src="/assets/playlist-actions/instagram.svg"
                  alt=""
                  style={{ width: '18px', height: '18px' }}
                />
                Share to Instagram
              </Button>
            </ButtonGroup>

            <CloseHint>Close to view your playlist</CloseHint>

            <Divider />

            <CTASection>
              <CTAHeader>Want to make more playlists?</CTAHeader>
              <CTAText>
                Check your inbox for a referral code and sign up at{' '}
                <a href="https://flowerpil.io/signup" target="_blank" rel="noopener noreferrer">
                  flowerpil.io/signup
                </a>
              </CTAText>
            </CTASection>
          </SuccessContainer>
        </ModalBody>
      </ModalSurface>
    </ModalRoot>
  );
};

export default Top10PublishSuccessModal;
