import React, { useMemo, useState, useRef, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { ModalRoot, ModalSurface, ModalBody, ModalCloseButton } from './Modal/Modal.jsx';

const fadeScaleIn = keyframes`
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
`;

const tooltipFadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const shimmer = keyframes`
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
`;

// New wrapper for inline positioning
const TooltipWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  position: relative;
  vertical-align: middle;
  margin: 0 0 0 ${theme.spacing.xs};
`;

const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ $hasLabel }) => $hasLabel ? theme.spacing.sm : '0'};
  padding: ${({ $hasLabel }) => $hasLabel ? '10px 18px' : '4px'};
  min-width: ${({ $hasLabel }) => $hasLabel ? 'auto' : '18px'};
  min-height: ${({ $hasLabel }) => $hasLabel ? 'auto' : '18px'};
  background: transparent;
  color: ${theme.colors.black};
  border: ${({ $hasLabel }) => $hasLabel ? `1px solid ${theme.colors.black}` : 'none'};
  border-radius: ${({ $hasLabel }) => $hasLabel ? '6px' : '50%'};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.medium};
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  opacity: ${({ $hasLabel }) => $hasLabel ? '1' : '0.5'};
  flex-shrink: 0;

  &:hover {
    opacity: 1;
    background: ${({ $hasLabel }) => $hasLabel ? 'rgba(0, 0, 0, 0.03)' : 'rgba(0, 0, 0, 0.05)'};
    transform: scale(1.1);
  }

  &:active {
    transform: scale(1.05);
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.primary};
    outline-offset: 2px;
    opacity: 1;
  }

  ${mediaQuery.mobile} {
    min-width: ${({ $hasLabel }) => $hasLabel ? '100%' : '20px'};
    min-height: ${({ $hasLabel }) => $hasLabel ? 'auto' : '20px'};
    padding: ${({ $hasLabel }) => $hasLabel ? '10px 16px' : '4px'};
  }
`;

const Logo = styled.img`
  width: ${({ $size }) => $size === 'large' ? '20px' : '12px'};
  height: ${({ $size }) => $size === 'large' ? '20px' : '12px'};
  object-fit: contain;
  flex-shrink: 0;
  transition: transform 0.15s ease;
  opacity: 0.7;

  ${Trigger}:hover & {
    opacity: 1;
    transform: scale(1.1);
  }

  ${mediaQuery.mobile} {
    width: ${({ $size }) => $size === 'large' ? '18px' : '12px'};
    height: ${({ $size }) => $size === 'large' ? '18px' : '12px'};
  }
`;

const TriggerLabel = styled.span`
  white-space: nowrap;
  ${mediaQuery.tablet} {
    white-space: normal;
  }
`;

// Tooltip container - positioned near trigger
const TooltipContent = styled.div`
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  min-width: 200px;
  max-width: 280px;
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
  padding: ${theme.spacing.sm};
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.12s ease, visibility 0.12s ease;

  /* Arrow pointing down to trigger */
  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid rgba(0, 0, 0, 0.92);
  }

  /* Show on wrapper hover - only if not disabled */
  ${TooltipWrapper}:hover &:not([data-disabled="true"]) {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  /* Keep visible when hovering the tooltip itself */
  &:hover:not([data-disabled="true"]) {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  /* Force hide when disabled */
  &[data-disabled="true"] {
    opacity: 0 !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  ${mediaQuery.mobile} {
    min-width: 180px;
    max-width: 240px;
    left: auto;
    right: 0;
    transform: none;

    &::after {
      left: auto;
      right: 12px;
      transform: none;
    }
  }
`;

const TooltipTitle = styled.div`
  margin: 0 0 6px 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.semibold};
  color: #ffffff;
  line-height: 1.3;
`;

const TooltipBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const TooltipText = styled.div`
  margin: 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: ${theme.fontSizes.tiny};
  line-height: 1.5;
  font-weight: ${theme.fontWeights.normal};
`;

const TooltipList = styled.div`
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: rgba(255, 255, 255, 0.9);
  font-size: ${theme.fontSizes.tiny};
  line-height: 1.4;
`;

const TooltipListItem = styled.div`
  display: flex;
  gap: 6px;
  align-items: flex-start;

  &::before {
    content: '·';
    color: rgba(255, 255, 255, 0.6);
    flex-shrink: 0;
    font-size: 16px;
    line-height: 1.4;
  }
`;

const ExpandButton = styled.button`
  margin-top: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  border: none;
  border-radius: 3px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.medium};
  cursor: pointer;
  transition: background 0.15s ease;
  align-self: flex-start;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }

  &:active {
    transform: scale(0.96);
  }
`;

const AnimatedModalSurface = styled(ModalSurface)`
  animation: ${fadeScaleIn} 0.35s cubic-bezier(0.16, 1, 0.3, 1);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md} ${theme.spacing.lg} ${theme.spacing.md};
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: black;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 5%;
    right: 5%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(0, 0, 0, 0.04) 20%,
      rgba(0, 0, 0, 0.06) 50%,
      rgba(0, 0, 0, 0.04) 80%,
      transparent 100%
    );
  }
`;

const HeaderLogo = styled.img`
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));

  ${mediaQuery.mobile} {
    width: 32px;
    height: 32px;
  }
`;

const HeaderText = styled.div`
  display: grid;
`;

const Eyebrow = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.md};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: ${theme.colors.primary};
  font-weight: ${theme.fontWeights.semibold};
  opacity: 0.9;
