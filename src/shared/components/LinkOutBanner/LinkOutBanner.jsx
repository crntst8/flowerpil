import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';

const SNOOZE_KEY = 'fp:linkout:snoozeUntil';
const VARIANT_KEY = 'fp:linkout:variant';
const VISIT_START_KEY = 'fp:linkout:visitStart';
const AUTO_REFERRAL_KEY = 'fp:linkout:referralContext';
const SNOOZE_DAYS = 7;
const ENGAGEMENT_THRESHOLD = 10000; // 10 seconds
const AUTO_REFERRAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const BannerOverlay = styled.div`
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  z-index: 9999;
  pointer-events: none;
`;

const BannerContainer = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$isVisible' })`
  position: relative;
  max-width: 600px;
  margin: 0 auto;
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(8px);
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  pointer-events: auto;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transform: translateY(${({ $isVisible }) => ($isVisible ? 0 : '20px')});
  transition: opacity 300ms ease-out, transform 300ms ease-out;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    margin: 0;
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    max-width: 100%;
    border-radius: 0;
    border-left: none;
    border-right: none;
  }
`;

const FlowerIcon = styled.img`
  width: 48px;
  height: 48px;
  flex-shrink: 0;

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 40px;
    height: 40px;
  }
`;

const ContentWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0;
`;

const Headline = styled.a`
  font-family: ${theme.fonts.primary};
  font-size: clamp(1rem, 2.8vw, 1.4rem);
  font-weight: bold;
  color: ${theme.colors.white};
  text-decoration: underline;
  margin: 0;
  line-height: 1.1;
  display: block;
  width: 100%;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: opacity ${theme.transitions.fast};

  &:hover {
    opacity: 0.8;
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: ${theme.spacing.md};
  right: ${theme.spacing.md};
  background: transparent;
  border: none;
  color: ${theme.colors.white};
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity ${theme.transitions.fast};

  &:hover {
    opacity: 0.7;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    top: ${theme.spacing.sm};
    right: ${theme.spacing.sm};
    font-size: 20px;
  }
`;

