import React, { useEffect, useState, useMemo, Suspense, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import SEO from '@shared/components/SEO';
import usePlaylistStore from '../store/playlistStore';
import {
  getPlaylistById,
  getPlaylistTracks,
  getPlaylistEngagement,
  lovePlaylist,
  unlovePlaylist,
  createPlaylistComment,
  createPlaylistReply,
  formatDate
} from '../services/playlistService';
import CuratorTypeDisplay from '@shared/components/CuratorTypeDisplay';
import ExpandableTrack from './ExpandableTrack';
import EndScrollSection from './EndScrollSection';
const PlaylistShareModal = React.lazy(() => import('./PlaylistShareModal'));
import { useGenreCatalog } from '@shared/hooks/useGenreCatalog';
import { createGenreLookup } from '@shared/utils/genreUtils';
import ResponsiveImage from '@shared/components/ResponsiveImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';
import IconWithFallback from '@shared/components/IconWithFallback';
import { IMAGE_SIZES } from '@shared/utils/imageUtils';
import { useAuth } from '@shared/contexts/AuthContext';
import { useSiteSettings } from '@shared/contexts/SiteSettingsContext';
import PurgatoryCTAModal, { shouldShowPurgatoryCTA } from './PurgatoryCTAModal';
import QRCodeCTABanner from './QRCodeCTABanner';
import metaPixel from '@shared/utils/metaPixel';
import siteAnalytics from '@shared/utils/siteAnalytics';
import SignupModal from '@shared/components/SignupModal';

// Define CuratorLink early to avoid hoisting issues
const CuratorLink = styled(Link)`
  color: ${theme.colors.black};
  transition: all ${theme.transitions.fast};
  font-weight: ${theme.fontWeights.bold};
  text-decoration: underline;
  letter-spacing: 0.006em;
  text-transform: none;
  font-size: ${theme.fontSizes.small};
  font-family: ${theme.fonts.primary};

  &:hover {
    background: rgba(42, 40, 40, 0.1);
    color: ${theme.colors.black};
    text-decoration: underline;
  }

  &:active {
    background: rgba(255, 255, 255, 0.2);
  }
`;

const PlaylistView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPurgatoryCTA, setShowPurgatoryCTA] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [isLoved, setIsLoved] = useState(false);
  const [loveCount, setLoveCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentsExpanded, setCommentsExpanded] = useState(true);
  const [commentDraft, setCommentDraft] = useState('');
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [submittingReplyId, setSubmittingReplyId] = useState(null);
  const [engagementError, setEngagementError] = useState('');
  const [qrCta, setQrCta] = useState(null);
  const [qrCtaDismissed, setQrCtaDismissed] = useState(false);
  const purgatoryCheckedRef = useRef(false);
  const viewTrackedRef = useRef(null);
  const { isAuthenticated, user, authenticatedFetch } = useAuth();
  const { isPlaylistLoveEnabled, isPlaylistCommentsEnabled } = useSiteSettings();
  const playlistLoveEnabled = isPlaylistLoveEnabled();
  const playlistCommentsEnabled = isPlaylistCommentsEnabled();
  const { catalog: genreCatalog } = useGenreCatalog();
  const genreLookup = useMemo(() => createGenreLookup(genreCatalog), [genreCatalog]);
  const {
    currentPlaylist,
    currentTracks,
    isLoadingPlaylist,
    playlistError,
    setCurrentPlaylist,
    setCurrentTracks,
    setLoadingPlaylist,
    setPlaylistError,
    clearPlaylistError,
  } = usePlaylistStore();

  const topArtists = useMemo(() => {
    if (!Array.isArray(currentTracks)) return [];
    const seen = new Set();
    const artists = [];

    currentTracks.forEach((track) => {
      const artist = track?.artist ? track.artist.trim() : '';
      if (!artist || seen.has(artist)) return;
      seen.add(artist);
      artists.push(artist);
    });

    return artists.slice(0, 4);
  }, [currentTracks]);

  // Helper function to check if description has actual content
  const hasDescriptionContent = (description) => {
    if (!description) return false;
    // Remove HTML tags and check if there's any text content
    const textContent = description.replace(/<[^>]*>/g, '').trim();
    return textContent.length > 0;
  };

  const formatCommentDate = (input) => {
    if (!input) return '';
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  useEffect(() => {
    const loadPlaylist = async () => {
      if (!id) return;

      clearPlaylistError();
      setLoadingPlaylist(true);

      try {
        const [playlist, tracks] = await Promise.all([
          getPlaylistById(id),
          getPlaylistTracks(id)
        ]);

        setCurrentPlaylist(playlist);
        setCurrentTracks(tracks);
      } catch (error) {
        console.error('Error loading playlist:', error);
        setPlaylistError(error.message || 'Failed to load playlist');
      } finally {
        setLoadingPlaylist(false);
      }
    };

    loadPlaylist();
  }, [id, clearPlaylistError, setLoadingPlaylist, setCurrentPlaylist, setCurrentTracks, setPlaylistError]);

  const applyEngagementData = (payload) => {
    setIsLoved(Boolean(payload?.viewerHasLoved));
    setLoveCount(Number(payload?.loveCount || 0));
    setComments(Array.isArray(payload?.comments) ? payload.comments : []);
  };

  useEffect(() => {
    const loadEngagement = async () => {
      if (!currentPlaylist?.id) return;
      if (!playlistLoveEnabled && !playlistCommentsEnabled) {
        setIsLoved(false);
        setLoveCount(0);
        setComments([]);
        setEngagementError('');
        return;
      }
      try {
        const data = await getPlaylistEngagement(currentPlaylist.id);
        applyEngagementData(data);
        setEngagementError('');
      } catch (error) {
        console.error('Failed to load playlist engagement:', error);
        setEngagementError('Comments are temporarily unavailable.');
      }
    };

    loadEngagement();
  }, [currentPlaylist?.id, isAuthenticated, playlistLoveEnabled, playlistCommentsEnabled]);

  useEffect(() => {
    if (!currentPlaylist?.id) return;
    if (viewTrackedRef.current === currentPlaylist.id) return;

    viewTrackedRef.current = currentPlaylist.id;
    const eventIdBase = metaPixel.createEventId();

    metaPixel.trackEvent({
      eventName: 'ViewContent',
      eventIdBase,
      curatorPixelId: currentPlaylist.meta_pixel_id,
      params: {
        content_ids: [String(currentPlaylist.id)],
        content_type: 'playlist',
        content_name: currentPlaylist.title || ''
      }
    });

    siteAnalytics.trackFeatureStart('playlist_view', 'page_load', { playlist_id: String(currentPlaylist.id) });
  }, [currentPlaylist?.id, currentPlaylist?.title, currentPlaylist?.meta_pixel_id]);
  
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('ref') === 'qr') {
      const fetchCta = async () => {
        try {
          // Check localStorage for existing variant assignment
          const storedVariant = localStorage.getItem('qr_cta_variant');
          const variantParam = storedVariant ? `&variant=${storedVariant}` : '';

          const res = await fetch(`/api/v1/qr-ctas?playlistId=${id}${variantParam}`);
          const data = await res.json();
          if (data.success && data.data) {
            setQrCta(data.data);
            // Store the assigned variant for future visits
            if (data.data.variant && !storedVariant) {
              localStorage.setItem('qr_cta_variant', data.data.variant);
            }
          }
        } catch (err) {
          console.error('Failed to fetch QR CTA:', err);
        }
      };
      fetchCta();
    }
  }, [id, location.search]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'user') return;
    if (purgatoryCheckedRef.current) return;
    if (!shouldShowPurgatoryCTA()) return;

    purgatoryCheckedRef.current = true;
    const controller = new AbortController();

    const checkPurgatoryStatus = async () => {
      try {
        const response = await fetch('/api/v1/top10/purgatory-status', {
          credentials: 'include',
          signal: controller.signal
        });

        if (!response.ok) return;
        const data = await response.json();
        if (data?.isPurgatory) {
          setShowPurgatoryCTA(true);
        }
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('Failed to check Top 10 purgatory status:', error);
        }
      }
    };

    checkPurgatoryStatus();
    return () => controller.abort();
  }, [isAuthenticated, user?.role]);

  const fromPerf = Boolean(location.state?.fromPerf || new URLSearchParams(location.search).get('from') === 'perf');
  const backHref = fromPerf ? '/perf' : '/home';
  const backLabel = fromPerf ? '← back to Perfect Sundays' : '← Back to Playlists';

  // Use custom grid title when coming from Perfect Sundays (with null safety)
  const displayTitle = currentPlaylist
    ? (fromPerf && currentPlaylist.custom_action_label
        ? currentPlaylist.custom_action_label
        : currentPlaylist.title)
    : '';

  const handleBack = () => {
    navigate(backHref);
  };

  const handleLoveToggle = async () => {
    if (!currentPlaylist?.id) return;
    if (!playlistLoveEnabled) return;
    if (!isAuthenticated) {
      setShowSignupModal(true);
      return;
    }

    const wasLoved = isLoved;
    const previousCount = loveCount;
    const nextLoved = !wasLoved;
    const nextCount = Math.max(0, previousCount + (nextLoved ? 1 : -1));

    setIsLoved(nextLoved);
    setLoveCount(nextCount);

    try {
      const data = nextLoved
        ? await lovePlaylist(currentPlaylist.id, authenticatedFetch)
        : await unlovePlaylist(currentPlaylist.id, authenticatedFetch);
      applyEngagementData(data);
      setEngagementError('');
      siteAnalytics.trackClick('playlist_view', 'love_click', {
        playlist_id: String(currentPlaylist.id),
        state: nextLoved ? 'loved' : 'unloved'
      });
    } catch (error) {
      console.error('Failed to toggle love:', error);
      setIsLoved(wasLoved);
      setLoveCount(previousCount);
      setEngagementError('Failed to update love. Please try again.');
    }
  };

  const handleSubmitComment = async () => {
    if (!currentPlaylist?.id) return;
    if (!isAuthenticated) {
      setShowSignupModal(true);
      return;
    }

    const nextComment = commentDraft.trim();
    if (!nextComment || isSubmittingComment) return;

    setIsSubmittingComment(true);
    try {
      const data = await createPlaylistComment(currentPlaylist.id, nextComment, authenticatedFetch);
      applyEngagementData(data);
      setCommentDraft('');
      setEngagementError('');
      setCommentsExpanded(true);
    } catch (error) {
      console.error('Failed to submit comment:', error);
      setEngagementError('Failed to post comment. Please try again.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleSubmitReply = async (commentId) => {
    if (!currentPlaylist?.id || !commentId) return;
    if (!isAuthenticated) {
      setShowSignupModal(true);
      return;
    }

    const replyText = String(replyDrafts[commentId] || '').trim();
    if (!replyText || submittingReplyId === commentId) return;

    setSubmittingReplyId(commentId);
    try {
      const data = await createPlaylistReply(currentPlaylist.id, commentId, replyText, authenticatedFetch);
      applyEngagementData(data);
      setReplyDrafts((prev) => ({ ...prev, [commentId]: '' }));
      setActiveReplyId(null);
      setEngagementError('');
      setCommentsExpanded(true);
    } catch (error) {
      console.error('Failed to submit reply:', error);
      setEngagementError('Failed to post reply. Please try again.');
    } finally {
      setSubmittingReplyId(null);
    }
  };

  if (playlistError) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <ErrorContainer>
            <ErrorMessage>Error: {playlistError}</ErrorMessage>
            <BackButton onClick={handleBack}>{backLabel}</BackButton>
          </ErrorContainer>
        </ScrollRegion>
      </PageContainer>
    );
  }

  if (isLoadingPlaylist) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <LoadingContainer>
            <LoadingText className="loading-dots">Loading playlist</LoadingText>
          </LoadingContainer>
        </ScrollRegion>
      </PageContainer>
    );
  }

  if (!currentPlaylist) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <ErrorContainer>
            <ErrorMessage>Playlist not found</ErrorMessage>
            <BackButton onClick={handleBack}>{backLabel}</BackButton>
          </ErrorContainer>
        </ScrollRegion>
      </PageContainer>
    );
  }

  const customActionLabel = typeof currentPlaylist.custom_action_label === 'string'
    ? currentPlaylist.custom_action_label.trim()
    : '';
  const customActionUrl = typeof currentPlaylist.custom_action_url === 'string'
    ? currentPlaylist.custom_action_url.trim()
    : '';
  const customActionIconUrl = typeof currentPlaylist.custom_action_icon === 'string'
    ? currentPlaylist.custom_action_icon.trim()
    : '';
  const shouldRenderCustomAction = Boolean(customActionLabel && customActionUrl);
  const resolvedImageUrl = currentPlaylist.image_url_large
    || currentPlaylist.image_url_original
    || currentPlaylist.image
    || null;
  const resolvedImageFallback = currentPlaylist.image_url_original || currentPlaylist.image || null;
  const seoTitle = currentPlaylist.curator_name
    ? `${displayTitle} by ${currentPlaylist.curator_name}`
    : displayTitle;
  const seoDescriptionParts = ['Cross-platform, curated, by people.'];
  const titleLine = displayTitle
    ? `${displayTitle}${currentPlaylist.curator_name ? ` by ${currentPlaylist.curator_name}` : ''}.`
    : null;
  if (titleLine) {
    seoDescriptionParts.push(titleLine);
  }
  if (topArtists.length) {
    seoDescriptionParts.push(`Featuring ${topArtists.join(', ')}.`);
  }
  const seoDescription = seoDescriptionParts.join(' ');
  const seoKeywords = [
    'flowerpil',
    'cross-platform',
    'curated',
    'by people',
    'playlist',
    displayTitle,
    currentPlaylist.curator_name,
    ...topArtists
  ].filter(Boolean);
  const trackEntries = Array.isArray(currentTracks)
    ? currentTracks
        .filter((track) => track?.title && track?.artist)
        .slice(0, 12)
        .map((track, index) => ({
          '@type': 'MusicRecording',
          name: track.title,
          byArtist: {
            '@type': 'MusicGroup',
            name: track.artist
          },
          position: index + 1
        }))
    : [];
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'MusicPlaylist',
    name: displayTitle || currentPlaylist.title,
    description: seoDescription,
    url: `https://flowerpil.io/playlists/${currentPlaylist.id}`,
    image: resolvedImageUrl || resolvedImageFallback || undefined,
    datePublished: currentPlaylist.publish_date || undefined,
    numTracks: currentTracks?.length || currentPlaylist.track_count || 0,
    creator: {
      '@type': 'Person',
      name: currentPlaylist.curator_name || 'Flowerpil'
    },
    track: trackEntries.length ? trackEntries : undefined
  };

  return (
    <PageContainer>
      <SEO
        title={seoTitle}
        description={seoDescription}
        canonical={`/playlists/${currentPlaylist.id}`}
        image={resolvedImageUrl || resolvedImageFallback}
        keywords={seoKeywords}
        type="music.playlist"
        structuredData={structuredData}
      />
      {qrCta && !qrCtaDismissed && (
        <QRCodeCTABanner
          cta={qrCta}
          variant={qrCta.variant}
          onDismiss={() => setQrCtaDismissed(true)}
        />
      )}
      <ReusableHeader />
      <ScrollRegion>
        <ContentWrapper>
          {/* Page Breadcrumb */}
          <PageBreadcrumb>
            {fromPerf ? (
              <Link to="/perf" state={{ fromPerf: true }}>{backLabel}</Link>
            ) : (
              <>
                <Link to="/home">Home</Link> / <Link to="/playlists">Playlists</Link> / {displayTitle}
              </>
            )}
          </PageBreadcrumb>

        {/* Hero Section */}
        <HeroSection>
          <HeroContent>
            {/* Left Section: Flags + Artwork */}
            <LeftSection>
              {/* Playlist Flags */}
              {Array.isArray(currentPlaylist?.flags) && currentPlaylist.flags.length > 0 && (
                <PlaylistFlags>
                  {currentPlaylist.flags.map((flag) => {
                    if (!flag) return null;
                    const slug = flag.url_slug;
                    const flagStyle = {
                      backgroundColor: flag.color || '#666',
                      color: flag.text_color || '#ffffff'
                    };

                    if (!slug) {
                      return (
                        <PlaylistFlag key={`${flag.id}-static`} style={flagStyle}>
                          {flag.text}
                        </PlaylistFlag>
                      );
                    }

                    return (
                      <TagLink key={`${flag.id}-${slug}`} to={`/content-tag/${slug}`}>
                        <PlaylistFlag style={flagStyle}>
                          {flag.text}
                        </PlaylistFlag>
                      </TagLink>
                    );
                  })}
                </PlaylistFlags>
              )}

              <PlaylistImage>
                {resolvedImageUrl ? (
                  <ResponsiveImage
                    src={resolvedImageUrl}
                    alt={currentPlaylist.title}
                    sizes={IMAGE_SIZES.CARD_LARGE}
                    loading="eager"
                    placeholder="NO IMAGE"
                    fallback={resolvedImageFallback} // Fallback to original if size variants don't exist
                  />
                ) : (
                  <PlaceholderArtwork
                    itemId={currentPlaylist.id}
                    size="large"
                    borderRadius="0"
                  />
                )}
              </PlaylistImage>
            </LeftSection>

            {/* Right Section: Date, Name/Type, Title, Actions */}
            <RightSection>
              {/* Metadata Group: Date, Title, Curator */}
              <MetadataGroup>
                <MetaLine>
                  <PublishDate>{formatDate(currentPlaylist.publish_date)}</PublishDate>
                  <PlaylistMeta>
                    <CuratorInfo>
                      <CuratorHeader>Playlist By</CuratorHeader>
                      <CuratorLink to={`/curator/${encodeURIComponent(currentPlaylist.curator_name)}`}>
                        {currentPlaylist.curator_name}
                      </CuratorLink>
                      {' '}
                      <CuratorTypeDisplay
                        type={currentPlaylist.curator_type}
                        prefix=" | "
                        uppercase={true}
                        fallback="CURATOR"
                      />
                    </CuratorInfo>
                  </PlaylistMeta>
                </MetaLine>
                <PlaylistTitle data-length={
                  displayTitle.length > 60 ? 'very-long' :
                    displayTitle.length > 35 ? 'long' :
                      'normal'
                }>
                  {displayTitle}
                </PlaylistTitle>


              </MetadataGroup>

              {hasDescriptionContent(currentPlaylist.description) && (
          <DescriptionSection>
            <DescriptionHeader>
              ABOUT THIS PLAYLIST:
            </DescriptionHeader>

            <DescriptionText dangerouslySetInnerHTML={{ __html: currentPlaylist.description }} />
          </DescriptionSection>
        )}
              
              {/* All Actions - Streaming + Additional */}
              <ActionsWrapper>
                <AllActions>
                  {/* Streaming Platform Buttons (no text labels) */}
                  {currentPlaylist.spotify_url && (
                    <StreamingIconButton
                      href={currentPlaylist.spotify_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Listen on Spotify`}
                      onClick={() => siteAnalytics.trackClick('playlist_view', 'dsp_link_click', { platform: 'spotify', playlist_id: String(currentPlaylist.id) })}
                    >
                      <StreamingIcon src="/assets/playlist-actions/spotify.svg" alt="Spotify" />
                    </StreamingIconButton>
                  )}
                  {currentPlaylist.apple_url && (
                    <StreamingIconButton
                      href={currentPlaylist.apple_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Listen on Apple Music`}
                      onClick={() => siteAnalytics.trackClick('playlist_view', 'dsp_link_click', { platform: 'apple', playlist_id: String(currentPlaylist.id) })}
                    >
                      <StreamingIcon src="/icons/apple.png" alt="Apple Music" />
                    </StreamingIconButton>
                  )}
                  {currentPlaylist.tidal_url && (
                    <StreamingIconButton
                      href={currentPlaylist.tidal_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Listen on Tidal`}
                      onClick={() => siteAnalytics.trackClick('playlist_view', 'dsp_link_click', { platform: 'tidal', playlist_id: String(currentPlaylist.id) })}
                    >
                      <StreamingIcon src="/assets/playlist-actions/tidal.svg" alt="Tidal" />
                    </StreamingIconButton>
                  )}
                  {currentPlaylist.qobuz_url && (
                    <StreamingIconButton
                      href={currentPlaylist.qobuz_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Listen on Qobuz`}
                      onClick={() => siteAnalytics.trackClick('playlist_view', 'dsp_link_click', { platform: 'qobuz', playlist_id: String(currentPlaylist.id) })}
                    >
                      <StreamingIcon src="/assets/playlist-actions/link.png" alt="Qobuz" />
                    </StreamingIconButton>
                  )}
                  {currentPlaylist.soundcloud_url && (
                    <StreamingIconButton
                      href={currentPlaylist.soundcloud_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Listen on SoundCloud`}
                      onClick={() => siteAnalytics.trackClick('playlist_view', 'dsp_link_click', { platform: 'soundcloud', playlist_id: String(currentPlaylist.id) })}
                    >
                      <StreamingIcon src="/assets/playlist-actions/soundcloud.svg" alt="SoundCloud" />
                    </StreamingIconButton>
                  )}

                  {playlistLoveEnabled && (
                    <ActionButton
                      onClick={handleLoveToggle}
                      title={isLoved ? 'Remove from saved playlists' : 'Love this playlist'}
                      aria-label={isLoved ? 'Unlove playlist' : 'Love playlist'}
                    >
                      <LoveIcon src={isLoved ? '/love-red-fullsize.png' : '/love-fullsize.png'} alt="Love" />
                    </ActionButton>
                  )}

                  <ActionButton
                    onClick={() => { siteAnalytics.trackClick('playlist_view', 'share_click', { playlist_id: String(currentPlaylist.id) }); setShowShareModal(true); }}
                    title="Share this playlist"
                  >
                    <ShareIcon src="/assets/playlist-actions/share.png" alt="More Actions" />
                    <ActionText>Share</ActionText>
                  </ActionButton>

                  {shouldRenderCustomAction && (
                    <CustomActionLink
                      href={customActionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={customActionLabel}
                      onClick={() => siteAnalytics.trackClick('playlist_view', 'cta_click', { playlist_id: String(currentPlaylist.id), label: customActionLabel })}
                    >
                      <CustomActionIconWrapper>
                        <IconWithFallback
                          src={customActionIconUrl}
                          alt={customActionLabel}
                          size={28}
                        />
                      </CustomActionIconWrapper>
                      <CustomActionText>{customActionLabel}</CustomActionText>
                    </CustomActionLink>
                  )}

                  {/* Edit button - only shown to playlist owner */}
                  {isAuthenticated && user?.curator_id && currentPlaylist?.curator_id &&
                   user.curator_id === currentPlaylist.curator_id && (
                    <EditPlaylistLink
                      to={`/curator-admin/playlists?select=${currentPlaylist.id}`}
                      title="Edit this playlist"
                    >
                      <EditIcon viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </EditIcon>
                      <ActionText>Edit</ActionText>
                    </EditPlaylistLink>
                  )}
                </AllActions>
              </ActionsWrapper>
            </RightSection>
          </HeroContent>

          {playlistCommentsEnabled && (
            <CommentsSection>
              <CommentsHeader>
                <CommentsTitle>Comments ({comments.length})</CommentsTitle>
                <CommentsHeaderActions>
                  {playlistLoveEnabled && (
                    <CommentsLoveCount>{loveCount} {loveCount === 1 ? 'love' : 'loves'}</CommentsLoveCount>
                  )}
                  <CommentsToggleButton
                    type="button"
                    onClick={() => setCommentsExpanded((previous) => !previous)}
                    aria-expanded={commentsExpanded}
                  >
                    {commentsExpanded ? 'Hide' : 'Show'}
                  </CommentsToggleButton>
                </CommentsHeaderActions>
              </CommentsHeader>

              {commentsExpanded && (
                <CommentsBody>
                  {engagementError && <CommentsStatus>{engagementError}</CommentsStatus>}

                  <CommentComposer>
                    <CommentInput
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      maxLength={600}
                      placeholder={isAuthenticated ? 'Add a comment...' : 'Log in to comment'}
                    />
                    <CommentActionButton
                      type="button"
                      onClick={handleSubmitComment}
                      disabled={isSubmittingComment || !commentDraft.trim()}
                    >
                      {isSubmittingComment ? 'Posting...' : 'Post'}
                    </CommentActionButton>
                  </CommentComposer>

                  {comments.length === 0 ? (
                    <CommentsEmpty>Be the first to leave a comment.</CommentsEmpty>
                  ) : (
                    <CommentList>
                      {comments.map((comment) => (
                        <CommentCard key={comment.id}>
                          <CommentMeta>
                            <CommentUser>{comment.username}</CommentUser>
                            <CommentDate>{formatCommentDate(comment.created_at)}</CommentDate>
                          </CommentMeta>
                          <CommentCopy>{comment.comment_text}</CommentCopy>
                          <CommentReplyButton
                            type="button"
                            onClick={() => setActiveReplyId((current) => (current === comment.id ? null : comment.id))}
                          >
                            {activeReplyId === comment.id ? 'Cancel' : 'Reply'}
                          </CommentReplyButton>

                          {activeReplyId === comment.id && (
                            <ReplyComposer>
                              <ReplyInput
                                value={replyDrafts[comment.id] || ''}
                                onChange={(event) => setReplyDrafts((previous) => ({
                                  ...previous,
                                  [comment.id]: event.target.value
                                }))}
                                maxLength={600}
                                placeholder={isAuthenticated ? 'Write a reply...' : 'Log in to reply'}
                              />
                              <CommentActionButton
                                type="button"
                                onClick={() => handleSubmitReply(comment.id)}
                                disabled={
                                  submittingReplyId === comment.id
                                  || !String(replyDrafts[comment.id] || '').trim()
                                }
                              >
                                {submittingReplyId === comment.id ? 'Replying...' : 'Reply'}
                              </CommentActionButton>
                            </ReplyComposer>
                          )}

                          {Array.isArray(comment.replies) && comment.replies.length > 0 && (
                            <ReplyList>
                              {comment.replies.map((reply) => (
                                <ReplyCard key={reply.id}>
                                  <CommentMeta>
                                    <CommentUser>{reply.username}</CommentUser>
                                    <CommentDate>{formatCommentDate(reply.created_at)}</CommentDate>
                                  </CommentMeta>
                                  <CommentCopy>{reply.comment_text}</CommentCopy>
                                </ReplyCard>
                              ))}
                            </ReplyList>
                          )}
                        </CommentCard>
                      ))}
                    </CommentList>
                  )}
                </CommentsBody>
              )}
            </CommentsSection>
          )}

        {/* Description if available */}



        {/* Track Section with Background */}
        <TrackSectionWrapper>
          {/* Track Listing */}
          <TrackSection>
            {currentTracks.length > 0 ? (
              <TrackList>
                {currentTracks.map((track, index) => (
                  <ExpandableTrack
                    key={track.id || index}
                    track={track}
                    index={index}
                    showCopyButton={true}
                    showStreaming={true}
                    playlistId={currentPlaylist.id}
                    playlistMetaPixelId={currentPlaylist.meta_pixel_id}
                    genreLookup={genreLookup}
                  />
                ))}
              </TrackList>
            ) : (
              <EmptyTracks>No tracks available</EmptyTracks>
            )}
          </TrackSection>

          {/* End Scroll Section - Shows related playlists when user reaches bottom */}
          <EndScrollSection playlistId={currentPlaylist.id} />
        </TrackSectionWrapper>
          </HeroSection>
        </ContentWrapper>
      </ScrollRegion>

      {/* Share Modal */}
      {showShareModal && (
        <Suspense fallback={<ShareModalFallback>Preparing share tools…</ShareModalFallback>}>
          <PlaylistShareModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            playlist={currentPlaylist}
            tracks={currentTracks}
            platformLinks={{
              spotify: currentPlaylist.spotify_url,
              apple: currentPlaylist.apple_url,
              tidal: currentPlaylist.tidal_url
            }}
          />
        </Suspense>
      )}

      {/* Purgatory CTA Modal - shown to top10 users who haven't signed up as curators */}
      <PurgatoryCTAModal
        isOpen={showPurgatoryCTA}
        onClose={() => setShowPurgatoryCTA(false)}
      />

      <SignupModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        onSuccess={() => {
          setShowSignupModal(false);
          if (currentPlaylist?.id) {
            getPlaylistEngagement(currentPlaylist.id)
              .then((data) => applyEngagementData(data))
              .catch((error) => console.error('Failed to refresh engagement after signup:', error));
          }
        }}
      />

    </PageContainer>
  );
};

// Styled Components

// Page structure matching LandingPage pattern
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
  -webkit-overflow-scrolling: touch;
  background: ${theme.colors.fpwhite};
  padding-bottom: ${theme.spacing.lg};
  scrollbar-gutter: stable;

  ${mediaQuery.mobile} {
    padding-bottom: ${theme.spacing.md};
  }
`;

const ContentWrapper = styled.div`
  max-width: ${theme.layout.maxWidth};
  margin: 0 auto;
  padding: ${theme.spacing.md} ${theme.layout.containerPadding} 0 ${theme.layout.containerPadding};

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm} ${theme.layout.containerPadding} 0 ${theme.layout.containerPadding};
  }
`;

const ShareModalFallback = styled.div`
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  z-index: 1200;
`;

const BackButton = styled.button`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  color: ${theme.colors.white};
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    color: ${theme.colors.red};
  }
`;

const DescriptionHeader = styled.div`
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.sm};
  opacity: 0.7;
  letter-spacing: 0.05em;
`;


const CuratorHeader = styled.div`
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  display: inline-block;
  opacity: 0.7;
  margin-right: 0.5em;
  letter-spacing: 0.05em;

  @media (max-width: 900px) {
    display: inline;
    margin-right: 0.35em;
  }

  ${mediaQuery.mobile} {
    display: inline;
  }
`;

const HeroSection = styled.section`
  margin-bottom: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  padding: ${theme.spacing.sm};

  /* Subtle shadow effects for slickness */
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs};
    margin-bottom: ${theme.spacing.sm};
  }
`;

const HeroContent = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.sm};

  @media (max-width: 900px) {
    flex-direction: column;
    gap: ${theme.spacing.lg};
    align-items: center;
    text-align: center;
  }

  ${mediaQuery.mobile} {
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: ${theme.spacing.md};
  }
`;

const LeftSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex-shrink: 0;
  position: relative;
  padding: ${theme.spacing.sm} ${theme.spacing.sm};
  background: linear-gradient(
    135deg,
    rgba(0, 0, 0, 0.005) 0%,
    rgba(0, 0, 0, 0.01) 100%
  );
  border-radius: 2px;

  /* Very subtle shadow */
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.01);

  @media (max-width: 900px) {
    align-items: center;
    width: 100%;
    padding: ${theme.spacing.sm};
  }

  ${mediaQuery.mobile} {
    align-items: center;
    width: 100%;
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
  }
`;

const RightSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
  gap: ${theme.spacing.lg};

  @media (max-width: 900px) {
    align-items: center;
    text-align: center;
    width: 100%;
    gap: ${theme.spacing.sm};
  }

  ${mediaQuery.mobile} {
    align-items: center;
    text-align: center;
    width: 100%;
    gap: ${theme.spacing.xs};
    
  }
`;

const PlaylistImage = styled.div`
  position: relative;
  width: 300px;
  height: 300px;
  border: ${theme.borders.solid} ${theme.colors.black};
  overflow: hidden;
  flex-shrink: 0;

  /* Subtle shadow effects for slickness */

  border-radius: 1px;



  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  ${mediaQuery.mobile} {
    width: 180px;
    height: 180px;
    margin-top: 0px;

  }
`;

const PlaylistMeta = styled.div`
`;

const MetaLine = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${theme.spacing.xs};

  @media (max-width: 900px) {
    flex-direction: row;
    align-items: baseline;
    justify-content: center;
    gap: 0;
    flex-wrap: nowrap;
    white-space: nowrap;
  }
`;

const MetadataGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.md} ${theme.spacing.md};

  border-radius: 2px;
  position: relative;
  width: 100%;

  /* Very subtle inner shadow for depth */
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);

  /* Subtle dividing line at bottom */
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: ${theme.spacing.md};
    right: ${theme.spacing.md};
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(0, 0, 0, 0.04) 20%,
      rgba(0, 0, 0, 0.04) 80%,
      transparent 100%
    );
  }

  @media (max-width: 900px) {
    align-items: center;
    text-align: center;
    padding: ${theme.spacing.sm};

    &::after {
      left: 10%;
      right: 10%;
    }
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm} ${theme.spacing.sm};

    &::after {
      left: 10%;
      right: 10%;
    }
  }
