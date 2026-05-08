/**
 * Top10TrackCard Component
 *
 * Individual track card for public Top 10 view
 * Matches mockup: docs/mockup/total-page.png
 *
 * UX Requirements:
 * - Min 64px tap target for entire card
 * - DSP icons min 44x44px each
 * - Mobile-first responsive design
 */

import React, { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import PreviewButton from '../../playlists/components/PreviewButton';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';

const copiedPulse = keyframes`
  0% { transform: scale(1); }
  45% { transform: scale(1.08); }
  100% { transform: scale(1); }
`;

const tooltipFadeIn = keyframes`
  0% { opacity: 0; transform: translateX(-50%) translateY(4px); }
  15% { opacity: 1; transform: translateX(-50%) translateY(0); }
  85% { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
`;

const CopyTooltip = styled.span`
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.88);
  color: #fff;
  padding: 6px 10px;
  border-radius: 4px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  z-index: 100;
  animation: ${tooltipFadeIn} 1.2s ease forwards;

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.88);
  }
`;

const CardContainer = styled.div`
  background: #dadada;
  border: 1px solid rgba(25, 1, 69, 0.85);
  --card-padding: 1px;
  --artwork-size: 115px;
  padding: var(--card-padding);
  min-height: 115px;
  display: flex;
  
  flex-direction: column;
  gap: clamp(10px, 3.5vw, 10px);
  box-shadow:
    5px 5px 0 rgba(0, 0, 0, 0.57),
    inset 0 1px 0 rgb(0, 0, 0);
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* Subtle paper texture effect */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image:
      radial-gradient(circle at 20% 50%, rgba(0, 0, 0, 0.02) 0%, transparent 50%),
      radial-gradient(circle at 80% 80%, rgba(0, 0, 0, 0.02) 0%, transparent 50%);
    pointer-events: none;
  }

  @media (max-width: 375px) {
    --card-padding: 10px;
    --artwork-size: 80px;
    padding: 12px;
    gap: 14px;
  }
`;

const TrackInfo = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: clamp(1em, 3vw, 1px);
  align-items: flex-start;

  @media (max-width: 768px) {
    grid-template-columns: auto 1fr;
  }
`;

const Artwork = styled.img`
  width: var(--artwork-size);
  height: var(--artwork-size);
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
  object-fit: cover;
  margin-top: 0.5em;
  margin-left: 1em;
  box-shadow:
    4px 2px 2px 1px rgba(0, 0, 0, 0.16),
    0 1px 2px rgba(0, 0, 0, 0.62),
    inset 0 0 0 1px rgba(255, 255, 255, 0.3);
  transition: all 0.25s ease;
`;

const ArtworkPlaceholder = styled.div`
  width: var(--artwork-size);
  height: var(--artwork-size);
  flex-shrink: 0;
  margin-top: 0.5em;
  margin-left: 1em;
  box-shadow:
    4px 2px 2px 1px rgba(0, 0, 0, 0.16),
    0 1px 2px rgba(0, 0, 0, 0.62),
    inset 0 0 0 1px rgba(255, 255, 255, 0.3);
  transition: all 0.25s ease;
`;

const Details = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(1px, 1vw, 1px);
  justify-content: center;
  min-height: var(--artwork-size);
    margin-top: 1em;

`;

const Artist = styled.p`
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', sans-serif;
  font-size: clamp(15px, 2vw, 12px);
  font-weight: 600;
  color: rgba(0, 0, 0, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;

  line-height: 1.1;
  letter-spacing: -0.8px;


    @media (max-width: 375px) {
  font-size: clamp(1em, 4.2vw, 1.2em);
  }
`;

const Title = styled.h3`
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', sans-serif;
  font-size: wrap(1em, 4vw, 1.2em);
  font-weight: 700;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.1;
  letter-spacing: -0.025em;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;

  @media (max-width: 375px) {
  font-size: clamp(1em, 4vw, 1.2em);
  }
`;

const Metadata = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: clamp(11px, 1.4vw, 13px);
  color: rgb(0, 0, 0);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 3px;
  font-weight: 500;

  span:first-child {
  font-family: 'Georgia', 'Times New Roman', serif;
    text-transform: none;
    letter-spacing: 0.02em;
    color: rgba(0, 0, 0, 0.78);
  }
`;

const Blurb = styled.div`
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: clamp(13px, 1.6vw, 15px);
  line-height: 1.7;
  color: rgba(0, 0, 0, 0.8);
  margin-top: 4px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.4);
  border-left: 2px solid rgba(0, 0, 0, 0.15);
  border-radius: 2px;
  position: relative;

  /* Subtle quote accent */
  &::before {
    content: '"';
    position: absolute;
    top: 8px;
    left: -6px;
    font-size: 28px;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.12);
    font-family: 'Georgia', serif;
  }

  p {
    margin: 0 0 10px;
    &:last-child {
      margin-bottom: 0;
    }
  }

  strong {
    font-weight: 600;
    color: rgba(0, 0, 0, 0.9);
  }

  em {
    font-style: italic;
    color: rgba(0, 0, 0, 0.75);
  }

  a {
    color: #2d5a7b;
    text-decoration: none;
    border-bottom: 1px solid rgba(45, 90, 123, 0.3);
    transition: border-color 0.2s ease;

    &:hover {
      border-bottom-color: rgba(45, 90, 123, 0.8);
    }
  }
