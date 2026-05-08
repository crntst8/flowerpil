import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import AnnouncementRenderer from './AnnouncementRenderer';

export default function AnnouncementBanner({
  announcement,
  position = 'top', // 'top' or 'bottom'
  isOpen,
  onDismiss,
  onAction,
}) {
  const [breakpoint, setBreakpoint] = useState('desktop');

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

  const { blocks = [] } = announcement;

  const handleClose = () => {
    onDismiss?.({ permanent: false });
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
    <BannerWrapper $position={position}>
      <BannerContent>
        <CloseButton onClick={handleClose} aria-label="Close banner">
          {'\u00d7'}
        </CloseButton>
        <BannerBody>
          <AnnouncementRenderer
            blocks={blocks}
            onAction={handleAction}
            breakpoint={breakpoint}
          />
        </BannerBody>
      </BannerContent>
    </BannerWrapper>
  );
}

const slideDown = keyframes`
  from {
    opacity: 0;
    transform: translateY(-100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const slideUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const BannerWrapper = styled.div`
  position: fixed;
  ${props => props.$position === 'top' ? 'top: 0;' : 'bottom: 0;'}
  left: 0;
  right: 0;
  z-index: 9000;
  animation: ${props => props.$position === 'top' ? slideDown : slideUp} 0.3s ease-out;

  /* Safe area for notched devices */
  ${props => props.$position === 'bottom' && `
    padding-bottom: env(safe-area-inset-bottom);
  `}
`;

const BannerContent = styled.div`
  background: ${theme.colors.fpwhite};
  border-bottom: ${theme.borders.solid} ${theme.colors.black};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  position: relative;
`;

const CloseButton = styled.button`
  position: absolute;
  top: ${theme.spacing.sm};
  right: ${theme.spacing.sm};
  width: ${theme.touchTarget.min};
  height: ${theme.touchTarget.min};
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  font-size: 24px;
  color: ${theme.colors.black};
  cursor: pointer;
  opacity: 0.6;
  transition: opacity ${theme.transitions.fast};
  z-index: 1;

  &:hover {
    opacity: 1;
  }
`;

const BannerBody = styled.div`
  padding: ${theme.spacing.md} ${theme.spacing.xl};
  padding-right: calc(${theme.touchTarget.min} + ${theme.spacing.md});

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    padding-right: calc(${theme.touchTarget.min} + ${theme.spacing.sm});
  }
`;