const LinkOutBanner = () => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [config, setConfig] = useState(null);
  const [variant, setVariant] = useState(null);
  const [isEligible, setIsEligible] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [autoReferralContext, setAutoReferralContext] = useState(null);

  const impressionTrackedRef = useRef(false);
  const impressionTimeRef = useRef(null);
  const lastPlaylistIdRef = useRef(null);

  // Don't show banner on certain pages
  const shouldHideBanner = () => {
    // Never show on authenticated pages
    if (isAuthenticated) {
      return true;
    }

    const path = location.pathname;

    // Blacklist of paths where banner should never appear
    const blacklistedPaths = [
      '/signup',
      '/reset-password',
    ];

    // Blacklist of path prefixes
    const blacklistedPrefixes = [
      '/curator-admin',
      '/admin',
      '/auth',
    ];

    // Check exact matches
    if (blacklistedPaths.includes(path)) {
      return true;
    }

    // Check prefix matches
    if (blacklistedPrefixes.some(prefix => path.startsWith(prefix))) {
      return true;
    }

    return false;
  };

  // Event tracking
  const trackEvent = useCallback(async (eventType, timeToAction) => {
    if (!variant) return;

    try {
      await fetch('/api/v1/linkout/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant,
          eventType,
          timeToAction,
          userFingerprint: `${variant}-${Date.now()}`
        })
      });
    } catch (error) {
      console.error('Failed to track linkout event:', error);
    }
  }, [variant]);

  const handleClose = useCallback(() => {
    const timeToAction = impressionTimeRef.current
      ? Date.now() - impressionTimeRef.current
      : null;

    trackEvent('dismiss', timeToAction);
    setIsVisible(false);
    setIsDismissed(true);

    const snoozeUntil = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(SNOOZE_KEY, snoozeUntil.toString());
    localStorage.removeItem(VISIT_START_KEY);
  }, [trackEvent]);

  const handleLinkClick = useCallback(() => {
    const timeToAction = impressionTimeRef.current
      ? Date.now() - impressionTimeRef.current
      : null;

    trackEvent('click', timeToAction);

    // Close banner immediately when clicking through
    setIsVisible(false);
    setIsDismissed(true);
    const snoozeUntil = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(SNOOZE_KEY, snoozeUntil.toString());
    localStorage.removeItem(VISIT_START_KEY);
    if (autoReferralContext?.playlistId) {
      const payload = {
        playlistId: autoReferralContext.playlistId,
        createdAt: Date.now(),
        expiresAt: Date.now() + AUTO_REFERRAL_TTL_MS
      };
      localStorage.setItem(AUTO_REFERRAL_KEY, JSON.stringify(payload));
    }
  }, [trackEvent, autoReferralContext]);

  const parsePlaylistId = useCallback(() => {
    const match = location.pathname.match(/^\/playlists\/(\d+)(?:\/|$)/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }, [location.pathname]);

  const resolveContextPlaylistId = useCallback(() => {
    if (!config) return null;
    const signupMode = config.signupMode || 'link';
    if (signupMode === 'target') {
      if (config.targetPlaylistId === null || config.targetPlaylistId === undefined || `${config.targetPlaylistId}`.trim() === '') {
        return null;
      }
      const parsed = parseInt(config.targetPlaylistId, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (signupMode === 'contextual') {
      return parsePlaylistId();
    }
    return null;
  }, [config, parsePlaylistId]);

  // Fetch configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/v1/linkout/config');
        const result = await response.json();

        if (result.success && result.data.enabled) {
          setConfig(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch linkout config:', error);
      }
    };

    fetchConfig();
  }, []);

  // Check snooze and assign variant
  useEffect(() => {
    if (!config) return;

    const snoozeUntil = localStorage.getItem(SNOOZE_KEY);
    if (snoozeUntil && Date.now() < parseInt(snoozeUntil)) {
      return;
    }

    let assignedVariant = localStorage.getItem(VARIANT_KEY);
    if (!assignedVariant) {
      assignedVariant = Math.random() < 0.5 ? 'A' : 'B';
      localStorage.setItem(VARIANT_KEY, assignedVariant);
    }
    setVariant(assignedVariant);

    // Initialize visit start timestamp if not set
    if (!localStorage.getItem(VISIT_START_KEY)) {
      localStorage.setItem(VISIT_START_KEY, Date.now().toString());
    }
  }, [config]);

  // Check if user has been on site for 10 seconds (eligibility threshold)
  useEffect(() => {
    if (!variant || isEligible) return;

    const checkElapsedTime = () => {
      const visitStart = localStorage.getItem(VISIT_START_KEY);
      if (!visitStart) return;

      const elapsed = Date.now() - parseInt(visitStart);
      if (elapsed >= ENGAGEMENT_THRESHOLD) {
        setIsEligible(true);
      }
    };

    // Check immediately
    checkElapsedTime();

    // Check every second until eligible
    const interval = setInterval(checkElapsedTime, 1000);

    return () => clearInterval(interval);
  }, [variant, isEligible]);

  // Fetch playlist-specific auto-referral context
  useEffect(() => {
    const playlistId = resolveContextPlaylistId();
    if (!playlistId) {
      setAutoReferralContext(null);
      lastPlaylistIdRef.current = null;
      return;
    }

    if (lastPlaylistIdRef.current === playlistId) {
      return;
    }

    lastPlaylistIdRef.current = playlistId;
    const controller = new AbortController();

    const loadPlaylistContext = async () => {
      try {
        const response = await fetch(`/api/v1/linkout/playlist/${playlistId}`, {
          signal: controller.signal
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          setAutoReferralContext(null);
          return;
        }
        if (result.data?.autoReferralEnabled) {
          setAutoReferralContext({
            playlistId: result.data.playlistId,
            playlistTitle: result.data.playlistTitle,
            curatorName: result.data.curatorName,
            curatorType: result.data.curatorType
          });
        } else {
          setAutoReferralContext(null);
        }
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('Failed to fetch linkout playlist context:', error);
        }
        setAutoReferralContext(null);
      }
    };

    loadPlaylistContext();

    return () => controller.abort();
  }, [resolveContextPlaylistId]);

  // Show banner automatically after becoming eligible
  useEffect(() => {
    if (!isEligible || isDismissed || isVisible) return;

    // Small delay for smooth appearance
    const timer = setTimeout(() => {
      setIsVisible(true);
      impressionTrackedRef.current = true;
      impressionTimeRef.current = Date.now();
    }, 500);

    return () => clearTimeout(timer);
  }, [isEligible, isDismissed, isVisible]);

  // Track impression when banner becomes visible
  useEffect(() => {
    if (isVisible && variant && impressionTrackedRef.current && !impressionTimeRef.current) {
      trackEvent('impression', null);
    }
  }, [isVisible, variant, trackEvent]);

  // Early return if banner should be hidden on this page (after all hooks)
  if (shouldHideBanner()) {
    return null;
  }

  if (!config || !variant || !isEligible) {
    return null;
  }

  const currentVariant = (variant === 'A' ? config.variantA : config.variantB) || { headline: '', link: '' };
  const variantLink = currentVariant.link || '';
  const isAutoReferral = Boolean(autoReferralContext?.playlistId);
  const linkUrl = isAutoReferral
    ? `/signup?source=linkout&playlistId=${autoReferralContext.playlistId}`
    : variantLink;
  const headlineText = currentVariant.headline || (isAutoReferral ? 'apply to curate' : '');
  const isExternalLink = linkUrl.startsWith('http');
  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <BannerOverlay>
      <BannerContainer $isVisible={isVisible}>
        <FlowerIcon src="/logo-nobg.png" alt="" />
        <ContentWrapper>
          <Headline
            href={linkUrl}
            {...(isExternalLink ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            onClick={handleLinkClick}
          >
            {headlineText}
          </Headline>
        </ContentWrapper>
        <CloseButton onClick={handleClose} aria-label="Close banner">
          ×
        </CloseButton>
      </BannerContainer>
    </BannerOverlay>,
    portalTarget
  );
};

export default LinkOutBanner;