`;

const DSPIcons = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 4em;
  margin-right: 2em;

  /* Hide on mobile - use MobileActionBar instead */
  @media (max-width: 768px) {
    display: none;
  }
`;

const ActionButton = styled.a`
  width: 46px;
  height: 46px;
  min-width: 46px;
  min-height: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid rgba(0, 0, 0, 0.85);
  background: #dadada;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
  border-radius: 0;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.1);

  &:hover {
    background: #ffffff;
    border-color: rgba(0, 0, 0, 1);
    transform: translateY(-1px);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.1);
  }

  &[data-copied='true'] {
    background: rgba(76, 175, 80, 0.25);
    border-color: rgba(76, 175, 80, 0.9);
    animation: ${copiedPulse} 420ms ease;
  }

  img, svg {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
`;

const DSPIcon = ActionButton;

const CopyButtonWrapper = styled.div`
  position: relative;
  display: flex;

  @media (max-width: 768px) {
    flex: 1;
    min-width: 0;
  }
`;

const CopyButton = styled.button`
  width: 46px;
  height: 46px;
  min-width: 46px;
  min-height: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid rgba(0, 0, 0, 0.85);
  background: #dadada;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: inherit;
  padding: 0;

  &:hover {
    background: rgba(255, 255, 255, 1);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  &:active {
    box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.15);
    transform: translateY(0);
  }

  svg {
    width: 20px;
    height: 20px;
    fill: rgba(0, 0, 0, 0.85);
  }

  &[data-copied='true'] {
    background: rgba(76, 175, 80, 0.25);
    border-color: rgba(76, 175, 80, 0.9);
    animation: ${copiedPulse} 420ms ease;
  }

  /* Match mobile action buttons on mobile */
  @media (max-width: 768px) {
    flex: 1;
    width: 100%;
    height: 46px;
    min-width: 0;
    background: #dadada;
    border: 1.5px solid rgba(0, 0, 0, 0.85);
    border-radius: 0;
    box-shadow: none;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;

    &:hover {
      background: #ffffff;
      border-color: rgba(0, 0, 0, 0.35);
      transform: none;
      box-shadow: none;
    }

    &:active {
      transform: scale(0.98);
      box-shadow: none;
    }

    &[data-copied='true'] {
      background: rgba(76, 175, 80, 0.2);
      border-color: rgba(76, 175, 80, 0.9);
      animation: ${copiedPulse} 420ms ease;
    }
  }
`;

const PreviewButtonWrapper = styled.div`
  width: 46px;
  height: 46px;
  min-width: 46px;
  min-height: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid rgba(0, 0, 0, 0.85);
  background: #dadada;
  cursor: pointer;
  transition: all 0.15s ease;
  border-radius: 0;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.1);

  &:hover {
    background: #ffffff;
    border-color: rgba(0, 0, 0, 1);
    transform: translateY(-1px);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.1);
  }

  button {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
    height: 100% !important;
    box-shadow: none !important;
  }

  /* Match mobile action buttons on mobile */
  @media (max-width: 768px) {
    flex: 1;
    height: 46px;
    min-width: 0;
    width: auto;
    background: #dadada;
    border: 1.5px solid rgba(0, 0, 0, 0.85);
    border-left: none;
    border-radius: 0;
    box-shadow: none;

    &:hover {
      background: #ffffff;
      border-color: rgba(0, 0, 0, 0.35);
      transform: none;
      box-shadow: none;
    }

    &:active {
      transform: scale(0.98);
      box-shadow: none;
    }
  }
`;

