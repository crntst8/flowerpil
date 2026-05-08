import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import ReusableHeader from '@shared/components/ReusableHeader';
import SEO from '@shared/components/SEO';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import PreviewButton from '@modules/playlists/components/PreviewButton';
import TrackShareModal from '@modules/playlists/components/TrackShareModal';

const TRACK_ENDPOINT = '/api/public/tracks';
const PLAYLIST_ENDPOINT = '/api/v1/playlists';

const platformIconMap = {
  spotify: {
    icon: '/assets/playlist-actions/spotify.svg',
    title: 'Listen on Spotify',
  },
  apple: {
    icon: '/icons/apple.png',
    title: 'Listen on Apple Music',
  },
  tidal: {
    icon: '/assets/playlist-actions/tidal.svg',
    title: 'Listen on TIDAL',
  },
  bandcamp: {
    icon: '/svg/bandcamp.svg',
    title: 'Open in Bandcamp',
  },
};

const formatDuration = (duration) => {
  if (!duration) return '';
  if (typeof duration === 'string' && duration.includes(':')) return duration;
  // Convert to number and handle milliseconds vs seconds
  const numDuration = Number(duration);
  if (isNaN(numDuration)) return '';
  // If it's milliseconds (likely from Spotify API), convert to seconds
  const totalSeconds = numDuration > 10000 ? Math.floor(numDuration / 1000) : numDuration;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const createPlatformLinks = (track, links) => {
  const linkLookup = new Map();
  (links || []).forEach((entry) => {
    if (entry?.platform && entry?.url) {
      linkLookup.set(entry.platform.toLowerCase(), entry.url);
    }
  });

  const spotify = track?.spotify_id
    ? `https://open.spotify.com/track/${track.spotify_id}`
    : linkLookup.get('spotify');
  const apple = track?.apple_music_url
    || (track?.apple_id ? `https://music.apple.com/song/${track.apple_id}?mt=1&app=music` : null)
    || linkLookup.get('apple')
    || linkLookup.get('apple_music');
  const tidal = track?.tidal_url
    || (track?.tidal_id ? `https://tidal.com/browse/track/${track.tidal_id}` : null)
    || linkLookup.get('tidal');
  const bandcamp = track?.bandcamp_url || linkLookup.get('bandcamp');

  return {
    spotify,
    apple,
    tidal,
    bandcamp,
  };
};

const buildShareUrl = (trackId, playlistId) => {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const base = `${origin}/track/${trackId}`;
  return playlistId ? `${base}?playlist=${playlistId}` : base;
};

export default function StaticTrackPage() {
  const { trackId } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState({ track: null, playlist: null, links: [] });
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadTrack = async () => {
      if (!trackId) return;
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`${TRACK_ENDPOINT}/${encodeURIComponent(trackId)}`);
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const message = errorBody?.error || 'Unable to load track';
          if (isMounted) {
            setError(message);
            setPayload({ track: null, playlist: null, links: [] });
          }
          return;
        }

        const data = await response.json();

        // Check if playlist override is requested via query param
        const playlistParam = searchParams.get('playlist');
        let finalPlaylist = data.playlist;

        if (playlistParam && playlistParam !== data.playlist?.id?.toString()) {
          try {
            const playlistResponse = await fetch(`${PLAYLIST_ENDPOINT}/${encodeURIComponent(playlistParam)}`);
            if (playlistResponse.ok) {
              const playlistData = await playlistResponse.json();
              finalPlaylist = playlistData?.playlist || data.playlist;
            }
          } catch (playlistErr) {
            console.warn('StaticTrackPage: Failed to load playlist from query param', playlistErr);
          }
        }

        if (isMounted) {
          setPayload({
            track: data.track,
            playlist: finalPlaylist,
            links: data.links || [],
          });
        }
      } catch (err) {
        if (isMounted) {
          console.error('StaticTrackPage: failed to load track', err);
          setError('Unable to load track right now.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadTrack();
    return () => {
      isMounted = false;
    };
  }, [trackId, searchParams]);

  const { track, playlist, links } = payload;

  const platformLinks = useMemo(() => createPlatformLinks(track, links), [track, links]);
  const shareUrl = useMemo(() => buildShareUrl(track?.id || trackId, playlist?.id), [track?.id, trackId, playlist?.id]);

  const metadataFields = useMemo(() => {
    if (!track) return [];
    return [
      { label: 'Album', value: track.album },
      { label: 'Year', value: track.year },
      { label: 'Duration', value: formatDuration(track.duration) },
      { label: 'Label', value: track.label },
      { label: 'ISRC', value: track.isrc },
    ].filter((item) => item.value);
  }, [track]);

  if (loading) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <CenteredMessage>Loading track…</CenteredMessage>
        </ScrollRegion>
      </PageContainer>
    );
  }

  if (error || !track) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <CenteredMessage>{error || 'Track not found'}</CenteredMessage>
        </ScrollRegion>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SEO
        title={`${track.title} by ${track.artist}`}
        description={`Cross-platform, curated, by people. ${track.title} by ${track.artist}.${playlist ? ` From the "${playlist.title}" playlist.` : ''} Links for every platform.`}
        image={track.artwork_url || track.album_artwork_url}
        canonical={`/track/${trackId}`}
        keywords={['flowerpil', 'cross-platform', 'curated', 'by people', track.artist, track.title, 'music', 'playlist']}
        type="music.song"
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'MusicRecording',
          name: track.title,
          byArtist: {
            '@type': 'MusicGroup',
            name: track.artist
          },
          inAlbum: track.album ? {
            '@type': 'MusicAlbum',
            name: track.album
          } : undefined,
          isrcCode: track.isrc || undefined,
          image: track.artwork_url || track.album_artwork_url,
          url: `https://flowerpil.io/track/${trackId}`
        }}
      />
      <ReusableHeader />
      <ScrollRegion>
        <Body>
        <Hero>
          {playlist ? (
            <AttributionRow>
              <AttributionLabel>
                from playlist{' '}
                {playlist?.id ? (
                  <AttributionLink href={`/playlists/${playlist.id}`}>
                    {playlist?.title || 'flowerpil playlist'}
                  </AttributionLink>
                ) : (
                  <span>{playlist?.title || 'flowerpil playlist'}</span>
                )}
              </AttributionLabel>
              <AttributionLabel>
                curated by{' '}
                {playlist?.curator_name ? (
                  <AttributionLink href={`/curator/${encodeURIComponent(playlist.curator_name)}`}>
                    {playlist.curator_name}
                  </AttributionLink>
                ) : (
                  <span>flowerpil</span>
                )}
              </AttributionLabel>
            </AttributionRow>
          ) : (
            <AttributionRow>
              <AttributionLabel>flowerpil track spotlight</AttributionLabel>
            </AttributionRow>
          )}

          <ArtworkWrapper>
            {track.artwork_url || track.album_artwork_url ? (
              <ArtworkImage
                src={track.artwork_url || track.album_artwork_url}
                alt={`${track.artist || 'Artist'} – ${track.title} artwork`}
              />
            ) : (
              <ArtworkFallback>no artwork</ArtworkFallback>
            )}
          </ArtworkWrapper>

          <TitleBlock>
            {track.artist && <ArtistName>{track.artist}</ArtistName>}
            <TrackTitle>{track.title}</TrackTitle>
          </TitleBlock>

 
          
        </Hero>

        <ActionsSection>
          {Object.entries(platformLinks).map(([platform, url]) => {
            if (!url || !platformIconMap[platform]) return null;
            const { icon, title } = platformIconMap[platform];
            return (
              <SquareAction
                as="a"
                key={platform}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={title}
              >
                <ActionIcon src={icon} alt={title} />
              </SquareAction>
            );
          })}

          <PreviewAction
            track={track}
            title="Play preview"
          />

          <MoreAction onClick={() => setShareOpen(true)}>
            <MoreIcon src="/assets/playlist-actions/share.png" alt="More actions" />
            <MoreText>SHARE</MoreText>
          </MoreAction>
        </ActionsSection>
        </Body>

        <TrackShareModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          track={track}
          playlist={playlist}
          platformLinks={platformLinks}
          shareUrl={shareUrl}
        />
      </ScrollRegion>
    </PageContainer>
  );
}

