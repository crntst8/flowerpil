import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { tokens } from '@modules/curator/components/ui';
import { theme } from '@shared/styles/GlobalStyles';
import AnnouncementRenderer from './AnnouncementRenderer';

export default function AnnouncementModal({
  announcement,
  isOpen,
  onDismiss,
  onAction,
}) {
  const [breakpoint, setBreakpoint] = useState('desktop');

  // Track window size for responsive block visibility
  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setBreakpoint('mobile');
      } else if (width < 1024) {
        setBreakpoint('tablet');
      } else {
        setBreakpoint('desktop');
      }
    };

    updateBreakpoint();
    window.addEventListener('resize', updateBreakpoint);
    return () => window.removeEventListener('resize', updateBreakpoint);
  }, []);

  if (!isOpen || !announcement) return null;

  const { blocks = [], header_style } = announcement;

  const handleOverlayClick = () => {
    onDismiss?.({ permanent: false });
  };

  const handleCloseClick = () => {
    onDismiss?.({ permanent: false });
  };

  const handleContentClick = (e) => {
    e.stopPropagation();
  };

  const handleAction = (actionData) => {
    if (actionData.action === 'dismiss') {
      onDismiss?.({ button: actionData.label, permanent: false });
    } else if (actionData.action === 'navigate') {
      onDismiss?.({ button: actionData.label, permanent: true });
      if (actionData.url) {
        window.location.href = actionData.url;
      }
    } else if (actionData.action === 'external_link') {
      window.open(actionData.url, '_blank');
      onDismiss?.({ button: actionData.label, permanent: false });
    } else if (onAction) {
      onAction(actionData);
    }
  };

  return (
    <ModalOverlay onClick={handleOverlayClick}>
      <ModalContent onClick={handleContentClick}>
        <CloseButton
          type="button"
          onClick={handleCloseClick}
          aria-label="Close announcement"
        >
          x
        </CloseButton>
        {header_style && (
          <ModalHeader $bgColor={header_style.backgroundColor}>
            {header_style.showLogo && (
              <LogoContainer>
                <Logo src="/logo-nobg.png" alt="Flowerpil" />
              </LogoContainer>
            )}
          </ModalHeader>
        )}
        <ModalBody>
          <AnnouncementRenderer
            blocks={blocks}
            onAction={handleAction}
            breakpoint={breakpoint}
          />
        </ModalBody>
      </ModalContent>
    </ModalOverlay>
  );
}

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const slideUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: ${theme.spacing.md};
  animation: ${fadeIn} 0.2s ease-out;

  /* Safari-safe height */
  height: 100vh;
  height: 100dvh;
`;

const ModalContent = styled.div`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  max-height: 90dvh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  animation: ${slideUp} 0.3s ease-out;
  -webkit-overflow-scrolling: touch;
  position: relative;

  @media (max-width: ${theme.breakpoints.mobile}) {
    max-width: 100%;
    max-height: 100vh;
    max-height: 100dvh;
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: ${theme.spacing.sm};
  right: ${theme.spacing.sm};
  width: ${tokens.sizing.touchTarget};
  height: ${tokens.sizing.touchTarget};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity ${theme.transitions.fast};
  z-index: 2;

  &:hover {
    opacity: 1;
  }
`;

const ModalHeader = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  background: ${props => props.$bgColor || theme.colors.black};
  border-bottom: ${theme.borders.solid} ${theme.colors.black};

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};
  }
`;

const dropIn = keyframes`
  0% {
    opacity: 0;
    transform: translateY(-60px) scale(0.3);
  }
  50% {
    transform: translateY(10px) scale(1.05);
  }
  70% {
    transform: translateY(-5px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const LogoContainer = styled.div`
  margin-bottom: ${theme.spacing.md};
  animation: ${dropIn} 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
`;

const Logo = styled.img`
  width: 80px;
  height: 80px;
  object-fit: contain;
  display: block;
  margin: 0 auto;
`;

const ModalBody = styled.div`
  padding: ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  flex: 1;

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};
  }
`;