const StreamingIcon = styled.img`
  width: clamp(20px, 3.5vw, 28px);
  height: clamp(20px, 3.5vw, 28px);
  object-fit: contain;
  opacity: 0.8;
`;

///************/// MOBILE BAR  ///************///
const MobileActionBar = styled.div`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    justify-content: stretch;
    width: 100%;
    gap: 0;

    background: #3c3c3c;
    flex-wrap: nowrap;
    padding: 0.4em 0 0.5em 0;

    overflow: hidden;
    -webkit-tap-highlight-color: transparent;
  }
`;

const MobileActionButton = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 46px;
  min-width: 0;
  border: 1.5px solid rgba(0, 0, 0, 0.85);
  border-left: none;
  background: #dadada;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  border-radius: 0;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;

  &:first-child {
    border-left: 1.5px solid rgba(0, 0, 0, 0.85);
  }

  &:hover {
    background: #ffffff;
    border-color: rgba(0, 0, 0, 0.35);
  }

  &:active {
    transform: scale(0.98);
  }

  &[data-copied='true'] {
    background: rgba(76, 175, 80, 0.2);
    border-color: rgba(76, 175, 80, 0.9);
    animation: ${copiedPulse} 420ms ease;
  }

  img, svg {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
`;

const Top10TrackCard = ({ track }) => {
  const [copiedAction, setCopiedAction] = useState(null);
  const [copiedText, setCopiedText] = useState(null);
  const copiedTimeoutRef = useRef(null);

  const {
    title,
    artist,
    album,
    artwork_url,
    blurb,
    spotify_url,
    apple_music_url,
    tidal_url,
    youtube_url,
    soundcloud_url,
    bandcamp_url,
    qobuz_url,
    custom_url,
    custom_platform_name,
  } = track;

  // Build shareable track link
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = track.id ? `${origin}/track/${track.id}` : null;

  // DSP platform configurations - order matches mockup: Link → TIDAL → Spotify → Apple Music
  const dspPlatforms = [
    // Share link first (matches mockup)
    ...(shareUrl ? [{ name: 'Share', url: shareUrl, icon: '/assets/playlist-actions/link.png', isShareLink: true }] : []),
    // DSP platforms in order
    { name: 'Tidal', url: tidal_url, icon: '/assets/playlist-actions/tidal.svg' },
    { name: 'Spotify', url: spotify_url, icon: '/assets/playlist-actions/spotify.svg' },
    { name: 'Apple Music', url: apple_music_url, icon: '/icons/apple.svg' },
    { name: 'YouTube', url: youtube_url, icon: '/assets/playlist-actions/youtube.svg' },
    { name: 'SoundCloud', url: soundcloud_url, icon: '/assets/playlist-actions/soundcloud.svg' },
    { name: 'Bandcamp', url: bandcamp_url, icon: '/assets/playlist-actions/bandcamp.svg' },
    { name: 'Qobuz', url: qobuz_url, icon: '/icons/qobuz.svg' },
  ];

  // Add custom platform if it exists
  if (custom_url && custom_platform_name) {
    dspPlatforms.push({
      name: custom_platform_name,
      url: custom_url,
      icon: '/icons/link.svg',
    });
  }

  // Filter to only show platforms that have URLs
  const availablePlatforms = dspPlatforms.filter(platform => platform.url);

  const showCopied = (action, text = null) => {
    setCopiedAction(action);
    setCopiedText(text);
    if (copiedTimeoutRef.current) {
      window.clearTimeout(copiedTimeoutRef.current);
    }
    copiedTimeoutRef.current = window.setTimeout(() => {
      setCopiedAction(null);
      setCopiedText(null);
      copiedTimeoutRef.current = null;
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const copyToClipboard = async (text, action, displayText = null) => {
    try {
      if (!navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(text);
      showCopied(action, displayText);
      return true;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Copy failed:', err);
      }
      return false;
    }
  };

  const handleCopyDetails = async () => {
    const text = `${artist} - ${title}`;
    await copyToClipboard(text, 'details', text);
  };

  return (
    <CardContainer>
      <TrackInfo>
        {artwork_url ? (
          <Artwork
            src={artwork_url}
            alt={`${title} by ${artist}`}
            loading="lazy"
            crossOrigin="anonymous"
            onError={(e) => {
              if (import.meta.env.DEV) {
                console.error('Failed to load artwork:', artwork_url);
              }
              e.target.src = '/placeholder-artwork.svg';
            }}
          />
        ) : (
          <ArtworkPlaceholder>
            <PlaceholderArtwork
              itemId={track.id}
              size="small"
              borderRadius="0"
            />
          </ArtworkPlaceholder>
        )}
        <Details>
          <Artist>{artist}</Artist>
          <Title>{title}</Title>
         {/* {album && (
            <Metadata>
              {album && <span>{album}</span>}
            </Metadata>
          )}*/}
        </Details> 

        {(availablePlatforms.length > 0 || track.id) && (
          <DSPIcons>
            {/* Copy Details button */}
            <CopyButtonWrapper>
              {copiedAction === 'details' && copiedText && (
                <CopyTooltip key={Date.now()}>Copied</CopyTooltip>
              )}
              <CopyButton
                onClick={handleCopyDetails}
                data-copied={copiedAction === 'details'}
                title="Copy track details"
                aria-label="Copy track details"
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
              </CopyButton>
            </CopyButtonWrapper>
            {availablePlatforms.map((platform, index) => (
              <DSPIcon
                key={`${platform.name}-${index}`}
                href={platform.url}
                target={platform.isShareLink ? '_self' : '_blank'}
                rel="noopener noreferrer"
                title={platform.isShareLink ? 'Share track' : `Listen on ${platform.name}`}
                aria-label={platform.isShareLink ? 'Share track' : `Listen on ${platform.name}`}
                onClick={(e) => {
                  if (platform.isShareLink) {
                    e.preventDefault();
                    void copyToClipboard(platform.url, 'share');
                  }
                }}
                data-copied={copiedAction === 'share' && platform.isShareLink}
              >
                <StreamingIcon src={platform.icon} alt={platform.name} />
              </DSPIcon>
            ))}
            {/* Preview/Play button at the end */}
            <PreviewButtonWrapper>
              <PreviewButton track={track} />
            </PreviewButtonWrapper>
          </DSPIcons>
        )}
      </TrackInfo>

      {blurb && (
        <Blurb dangerouslySetInnerHTML={{ __html: blurb }} />
      )}

      {(availablePlatforms.length > 0 || track.id) && (
        <MobileActionBar>
          {/* Copy Details button */}
          <CopyButtonWrapper>
            {copiedAction === 'details' && copiedText && (
              <CopyTooltip key={Date.now()}>Copied</CopyTooltip>
            )}
            <CopyButton
              onClick={handleCopyDetails}
              data-copied={copiedAction === 'details'}
              title="Copy track details"
              aria-label="Copy track details"
            >
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
            </CopyButton>
          </CopyButtonWrapper>
          {availablePlatforms.map((platform, index) => (
            <MobileActionButton
              key={`mobile-${platform.name}-${index}`}
              href={platform.url}
              target={platform.isShareLink ? '_self' : '_blank'}
              rel="noopener noreferrer"
              title={platform.isShareLink ? 'Share track' : `Listen on ${platform.name}`}
              onClick={(e) => {
                if (platform.isShareLink) {
                  e.preventDefault();
                  void copyToClipboard(platform.url, 'share');
                }
              }}
              data-copied={copiedAction === 'share' && platform.isShareLink}
            >
              <StreamingIcon src={platform.icon} alt={platform.name} />
            </MobileActionButton>
          ))}
          <PreviewButtonWrapper>
            <PreviewButton track={track} className="mobile-preview-button" />
          </PreviewButtonWrapper>
        </MobileActionBar>
      )}
    </CardContainer>
  );
};

export default Top10TrackCard;
