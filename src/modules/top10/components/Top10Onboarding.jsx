/**
 * Top10 Onboarding Component
 *
 * 3-step onboarding flow for public listeners to create their Top 10 of 2025:
 * Step 1: Email signup
 * Step 2: Display name
 * Step 3: URL import
 *
 * Design: Brutalist aesthetic with black/white contrast, casual lowercase typography
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { motion, useReducedMotion } from 'framer-motion';
import useOnboardingStore from '../store/onboardingStore';

// Animations - Hi-tech premium feel
const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const float = keyframes`
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-2px);
  }
`;

const riseIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const progressSheen = keyframes`
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 100% 50%;
  }
`;

const progressDotBounce = keyframes`
  0%, 70%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  35% {
    transform: translateY(-4px);
    opacity: 1;
  }
`;


// Container - Full viewport, black background
const OnboardingContainer = styled.div`
  min-height: 100vh;
  background: #000;
  display: flex;
  flex-direction: column;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  padding: 0;
  margin: 0;
  overflow-x: hidden;
`;

// Header section with logo
const HeaderSection = styled.header`
  background: #000000;
  padding: clamp(0.1rem, 1vw, 0.2rem) clamp(0.2em, 2vw, 0.5rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(0.75rem, 3vw, 1.5rem);
  min-height: ${({ $isStep1 }) => $isStep1 ? '15vh' : '15vh'};
  transition: min-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  @media (max-width: 375px) {
    min-height: ${({ $isStep1 }) => $isStep1 ? '15vh' : '15vh'};
  }
`;

const StartOverButton = styled.button`
  position: fixed;
  top: calc(env(safe-area-inset-top) + clamp(0.65rem, 2vw, 1.6rem));
  left: calc(env(safe-area-inset-left) + clamp(0.65rem, 3vw, 2.25rem));
  padding: 0.75em 1em;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: lowercase;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  border: 1px dashed rgba(117, 93, 93, 0.8);
  cursor: pointer;
  z-index: 10;
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: all 0.2s ease;
  font-family: inherit;
  animation: ${riseIn} 0.45s cubic-bezier(0.22, 0.9, 0.24, 1) 0.1s both;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
    border-color: rgba(255, 255, 255, 0.5);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  @media (min-width: 768px) {
    font-size: 0.75rem;
    top: clamp(1rem, 2vw, 2rem);
    left: clamp(1.5rem, 6vw, 4rem);
  }
`;

// Logo image styling
const LogoImage = styled.img`
  height: clamp(60px, 15vw, 100px);
  width: auto;
  object-fit: contain;
  flex-shrink: 0;
  animation: ${riseIn} 0.5s cubic-bezier(0.22, 0.9, 0.24, 1) 0.05s both,
             ${float} 3s ease-in-out 0.6s infinite;
  filter: drop-shadow(0 10px 30px rgba(255, 255, 255, 0.1));

  @media (max-width: 375px) {
    height: 60px;
  }
`;



// Content section - light gray with rounded top corners
const ContentSection = styled.section`
  background: linear-gradient(to bottom, #5b5079 0%, #020108 100%);
  flex: 1;
  padding: clamp(1rem, 4vw, 5rem) clamp(0.75rem, 6vw, 1.5rem);
  padding-bottom: calc(env(safe-area-inset-bottom) + 3rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) 0.08s both;
  position: relative;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5);

  @media (min-width: 375px) {
    padding: 2rem 1.25rem;
    padding-bottom: calc(env(safe-area-inset-bottom) + 4rem);
  }
`;

// Content wrapper - constrained width
const ContentWrapper = styled.div`
  width: 100%;
  max-width: 520px;
  display: flex;
  border: rgba(0, 0, 0, 0.01) solid 2px;
  box-shadow: 0 -10px 40px rgba(250, 250, 250, 0.5);
  background: #dadada;
  border-radius: 14px;
  padding: 1.25em;
  flex-direction: column;
  gap: clamp(0.4rem, 3vw, 0.15rem);
  margin-bottom: 1rem;

  @media (max-width: 480px) {
    max-width: 95%;
    padding: 1em 0.9em;
    margin-bottom: 0.75rem;
  }
`;

const FlowerTenImage = styled.img`
  width: clamp(140px, 12vw, 170px);
  height: auto;
  margin: 0 auto 0.5rem;
  display: block;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
const FlowerBlobImage = styled.img`
  width: clamp(140px, 12vw, 170px);
  height: auto;
  margin: 0 auto 0.5rem;
  display: block;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

// Headline
const Headline = styled.h2`
  font-size: clamp(1.4rem, 6vw, 2.2rem);
  font-weight: 900;
  color: #000;
  margin: 0;
  text-align: center;
  letter-spacing: -0.04em;
  text-transform: lowercase;
  white-space: nowrap;
  filter: drop-shadow(0 10px 28px rgba(255, 255, 255, 0.54));
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  @media (max-width: 420px) {
    font-size: 1.35rem;
    white-space: normal;
  }
`;

const Headline1 = styled.h2`
  font-size: clamp(0.85rem, 5vw, 1.1rem);
  font-weight: 700;
  color: #000;
  margin: 0.5em 0 0.75em;
  text-align: center;
  letter-spacing: -0.03em;
  text-transform: lowercase;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  @media (max-width: 375px) {
    font-size: 0.9rem;
    margin: 0.4em 0 0.6em;
  }
`;
const Headline3 = styled.h2`
  font-size: clamp(0.85rem, 5vw, 1.1rem);
  font-weight: 800;
  color: #000;
  margin: 0.75em 0 0.25em;
  text-align: center;
  letter-spacing: -0.02em;
  text-transform: lowercase;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  @media (max-width: 375px) {
    font-size: 0.9rem;
  }
`;

const SubHeadline = styled.h2`
  font-size: clamp(0.7em, 3.5vw, 0.85rem);
  font-weight: 400;
  color: #333;
  margin: 0;
  text-align: center;
  letter-spacing: 0;
  text-transform: none;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'Droid Sans Mono', 'Source Code Pro', monospace;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  @media (max-width: 375px) {
    font-size: 0.75rem;
  }
`;
// Subheading
const Subheading = styled.p`
  font-size: clamp(0.65rem, 3.5vw, 0.8rem);
  color: #444;
  margin: -0.5rem 0 0;
  text-align: center;
  text-transform: none;
  padding: 0.5em 1em;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'Droid Sans Mono', 'Source Code Pro', monospace;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  @media (min-width: 375px) {
    font-size: 0.75rem;
  }
`;
const Subheading2 = styled.p`
  font-size: clamp(0.5rem, 4vw, 0.8rem);
  color: #000;
  margin: -1.5rem 0 0.1em;
  text-align: center;
  line-height: 0;
  text-transform: lowercase;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  @media (max-width: 375px) {
    font-size: 0.5rem;
  }
`;
// Input field
const InputField = styled.input`
  width: 100%;
  padding: 18px 20px;
  font-size: clamp(0.95rem, 4vw, 0.2rem);
  border: 2px solid #000;
  border-radius: 0;
  background: ${({ $hasError }) => $hasError ? '#fff5f5' : '#fff'};
  color: #000;
  font-family: inherit;
  outline: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 56px;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);

  &::placeholder {
    color: #999;
    opacity: 1;
    align-items: center;
  }

  &:focus {
    background: #fff;
    box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.1),
                0 8px 24px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  @media (max-width: 375px) {
    padding: 14px 16px;
    min-height: 52px;
    font-size: 16px; /* Prevent zoom on iOS */
  }
