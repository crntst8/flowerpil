import React, { useState, useMemo, useEffect } from 'react';
import styled, { ThemeConsumer } from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import LazyImage from '@shared/components/LazyImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';
import ImageModal from '@shared/components/ImageModal';
import FlagModal from '@shared/components/FlagModal';
import SignupModal from '@shared/components/SignupModal';
const TrackShareModal = React.lazy(() => import('./TrackShareModal'));
import PreviewButton from './PreviewButton';
import { parseGenreTags } from '@shared/utils/genreUtils';
import { useAuth } from '@shared/contexts/AuthContext';
import metaPixel from '@shared/utils/metaPixel';
import siteAnalytics from '@shared/utils/siteAnalytics';

// Helper function to get platform icon path from custom source name
const getPlatformIconPath = (platformName) => {
  if (!platformName) return '/assets/playlist-actions/website.png';

  const normalized = platformName.toLowerCase().trim();

  // Platform mapping
  const platformMap = {
    'youtube': 'youtube',
    'spotify': 'spotify',
    'apple music': 'apple',
    'apple': 'apple',
    'tidal': 'tidal',
    'bandcamp': 'bandcamp',
    'soundcloud': 'soundcloud',
    'qobuz': 'qobiz',
    'mixcloud': 'mixcloud',
    'discord': 'discord',
    'instagram': 'instagram',
    'tiktok': 'tiktok',
    'reddit': 'reddit'
  };

  const iconName = platformMap[normalized];
  return iconName
    ? `/assets/playlist-actions/${iconName}.png`
    : '/assets/playlist-actions/website.png';
};