`;

const Title = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.25rem, 3vw, 1.75rem);
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.02em;
  color: ${theme.colors.white};
    align-items: center;

  
`;

const Intro = styled.p`
  margin: 0;
  color: ${theme.colors.black};
  font-size: ${theme.fontSizes.base};
  line-height: 1.6;
  font-weight: ${theme.fontWeights.normal};
`;

const List = styled.ul`
  padding-left: ${theme.spacing.lg};
  display: grid;
  gap: ${theme.spacing.sm};
  color: ${theme.colors.black};
  font-size: ${theme.fontSizes.base};
  line-height: 1.65;
  background: white;
  border: 1px black solid;
  padding: 1em;

  li {
    position: relative;
    padding-left: ${theme.spacing.xs};

    &::marker {
      color: ${theme.colors.primary};
      font-weight: ${theme.fontWeights.bold};
    }

    strong {
      display: block;
      margin-bottom: ${theme.spacing.xs};
      font-weight: ${theme.fontWeights.semibold};
      color: ${theme.colors.black};
      font-size: 1.05em;
    }
  }
`;

const Tip = styled.div`
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border: 2px solid rgba(0, 0, 0, 0.15);
  border-radius: 12px;
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.9) 0%,
    rgba(248, 250, 252, 0.95) 50%,
    rgba(240, 245, 250, 0.9) 100%
  );
  backdrop-filter: blur(10px);
  color: ${theme.colors.black};
  font-weight: ${theme.fontWeights.bold};
  font-size: 1em;
  line-height: 1.3;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04),
              inset 0 1px 0 rgba(255, 255, 255, 0.8);
  position: relative;
  overflow: hidden;


  &::after {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%);
    opacity: 0.5;
    pointer-events: none;
  }
`;

const FooterNote = styled.p`
  margin: ${theme.spacing.md} 0 0;
  color: rgba(0, 0, 0, 0.65);
  font-size: ${theme.fontSizes.small};
  line-height: 1.5;
  font-style: italic;
  padding-top: ${theme.spacing.sm};
  border-top: 1px solid rgba(0, 0, 0, 0.06);
`;

const MediaContainer = styled.div`
  margin: ${theme.spacing.lg} 0;
  border-radius: 12px;
  overflow: hidden;
  background: ${theme.colors.black};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15),
              0 2px 6px rgba(0, 0, 0, 0.1);
  border: 2px solid rgba(0, 0, 0, 0.1);
  position: relative;
  aspect-ratio: ${({ $aspectRatio }) => $aspectRatio || '16 / 9'};

  video, img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 10px;
    box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.1);
    pointer-events: none;
  }
`;

const MediaCaption = styled.p`
  margin: ${theme.spacing.sm} 0 0;
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  text-align: center;
  font-style: italic;
  line-height: 1.4;
`;

const CustomCloseButton = styled(ModalCloseButton)`
  background: transparent;
  border: none;
  color: ${theme.colors.white};
  opacity: 0.6;
  transition: all ${theme.transitions.medium};
  width: 36px;
  height: 36px;
  padding: 1em;
  font-size: 28px;
  font-weight: ${theme.fontWeights.normal};
  line-height: 1;
  z-index: 10;

  &:hover {
    opacity: 1;
    transform: scale(1.15) rotate(90deg);
    background: transparent;
  }

  &:active {
    transform: scale(1.05) rotate(90deg);
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.primary};
    outline-offset: 3px;
    opacity: 1;
  }

  ${mediaQuery.mobile} {
    width: 32px;
    height: 32px;
    font-size: 26px;
  }
`;