`;

const PublishDate = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  margin-bottom: 0;
  text-transform: uppercase;
  opacity: 0.7;
  letter-spacing: 0.05em;

  @media (max-width: 900px) {
    display: inline;
    padding-right: ${theme.spacing.sm};
    margin-right: ${theme.spacing.sm};
    position: relative;

    &::after {
      content: '|';
      position: absolute;
      right: 0;
      color: rgba(0, 0, 0, 0.3);
      font-weight: 300;
    }
  }
`;

const CuratorInfo = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: none;
  letter-spacing: -0.9px;
  word-spacing: 0.005em;
  opacity: 0.85;
  margin: 0;

  @media (max-width: 900px) {
    display: inline;
    font-size: ${theme.fontSizes.small};
  }

  ${mediaQuery.mobile} {
    margin: 0;
  }
`;

const PlaylistTitle = styled.h1`
  /* Typography */
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: clamp(3.4rem, 2.4vw, 2.4rem);
  font-weight: ${theme.fontWeights.bold};
  line-height: 1.2;


  /* Kerning and spacing */
  letter-spacing: -0.991px;
  word-spacing: tight;

  /* Color and layout */
  color: ${theme.colors.black};
  margin: ${theme.spacing.xs} 0;

  /* Text handling */
  word-break: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  max-width: 100%;
  display: block;
  text-transform: none;

  /* Text rendering optimization */
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* Dynamic font scaling based on content length */
  &[data-length="long"] {
    font-size: clamp(2rem, 1.6vw, calc(${theme.fontSizes.h1} * 0.65));
    letter-spacing: 0.01em; /* Tighter kerning for longer titles */
  }

  &[data-length="very-long"] {
    font-size: clamp(0.6rem, 1.4vw, calc(${theme.fontSizes.h1} * 0.56));
    letter-spacing: 1em; /* Even tighter kerning for very long titles */
  }

  /* Tablet and below - single line with spacing */
  ${mediaQuery.tablet} {
    font-size: clamp(1.9rem, 6vw, 1.5rem);
    font-weight: ${theme.fontWeights.black};
    margin: 1px 0 12px 0;
    letter-spacing: -0.98px;
    word-spacing: tight;

    white-space: nowrap;
    overflow: hidden;
    max-width: calc(100% - -1.2rem);

    &[data-length="long"] {
      font-size: clamp(1rem, 4.2vw, 1.4rem);
    }

    &[data-length="very-long"] {
      font-size: clamp(0.9rem, 3.8vw, 1.2rem);
    }
  }

  /* Very small mobile devices - allow two lines with wrapping */
  ${mediaQuery.mobile} {
    font-size: clamp(1.rem, 5vw, 1.5rem);
    white-space: normal;
    overflow: visible;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.2;
    max-height: calc(1.2em * 2);
    word-break: normal;
    overflow-wrap: normal;
    hyphens: none;

    &[data-length="long"] {
      font-size: clamp(1.2rem, 4.5vw, 1.3rem);
    }

    &[data-length="very-long"] {
      font-size: clamp(1rem, 4vw, 1.2rem);
    }
  }
