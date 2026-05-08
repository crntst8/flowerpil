import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import SEO from '@shared/components/SEO';
import { getPublicRelease, verifyReleasePassword, PLATFORM_ICONS, RELEASE_TYPES } from '../services/releaseService';
import ReleasePasswordGate from './ReleasePasswordGate';
import ReleaseImageModal from './ReleaseImageModal';
import { useAudioPreview } from '@shared/contexts/AudioPreviewContext';

const PageContainer = styled.div`
  min-height: calc(var(--vh, 1vh) * 100);
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  display: flex;
  flex-direction: column;
`;

const ScrollRegion = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding-bottom: ${theme.spacing.lg};
`;

const ContentWrapper = styled.div`
  max-width: ${theme.layout.maxWidth};
  margin: 0 auto;
  width: 100%;
  padding: ${theme.spacing.sm} ${theme.layout.containerPadding} 0;
`;

const PageBreadcrumb = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: ${theme.spacing.md};

  a {
    color: ${theme.colors.black};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const HeroCard = styled.section`
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.08);
  padding: ${theme.spacing.md};
`;

const HeroGrid = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$hasArtwork'
})`
  display: grid;
  grid-template-columns: ${({ $hasArtwork }) => ($hasArtwork ? 'minmax(180px, 280px) 1fr' : '1fr')};
  gap: ${theme.spacing.lg};

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.md};
  }
`;

const ArtworkFrame = styled.div`
  width: 100%;
  aspect-ratio: 1 / 1;
  border: ${theme.borders.solid} ${theme.colors.black};
  overflow: hidden;
`;

const Artwork = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const HeroBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  min-width: 0;
`;

const MetaBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ReleaseMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.75;
`;

const ArtistName = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: clamp(1rem, 2vw, 1.3rem);
  font-weight: ${theme.fontWeights.bold};
`;

const ReleaseTitle = styled.h1`
  margin: 0;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: clamp(1.8rem, 4vw, 2.7rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
`;

const GenreTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
`;

const GenreTag = styled.span`
  border: ${theme.borders.solid} ${theme.colors.black};
  background: transparent;
  padding: 2px 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const DescriptionBlock = styled.div`
  border-top: ${theme.borders.solid} rgba(0, 0, 0, 0.18);
  padding-top: ${theme.spacing.sm};

  h3 {
    margin: 0 0 ${theme.spacing.xs} 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.72;
  }

  p {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    line-height: 1.62;
    white-space: pre-line;
  }
`;

const ActionsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  align-items: center;
`;

const IconAction = styled.a.withConfig({
  shouldForwardProp: (prop) => !['$active'].includes(prop)
})`
  width: 64px;
  height: 64px;
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${({ $active }) => ($active ? 'rgba(0, 0, 0, 0.1)' : theme.colors.fpwhite)};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform ${theme.transitions.fast}, box-shadow ${theme.transitions.fast};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.14);
  }

  ${mediaQuery.mobile} {
    width: 56px;
    height: 56px;
  }
`;

const IconActionButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['$active'].includes(prop)
})`
  width: 64px;
  height: 64px;
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${({ $active }) => ($active ? 'rgba(0, 0, 0, 0.1)' : theme.colors.fpwhite)};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform ${theme.transitions.fast}, box-shadow ${theme.transitions.fast};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.14);
  }

  ${mediaQuery.mobile} {
    width: 56px;
    height: 56px;
  }
`;

const ActionIcon = styled.img`
  width: 28px;
  height: 28px;
  object-fit: contain;
`;

const SectionShell = styled.section`
  margin-top: ${theme.spacing.lg};
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.08);
`;

const SectionNav = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm};
  border-bottom: ${theme.borders.solid} ${theme.colors.black};
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const SectionTab = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$active'
})`
  border: ${theme.borders.solid} ${props => (props.$active ? theme.colors.black : 'rgba(0, 0, 0, 0.25)')};
  background: ${props => (props.$active ? 'rgba(0, 0, 0, 0.1)' : 'transparent')};
  min-height: 44px;
  padding: 0 ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  cursor: pointer;