const PageContainer = styled.div`
  height: calc(var(--vh, 1vh) * 100);
  min-height: calc(var(--vh, 1vh) * 100);
  width: 100%;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ScrollRegion = styled.div`
  flex: 1 1 auto;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y; /* Allow horizontal gestures for browser navigation */
  background: ${theme.colors.fpwhite};
  padding-bottom: ${theme.spacing.lg};
  scrollbar-gutter: stable;
`;

const Body = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.md} ${theme.spacing.lg} ${theme.spacing.xl};
  gap: ${theme.spacing.lg};

  ${mediaQuery.mobile} {
    padding: clamp(8px, 2vh, 16px) ${theme.spacing.md} max(clamp(12px, 3vh, 20px), env(safe-area-inset-bottom, 12px));
    gap: clamp(8px, 2vh, 16px);
    justify-content: flex-start;
    min-height: 100dvh;
  }
`;

const Hero = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: ${theme.spacing.lg};
  max-width: 640px;

  ${mediaQuery.mobile} {
    gap: clamp(8px, 1.5vh, 14px);
  }
`;

const AttributionRow = styled.div`
  display: flex;
  gap: ${theme.spacing.xl};
  text-transform: lowercase;
  font-family: ${theme.fonts.primary};
  font-size: clamp(0.9rem, 2vw, 1rem);
 letter-spacing: -0.9px;

  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: ${theme.spacing.large};

  ${mediaQuery.mobile} {
    gap: clamp(4px, 1vw, 8px);
    margin-bottom: clamp(4px, 1vh, 5px);
    flex-wrap: nowrap;
    font-size: clamp(0.7rem, 2vw, 0.85rem);
  }
