import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import CompactPlaylistCard from './CompactPlaylistCard';

/**
 * EndScrollSection - Displays related playlists when user scrolls to bottom
 * Features:
 * - Fetches config from API based on priority: playlist > tag > global
 * - IntersectionObserver for impression tracking
 * - A/B testing support for CTAs
 * - Click tracking analytics
 */
const EndScrollSection = ({ playlistId }) => {
  const [config, setConfig] = useState(null);
  const [relatedPlaylists, setRelatedPlaylists] = useState([]);
  const [variant, setVariant] = useState('default');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasTrackedImpression, setHasTrackedImpression] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const observerRef = useRef(null);
  const sectionRef = useRef(null);

  /**
   * Fetch end-scroll configuration and related playlists from API
   */
  useEffect(() => {
    const fetchConfig = async () => {
      if (!playlistId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/v1/end-scroll/${playlistId}`);

        if (!response.ok) {
          if (response.status === 404) {
            // No configuration for this playlist
            setIsLoading(false);
            return;
          }
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        // Check if feature is disabled
        if (!data.config || !data.config.enabled) {
          setIsLoading(false);
          return;
        }

        setConfig(data.config);
        setRelatedPlaylists(data.relatedPlaylists || []);
        setVariant(data.variant || 'default');
        setIsLoading(false);
      } catch (err) {
        // Silently handle expected errors (no config, 404s)
        // Only log unexpected network errors
        if (err.message && !err.message.includes('404') && !err.message.includes('Not Found')) {
          console.error('[EndScrollSection] Error fetching config:', err);
        }
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [playlistId]);

  /**
   * Set up IntersectionObserver for impression tracking
   */
  useEffect(() => {
    if (!config || !sectionRef.current || hasTrackedImpression) {
      return;
    }

    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1 // Trigger when 10% of section is visible
    };

    const handleIntersection = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasTrackedImpression) {
          trackEvent('impression');
          setHasTrackedImpression(true);
          // Disconnect observer after tracking impression
          observerRef.current?.disconnect();
        }

        if (entry.isIntersecting && !isRevealed) {
          setIsRevealed(true);
        }
      });
    };

    observerRef.current = new IntersectionObserver(handleIntersection, observerOptions);
    observerRef.current.observe(sectionRef.current);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [config, hasTrackedImpression, isRevealed]);

  /**
   * Track analytics event (impression, click, scroll_back)
   */
  const trackEvent = async (eventType, clickedPlaylistId = null) => {
    if (!playlistId || !config) return;

    try {
      await fetch('/api/v1/end-scroll/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playlist_id: playlistId,
          event_type: eventType,
          variant: variant || 'default',
          clicked_playlist_id: eventType === 'click' ? clickedPlaylistId : null,
          user_fingerprint: getUserFingerprint()
        })
      });
    } catch (err) {
      console.error('[EndScrollSection] Error tracking event:', err);
      // Silently fail - don't impact UX
    }
  };

  /**
   * Generate a user fingerprint for anonymous tracking
   * Uses combination of browser/device info
   */
  const getUserFingerprint = () => {
    const navigator_ = typeof navigator !== 'undefined' ? navigator : {};
    const screen_ = typeof screen !== 'undefined' ? screen : {};

    const fingerprint = `${navigator_.userAgent || ''}-${screen_.width || ''}-${screen_.height || ''}-${navigator_.language || ''}`;

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return `fp_${Math.abs(hash).toString(36)}`;
  };

  /**
   * Handle related playlist click
   */
  const handlePlaylistClick = (playlistId) => {
    trackEvent('click', playlistId);
  };

  // Don't render if feature is disabled or if there's no config
  if (isLoading || !config || relatedPlaylists.length === 0) {
    return null;
  }

  if (error) {
    console.warn('[EndScrollSection] Rendering skipped due to error:', error);
    return null;
  }

  // Determine CTA text based on variant
  const ctaText = variant === 'A' && config.variant_a_cta
    ? config.variant_a_cta
    : variant === 'B' && config.variant_b_cta
      ? config.variant_b_cta
      : config.cta_text || 'Explore More Playlists';

  return (
    <SectionContainer ref={sectionRef} $visible={isRevealed}>
      <AmbientGlow $visible={isRevealed} />

      <SectionContent>
        <SectionHeader>
          <TitleChrome />
          <SectionTitle>{ctaText}</SectionTitle>
        </SectionHeader>

        <PlaylistsGrid>
          {relatedPlaylists.map((playlist) => (
            <PlaylistCardWrapper
              key={playlist.id}
              onClick={() => handlePlaylistClick(playlist.id)}
            >
              <CompactPlaylistCard playlist={playlist} />
            </PlaylistCardWrapper>
          ))}
        </PlaylistsGrid>
      </SectionContent>
    </SectionContainer>
  );
};

// Styled Components

const SectionContainer = styled.section`
  position: relative;
  margin-top: ${theme.spacing.md};
  padding: ${theme.spacing.xs} ${theme.layout.xs} ${theme.spacing.xs};
  overflow: hidden;
  isolation: isolate;

  opacity: ${props => props.$visible ? 1 : 0};
  transform: translateY(${props => props.$visible ? '0' : '32px'});
  filter: ${props => props.$visible ? 'none' : 'blur(6px)'};
  transition: opacity 0.5s ease, transform 0.6s ease, filter 0.6s ease;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs} ${theme.spacing.xs};
    margin-top: ${theme.spacing.lg};
    transform: translateY(${props => props.$visible ? '0' : '16px'});
    filter: ${props => props.$visible ? 'none' : 'blur(3px)'};
  }
`;

const AmbientGlow = styled.div`
  position: absolute;
  top: -25%;
  left: -10%;
  right: -10%;
  height: 55%;
  
  filter: blur(48px);
  border-radius: 5px
  opacity: ${props => props.$visible ? 0.7 : 0.4};
  transition: opacity 0.6s ease;
  pointer-events: none;
  z-index: 0;
`;

const GradientOverlay = styled.div`
  position: absolute;
  top: -120px;
  left: 0;
  right: 0;
  height: 220px;
  background: linear-gradient(
    180deg,
    rgba(219, 219, 218, 0) 0%,
    rgba(219, 219, 218, 0.65) 35%,
    rgba(219, 219, 218, 0.95) 70%,
    rgba(219, 219, 218, 1) 100%
  );
  pointer-events: none;
  z-index: 1;
`;

const SectionContent = styled.div`
  position: relative;
  z-index: 2;
  max-width: ${theme.layout.maxWidth};
  margin: 0 auto;
  display: flex;

  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const SectionHeader = styled.div`
  position: relative;
  margin-bottom: ${theme.spacing.lg};
  text-align: center;
  display: flex;
  border-radius: 5px;
  justify-content: center;
  background: black;
  align-items: center;
  opacity: 40%;
  ${mediaQuery.mobile} {
    margin-bottom: ${theme.spacing.md};
  }
`;

const SectionTitle = styled.h2`
  font-size: 28px;
  font-weight: 600;
  color: ${theme.colors.white};
  padding-top: 0.5em;
  padding-bottom: 0.5em;
  margin: 0;
  letter-spacing: -0.5px;
  line-height: 1.1;
  word-break: break-word;
  text-wrap: balance;
  max-width: 880px;
  margin-left: auto;
  margin-right: auto;
  position: relative;
  z-index: 1;

  ${mediaQuery.mobile} {
    font-size: 20px;
  }
`;

const TitleChrome = styled.div`
  position: absolute;
  inset: -12px;
  max-width: 620px;
  margin: 0 auto;
  height: 72px;
  background:
    radial-gradient(70% 120% at 50% 50%, rgba(0, 0, 0, 0.08), transparent 70%),
    linear-gradient(120deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.02));
  filter: blur(16px);
  opacity: 0.85;
  border-radius: 999px;
  pointer-events: none;
  z-index: 0;

  ${mediaQuery.mobile} {
    inset: -8px;
    height: 64px;
    opacity: 0.75;
  }
`;

const SectionSubtitle = styled.p`
  font-size: 14px;
  color: ${theme.colors.darkgrey};
  margin: 0;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;

  ${mediaQuery.mobile} {
    font-size: 12px;
  }
`;

const PlaylistsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: ${theme.spacing.sm};
  width: 100%;
  align-items: stretch;

  ${mediaQuery.wide} {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: ${theme.spacing.sm};
  }

  ${mediaQuery.tablet} {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: ${theme.spacing.sm};
  }

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm};
  }
`;

const PlaylistCardWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  cursor: pointer;
  transition: transform ${theme.transitions.normal}, filter ${theme.transitions.normal};

  &:hover {
    transform: translateY(-2px);
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.12));
  }

  ${mediaQuery.mobile} {
    &:hover {
      transform: translateY(-2px);
    }
  }
`;

export default EndScrollSection;