`;

const SingleSectionHeader = styled.div`
  border-bottom: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.75;
`;

const SectionContent = styled.div`
  padding: ${theme.spacing.md};
`;

const VideoWrapper = styled.div`
  width: 100%;
  aspect-ratio: 16/9;
  border: ${theme.borders.solid} ${theme.colors.black};

  iframe {
    width: 100%;
    height: 100%;
    border: none;
  }
`;

const VideoFallbackLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: ${theme.borders.solid} ${theme.colors.black};
  min-height: 44px;
  padding: 0 ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${theme.colors.black};
  text-decoration: none;

  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }
`;

const ImageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${theme.spacing.md};
`;

const ImageItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ImageThumb = styled.button`
  border: ${theme.borders.solid} ${theme.colors.black};
  aspect-ratio: 1 / 1;
  padding: 0;
  background: ${theme.colors.black};
  cursor: pointer;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform ${theme.transitions.fast};
  }

  &:hover img {
    transform: scale(1.03);
  }
`;

const ImageMetaRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${theme.spacing.xs};
  align-items: center;
`;

const Attribution = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  opacity: 0.72;
  min-width: 0;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

const DownloadLink = styled.a`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const BioGrid = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$hasImage'
})`
  display: grid;
  grid-template-columns: ${({ $hasImage }) => ($hasImage ? 'minmax(150px, 240px) 1fr' : '1fr')};
  gap: ${theme.spacing.md};

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const BioImage = styled.img`
  width: 100%;
  border: ${theme.borders.solid} ${theme.colors.black};
  object-fit: cover;
`;

const BioText = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};

  h4 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h3};
  }

  p {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    line-height: 1.62;
    white-space: pre-line;
  }
`;

const ShowsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const ShowRow = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.sm};
  display: grid;
  grid-template-columns: minmax(120px, 170px) 1fr auto;
  gap: ${theme.spacing.sm};
  align-items: center;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const ShowDate = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ShowMain = styled.div`
  min-width: 0;

  strong {
    display: block;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    line-height: 1.2;
  }

  span {
    display: block;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.small};
    opacity: 0.8;
  }

  em {
    display: block;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.tiny};
    opacity: 0.72;
    margin-top: 4px;
    font-style: normal;
  }
`;

const TicketLink = styled.a`
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: 0 ${theme.spacing.sm};
  text-decoration: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};

  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }
`;

const LoadingContainer = styled.div`
  min-height: 50vh;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const ErrorContainer = styled.div`
  min-height: 50vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.sm};
  text-align: center;
`;

const ErrorTitle = styled.h1`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h2};
`;

const ErrorMessage = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  color: ${theme.colors.textGray};
`;

const BackLink = styled(Link)`
  border: ${theme.borders.solid} ${theme.colors.black};
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: ${theme.colors.black};
  padding: 0 ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const PreviewLoadingSpinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid transparent;
  border-top: 2px solid ${theme.colors.black};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

const PlayIcon = styled.span`
  font-size: 22px;
  line-height: 1;
`;

const getActionIconPath = (platformKey) => {
  if (platformKey === 'spotify') return '/assets/playlist-actions/spotify.svg';
  if (platformKey === 'apple_music') return '/icons/apple.png';
  if (platformKey === 'tidal') return '/assets/playlist-actions/tidal.svg';
  if (platformKey === 'bandcamp') return '/assets/playlist-actions/bandcamp.svg';
  if (platformKey === 'youtube_music') return '/assets/playlist-actions/youtube.png';
  if (platformKey === 'soundcloud') return '/assets/playlist-actions/soundcloud.svg';
  return '/assets/playlist-actions/website.png';
};