const ExpandableTrack = ({
  track,
  index,
  showCopyButton = true,
  showStreaming = true,
  playlistId,
  playlistMetaPixelId,
  genreLookup,
  onAddToList
}) => {
  const { isAuthenticated, authenticatedFetch } = useAuth();

  const [isExpanded, setIsExpanded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);
  const [isTrackShareModalOpen, setIsTrackShareModalOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const tags = useMemo(() => parseGenreTags(track?.genre), [track?.genre]);

  // Parse custom_sources if it's a JSON string
  const customSources = useMemo(() => {
    if (!track?.custom_sources) return [];
    try {
      return typeof track.custom_sources === 'string'
        ? JSON.parse(track.custom_sources)
        : track.custom_sources;
    } catch (e) {
      console.error('Failed to parse custom_sources:', e);
      return [];
    }
  }, [track?.custom_sources]);

  const resolvedTags = useMemo(() => {
    if (!tags.length) return [];
    const resolve = genreLookup?.resolve;
    const seen = new Set();
    return tags.map(tag => {
      const match = typeof resolve === 'function' ? resolve(tag) : null;
      const label = match?.label || tag;
      const color = match?.color || '#000000';
      const key = (match?.id || label || tag).toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: key,
        label,
        color
      };
    }).filter(Boolean);
  }, [genreLookup, tags]);

  const handleToggle = () => {
    if (!isExpanded) {
      siteAnalytics.trackClick('playlist_track', 'track_expand', { track_id: String(track?.id || ''), position: String(index ?? '') });
    }
    setIsExpanded(!isExpanded);
  };

  const handleArtworkClick = (e) => {
    e.stopPropagation();
    if (track.artwork_url || track.album_artwork_url) {
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleCloseFlagModal = () => {
    setIsFlagModalOpen(false);
  };

  const handleFlagTrack = (e) => {
    e.stopPropagation();
    setIsFlagModalOpen(true);
  };

  const handleStreamingClick = (platform) => (event) => {
    event.stopPropagation();
    siteAnalytics.trackClick('playlist_track', 'dsp_link_click', { platform: String(platform || 'unknown'), track_id: String(track?.id || '') });

    if (typeof window === 'undefined') return;

    const pixelIds = metaPixel.getMetaPixelTargets({ curatorPixelId: playlistMetaPixelId });
    if (!metaPixel.canTrackMetaPixel({ curatorPixelId: playlistMetaPixelId }) || !pixelIds.length) {
      return;
    }

    const eventIdBase = metaPixel.createEventId();
    const resolvedPlatform = typeof platform === 'string' ? platform.toLowerCase() : 'unknown';

    metaPixel.trackEvent({
      eventName: 'PlaylistClickout',
      eventIdBase,
      curatorPixelId: playlistMetaPixelId,
      params: {
        content_ids: playlistId ? [String(playlistId)] : [],
        content_type: 'track',
        content_name: track?.title || '',
        platform: resolvedPlatform
      }
    });

    const payload = {
      event_name: 'PlaylistClickout',
      event_id_base: eventIdBase,
      pixel_ids: pixelIds,
      event_source_url: window.location.href,
      custom_data: {
        playlist_id: playlistId || null,
        track_id: track?.id || null,
        platform: resolvedPlatform
      }
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/v1/meta/events', body);
    } else {
      fetch('/api/v1/meta/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
      }).catch(() => {});
    }
  };

  const handleCopyTrack = async () => {
    if (!track?.id) return;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const playlistSuffix = playlistId ? `?playlist=${encodeURIComponent(playlistId)}` : '';
    const shareUrl = `${origin}/track/${track.id}${playlistSuffix}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);

      console.log('Track share URL copied to clipboard:', shareUrl);
    } catch (error) {
      console.error('Failed to copy track share URL:', error);
    }
  };

  // Check if track is saved on mount
  // DISABLED: Save feature is not currently in use
  // useEffect(() => {
  //   const checkSavedStatus = async () => {
  //     if (!isAuthenticated || !track?.id) return;

  //     try {
  //       const response = await authenticatedFetch(`/api/v1/saved/check/${track.id}`);
  //       const data = await response.json();

  //       if (response.ok && data.success) {
  //         setIsSaved(data.saved);
  //       }
  //     } catch (error) {
  //       console.error('Failed to check saved status:', error);
  //     }
  //   };

  //   checkSavedStatus();
  // }, [isAuthenticated, track?.id, authenticatedFetch]);

  // Handle save/unsave
  const handleSaveToggle = async (e) => {
    e.stopPropagation();

    // Show signup modal if not authenticated
    if (!isAuthenticated) {
      setIsSignupModalOpen(true);
      return;
    }

    if (isSaving) return;

    // Optimistic UI update
    const previousSaved = isSaved;
    setIsSaved(!isSaved);
    setIsSaving(true);

    try {
      const url = `/api/v1/saved/${track.id}`;
      const method = previousSaved ? 'DELETE' : 'POST';

      const response = await authenticatedFetch(url, { method });

      if (!response.ok) {
        // Revert on error
        setIsSaved(previousSaved);
        console.error('Failed to toggle save:', await response.text());
      }
    } catch (error) {
      // Revert on error
      setIsSaved(previousSaved);
      console.error('Failed to toggle save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDuration = (duration) => {
    if (!duration) return '';
    // If it's already in MM:SS format, return as is
    if (typeof duration === 'string' && duration.includes(':')) return duration;
    // Convert to number and handle milliseconds vs seconds
    const numDuration = Number(duration);
    if (isNaN(numDuration)) return '';
    // If it's milliseconds (likely from Spotify API), convert to seconds
    const seconds = numDuration > 10000 ? Math.floor(numDuration / 1000) : numDuration;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <TrackContainer $hasQuote={!!track.quote}>

      {/* Quote */}
      {!!track.quote && (
        <>
          <QuoteAddon dangerouslySetInnerHTML={{ __html: track.quote }} />
          <MobileQuote dangerouslySetInnerHTML={{ __html: track.quote }} />
        </>
      )}



      <TrackMainContent onClick={handleToggle}>
        {/* Track Artwork */}
        <TrackMainArtwork onClick={handleArtworkClick} hasArtwork={!!(track.artwork_url || track.album_artwork_url)}>
          {(track.artwork_url || track.album_artwork_url) ? (
            <LazyImage
              src={track.artwork_url || track.album_artwork_url}
              alt={`${track.artist} - ${track.title} artwork`}
              placeholder="NO ART"
              loading="lazy"
            />
          ) : (
            <PlaceholderArtwork
              itemId={track.id}
              size="small"
              borderRadius="0"
            />
          )}
        </TrackMainArtwork>




        {/* Track Content and Actions Container */}
        <TrackContentAndActions>
          <TrackContentColumn>
            <TrackText>
              {/* Row 1: Badge (col 1) + Artist/Title (col 2) */}
 
              <ArtistTitleBlock data-artist-title>
                <ArtistTitleRow>
                  {track.artist && (
                    <ArtistName>{track.artist}</ArtistName>
                  )}

                  <SongTitle>{track.title}</SongTitle>
                </ArtistTitleRow>
                {resolvedTags.length > 0 && (
                  <GenreTagList>
                    {resolvedTags.map(tag => (
                      <GenreTag key={tag.id} $color={tag.color}>
                        {tag.label.toUpperCase()}
                      </GenreTag>
                    ))}
                  </GenreTagList>
                )}
              </ArtistTitleBlock>

            </TrackText>
          </TrackContentColumn>




          <TrackActions>
            {/* Save Button 
            <SaveButton
              onClick={handleSaveToggle}
              title={isSaved ? 'Unsave track' : 'Save track'}
              $isSaved={isSaved}
              disabled={isSaving}
            >
              <SaveIcon>{isSaved ? '✓' : '+'}</SaveIcon>
            </SaveButton>
*/}
            {/* Add to List Button 
            {onAddToList && (
              <CopyButton
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToList(track);
                }}
                title="Add to list"
              >
                <CopyIcon>⩲</CopyIcon>
              </CopyButton>
            )}
*/}
            {/* Copy Button */}
            {showCopyButton && (
              <CopyButton
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTrackShareModalOpen(true);
                }}
                title="Share track"
                $isCopied={isCopied}
              >
                {isCopied ? (
                  <CopyIcon>✓</CopyIcon>
                ) : (
                  <StreamingIcon src="/assets/playlist-actions/share.png" alt="Share" />
                )}
              </CopyButton>
            )}




            {/* DSP Integration Icons */}
            {showStreaming && (
              <DSPButtonGroup>
                {/* Custom Sources - positioned after share button */}
                {customSources.map((source, idx) => (
                  source.url && source.name && (
                    <StreamingButton
                      key={idx}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Listen on ${source.name}`}
                      onClick={handleStreamingClick(source.name)}
                    >
                      <StreamingIcon src={getPlatformIconPath(source.name)} alt={source.name} />
                    </StreamingButton>
                  )
                ))}

                {/* Tidal - use cross-platform URL if available, fallback to old ID-based URL */}
                {(track.tidal_url || track.tidal_id) && (
                  <StreamingButton
                    href={track.tidal_url || `https://tidal.com/browse/track/${track.tidal_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Listen on Tidal"
                    onClick={handleStreamingClick('tidal')}
                  >
                    <StreamingIcon src="/assets/playlist-actions/tidal.svg" alt="Tidal" />
                  </StreamingButton>
                )}



                {/* Apple Music - use cross-platform URL if available, fallback to old ID-based URL */}
                {(track.apple_music_url || track.apple_id) && (
                  <StreamingButton
                    href={track.apple_music_url || `https://music.apple.com/song/${track.apple_id}?mt=1&app=music`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Listen on Apple Music"
                    onClick={handleStreamingClick('apple')}
                  >
                    <StreamingIcon src="/icons/apple.png" alt="Apple Music" />
                  </StreamingButton>
                )}



                {/* Spotify - keep existing behavior (no cross-platform linking for Spotify yet) */}
                {track.spotify_id && (
                  <StreamingButton
                    href={`https://open.spotify.com/track/${track.spotify_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Listen on Spotify"
                    onClick={handleStreamingClick('spotify')}
                  >
                    <StreamingIcon src="/assets/playlist-actions/spotify.svg" alt="Spotify" />
                  </StreamingButton>
                )}

                {/* YouTube Music */}
                {(track.youtube_music_url || track.youtube_music_id) && (
                  <StreamingButton
                    href={track.youtube_music_url || `https://music.youtube.com/watch?v=${track.youtube_music_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Listen on YouTube Music"
                    onClick={handleStreamingClick('youtube_music')}
                  >
                    <StreamingIcon src="/assets/playlist-actions/youtube.png" alt="YouTube Music" />
                  </StreamingButton>
                )}

                {/* Bandcamp */}
                {track.bandcamp_url && (
                  <StreamingButton
                    href={track.bandcamp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Listen on Bandcamp"
                    onClick={handleStreamingClick('bandcamp')}
                  >
                    <StreamingIcon src="/assets/playlist-actions/bandcamp.svg" alt="Bandcamp" />
                  </StreamingButton>
                )}

                {/* SoundCloud */}
                {track.soundcloud_url && (
                  <StreamingButton
                    href={track.soundcloud_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Listen on SoundCloud"
                    onClick={handleStreamingClick('soundcloud')}
                  >
                    <StreamingIcon src="/assets/playlist-actions/soundcloud.svg" alt="SoundCloud" />
                  </StreamingButton>
                )}

                {/* Qobuz */}
                {track.qobuz_url && (
                  <StreamingButton
                    href={track.qobuz_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Listen on Qobuz"
                    onClick={handleStreamingClick('qobuz')}
                  >
                    <StreamingIcon src="/assets/playlist-actions/qobiz.png" alt="Qobuz" />
                  </StreamingButton>
                )}
              </DSPButtonGroup>
            )}


            {/* Preview Button */}
            <span onClick={() => siteAnalytics.trackClick('playlist_track', 'preview_play', { track_id: String(track?.id || '') })}><PreviewButton track={track} /></span>
          </TrackActions>
        </TrackContentAndActions>
      </TrackMainContent>



      {/* Mobile Action Bar */}
      <MobileActionBar>
        {/* Save Button - first position 
        <MobileActionButton
          onClick={handleSaveToggle}
          title={isSaved ? 'Unsave track' : 'Save track'}
          disabled={isSaving}
          style={{ borderColor: isSaved ? theme.colors.fpwhite : theme.colors.black }}
        >
          <SaveIcon>{isSaved ? '✓' : '+'}</SaveIcon>
        </MobileActionButton>*/}

        {/* Add to List Button 
        {onAddToList && (
          <MobileActionButton
            onClick={(e) => {
              e.stopPropagation();
              onAddToList(track);
            }}
            title="Add to list"
          >
            <CopyIcon>📋</CopyIcon>
          </MobileActionButton>
        )}
          */}

        {/* Copy Button */}
        {showCopyButton && (
          <MobileActionButton
            onClick={(e) => {
              e.stopPropagation();
              setIsTrackShareModalOpen(true);
            }}
            title="Share track"
            $isCopied={isCopied}
          >
            {isCopied ? (
              <>
                <CopyIcon>✓</CopyIcon>
                <CopiedMessage>Copied!</CopiedMessage>
              </>
            ) : (
              <StreamingIcon src="/assets/playlist-actions/share.png" alt="Share" />
            )}
          </MobileActionButton>
        )}




        {/* DSP Integration Icons */}
        {showStreaming && (
          <>
            {/* Custom Sources - positioned after share button */}
            {customSources.map((source, idx) => (
              source.url && source.name && (
                <MobileActionButton
                  key={idx}
                  as="a"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Listen on ${source.name}`}
                  onClick={handleStreamingClick(source.name)}
                >
                  <StreamingIcon src={getPlatformIconPath(source.name)} alt={source.name} />
                </MobileActionButton>
              )
            ))}
            {(track.tidal_url || track.tidal_id) && (
              <MobileActionButton
                as="a"
                href={track.tidal_url || `https://tidal.com/browse/track/${track.tidal_id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Listen on Tidal"
                onClick={handleStreamingClick('tidal')}
              >
                <StreamingIcon src="/assets/playlist-actions/tidal.svg" alt="Tidal" />
              </MobileActionButton>
            )}
            {(track.apple_music_url || track.apple_id) && (
              <MobileActionButton
                as="a"
                href={track.apple_music_url || `https://music.apple.com/song/${track.apple_id}?mt=1&app=music`}
                target="_blank"
                rel="noopener noreferrer"
                title="Listen on Apple Music"
                onClick={handleStreamingClick('apple')}
              >
                <StreamingIcon src="/icons/apple.png" alt="Apple Music" />
              </MobileActionButton>
            )}
            {track.spotify_id && (
              <MobileActionButton
                as="a"
                href={`https://open.spotify.com/track/${track.spotify_id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Listen on Spotify"
                onClick={handleStreamingClick('spotify')}
              >
                <StreamingIcon src="/assets/playlist-actions/spotify.svg" alt="Spotify" />
              </MobileActionButton>
            )}
            {(track.youtube_music_url || track.youtube_music_id) && (
              <MobileActionButton
                as="a"
                href={track.youtube_music_url || `https://music.youtube.com/watch?v=${track.youtube_music_id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Listen on YouTube Music"
                onClick={handleStreamingClick('youtube_music')}
              >
                <StreamingIcon src="/assets/playlist-actions/youtube.png" alt="YouTube Music" />
              </MobileActionButton>
            )}
            {track.bandcamp_url && (
              <MobileActionButton
                as="a"
                href={track.bandcamp_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Listen on Bandcamp"
                onClick={handleStreamingClick('bandcamp')}
              >
                <StreamingIcon src="/assets/playlist-actions/bandcamp.svg" alt="Bandcamp" />
              </MobileActionButton>
            )}
            {track.soundcloud_url && (
              <MobileActionButton
                as="a"
                href={track.soundcloud_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Listen on SoundCloud"
                onClick={handleStreamingClick('soundcloud')}
              >
                <StreamingIcon src="/assets/playlist-actions/soundcloud.svg" alt="SoundCloud" />
              </MobileActionButton>
            )}
            {track.qobuz_url && (
              <MobileActionButton
                as="a"
                href={track.qobuz_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Listen on Qobuz"
                onClick={handleStreamingClick('qobuz')}
              >
                <StreamingIcon src="/assets/playlist-actions/qobiz.png" alt="Qobuz" />
              </MobileActionButton>
            )}
          </>
        )}





        {/* Preview Button */}
        <PreviewButton track={track} className="mobile-preview-button" />
      </MobileActionBar>




      {/* Expanded Details */}
      {isExpanded && (
        <TrackDetails>
          <DetailsGrid>
            {track.album && (
              <DetailItem>
                <DetailLabel>Album</DetailLabel>
                <DetailValue>{track.album}</DetailValue>
              </DetailItem>
            )}

            {track.year && (
              <DetailItem>
                <DetailLabel>Year</DetailLabel>
                <DetailValue>{track.year}</DetailValue>
              </DetailItem>
            )}

            {track.duration && (
              <DetailItem>
                <DetailLabel>Duration</DetailLabel>
                <DetailValue>{formatDuration(track.duration)}</DetailValue>
              </DetailItem>
            )}

            {track.label && (
              <DetailItem>
                <DetailLabel>Label</DetailLabel>
                <DetailValue>{track.label}</DetailValue>
              </DetailItem>
            )}

            {track.genre && (
              <DetailItem>
                <DetailLabel>Genre</DetailLabel>
                <DetailValue>{track.genre}</DetailValue>
              </DetailItem>
            )}


            {track.explicit === true && (
              <DetailItem>
                <DetailLabel>Content</DetailLabel>
                <DetailValue>Explicit</DetailValue>
              </DetailItem>
            )}

            {track.isrc && (
              <DetailItem>
                <DetailLabel>ISRC</DetailLabel>
                <DetailValue>{track.isrc}</DetailValue>
              </DetailItem>
            )}
          </DetailsGrid>



          {/* Track Actions Section */}
          <TrackActionsSection>
            <TrackActionButtons>
              <FlagButton
                onClick={handleFlagTrack}
                title="Flag track for review"
              >
                🏴 Report Issue
              </FlagButton>
            </TrackActionButtons>
          </TrackActionsSection>
        </TrackDetails>
      )}




      {/* Image Modal */}
      <ImageModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        src={track.artwork_url || track.album_artwork_url}
        alt={`${track.artist} - ${track.title} artwork`}
      />




      {/* Flag Modal */}
      <FlagModal
        isOpen={isFlagModalOpen}
        onClose={handleCloseFlagModal}
        track={track}
        playlistId={playlistId}
      />

      {/* Signup Modal */}
      <SignupModal
        isOpen={isSignupModalOpen}
        onClose={() => setIsSignupModalOpen(false)}
        onSuccess={() => {
          // After successful signup, check saved status again
          setIsSaved(false);
        }}
      />

      {/* Track Share Modal */}
      {isTrackShareModalOpen && (
        <React.Suspense fallback={null}>
          <TrackShareModal
            isOpen={isTrackShareModalOpen}
            onClose={() => setIsTrackShareModalOpen(false)}
            track={track}
            playlistId={playlistId}
            platformLinks={{
              spotify: track.spotify_url,
              apple: track.apple_music_url,
              tidal: track.tidal_url
            }}
          />
        </React.Suspense>
      )}
    </TrackContainer>
  );
};




// Styled Components
const TrackContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$hasQuote'
})`
  margin-bottom: ${theme.spacing.sm};
  border: ${theme.borders.solid} ${props => props.$hasQuote ? theme.colors.quote : theme.colors.black};
  background: ${theme.colors.fpwhite};



  &:last-child {
    margin-bottom: 0;
  }
`;

const TrackMainContent = styled.div`
  display: flex;
  align-items: center;
  padding: ${theme.spacing.md};
  cursor: pointer;
  transition: background-color 0.2s ease;
  gap: ${theme.spacing.sm}; /* Increased from md to lg for more space */
  
  &:hover {
    background: rgba(rgba(67, 142, 255, 0.2));
  }
  
  ${mediaQuery.tablet} {
    gap: ${theme.spacing.sm}; /* Increased from sm to md on mobile */
    align-items: center; /* Keep centered on mobile too */
    padding: ${theme.spacing.sm};
  }
`;

const TrackContentAndActions = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  gap: ${theme.spacing.md};
  min-width: 0;
  
  ${mediaQuery.tablet} {
    flex-direction: column;
    align-items: stretch;
    gap: 0; /* No gap - action bar will be separate */
  }
`;


const TrackMainArtwork = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'hasArtwork'
})`
  width: 100px;
  height: 100px;
  flex-shrink: 0;
  border: ${theme.borders.solid} ${theme.colors.gray[400]};
  display: flex;
  align-items: center;
  margin-left: 12px;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  align-self: center;
  cursor: ${props => props.hasArtwork ? 'pointer' : 'default'};
  transition: all 120ms ease-out;
  
  ${props => props.hasArtwork && `
    &:hover {
      border-color: ${theme.colors.black};
      background: rgba(255, 255, 255, 0.05);
      transform: scale(1.02);
    }
    
    &:active {
      transform: scale(0.98);
      background: rgba(255, 255, 255, 0.1);
    }
  `}
  
  ${mediaQuery.tablet} {
    width: 80px;
    height: 80px;
    flex-shrink: 0;
    align-self: center;


    ${props => props.hasArtwork && `
      &:hover {
        transform: none; /* Disable hover transform on mobile */
      }

      &:active {
        transform: scale(0.95);
      }
    `}
  }
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    
    &:hover,
    &:active {
      transform: none;
    }
  }
`;

const TrackContentColumn = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center; /* Center content vertically with image */
  gap: ${theme.spacing.xs};
  flex: 1;
  min-width: 0;
  
  ${mediaQuery.mobile} {
    flex: 1;
    min-width: 0;
    justify-content: center; /* Keep centered on mobile */
  }
`;

const TrackText = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  color: ${theme.colors.black};
  line-height: 1.6;
  flex: 1;
  text-align: left;
  display: grid;
  grid-template-columns: auto 1fr; /* badge | text */
  grid-auto-rows: minmax(0, auto);
  align-items: center;
  column-gap: ${theme.spacing.md};
  row-gap: ${theme.spacing.xs};
  overflow: hidden;

  /* Place badge at (1,1), artist/title at (1,2) */
  & > span[data-badge] {
    grid-column: 1 / 2;
    grid-row: 1 / 2;
  }
  & > div[data-artist-title] {
    grid-column: 2 / 3;
    grid-row: 1 / 2;
  }

  ${mediaQuery.tablet} {
    line-height: 1.4;
  }
`;

const NonDSPBadge = styled.span`
  display: inline-block;
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  color: ${theme.colors.gray[600]};
  padding: 2px 6px;
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  margin-right: ${theme.spacing.xs};
  &[data-badge] { /* grid hook */ }
`;

// DESKTOP ACTIONS - Button sizes: 48x48px
const TrackActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-shrink: 0;
  background: ${theme.colors.fpwhite};
  margin-right: 12px;
  pointer-events: auto; /* Capture clicks and prevent bubbling to TrackMainContent */


  ${mediaQuery.tablet} {
    display: none; /* Hidden on mobile - actions move to MobileActionBar below */
  }
`;

const DSPButtonGroup = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};

  ${mediaQuery.tablet} {
    display: contents; /* Contents collapse into parent flex container */
  }
`;




const StreamingButton = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px; /* Increased from 40px to match mobile ratio */
  height: 48px; /* Increased from 40px to match mobile ratio */
  background: transparent;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
  
  &:hover {
    border-color: ${theme.colors.fpwhite};
    background: rgba(67, 142, 255, 0.4);
  }
  
  &:active {
    background: rgba(255, 255, 255, 0.1);
  }
  
  ${mediaQuery.tablet} {
    width: 48px; /* Fixed width for consistency */
    height: 48px;
    min-width: 48px;
    border: ${theme.borders.solidThin} ${theme.colors.black};

    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
`;

const StreamingIcon = styled.img`
  width: 24px; /* Increased from 20px to match larger buttons */
  height: 24px; /* Increased from 20px to match larger buttons */
  opacity: 0.7;
  
  ${mediaQuery.tablet} {
    width: 24px;
    height: 24px;
  }
`;

const ArtistTitleBlock = styled.div`
  &[data-artist-title] { /* grid hook */ }
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  min-width: 0;
`;

const ArtistTitleRow = styled.div`

    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  
`;

const BaseLine = `
  display: block;
  min-width: 0;
  overflow: visible;
  white-space: normal;
  word-break: keep-all;
`;

const ArtistName = styled.div`
  ${BaseLine}
  font-size: ${theme.fontSizes.body};
  opacity: 0.85;
  flex-shrink: 0;
  letter-spacing: -0.5px;
  word-spacing: tight;

  ${mediaQuery.tablet} {
    flex-shrink: 1;
  }
`;

const TitleSeparator = styled.span`
  display: inline-block;
  color: ${theme.colors.black};
  opacity: 0.6;
  margin: 0 ${theme.spacing.sm};
      font-size: calc(${theme.fontSizes.body} * 0.9);


  ${mediaQuery.tablet} {
    display: none;
  }
`;

const SongTitle = styled.div`
  ${BaseLine}
    font-size: calc(${theme.fontSizes.body} * 1.1);
    font-weight: ${theme.fontWeights.bold};
  flex-shrink: 1;
  letter-spacing: -0.5px;
  word-spacing: tight;
  ${mediaQuery.tablet} {
    flex-shrink: 1;
  }
`;

const GenreTagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.xs};
`;

const GenreTag = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$color' })`
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border: 1px solid ${props => props.$color};
  color: ${props => props.$color};
  font-family: ${theme.fonts.mono};
  font-size: clamp(0.5rem, 1.1vw, 0.65rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.04);
  white-space: nowrap;

  ${mediaQuery.tablet} {
    font-size: clamp(0.55rem, 1.2vw, 0.7rem);
    padding: 2px 8px;
  }
`;

const SaveButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$isSaved'
})`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: ${props => props.$isSaved ? theme.colors.stateSaved : 'transparent'};
  border: ${theme.borders.solidThin} ${props => props.$isSaved ? theme.colors.olive : theme.colors.black};
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;

  &:hover:not(:disabled) {
    border-color: ${theme.colors.fpwhite};
    background: ${props => props.$isSaved ? theme.colors.olive[800] : 'rgba(67, 142, 255, 0.4)'};
  }

  &:active:not(:disabled) {
    background: ${props => props.$isSaved ? theme.colors.olive : 'rgba(0, 0, 0, 0.89)'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${mediaQuery.tablet} {
    width: 48px;
    height: 48px;
    min-width: 48px;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
`;

const SaveIcon = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 24px;
  color: ${theme.colors.black};
  opacity: 0.9;
  font-weight: bold;

  ${mediaQuery.tablet} {
    font-size: 24px;
  }
`;

const CopyButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$isCopied'
})`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px; /* Increased from 40px to match mobile ratio */
  height: 48px; /* Increased from 40px to match mobile ratio */
  background: ${props => props.$isCopied ? 'rgba(76, 175, 80, 0.2)' : 'transparent'};
  border: ${theme.borders.solidThin} ${props => props.$isCopied ? theme.colors.success : theme.colors.black};
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    border-color: ${props => props.$isCopied ? theme.colors.success : theme.colors.white};
    background: ${props => props.$isCopied ? 'rgba(76, 175, 80, 0.3)' : 'rgba(67, 142, 255, 0.4)'};
  }

  &:active {
    background: rgba(255, 255, 255, 0.1);
  }

  ${mediaQuery.tablet} {
    width: 44px; /* Fixed width for consistency */
    height: 48px;
    min-width: 44px;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
`;

const CopyIcon = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 27px; /* Increased from 22px to match larger buttons */
  color: ${theme.colors.black};
  opacity: 0.7;

  ${mediaQuery.tablet} {
    font-size: 24px;
  }
`;



const TrackDetails = styled.div`
  border-top: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
`;

const DetailsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
  
  ${mediaQuery.tablet} {
    grid-template-columns: 1fr;
  }
`;

const DetailItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const DetailLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  text-transform: uppercase;
  font-weight: bold;
  letter-spacing: 0.05em;
`;

const DetailValue = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;



const TrackActionsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.md};
`;

const TrackActionButtons = styled.div`
  display: flex;
  flex-direction: row;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.md};
`;

const FlagButton = styled.button`
  display: flex;
  align-items: right;
  justify-content: right;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  background: rgba(133, 19, 19, 0.11);
  border: ${theme.borders.solid} ${theme.colors.red};
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  grid-template-columns: 1fr;
  
  &:hover {
    border-color: ${theme.colors.white};
    background: rgba(255, 255, 255, 0.05);

  }
  
  &:active {
    background: rgba(255, 255, 255, 0.6);
  }
  
  ${mediaQuery.tablet} {
    padding: ${theme.spacing.sm};
    font-size: ${theme.fontSizes.small};
    touch-action: manipulation;
  }
`;

// Quote Components
const QuoteAddon = styled.div`
  /* Desktop only - appears above main container */
  display: block;
  background: rgba(230, 230, 230, 0.87);
  color: ${theme.colors.black};
  border: ${theme.borders.dashedThin} ${theme.colors.olive};
  border-top: none; 
  border-left: none;
  border-right: none;
  padding: ${theme.spacing.md};
  text-align: left;
    font-family: ${theme.fonts.primary};
  font-size: calc(${theme.fontSizes.tiny}*1.1);
  line-height: 1.2;
  word-break: break-word;

  ${mediaQuery.tablet} {
    display: none; /* Hidden on mobile */
  }
`;

const MobileQuote = styled.div`
  /* Mobile only - appears above artwork and track details */
  display: none;

  ${mediaQuery.tablet} {
    display: block;
  background: rgba(230, 230, 230, 0.85);
    color: ${theme.colors.black};
    border: ${theme.borders.dashedThin} ${theme.colors.olive};
      border-top: none; 
  border-left: none;
  border-right: none;
    //border-bottom: none; /* Connect to main content below */
  padding: ${theme.spacing.md};
  text-align: left;
    font-family: ${theme.fonts.primary};
  font-size: calc(${theme.fontSizes.tiny}*1.1);
  line-height: 1.5;
  word-break: break-word;
    box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 1px 11px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  }
`;

// Mobile Action Bar Components
const MobileActionBar = styled.div`
  display: none;
  
  ${mediaQuery.tablet} {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 2px;
    padding: ${theme.spacing.sm};
    border-top: ${theme.borders.solid} ${theme.colors.black};
    background: rgba(0, 0, 0, 0.05);
    flex-wrap: nowrap;
    overflow: hidden;
    -webkit-tap-highlight-color: transparent;

    /* Equal width buttons that fill container */
    & > * {
      flex: 1;
      min-width: 44px;
      max-width: none;
    }
  }
`;

const MobileActionButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['$isExpanded', '$isCopied'].includes(prop)
})`
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  height: 48px;
  background: ${props => props.$isCopied ? 'rgba(76, 175, 80, 0.2)' : 'transparent'};
  border: ${theme.borders.solidThin} ${props => props.$isCopied ? theme.colors.success : theme.colors.black};
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: ${theme.fonts.mono};
  font-size: 16px;
  color: ${theme.colors.black};
  text-decoration: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    border-color: ${props => props.$isCopied ? theme.colors.success : theme.colors.fpwhite};
    background: ${props => props.$isCopied ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 255, 255, 0.05)'};
  }

  &:active {
    background: rgba(145, 145, 145, 0.17);
  }

  /* Hide on desktop */
  ${mediaQuery.tablet} {
    display: flex;
  }

  @media (min-width: 769px) {
    display: none;
  }
`;

const CopiedMessage = styled.span`
  position: absolute;
  left: -60px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${theme.colors.success};
  white-space: nowrap;
  pointer-events: none;
  animation: fadeIn 0.2s ease;

  @keyframes fadeIn {
    from { opacity: 0; transform: translateX(5px); }
    to { opacity: 1; transform: translateX(0); }
  }
`;

export default ExpandableTrack;