`;

const TrackSection = styled.section`
  margin-bottom: ${theme.spacing.md};
    background: ${theme.colors.fpwhite};
s

`;

const TrackList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;


const EmptyTracks = styled.div`
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const DescriptionSection = styled.section`
  width: 100%;
  padding: ${theme.spacing.lg} ${theme.spacing.md};
  background: linear-gradient(
    135deg,
    rgba(147, 139, 139, 0.02) 0%,
    rgba(147, 139, 139, 0.03) 100%
  );
  border-radius: 2px;
  position: relative;

  /* Very subtle inner shadow */
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.02);

  /* Subtle dividing line at bottom */
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: ${theme.spacing.md};
    right: ${theme.spacing.md};
    height: 1px;

  }

  @media (max-width: 900px) {
    padding: ${theme.spacing.md};

    &::after {
      left: 10%;
      right: 10%;
    }
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm} ${theme.spacing.sm};

    &::after {
      left: 10%;
      right: 10%;
    }
  }
`;

const DescriptionText = styled.div`
  font-size: ${theme.fontSizes.sm};
  color: ${theme.colors.black};
  padding: 0;
  margin: 0;
  text-align: left;
  line-height: 1.6;

  /* Rich text styles */
  h1, h2, h3 {
    font-family: ${theme.fonts.primary};
    color: ${theme.colors.black};
    margin-top: ${theme.spacing.md};
    margin-bottom: ${theme.spacing.sm};
  }

  h1 { font-size: ${theme.fontSizes.xl}; font-weight: ${theme.fontWeights.bold}; }
  h2 { font-size: ${theme.fontSizes.lg}; font-weight: ${theme.fontWeights.semibold}; }
  h3 { font-size: ${theme.fontSizes.md}; font-weight: ${theme.fontWeights.semibold}; }

  p {
    margin-bottom: ${theme.spacing.sm};
  }

  strong {
    font-weight: ${theme.fontWeights.bold};
  }

  em {
    font-style: italic;
  }

  ul, ol {
    margin-left: ${theme.spacing.lg};
    margin-bottom: ${theme.spacing.sm};
    padding: 0;
  }

  li {
    margin-bottom: ${theme.spacing.xs};
  }

  a {
    color: ${theme.colors.fpblue};
    text-decoration: underline;

    &:hover {
      opacity: 0.8;
    }
  }

  @media (max-width: 900px) {
    text-align: center;

    h1, h2, h3 {
      text-align: center;
      margin-left: 0;
      margin-right: 0;
    }

    ul, ol {
      margin-left: 0;
      list-style-position: inside;
    }

    li {
      text-align: center;
    }
  }

  ${mediaQuery.mobile} {
    text-align: center;
    font-size: ${theme.fontSizes.body};

    h1, h2, h3 {
      text-align: center;
      margin-left: 0;
      margin-right: 0;
    }

    ul, ol {
      margin-left: 0;
      list-style-position: inside;
    }

    li {
      text-align: center;
    }
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 50vh;
`;