`;

const AttributionLabel = styled.span`
  display: inline-flex;
  gap: ${theme.spacing.xs};
  align-items: baseline;
`;

const AttributionLink = styled.a`
  color: ${theme.colors.black};
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: opacity ${theme.transitions.fast};
  font-weight: ${theme.fontWeights.bold};
  text-transform: none;

  &:hover {
    opacity: 0.6;
  }
`;

const ArtworkWrapper = styled.div`
  width: min(280px, 60vw);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${theme.colors.fpwhite};
  box-shadow: 0 32px 48px rgba(0, 0, 0, 0.15);
  margin-bottom: ${theme.spacing.lg};

  ${mediaQuery.mobile} {
    margin-bottom: clamp(8px, 1.5vh, 14px);
  }
`;

const ArtworkImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const ArtworkFallback = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  align-items: center;
  width: 100%;
  max-width: min(520px, 90vw);
  margin-bottom: ${theme.spacing.xxs};

  ${mediaQuery.mobile} {
    margin-bottom: clamp(8px, 1.5vh, 14px);
  }
`;

const ArtistName = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: clamp(16px, 2.2vw, 26px);
  font-weight: ${theme.fontWeights.regular};
  letter-spacing: -0.02em;
  text-align: center;
  width: 100%;
  line-height: 1.15;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
`;

const TrackTitle = styled.h1`
  font-family: ${theme.fonts.primary};
  font-size: clamp(28px, 2.8vw, 34px);
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.9px;
  margin: 0;
  text-align: center;
  width: 100%;
  text-transform: none;
  line-height: 1.15;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
`;

const MetadataList = styled.div`
  width: min(520px, 90vw);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const MetadataRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
`;

const MetadataLabel = styled.span`
  text-transform: capitalize;
`;

const MetadataDots = styled.span`
  flex: 1;
  border-bottom: 1px dotted ${theme.colors.black};
  opacity: 0.4;
  transform: translateY(-2px);
`;

const MetadataValue = styled.span`
  margin-left: auto;
`;

const ActionsSection = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${theme.spacing.md};
  width: 100%;
  max-width: min(520px, 90vw);
  margin-top: ${theme.spacing.lg};

  ${mediaQuery.mobile} {
    flex-wrap: nowrap;
    gap: clamp(8px, 2vw, 12px);
    margin-top: clamp(10px, 2vh, 16px);
  }
`;

const SquareAction = styled.button`
  width: clamp(70px, 14vw, 88px);
  height: clamp(70px, 14vw, 88px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.15),
    0 16px 32px rgba(0, 0, 0, 0.08);
  transition: transform ${theme.transitions.fast}, box-shadow ${theme.transitions.fast};
  cursor: pointer;
  text-decoration: none;
  color: ${theme.colors.black};

  ${mediaQuery.mobile} {
    width: clamp(52px, 15vw, 70px);
    height: clamp(52px, 15vw, 70px);
    flex: 1;
    min-width: 52px;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow:
      0 16px 24px rgba(0, 0, 0, 0.2),
      0 24px 48px rgba(0, 0, 0, 0.12);
  }
`;

const ActionIcon = styled.img`
  width: clamp(28px, 6vw, 36px);
  height: clamp(28px, 6vw, 36px);
  object-fit: contain;

  ${mediaQuery.mobile} {
    width: clamp(20px, 6vw, 28px);
    height: clamp(20px, 6vw, 28px);
  }
`;

const PreviewAction = styled(PreviewButton)`
  width: clamp(70px, 14vw, 88px) !important;
  height: clamp(70px, 14vw, 88px) !important;
  border-radius: 0 !important;
  border: ${theme.borders.solid} ${theme.colors.black} !important;
  background: ${theme.colors.fpwhite} !important;
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.15),
    0 16px 32px rgba(0, 0, 0, 0.08);

  ${mediaQuery.mobile} {
    width: clamp(52px, 15vw, 70px) !important;
    height: clamp(52px, 15vw, 70px) !important;
    flex: 1;
    min-width: 52px;
  }

  &:hover {
    transform: translateY(-2px);
  }
`;

const MoreAction = styled(SquareAction)`
  flex-direction: column;
  gap: ${theme.spacing.xs};
  text-decoration: none;
`;

const MoreIcon = styled.img`
  width: clamp(24px, 5vw, 32px);
  height: clamp(24px, 5vw, 32px);

  ${mediaQuery.mobile} {
    width: clamp(18px, 5vw, 24px);
    height: clamp(18px, 5vw, 24px);
  }
`;

const MoreText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: clamp(0.55rem, 1vw, 0.75rem);
  letter-spacing: 0.16em;

  ${mediaQuery.mobile} {
    font-size: clamp(0.45rem, 1.2vw, 0.6rem);
  }
`;

const CenteredMessage = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.medium};
  letter-spacing: 0.04em;
`;