`;

// Button
const Button = styled.button`
  width: 100%;
  padding: 18px 24px;
  font-size: clamp(1rem, 4vw, 1.5rem);
  font-weight: 700;
  text-transform: lowercase;
  background:  rgb(105, 221, 11);
  color: #000;
  border: 2px solid #000;
  border-radius: 0;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  
  min-height: 56px;
      box-shadow: 0 2px 0 #000;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  letter-spacing: 0.01em;

  &:hover:not(:disabled) {
    background:#cbf7c9;
    transform: translateY(-2px);
    box-shadow: 0 4px 0 #000;
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 0 #000;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 375px) {
    padding: 16px 20px;
    min-height: 52px;
    font-size: 1rem;
  }
`;

// Privacy note
const PrivacyNote = styled.p`
  font-size: clamp(0.65rem, 2.8vw, 0.75rem);
  color: #555;
  margin: -0.25rem 0 0;
  text-align: center;
  line-height: 1.4;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'Droid Sans Mono', 'Source Code Pro', monospace;
  animation: ${riseIn} 0.55s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  @media (max-width: 375px) {
    font-size: 0.65rem;
  }
`;

// Error message
const ErrorMessage = styled.div`
  padding: 16px;
  background: #fff5f5;
  border: 2px solid #e53e3e;
  color: #c53030;
  font-size: clamp(0.85rem, 3.5vw, 0.95rem);
  text-align: center;
  border-radius: 4px;
  animation: ${riseIn} 0.35s cubic-bezier(0.22, 0.9, 0.24, 1) var(--stagger-delay, 0s) both;

  @media (max-width: 375px) {
    padding: 14px;
    font-size: 0.85rem;
  }