const LoadingText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  gap: ${theme.spacing.lg};
`;

const ErrorMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.red};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
`;

const AllActions = styled.div`
  display: flex;
  justify-content: flex-start;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
  width: 100%;

  @media (max-width: 900px) {
    justify-content: center;
  }

  ${mediaQuery.mobile} {
    gap: ${theme.spacing.md};
    justify-content: center;
    /* Prevent wrapping of main action buttons, but allow custom CTA to wrap */
  }
`;

const StreamingIconButton = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.sm} ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  text-decoration: none;
  transition: all 0.2s ease;
  min-width: 80px;
  min-height: 80px;
  cursor: pointer;
  flex-shrink: 0;

  /* Subtle shadow effects for slickness */
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;

  &:hover {
    border-color: ${theme.colors.blackAct};
    background: rgba(255, 255, 255, 0.05);
    transform: translateY(-2px);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.2);
  }

  &:active {
    background: rgba(255, 255, 255, 0.1);
  }

  ${mediaQuery.mobile} {
    min-width: 62px;
    min-height: 62px;
    padding: ${theme.spacing.xs};
    touch-action: manipulation;
  }
`;

const StreamingIcon = styled.img`
  width: 32px;
  height: 32px;
  opacity: 0.8;

  ${mediaQuery.mobile} {
    width: 26px;
    height: 26px;
  }