const getVideoEmbedUrl = (url) => {
  if (!url) return null;

  const ytMatch = url.match(/(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }

  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  return null;
};

const ReleaseView = () => {
  const { id } = useParams();

  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [accessToken, setAccessToken] = useState(null);

  const [activeTab, setActiveTab] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [copied, setCopied] = useState(false);

  const {
    isPlaying,
    isLoading: previewLoading,
    playPreview,
    stopPreview,
    isCurrentTrack
  } = useAudioPreview();

  const loadRelease = useCallback(async (token = null) => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getPublicRelease(id, token);
      setRelease(result.data);
      setRequiresPassword(false);
    } catch (err) {
      if (err.details?.requires_password) {
        setRequiresPassword(true);
      } else if (err.status === 404) {
        setError('Release not found');
      } else {
        setError(err.message || 'Failed to load release');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRelease(accessToken);
  }, [loadRelease, accessToken]);

  const handlePasswordSubmit = async (password) => {
    try {
      const result = await verifyReleasePassword(id, password);
      setAccessToken(result.accessToken);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyUrl = async () => {
    const url = `${window.location.origin}/r/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error('Failed to copy release URL', err);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long' }).toUpperCase();
  };

  const handleDeezerPreview = useCallback(() => {
    if (!release?.artist_name || !release?.title) return;
    playPreview({
      artist: release.artist_name,
      title: release.title
    });
  }, [release, playPreview]);

  const isReleasePreviewPlaying = useCallback(() => {
    if (!release?.artist_name || !release?.title) return false;
    return isCurrentTrack({
      artist: release.artist_name,
      title: release.title
    });
  }, [release, isCurrentTrack]);

  const sections = useMemo(() => {
    if (!release) return [];

    const list = [];
    const pressImages = (release.assets || []).filter((asset) => (
      asset.asset_type === 'press_image' && asset.url
    ));

    const hasBioFields = Boolean(
      release.artist_bio_topline?.trim() ||
      release.artist_bio_subtext?.trim() ||
      release.artist_bio_image_url?.trim()
    );

    if (release.show_video && release.video_url) {
      const embed = getVideoEmbedUrl(release.video_url);
      list.push({
        key: 'video',
        label: 'Video',
        content: embed ? (
          <VideoWrapper>
            <iframe
              src={embed}
              title="Release video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </VideoWrapper>
        ) : (
          <VideoFallbackLink href={release.video_url} target="_blank" rel="noopener noreferrer">
            Open Video
          </VideoFallbackLink>
        )
      });
    }

    if (release.show_images && pressImages.length > 0) {
      list.push({
        key: 'images',
        label: 'Press Assets',
        content: (
          <ImageGrid>
            {pressImages.map((asset, index) => (
              <ImageItem key={asset.id || `${asset.url}-${index}`}>
                <ImageThumb type="button" onClick={() => setSelectedImage(asset)}>
                  <img src={asset.url} alt={asset.attribution || `${release.title || 'Release'} asset`} />
                </ImageThumb>
                <ImageMetaRow>
                  {asset.attribution ? <Attribution>{asset.attribution}</Attribution> : null}
                  {asset.allow_download !== 0 && (
                    <DownloadLink href={asset.url} target="_blank" rel="noopener noreferrer" download>
                      Download
                    </DownloadLink>
                  )}
                </ImageMetaRow>
              </ImageItem>
            ))}
          </ImageGrid>
        )
      });
    }

    if (release.show_about && hasBioFields) {
      list.push({
        key: 'bio',
        label: 'Artist Bio',
        content: (
          <BioGrid $hasImage={Boolean(release.artist_bio_image_url)}>
            {release.artist_bio_image_url && (
              <BioImage src={release.artist_bio_image_url} alt={release.artist_name || 'Artist image'} />
            )}
            <BioText>
              {release.artist_bio_topline && <h4>{release.artist_bio_topline}</h4>}
              {release.artist_bio_subtext && <p>{release.artist_bio_subtext}</p>}
            </BioText>
          </BioGrid>
        )
      });
    }

    if (release.show_shows && Array.isArray(release.shows) && release.shows.some((show) => show.show_date)) {
      list.push({
        key: 'shows',
        label: 'Shows',
        content: (
          <ShowsList>
            {release.shows
              .filter((show) => show.show_date)
              .map((show, index) => {
                const location = [show.city, show.country].filter(Boolean).join(', ');
                const details = [show.venue, location].filter(Boolean);

                return (
                  <ShowRow key={show.id || `${show.show_date}-${index}`}>
                    <ShowDate>{formatDate(show.show_date)}</ShowDate>
                    <ShowMain>
                      {details[0] && <strong>{details[0]}</strong>}
                      {details[1] && <span>{details[1]}</span>}
                      {show.notes && <em>{show.notes}</em>}
                    </ShowMain>
                    {show.ticket_url ? (
                      <TicketLink href={show.ticket_url} target="_blank" rel="noopener noreferrer">
                        Tickets
                      </TicketLink>
                    ) : null}
                  </ShowRow>
                );
              })}
          </ShowsList>
        )
      });
    }

    return list;
  }, [release]);

  useEffect(() => {
    if (!sections.length) {
      setActiveTab('');
      return;
    }

    if (!sections.find((section) => section.key === activeTab)) {
      setActiveTab(sections[0].key);
    }
  }, [sections, activeTab]);

  if (loading) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <LoadingContainer>
            <LoadingText>Loading release</LoadingText>
          </LoadingContainer>
        </ScrollRegion>
      </PageContainer>
    );
  }

  if (requiresPassword) {
    return <ReleasePasswordGate onSubmit={handlePasswordSubmit} />;
  }

  if (error) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <ErrorContainer>
            <ErrorTitle>Error</ErrorTitle>
            <ErrorMessage>{error}</ErrorMessage>
            <BackLink to="/">Back to Flowerpil</BackLink>
          </ErrorContainer>
        </ScrollRegion>
      </PageContainer>
    );
  }

  if (!release) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <ErrorContainer>
            <ErrorTitle>Release Not Found</ErrorTitle>
            <ErrorMessage>This release is unavailable.</ErrorMessage>
            <BackLink to="/">Back to Flowerpil</BackLink>
          </ErrorContainer>
        </ScrollRegion>
      </PageContainer>
    );
  }

  const hasDescription = Boolean(release.description?.trim());
  const genres = Array.isArray(release.genres) ? release.genres : [];
  const hasArtwork = Boolean(release.artwork_url);
  const releaseTypeLabel = RELEASE_TYPES[release.release_type] || release.release_type;
  const releaseDateLabel = release.release_date ? formatDate(release.release_date) : '';

  const releaseActions = (release.actions || []).filter((action) => action?.url);

  const seoTitle = [release.title, release.artist_name].filter(Boolean).join(' by ') || release.title || 'Release';
  const seoDescription = [release.title, release.artist_name].filter(Boolean).join(' · ');
  const seoKeywords = [
    'flowerpil',
    'release',
    release.title,
    release.artist_name,
    release.release_type
  ].filter(Boolean);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'MusicAlbum',
    name: release.title,
    byArtist: release.artist_name ? {
      '@type': 'MusicGroup',
      name: release.artist_name
    } : undefined,
    image: release.artwork_url || undefined,
    url: `https://flowerpil.io/r/${release.id}`,
    datePublished: release.release_date || release.post_date || undefined
  };

  return (
    <PageContainer>
      <SEO
        title={seoTitle}
        description={seoDescription}
        canonical={`/r/${release.id}`}
        image={release.artwork_url}
        keywords={seoKeywords}
        noindex={!release.is_published}
        structuredData={structuredData}
      />
      <ReusableHeader />
      <ScrollRegion>
        <ContentWrapper>
          <PageBreadcrumb>
            <Link to="/home">Home</Link> / Release / {release.title}
          </PageBreadcrumb>

          <HeroCard>
            <HeroGrid $hasArtwork={hasArtwork}>
              {hasArtwork && (
                <ArtworkFrame>
                  <Artwork src={release.artwork_url} alt={`${release.title || 'Release'} artwork`} />
                </ArtworkFrame>
              )}

              <HeroBody>
                <MetaBlock>
                  {(releaseTypeLabel || releaseDateLabel) && (
                    <ReleaseMeta>
                      {[releaseTypeLabel, releaseDateLabel].filter(Boolean).join(' - ')}
                    </ReleaseMeta>
                  )}
                  {release.artist_name && <ArtistName>{release.artist_name}</ArtistName>}
                  {release.title && <ReleaseTitle>{release.title}</ReleaseTitle>}

                  {genres.length > 0 && (
                    <GenreTags>
                      {genres.map((genre, index) => (
                        <GenreTag key={`${genre}-${index}`}>{genre}</GenreTag>
                      ))}
                    </GenreTags>
                  )}
                </MetaBlock>

                {hasDescription && (
                  <DescriptionBlock>
                    <h3>About This Release</h3>
                    <p>{release.description}</p>
                  </DescriptionBlock>
                )}

                <ActionsRow>
                  <IconActionButton
                    type="button"
                    onClick={handleCopyUrl}
                    title={copied ? 'Copied' : 'Copy link'}
                    $active={copied}
                  >
                    {copied ? (
                      <PlayIcon>✓</PlayIcon>
                    ) : (
                      <ActionIcon src="/assets/playlist-actions/link.png" alt="Copy link" />
                    )}
                  </IconActionButton>

                  {releaseActions.map((action, index) => {
                    const platformKey = action.platform_key;

                    if (platformKey === 'deezer') {
                      const isThisPlaying = isPlaying && isReleasePreviewPlaying();
                      const isThisLoading = previewLoading && isReleasePreviewPlaying();

                      return (
                        <IconActionButton
                          key={action.id || `${platformKey}-${index}`}
                          type="button"
                          onClick={() => (isThisPlaying ? stopPreview() : handleDeezerPreview())}
                          title={isThisPlaying ? 'Pause preview' : 'Play 30-second preview'}
                          $active={isThisPlaying}
                        >
                          {isThisLoading ? (
                            <PreviewLoadingSpinner />
                          ) : (
                            <PlayIcon>{isThisPlaying ? '⏸' : '▶'}</PlayIcon>
                          )}
                        </IconActionButton>
                      );
                    }

                    const iconPath = getActionIconPath(platformKey);
                    const title = action.label || PLATFORM_ICONS[platformKey]?.name || 'Link';

                    return (
                      <IconAction
                        key={action.id || `${platformKey}-${index}`}
                        href={action.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={title}
                      >
                        <ActionIcon src={iconPath} alt={title} />
                      </IconAction>
                    );
                  })}
                </ActionsRow>
              </HeroBody>
            </HeroGrid>
          </HeroCard>

          {sections.length > 0 && (
            <SectionShell>
              {sections.length > 1 ? (
                <>
                  <SectionNav>
                    {sections.map((section) => (
                      <SectionTab
                        key={section.key}
                        type="button"
                        $active={activeTab === section.key}
                        onClick={() => setActiveTab(section.key)}
                      >
                        {section.label}
                      </SectionTab>
                    ))}
                  </SectionNav>
                  <SectionContent>
                    {sections.find((section) => section.key === activeTab)?.content}
                  </SectionContent>
                </>
              ) : (
                <>
                  <SingleSectionHeader>{sections[0].label}</SingleSectionHeader>
                  <SectionContent>{sections[0].content}</SectionContent>
                </>
              )}
            </SectionShell>
          )}
        </ContentWrapper>
      </ScrollRegion>

      {selectedImage && (
        <ReleaseImageModal image={selectedImage} onClose={() => setSelectedImage(null)} />
      )}
    </PageContainer>
  );
};

export default ReleaseView;