`;

// Footer with flowerpil logo
const Footer = styled.footer`
  background: transparent;
  padding: clamp(2rem, 5vw, 3.5rem) clamp(1rem, 6vw, 4rem);
  padding-bottom: calc(env(safe-area-inset-bottom) + 2rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(1rem, 3vw, 1.5rem);
  margin-top: auto;
  min-height: 80px;

  @media (max-width: 480px) {
    padding: 1.75rem 1rem;
    padding-bottom: calc(env(safe-area-inset-bottom) + 1.5rem);
    min-height: 70px;
  }
`;

const FooterLogo = styled.img`
  height: 38px;
  width: auto;
  object-fit: contain;
  flex-shrink: 0;
  opacity: 0.85;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 1;
  }

  @media (max-width: 375px) {
    height: 32px;
  }
`;

const FooterLogoLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
`;






const platformLogos = [
  { src: '/assets/playlist-actions/spotify.svg', alt: 'Spotify', href: 'https://open.spotify.com/' },
  { src: '/assets/playlist-actions/apple.svg', alt: 'Apple Music', href: 'https://music.apple.com/' },
  { src: '/assets/playlist-actions/youtube.svg', alt: 'YouTube', href: 'https://music.youtube.com/' },
  { src: '/assets/playlist-actions/soundcloud.svg', alt: 'SoundCloud', href: 'https://soundcloud.com/' },
  { src: '/assets/playlist-actions/tidal.svg', alt: 'Tidal', href: 'https://tidal.com/' },
  { src: '/assets/playlist-actions/qobiz.png', alt: 'Qobuz', href: 'https://www.qobuz.com/' },
  { src: '/assets/playlist-actions/bandcamp.svg', alt: 'Bandcamp', href: 'https://bandcamp.com/' },
];

// Platform Logo Wall (replaces scrolling carousels)
const PlatformLogoWall = styled(motion.div)`
  width: 100%;
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: clamp(0.35rem, 2.2vw, 0.7rem);
  padding: clamp(0.1rem, 2vw, 0.8rem) 0;
  user-select: none;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  &::before {
    content: '';
    position: absolute;
    inset: -12px -48px;
    background: radial-gradient(
      60% 120% at 50% 50%,
      rgba(0, 0, 0, 0.14) 0%,
      rgba(0, 0, 0, 0.06) 45%,
      rgba(0, 0, 0, 0) 70%
    );
    filter: blur(18px);
    opacity: 1;
    pointer-events: none;
  }

  > * {
    position: relative;
    z-index: 1;
  }
`;

const PlatformLogoDrift = styled(motion.div)`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
`;

const PlatformLogoSlot = styled(motion.a)`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.15rem;
  border-radius: 10px;
  will-change: transform;
  text-decoration: none;
`;

const PlatformLogo = styled.img`
  height: clamp(32px, 8vw, 48px);
  width: auto;
  object-fit: contain;
  filter: grayscale(100%);
  opacity: 0.5;
  flex-shrink: 0;
  transition: opacity 0.2s ease, filter 0.2s ease;

  &:hover {
    opacity: 1;
    filter: grayscale(0%);
  }

  @media (max-width: 375px) {
    height: 36px;
  }
`;

// Progress Modal Styles
const ProgressOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: ${fadeIn} 0.2s ease;
`;

const ProgressModal = styled.div`
  position: relative;
  background: #fff;
  color: #000;
  padding: clamp(2rem, 5vw, 3rem);
  border-radius: 0;
  min-width: clamp(280px, 90vw, 420px);
  max-width: 90vw;
  border: 2px solid #000;
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.35);
  overflow: hidden;
`;

const ProgressCloseButton = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  border: 2px solid #000;
  background: #fff;
  color: #000;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  text-transform: lowercase;
  touch-action: manipulation;

  &:hover {
    background: #000;
    color: #fff;
  }
`;

const ProgressTitle = styled.h3`
  font-size: clamp(1.2rem, 3vw, 1.5rem);
  font-weight: 700;
  margin: 0 0 1.5rem 0;
  text-transform: lowercase;
  letter-spacing: -0.02em;
`;

const ProgressMessage = styled.p`
  font-size: clamp(0.9rem, 2.5vw, 1rem);
  margin: 0 0 1.5rem 0;
  color: #666;
  line-height: 1.5;
`;

const ProgressDots = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin: 0 0 1.25rem;

  span {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #000;
    opacity: 0.35;
    animation: ${progressDotBounce} 1.1s ease-in-out infinite;
  }

  span:nth-child(2) {
    animation-delay: 0.12s;
  }

  span:nth-child(3) {
    animation-delay: 0.24s;
  }

  @media (prefers-reduced-motion: reduce) {
    span {
      animation: none;
    }
  }
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 10px;
  background: #f4f4f4;
  border-radius: 0;
  overflow: hidden;
  margin: 1.5rem 0;
  border: 1.5px solid #000;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