`;

const ActionsWrapper = styled.div`
  display: flex;
  justify-content: flex-start;
  width: 100%;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: linear-gradient(
    135deg,
    rgba(0, 0, 0, 0.015) 0%,
    rgba(0, 0, 0, 0.01) 100%
  );
  border-radius: 2px;
  position: relative;

  /* Very subtle inner shadow */
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.015);

  @media (max-width: 900px) {
    justify-content: center;
    padding: ${theme.spacing.sm};
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    justify-content: center;
    
  }
`;

const CustomActionLink = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  text-decoration: none;
  transition: all 0.2s ease;
  min-height: 75px;
  cursor: pointer;

  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;

  &:hover {
    border-color: ${theme.colors.blackAct};
    background: rgba(255, 255, 255, 0.05);
    transform: translateY(-2px);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.2);
  }

  &:active {
    background: rgba(255, 255, 255, 0.1);
  }

  ${mediaQuery.mobile} {
    min-height: 62px;
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    touch-action: manipulation;
    /* Force custom CTA to take full width and wrap to new line */
    flex: 1 0 100%;
    width: 100%;
    max-width: 100%;
  }
`;

const CustomActionIconWrapper = styled.div`
  width: 28px;
  height: 28px;
  display: inline-block;

  img, picture {
    width: 100%;
    height: 100%;
  }

  img {
    object-fit: contain;
  }

  ${mediaQuery.mobile} {
    width: 24px;
    height: 24px;
  }
`;

