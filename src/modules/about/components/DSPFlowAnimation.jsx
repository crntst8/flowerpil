import React from 'react';
import styled, { keyframes, css } from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';

const fadeIn = keyframes`
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
`;

const slideInLeft = keyframes`
  from { opacity: 0; transform: translate(-50%, -50%) translateX(-6px); }
  to { opacity: 1; transform: translate(-50%, -50%) translateX(0); }
`;

const slideInRight = keyframes`
  from { opacity: 0; transform: translate(-50%, -50%) translateX(4px); }
  to { opacity: 1; transform: translate(-50%, -50%) translateX(0); }
`;

const drawLine = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;

// Layout Constants
const SRC_POS = { x: 8, y: 50 };
const HUB_POS = { x: 28, y: 50 };
const DEST_START_X = 48;
const DEST_END_X = 94;

const Container = styled.div`
  position: relative;
  width: 100%;
  max-width: 380px;
  height: 80px;
  margin-bottom: ${theme.spacing.xxl || '3rem'};
  isolation: isolate; /* Create a new stacking context */
  --flow-center-offset: 0px;
  --flow-center: calc(50% + var(--flow-center-offset));

  ${mediaQuery.mobile} {
    max-width: 100%;
    height: 70px;
  }
`;

const FlowLine = styled.div`
  position: absolute;
  left: ${SRC_POS.x}%;
  right: ${100 - DEST_END_X}%;
  top: var(--flow-center);
  height: 1.5px;
  transform: translateY(-50%);
  opacity: 0.2;
  pointer-events: none;
  z-index: 0;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: ${theme.colors.black};
    transform-origin: left center;
    transform: scaleX(0);
    animation: ${props => props.$animate ? css`${drawLine} 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${props.$delay || '0.2s'} forwards` : 'none'};
  }
`;

const Icon = styled.div`
  position: absolute;
  z-index: 2; /* Clearly above the line */
  opacity: 0;
  top: var(--flow-center);
  transform: translate(-50%, -50%);
  background: #f5f5f5;
  border-radius: 50%;
  padding: 4px;
  box-shadow: 0 0 0 2px ${theme.colors.fpwhite}; /* Optional: helps mask if there's sub-pixel bleeding */

  && img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    margin: 0;
    border-radius: 0;
    box-shadow: none;
  }
`;

const SourceIcon = styled(Icon)`
  width: 26px;
  height: 26px;
  left: ${SRC_POS.x}%;
  animation: ${props => props.$animate ? css`${slideInLeft} 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards` : 'none'};

  ${mediaQuery.mobile} {
    width: 22px;
    height: 22px;
  }
`;

const CenterLogo = styled(Icon)`
  width: 36px;
  height: 36px;
  left: ${HUB_POS.x}%;
  border-radius: 10px;
  padding: 0;
  animation: ${props => props.$animate ? css`${fadeIn} 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards` : 'none'};

  img {
    border-radius: 10px;
  }

  ${mediaQuery.mobile} {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    img { border-radius: 8px; }
  }
`;

const DestIcon = styled(Icon)`
  width: 20px;
  height: 20px;
  animation: ${props => props.$animate ? css`${slideInRight} 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${props.$delay || '0.5s'} forwards` : 'none'};

  ${mediaQuery.mobile} {
    width: 16px;
    height: 16px;
    padding: 3px;
  }
`;

const DSPFlowAnimation = ({ isOpen }) => {
  const dspIcons = [
    { src: '/assets/playlist-actions/apple.svg', alt: 'Apple Music' },
    { src: '/assets/playlist-actions/tidal.svg', alt: 'Tidal' },
    { src: '/assets/playlist-actions/soundcloud.svg', alt: 'SoundCloud' },
    { src: '/icons/qobuz.svg', alt: 'Qobuz' },
    { src: '/icons/youtubemusic.svg', alt: 'YouTube Music' },
    { src: '/assets/playlist-actions/bandcamp.svg', alt: 'Bandcamp' },
    { src: '/assets/playlist-actions/mixcloud.svg', alt: 'Mixcloud' },
    { src: '/assets/playlist-actions/discogs.svg', alt: 'Discogs' },
  ];

  // Calculate positions for destinations
  const destCount = dspIcons.length;
  const destStep = (DEST_END_X - DEST_START_X) / (destCount - 1);

  return (
    <Container>
      <FlowLine $animate={isOpen} $delay="0.2s" />

      <SourceIcon $animate={isOpen}>
        <img src="/assets/playlist-actions/spotify.svg" alt="Spotify" />
      </SourceIcon>

      <CenterLogo $animate={isOpen}>
        <img src="/logo-bg.png" alt="Flowerpil" />
      </CenterLogo>

      {dspIcons.map((icon, i) => {
        const leftPos = DEST_START_X + (i * destStep);
        return (
          <DestIcon
            key={i}
            $animate={isOpen}
            $delay={`${0.5 + i * 0.06}s`}
            style={{ left: `${leftPos}%` }}
          >
            <img src={icon.src} alt={icon.alt} />
          </DestIcon>
        );
      })}
    </Container>
  );
};

export default DSPFlowAnimation;