`;

const ProgressBarFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #000 0%, #3a3a3a 50%, #000 100%);
  background-size: 200% 100%;
  animation: ${progressSheen} 1.6s ease infinite;
  transition: width 0.35s ease;
  width: ${props => props.$progress}%;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    right: 2px;
    top: 50%;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #000;
    transform: translateY(-50%);
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.35);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ProgressStats = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: clamp(0.85rem, 2vw, 0.95rem);
  color: #999;
  font-weight: 500;
`;

const Top10Onboarding = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const {
    currentStep,
    email,
    displayName,
    playlistUrl,
    error,
    isLoading,
    isAuthenticated,
    awaitingVerification,
    setEmail,
    setDisplayName,
    setPlaylistUrl,
    setError,
    clearError,
    nextStep,
    setStep,
    setLoading,
    setAuthenticated,
    setAttemptedDspImport,
    reset,
  } = useOnboardingStore();

  const [verificationCode, setVerificationCode] = useState('');
  const [linkingProgress, setLinkingProgress] = useState(null); // {status, current_track, total_tracks, message}
  const [isCuratorFlow, setIsCuratorFlow] = useState(false); // Track if user is an existing curator
  const [curatorCheckComplete, setCuratorCheckComplete] = useState(false);
  const linkingCancelRef = useRef(false);
  const emailInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const urlInputRef = useRef(null);
  const verifyInputRef = useRef(null);
  const startOverTouchRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    platformLogos.forEach(({ src }) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  // Check if user is an existing curator on mount - skip to import step if so
  useEffect(() => {
    const checkExistingCurator = async () => {
      // Skip if already checking or already on step 3 with curator flow
      if (curatorCheckComplete) return;

      // Don't interfere with email link verification flow
      const params = new URLSearchParams(location.search);
      if (params.get('email') && params.get('code')) {
        setCuratorCheckComplete(true);
        return;
      }

      try {
        const response = await fetch('/api/v1/auth/status', {
          method: 'GET',
          credentials: 'include'
        });
        const data = await response.json();

        if (data.authenticated && data.user) {
          const { role, email: userEmail, curator_name } = data.user;

          // Check if user is a curator (full account) - not just a regular 'user' role
          if (role === 'curator' || role === 'admin') {
            if (import.meta.env.DEV) {
              console.log('🎯 Curator detected, skipping to import step', {
                role,
                email: userEmail,
                curatorName: curator_name
              });
            }

            // Fetch display name from profile
            let profileDisplayName = curator_name || '';
            try {
              const profileResponse = await fetch('/api/v1/profile/me', {
                method: 'GET',
                credentials: 'include'
              });
              const profileData = await profileResponse.json();
              if (profileResponse.ok && profileData.user?.displayName) {
                profileDisplayName = profileData.user.displayName;
              }
            } catch (profileError) {
              if (import.meta.env.DEV) {
                console.log('Could not fetch profile, using curator_name', profileError);
              }
            }

            // Pre-populate curator data and skip to import step
            setEmail(userEmail || '');
            setDisplayName(profileDisplayName || curator_name || '');
            setAuthenticated(true, data.user.id);
            setIsCuratorFlow(true);
            setStep(3);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.log('Curator check failed (expected for new users)', err);
        }
      } finally {
        setCuratorCheckComplete(true);
      }
    };

    checkExistingCurator();
  }, [location.search, curatorCheckComplete, setEmail, setDisplayName, setAuthenticated, setStep]);

  const handleUnauthorized = () => {
    reset();
    navigate('/top10/start', { replace: true });
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    let isActive = true;

    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/v1/auth/status', {
          method: 'GET',
          credentials: 'include'
        });
        const data = await response.json();

        if (!data.authenticated && isActive) {
          handleUnauthorized();
        }
      } catch (err) {
        if (isActive) {
          handleUnauthorized();
        }
      }
    };

    checkAuthStatus();
    return () => {
      isActive = false;
    };
  }, [isAuthenticated, reset, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const resumeEmail = params.get('email');
    const resumeCode = params.get('code');

    if (!resumeEmail || !resumeCode) return;

    const resumeWithLink = async () => {
      setLoading(true);
      clearError();

      try {
        const response = await fetch('/api/v1/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: resumeEmail, code: resumeCode, purpose: 'login' })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || 'verification failed');
        }

        setEmail(resumeEmail);
        setAuthenticated(true, data.user?.id);

        let profileName = '';
        try {
          const profileResponse = await fetch('/api/v1/profile/me', {
            method: 'GET',
            credentials: 'include'
          });
          const profileData = await profileResponse.json();
          if (profileResponse.ok && profileData.user?.displayName) {
            profileName = profileData.user.displayName;
          }
        } catch (_) {
          profileName = '';
        }

        if (profileName) {
          setDisplayName(profileName);
          setStep(3);
          navigate('/top10/start?step=3', { replace: true });
        } else {
          setStep(2);
          navigate('/top10/start?step=2', { replace: true });
        }
      } catch (err) {
        reset();
        setError(err.message || 'failed to verify link');
        navigate('/top10/start', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    resumeWithLink();
  }, [
    location.search,
    clearError,
    navigate,
    reset,
    setAuthenticated,
    setDisplayName,
    setEmail,
    setError,
    setLoading,
    setStep
  ]);

  const platformLogoWallVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 1 },
        show: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0, y: 10 },
        show: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.5,
            ease: [0.22, 0.9, 0.24, 1],
            delay: 0.1,
            staggerChildren: 0.05,
            delayChildren: 0.08,
          },
        },
      };

  const platformLogoVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 0, scale: 0.98 },
        show: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
      }
    : {
        hidden: () => ({
          opacity: 0,
          y: 12,
          scale: 0.96,
          filter: 'blur(6px)',
        }),
        show: () => ({
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          transition: {
            duration: 0.55,
            ease: [0.22, 0.9, 0.24, 1],
          },
        }),
      };

  const getPlatformLogoDriftAnimation = (index) => {
    if (shouldReduceMotion) return undefined;
    return {
      y: [0, -1.6 - (index % 2) * 0.4, 0],
      rotate: [0, index % 2 === 0 ? -0.3 : 0.3, 0],
    };
  };

  const getPlatformLogoDriftTransition = (index) => {
    if (shouldReduceMotion) return undefined;
    return {
      duration: 4.6 + (index % 3) * 0.6,
      repeat: Infinity,
      ease: 'easeInOut',
      delay: 0.8 + index * 0.05,
    };
  };

  // Browser history support - sync URL with step
  useEffect(() => {
    // Push state when step changes
    const stepParam = currentStep > 1 ? `?step=${currentStep}` : '';
    window.history.pushState({ step: currentStep }, '', `/top10/start${stepParam}`);
  }, [currentStep]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = (event) => {
      const params = new URLSearchParams(window.location.search);
      const step = parseInt(params.get('step')) || 1;
      if (step !== currentStep && step >= 1 && step <= 3) {
        setStep(step);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentStep, setStep]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const step = parseInt(params.get('step'), 10);
    if (step >= 1 && step <= 3) {
      setStep(step);
    }
  }, [setStep]);

  // Focus management
  useEffect(() => {
    if (currentStep === 1 && emailInputRef.current) {
      emailInputRef.current.focus();
    } else if (currentStep === 2 && nameInputRef.current) {
      nameInputRef.current.focus();
    } else if (currentStep === 3 && urlInputRef.current) {
      urlInputRef.current.focus();
    }
  }, [currentStep]);

  // Handle start over
  const handleStartOver = () => {
    // For curators, don't allow resetting to step 1 - just clear the URL
    if (isCuratorFlow) {
      if (window.confirm('Clear the URL and start fresh?')) {
        setPlaylistUrl('');
        clearError();
      }
      return;
    }

    if (window.confirm('Start over? This will reset your progress.')) {
      setStep(1);
      setEmail('');
      setDisplayName('');
      setPlaylistUrl('');
      clearError();
      navigate('/top10/start');
    }
  };

  const handleStartOverClick = (event) => {
    if (event.type === 'touchend') {
      startOverTouchRef.current = Date.now();
      handleStartOver();
      return;
    }

    if (event.type === 'click') {
      if (Date.now() - startOverTouchRef.current < 700) {
        return;
      }
      handleStartOver();
    }
  };

  const handleCancelLinking = () => {
    linkingCancelRef.current = true;
    setLinkingProgress(null);
    setLoading(false);
    setStep(3);
  };

  // Validation helpers
  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateDisplayName = (name) => {
    return name.length >= 2 && name.length <= 50;
  };

  const validateUrl = (url) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const validDomains = [
        'spotify.com',
        'music.apple.com',
        'tidal.com',
        'qobuz.com',
        'soundcloud.com',
        'youtube.com',
        'youtu.be',
        'bandcamp.com'
      ];
      return validDomains.some(domain => hostname.includes(domain));
    } catch {
      return false;
    }
  };

  // Generate a strong password that meets all backend requirements
  const generateSecurePassword = () => {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    const all = lowercase + uppercase + numbers + special;

    // Ensure at least one of each required character type
    let password = '';
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill the rest (total 32 chars)
    for (let i = 4; i < 32; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  // Step 1: Email signup (passwordless, auto-authenticated)
  const handleSignup = async (e) => {
    e.preventDefault();
    clearError();

    if (!validateEmail(email)) {
      setError('please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const password = generateSecurePassword();

      if (import.meta.env.DEV) {
        console.log('🔐 Generated password:', password);
        console.log('📧 Email:', email);
      }

      // Create account with auto-verification (passwordless flow)
      const signupResponse = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          autoVerify: true // Skip email verification for passwordless signup
        }),
      });

      const signupData = await signupResponse.json();

      if (signupResponse.ok && signupData.type === 'login_link_sent') {
        setError(signupData.message || 'Check your email for a link to restart your Top 10.');
        return;
      }

      if (!signupResponse.ok) {
        console.error('❌ Signup failed:', signupData);
        throw new Error(signupData.message || signupData.error || 'signup failed');
      }

      // Auto-verified! Set authenticated and move to next step
      setAuthenticated(true, signupData.user?.id);

      if (import.meta.env.DEV) {
        console.log('✅ Account created and auto-verified (passwordless)');
        console.log('👤 User ID:', signupData.user?.id);
      }

      // Move to step 2 (display name)
      nextStep();
    } catch (err) {
      setError(err.message || 'something went wrong. please try again');
    } finally {
      setLoading(false);
    }
  };

  // Verification
  const handleVerify = async (e) => {
    e.preventDefault();
    clearError();

    if (verificationCode.length !== 6) {
      setError('please enter the 6-digit code');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'verification failed');
      }

      setAuthenticated(true, data.user?.id);
      nextStep();
    } catch (err) {
      setError(err.message || 'invalid code. please try again');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Display name
  const handleDisplayName = (e) => {
    e.preventDefault();
    clearError();

    if (!validateDisplayName(displayName)) {
      setError('name must be between 2 and 50 characters');
      return;
    }

    // Update user profile with display name
    setLoading(true);
    (async () => {
      try {
        const response = await fetch('/api/v1/users/me/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ display_name: displayName }),
        });

        const data = await response.json();

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!response.ok) {
          throw new Error(data.message || 'failed to save name');
        }

        nextStep();
      } catch (err) {
        setError(err.message || 'failed to save name');
      } finally {
        setLoading(false);
      }
    })();
  };

  // Poll for linking progress
  const pollLinkingProgress = async (top10Id) => {
    const maxAttempts = 60; // 60 seconds max
    const pollInterval = 1000; // Poll every 1 second

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (linkingCancelRef.current) {
        return 'cancelled';
      }
      try {
        const response = await fetch(`/api/v1/top10/${top10Id}/link/progress`, {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          const progress = data.progress;

          if (linkingCancelRef.current) {
            return 'cancelled';
          }

          setLinkingProgress(progress);

          // Check if completed or failed
          if (progress.status === 'completed') {
            console.log('Cross-linking completed successfully');
            return 'completed';
          } else if (progress.status === 'failed') {
            console.warn('Cross-linking failed:', progress.message);
            return 'failed';
          }
        }
      } catch (err) {
        console.warn('Failed to poll linking progress:', err);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout
    console.warn('Linking progress polling timed out');
    return 'timeout';
  };

  const fetchExistingTop10 = async () => {
    try {
      const response = await fetch('/api/v1/top10/me', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.status === 401) {
        handleUnauthorized();
        return { unauthorized: true };
      }

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.top10 || null;
    } catch (err) {
      return null;
    }
  };

  // Step 3: URL import
  const handleImport = async (e) => {
    e.preventDefault();
    clearError();

    if (!playlistUrl) {
      setError('please paste a playlist or track url');
      return;
    }

    if (!validateUrl(playlistUrl)) {
      setError('please enter a valid playlist or track url from spotify, apple music, tidal, qobuz, soundcloud, youtube, or bandcamp');
      return;
    }

    const existingTop10 = await fetchExistingTop10();
    if (existingTop10?.unauthorized) {
      return;
    }
    const hasExistingTracks = existingTop10?.tracks && existingTop10.tracks.length > 0;

    if (hasExistingTracks || existingTop10?.is_published) {
      const confirmOverwrite = window.confirm('Replace your current Top 10? This will overwrite your existing tracks.');
      if (!confirmOverwrite) {
        return;
      }
    }

    setLoading(true);
    linkingCancelRef.current = false;
    setLinkingProgress(null); // Reset linking progress

    // Mark that user attempted a DSP URL import (for referral code eligibility)
    // Skip for curator flow - they're already curators and don't need referral codes
    if (!isCuratorFlow) {
      setAttemptedDspImport(true);
    }

    try {
      const response = await fetch('/api/v1/top10/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: playlistUrl }),
      });

      const data = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'import failed');
      }

      const importedTracks = data.tracks || [];
      let top10Id = existingTop10?.id || null;

      if (top10Id) {
        const updateResponse = await fetch(`/api/v1/top10/${top10Id}/tracks`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tracks: importedTracks }),
        });

        const updateData = await updateResponse.json();

        if (updateResponse.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!updateResponse.ok) {
          throw new Error(updateData.error || 'failed to update top10');
        }
      } else {
        const createResponse = await fetch('/api/v1/top10', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: 'My Top 10 of 2025',
            description: '',
            tracks: importedTracks
          }),
        });

        const createData = await createResponse.json();

        if (createResponse.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!createResponse.ok) {
          if (createData.type === 'top10_exists') {
            const fallbackTop10 = await fetchExistingTop10();
            if (fallbackTop10?.unauthorized) {
              return;
            }
            if (!fallbackTop10?.id) {
              throw new Error(createData.error || 'failed to create top10');
            }

            top10Id = fallbackTop10.id;

            const overwriteResponse = await fetch(`/api/v1/top10/${top10Id}/tracks`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ tracks: importedTracks }),
            });

            const overwriteData = await overwriteResponse.json();

            if (overwriteResponse.status === 401) {
              handleUnauthorized();
              return;
            }

            if (!overwriteResponse.ok) {
              throw new Error(overwriteData.error || 'failed to update top10');
            }
          } else {
            throw new Error(createData.error || 'failed to create top10');
          }
        } else {
          top10Id = createData.top10.id;
        }
      }

      // Start cross-linking and poll for progress
      if (importedTracks.length > 0 && top10Id) {
        // Start linking in background (don't await)
        fetch(`/api/v1/top10/${top10Id}/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ forceRefresh: false }),
        }).catch(err => {
          console.warn('Cross-linking request failed:', err);
        });

        // Poll for progress
        const progressStatus = await pollLinkingProgress(top10Id);
        if (progressStatus === 'cancelled') {
          return;
        }
      }

      // Redirect to editor
      navigate('/top10');
    } catch (err) {
      setError(err.message || 'failed to import url. you can add tracks manually in the editor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingContainer>
      <HeaderSection
        $isStep1={currentStep === 1}
      >
      {currentStep > 1 && (
          <StartOverButton
            type="button"
            onClick={handleStartOverClick}
            onTouchEnd={handleStartOverClick}
          >
            start again?
          </StartOverButton>
        )}
        <Link to="/home" aria-label="Flowerpil home">
          <LogoImage src="/2025.png" alt="Flowerpil" />
        </Link>
      </HeaderSection>

      <ContentSection>
        <ContentWrapper>
          {/* Step 1: Email Signup (passwordless) */}
          {/* Only show step 1 after curator check completes to prevent flash for logged-in curators */}
          {currentStep === 1 && !awaitingVerification && curatorCheckComplete && (

            <>
                          <FlowerTenImage style={{ '--stagger-delay': '0.05s' }} src="/flower-10.png" alt="Flowerpil Top 10" />

                          <Headline style={{ '--stagger-delay': '0.12s' }}>10 songs you loved from 2025</Headline>
                          <Headline1 style={{ '--stagger-delay': '0.18s' }}>one link, every platform</Headline1>

                          <SubHeadline style={{ '--stagger-delay': '0.24s' }}>enter your email to get started</SubHeadline>





              {error && <ErrorMessage>{error}</ErrorMessage>}


              <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(1rem, 3vw, 1.25rem)', marginTop: '0.75rem' }}>
                <InputField
                  ref={emailInputRef}
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  $hasError={error}
                  required
                  autoComplete="email"
                  style={{ '--stagger-delay': '0.3s' }}
                />


<PrivacyNote style={{ '--stagger-delay': '0.36s' }}>
                  we will <b> never</b> share, show or spam your email.
                  <br/>
                </PrivacyNote>
                <Button type="submit" disabled={isLoading} style={{ '--stagger-delay': '0.42s' }}>
                  {isLoading ? 'cookin...' : 'continue'}
                </Button>

              </form>
            </>
          )}

          {/* Verification step removed - passwordless flow auto-verifies on signup */}

          {/* Step 2: Display Name */}
          {currentStep === 2 && (
            <>
              <div
                style={{ textAlign: 'center', marginBottom: 'clamp(0.75rem, 2vw, 1rem)' }}
              >
                <FlowerBlobImage style={{ '--stagger-delay': '0.05s' }} src="/blobs.png" alt="Flowerpil Top 10" />
                <Headline style={{ '--stagger-delay': '0.12s' }}>who picked the songs?</Headline>
              </div>

              {error && <ErrorMessage>{error}</ErrorMessage>}

              <form onSubmit={handleDisplayName} style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(1rem, 3vw, 1.25rem)', marginTop: '0.5rem' }}>
                <InputField
                  ref={nameInputRef}
                  type="text"
                  placeholder="your name, your bands name etc."
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isLoading}
                  $hasError={error}
                  required
                  maxLength={50}
                  style={{ '--stagger-delay': '0.2s' }}
                />



                <Button type="submit" disabled={isLoading} style={{ '--stagger-delay': '0.26s' }}>
                  {isLoading ? 'lovely name...' : 'next'}
                </Button>
              </form>
            </>
          )}

          {/* Step 3: URL Import */}
          {currentStep === 3 && (
            <>

<Headline3 style={{ '--stagger-delay': '0.08s' }}>1. create a playlist with your 10 favorites</Headline3>
              <div
                style={{ textAlign: 'center', marginBottom: 'clamp(0.5rem, 2vw, 0.75rem)', marginTop: '0.5rem' }}
              >
                                <PlatformLogoWall
                variants={platformLogoWallVariants}
                initial="hidden"
                animate="show"
              >
                {platformLogos.map((logo, index) => (
                  <PlatformLogoDrift
                    key={logo.alt}
                    animate={getPlatformLogoDriftAnimation(index)}
                    transition={getPlatformLogoDriftTransition(index)}
                  >
                    <PlatformLogoSlot
                      variants={platformLogoVariants}
                      custom={index}
                      href={logo.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${logo.alt} homepage`}
                      whileHover={shouldReduceMotion ? undefined : { scale: 1.06 }}
                      whileTap={shouldReduceMotion ? undefined : { scale: 1.02 }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <PlatformLogo src={logo.src} alt={logo.alt} title={logo.alt} draggable={false} decoding="async" />
                    </PlatformLogoSlot>
                  </PlatformLogoDrift>
                ))}
              </PlatformLogoWall>
              </div>

              <Headline3 style={{ '--stagger-delay': '0.18s', marginTop: '0.25rem' }}>2. paste the playlist url below</Headline3>

              {error && <ErrorMessage>{error}</ErrorMessage>}

              <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 2.5vw, 1rem)', marginTop: '0.5rem' }}>
                <InputField
                  ref={urlInputRef}
                  type="url"
                  placeholder="Paste Playlist URL Here"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  disabled={isLoading}
                  $hasError={error}
                  required
                  style={{ '--stagger-delay': '0.24s' }}
                />

                <Subheading style={{ '--stagger-delay': '0.3s' }}>
                  we'll link every track to all platforms
                </Subheading>

                <Button type="submit" disabled={isLoading} style={{ '--stagger-delay': '0.36s' }}>
                  {isLoading ? 'importing...' : 'import tracks'}
                </Button>
              </form>
            </>
          )}
        </ContentWrapper>

        <Footer>
          <FooterLogoLink to="/home" aria-label="Flowerpil home">
            <FooterLogo src="/text.png" alt="Flowerpil" />
          </FooterLogoLink>
        </Footer>
      </ContentSection>

      {/* Progress Modal */}
      {linkingProgress && linkingProgress.status === 'in_progress' && (
        <ProgressOverlay>
          <ProgressModal>
            <ProgressCloseButton type="button" onClick={handleCancelLinking} aria-label="Cancel import">
              x
            </ProgressCloseButton>
            <ProgressTitle>importing & cross-linking</ProgressTitle>
            <ProgressMessage>{linkingProgress.message || 'Processing...'}</ProgressMessage>
            <ProgressDots aria-hidden="true">
              <span />
              <span />
              <span />
            </ProgressDots>
            <ProgressBarContainer>
              <ProgressBarFill
                $progress={(linkingProgress.current_track / linkingProgress.total_tracks) * 100}
              />
            </ProgressBarContainer>
            <ProgressStats>
              <span>{linkingProgress.current_track} of {linkingProgress.total_tracks} tracks</span>
              <span>{Math.round((linkingProgress.current_track / linkingProgress.total_tracks) * 100)}%</span>
            </ProgressStats>
          </ProgressModal>
        </ProgressOverlay>
      )}
    </OnboardingContainer>
  );
};

export default Top10Onboarding;