const CustomActionText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
`;

const ActionButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  text-decoration: none;
  transition: all 0.2s ease;
  min-width: 80px;
  min-height: 80px;
  cursor: pointer;
  gap: ${theme.spacing.xs};
  flex-shrink: 0;

  /* Subtle shadow effects for slickness */
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;

  &:hover {
    border-color: ${theme.colors.blackAct};
    background: rgba(255, 255, 255, 0.05);
    transform: translateY(-2px);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.2);
  }

  &:active {
    background: rgba(255, 255, 255, 0.1);
  }

  ${mediaQuery.mobile} {
    min-width: 62px;
    min-height: 62px;
    padding: ${theme.spacing.xs};
    gap: 2px;
    touch-action: manipulation;
  }
`;


const ActionText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  line-height: 0.1;
  
  ${mediaQuery.mobile} {
    font-size: ${theme.fontSizes.tiny};
  }
`;

const ShareIcon = styled.img`
  width: 32px;
  height: 32px;
  opacity: 0.8;

  ${mediaQuery.mobile} {
    width: 26px;
    height: 26px;
  }
`;

const LoveIcon = styled.img`
  width: 30px;
  height: 30px;
  object-fit: contain;
  opacity: 0.95;

  ${mediaQuery.mobile} {
    width: 24px;
    height: 24px;
  }