export function InfoModal({
  triggerLabel,
  eyebrow = 'Info',
  title,
  intro,
  bullets = [],
  tip,
  footerNote,
  logoVariant = 'dark',
  overlayProps,
  modalSize = 'md',
  media,
  mediaFallback,
  mediaCaption,
  mediaAspectRatio = '16 / 9',
  mode = 'hover', // 'hover' or 'click'
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [canShowTooltip, setCanShowTooltip] = useState(true);
  const triggerRef = useRef(null);
  const visibilityTimeoutRef = useRef(null);

  const logoSrc = useMemo(() => {
    if (logoVariant === 'light') return '/images/info/info-light.png';
    return '/images/info/info-dark.png';
  }, [logoVariant]);

  // Prevent tooltip flash when returning to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Disable tooltips temporarily when tab becomes visible
        setCanShowTooltip(false);

        // Clear any existing timeout
        if (visibilityTimeoutRef.current) {
          clearTimeout(visibilityTimeoutRef.current);
        }

        // Re-enable after 300ms
        visibilityTimeoutRef.current = setTimeout(() => {
          setCanShowTooltip(true);
        }, 300);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
      }
    };
  }, []);


  const renderMedia = () => {
    if (!media && !mediaFallback) return null;

    const isVideo = media && (media.endsWith('.webm') || media.endsWith('.mp4'));

    return (
      <>
        <MediaContainer $aspectRatio={mediaAspectRatio}>
          {isVideo ? (
            <video
              autoPlay
              loop
              muted
              playsInline
              poster={mediaFallback}
            >
              <source src={media} type={media.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
              {mediaFallback && <img src={mediaFallback} alt={mediaCaption || 'Info animation'} />}
            </video>
          ) : (
            <img src={media || mediaFallback} alt={mediaCaption || 'Info visual'} />
          )}
        </MediaContainer>
        {mediaCaption && <MediaCaption>{mediaCaption}</MediaCaption>}
      </>
    );
  };

  const hasLabel = Boolean(triggerLabel);
  const hasMedia = Boolean(media || mediaFallback);

  // Use tooltip mode for simple content, modal for complex/media content
  const shouldUseTooltip = mode === 'hover' && !hasMedia && bullets.length <= 5;

  const handleTriggerClick = () => {
    if (mode === 'click' || !shouldUseTooltip) {
      setIsModalOpen(true);
    }
  };

  const renderTooltipContent = () => {
    // Show max 2 bullets for quick preview
    const displayBullets = bullets.slice(0, 2);
    const hasMoreContent = bullets.length > 2 || hasMedia || tip;

    return (
      <TooltipContent
        role="tooltip"
        aria-live="polite"
        data-disabled={!canShowTooltip}
      >
        {title && <TooltipTitle>{title}</TooltipTitle>}

        <TooltipBody>
          {intro && <TooltipText>{intro}</TooltipText>}

          {displayBullets.length > 0 && (
            <TooltipList>
              {displayBullets.map((item, index) => (
                <TooltipListItem key={item.title || item || index}>
                  {typeof item === 'string'
                    ? item
                    : item.text || item.description || item.title || ''}
                </TooltipListItem>
              ))}
            </TooltipList>
          )}

          {hasMoreContent && (
            <ExpandButton onClick={() => setIsModalOpen(true)}>
              More info
            </ExpandButton>
          )}
        </TooltipBody>
      </TooltipContent>
    );
  };

  return (
    <>
      <TooltipWrapper>
        <Trigger
          ref={triggerRef}
          type="button"
          onClick={handleTriggerClick}
          aria-label={title || triggerLabel || `${eyebrow} info`}
          $hasLabel={hasLabel}
        >
          <Logo src={logoSrc} alt="" aria-hidden $size={hasLabel ? 'large' : 'small'} />
          {hasLabel && <TriggerLabel>{triggerLabel}</TriggerLabel>}
        </Trigger>

        {shouldUseTooltip && renderTooltipContent()}
      </TooltipWrapper>

      {/* Full modal for complex content or click mode */}
      <ModalRoot
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        align="center"
        overlayProps={{
          $backdrop: 'rgba(0, 0, 0, 0.55)',
          $backdropBlur: 'blur(16px)',
          ...overlayProps
        }}
      >
        <AnimatedModalSurface
          $size={modalSize}
          $padding="clamp(1.5rem, 5vw, 2.5rem)"
          $radius="16px"
          $border="2px solid rgba(0, 0, 0, 0.12)"
          $shadow="0 20px 60px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15)"
        >
          <CustomCloseButton />
          <Header>
            <HeaderLogo src={logoSrc} alt="" />
            <HeaderText>
              {title && <Title>{title}</Title>}
            </HeaderText>
          </Header>
          <ModalBody>
            {intro && <Intro>{intro}</Intro>}

            {bullets.length > 0 && (
              <List>
                {bullets.map((item, index) => (
                  <li key={item.title || item || index}>
                    {item.title ? (
                      <strong>{item.title}</strong>
                    ) : null}
                    <span>{item.text || item.description || item}</span>
                  </li>
                ))}

              </List>
            )}
            {tip && <Tip>{tip}{renderMedia()}</Tip>}
            {footerNote && <FooterNote>{footerNote}</FooterNote>}
          </ModalBody>
        </AnimatedModalSurface>
      </ModalRoot>
    </>
  );
}

export default InfoModal;
