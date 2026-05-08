/**
 * Top10PublishSuccessAnimation Component
 *
 * Brief success animation shown after publishing, before transitioning to public page.
 *
 * Features:
 * - Animated checkmark with scale bounce effect
 * - "Published!" text reveal
 * - Brief hold before auto-redirect
 * - Modern, smooth animations optimized for mobile (iOS26/WebKit)
 *
 * Duration: ~2 seconds total before redirect
 */

import React, { useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

// Fade in scale animation for container
const fadeInScale = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
`;

// Circle draw animation
const circleDraw = keyframes`
  0% {
    stroke-dashoffset: 320;
  }
  100% {
    stroke-dashoffset: 0;
  }
`;

// Checkmark draw animation
const checkmarkDraw = keyframes`
  0% {
    stroke-dashoffset: 100;
  }
  100% {
    stroke-dashoffset: 0;
  }
`;

// Success scale bounce
const successBounce = keyframes`
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
`;

// Text reveal from bottom
const textReveal = keyframes`
  0% {
    opacity: 0;
    transform: translateY(10px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
`;

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: ${fadeInScale} 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
`;

const AnimationContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem;
  text-align: center;
`;

const IconWrapper = styled.div`
  width: 120px;
  height: 120px;
  position: relative;
  animation: ${successBounce} 0.6s ease-out 0.5s;

  @media (max-width: 375px) {
    width: 100px;
    height: 100px;
  }
`;

const AnimatedCircle = styled.circle`
  animation: ${circleDraw} 0.6s ease-out forwards;
`;

const AnimatedCheckmark = styled.path`
  animation: ${checkmarkDraw} 0.4s ease-out 0.4s forwards;
`;

const SuccessText = styled.h2`
  font-family: ${theme.fonts.mono};
  font-size: clamp(1.5rem, 5vw, 2rem);
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: ${theme.colors.success};
  margin: 0;
  animation: ${textReveal} 0.4s ease-out 0.6s both;
`;

const SubText = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: clamp(0.875rem, 3vw, 1rem);
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  animation: ${textReveal} 0.4s ease-out 0.8s both;
  letter-spacing: -0.02em;
`;

const Top10PublishSuccessAnimation = ({ onComplete }) => {
  useEffect(() => {
    // Auto-complete after animation sequence (~2 seconds)
    const timer = setTimeout(() => {
      if (onComplete) {
        onComplete();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <Overlay>
      <AnimationContainer>
        <IconWrapper>
          <svg
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '100%', height: '100%' }}
          >
            {/* Circle */}
            <AnimatedCircle
              cx="60"
              cy="60"
              r="50"
              stroke="#4CAF50"
              strokeWidth="4"
              fill="none"
              strokeDasharray="320"
              strokeDashoffset="320"
            />

            {/* Checkmark */}
            <AnimatedCheckmark
              d="M35 60 L52 77 L85 44"
              stroke="#4CAF50"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray="100"
              strokeDashoffset="100"
            />
          </svg>
        </IconWrapper>

        <SuccessText>Published!</SuccessText>
        <SubText>Taking you to your Top 10...</SubText>
      </AnimationContainer>
    </Overlay>
  );
};

export default Top10PublishSuccessAnimation;