`;

const EditPlaylistLink = styled(Link)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  text-decoration: none;
  transition: all 0.2s ease;
  min-width: 80px;
  min-height: 80px;
  cursor: pointer;
  gap: ${theme.spacing.xs};
  flex-shrink: 0;

  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;

  &:hover {
    border-color: ${theme.colors.blackAct};
    background: rgba(255, 255, 255, 0.05);
    transform: translateY(-2px);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.2);
  }

  &:active {
    background: rgba(255, 255, 255, 0.1);
  }

  ${mediaQuery.mobile} {
    min-width: 62px;
    min-height: 62px;
    padding: ${theme.spacing.xs};
    gap: 2px;
    touch-action: manipulation;
  }
`;

const EditIcon = styled.svg`
  width: 32px;
  height: 32px;
  color: ${theme.colors.black};
  opacity: 0.8;

  ${mediaQuery.mobile} {
    width: 26px;
    height: 26px;
  }
`;

const PageBreadcrumb = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: ${theme.spacing.sm} ${theme.spacing.md} ${theme.spacing.md};
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  transition: all 0.3s ease;

  a {
    color: ${theme.colors.black};
    text-decoration: none;

    &:hover {
      color: ${theme.colors.red};
    }
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs} ${theme.spacing.sm} ${theme.spacing.sm};
    font-size: ${theme.fontSizes.tiny};
  }
`;


const PlaylistFlags = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  position: absolute;
  top: -${theme.spacing.md};
  left: 0;
  z-index: 1;

  @media (max-width: 900px) {
    position: static;
    justify-content: center;
    margin-bottom: ${theme.spacing.md};
  }

  ${mediaQuery.mobile} {
    position: static;
    justify-content: center;
    margin-bottom: ${theme.spacing.md};
  }
`;

const TagLink = styled(Link)`
  text-decoration: none;
  display: inline-flex;
`;

const PlaylistFlag = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: 14.5px;
  font-weight: ${theme.fontWeights.bold};
  text-transform: Capitalise;
  letter-spacing: -0.9px;
  border: ${theme.borders.solidThin} black;
  border-top: none;

  text-align: right;
  //top right bottom left
  padding: 32px 10px 8px 10px;

  text-shadow: 0 1px 2px rgba(153, 150, 150, 0.4);
  white-space: nowrap;
  line-height: 1;
  background: ${(p) => p.$bgColor || '#666'};
  opacity: 1;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, transparent 10%, rgba(123, 122, 122, 0.17) 100%);

    pointer-events: none;
  }
  color: ${(p) => p.$textColor || '#ffffff'};
  cursor: pointer;



  &:hover:not(:disabled) {
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.91),
      0 2px 6px rgba(27, 27, 29, 0.08),
      0 1px 3px rgba(108, 108, 119, 0.67);


    padding: 40px 10px 8px 10px;
    transition: padding ${theme.transitions.slow};
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.black};
    outline-offset: 2px;
  }

  &:disabled {
    cursor: default;
    opacity: 0.65;
  }

  ${mediaQuery.mobile} {
    font-size: 10px;
    font-weight: ${theme.fontWeights.bold};
    letter-spacing: -0.3px;
    border-top: ${theme.borders.solidThin} black;
    //top right bottom left (scaled down proportionally)
    padding: 12px 10px 8px 10px;

    text-align: right;
    &:hover:not(:disabled) {
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.91),
        0 2px 6px rgba(27, 27, 29, 0.08),
        0 1px 3px rgba(108, 108, 119, 0.67);
      padding: 16px 10px 8px 10px;

      transition: padding ${theme.transitions.fast};
    }
  }
`;

const TrackSectionWrapper = styled.div`
  background: #dbdbda;
  padding: ${theme.spacing.md} ${theme.spacing.md} ${theme.spacing.md};
  margin-top: ${theme.spacing.lg};

  /* Subtle shadow effects for slickness */
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  transition: all 0.3s ease;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs};
    margin-top: ${theme.spacing.sm};
  }
`;

const CommentsSection = styled.section`
  margin-top: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.015));
  border: ${theme.borders.solid} ${theme.colors.black};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
    margin-top: ${theme.spacing.sm};
  }
`;

const CommentsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const CommentsTitle = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const CommentsHeaderActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const CommentsLoveCount = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.75;
`;

const CommentsToggleButton = styled.button`
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
`;

const CommentsBody = styled.div`
  margin-top: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const CommentsStatus = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.red};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const CommentComposer = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${theme.spacing.sm};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

const CommentInput = styled.textarea`
  width: 100%;
  min-height: 84px;
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  resize: vertical;
  line-height: 1.45;

  &::placeholder {
    color: rgba(0, 0, 0, 0.45);
  }
`;

const CommentActionButton = styled.button`
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  min-height: 44px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.04);
  }
`;

const CommentsEmpty = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  opacity: 0.7;
`;

const CommentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const CommentCard = styled.article`
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  padding: ${theme.spacing.sm};
`;

const CommentMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const CommentUser = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
`;

const CommentDate = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  opacity: 0.6;
`;

const CommentCopy = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
`;

const CommentReplyButton = styled.button`
  margin-top: ${theme.spacing.xs};
  border: none;
  background: transparent;
  color: ${theme.colors.black};
  text-decoration: underline;
  cursor: pointer;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0;
`;

const ReplyComposer = styled.div`
  margin-top: ${theme.spacing.sm};
  padding-left: ${theme.spacing.sm};
  border-left: ${theme.borders.solidThin} ${theme.colors.black};
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${theme.spacing.sm};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

const ReplyInput = styled.textarea`
  width: 100%;
  min-height: 68px;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  line-height: 1.45;
  resize: vertical;
`;

const ReplyList = styled.div`
  margin-top: ${theme.spacing.sm};
  padding-left: ${theme.spacing.sm};
  border-left: ${theme.borders.solidThin} ${theme.colors.black};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const ReplyCard = styled.div`
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: #f7f7f6;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
`;

export default PlaylistView;
