import { useState, useEffect, useMemo, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { getUnifiedFeed } from '../services/unifiedFeedService';
import LandingHeader from './LandingHeader';
import FeedPlaylistCard from './FeedPlaylistCard';
import FeedReleaseCard from './FeedReleaseCard';
import FeedLinkCard from './FeedLinkCard';
import BlogPostCard from '@modules/blog/components/BlogPostCard';
import FeaturePieceFeedCard from '@modules/features/components/FeaturePieceFeedCard';
import { useGenreCatalog } from '@shared/hooks/useGenreCatalog';
import { createGenreLookup } from '@shared/utils/genreUtils';
import { scheduleIdleTask, cancelIdleTask } from '@shared/utils/scheduler';
import SEO, { generateWebsiteSchema, generateOrganizationSchema } from '@shared/components/SEO';
import siteAnalytics from '@shared/utils/siteAnalytics';

const fadeInUp = keyframes`
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
`;

const INITIAL_FEED_LIMIT = 12;
const FULL_FEED_LIMIT = 50;

const LandingPage = () => {
  // Data state
  const [unifiedFeed, setUnifiedFeed] = useState([]);

  // Loading state
  const [loading, setLoading] = useState(true);

  // Error state
  const [error, setError] = useState(null);

  const { catalog: genreCatalog } = useGenreCatalog();
  const genreLookup = useMemo(() => createGenreLookup(genreCatalog), [genreCatalog]);

  const mergeFeed = useCallback((incoming) => {
    if (!Array.isArray(incoming)) return;
    setUnifiedFeed((prev) => {
      if (!Array.isArray(prev) || !prev.length) {
        return incoming;
      }

      const map = new Map();
      prev.forEach((item) => {
        const key = `${item.contentType || 'unknown'}-${item.id}`;
        map.set(key, item);
      });
      incoming.forEach((item) => {
        const key = `${item.contentType || 'unknown'}-${item.id}`;
        map.set(key, item);
      });

      // Sort: pinned playlists first (by their _pinnedOrder), then everything else by date
      return Array.from(map.values()).sort((a, b) => {
        const aIsPinned = a.contentType === 'playlist' && a.pinned === true;
        const bIsPinned = b.contentType === 'playlist' && b.pinned === true;

        // Both pinned: preserve their order
        if (aIsPinned && bIsPinned) {
          return (a._pinnedOrder ?? 0) - (b._pinnedOrder ?? 0);
        }

        // Only one is pinned: pinned comes first
        if (aIsPinned && !bIsPinned) return -1;
        if (!aIsPinned && bIsPinned) return 1;

        // Neither pinned: sort by date (newest first)
        return (b.sortDate || 0) - (a.sortDate || 0);
      });
    });
  }, []);

  const loadFeed = useCallback(async ({ limit, silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const data = await getUnifiedFeed({ limit });
      mergeFeed(data);
    } catch (err) {
      console.error('Error loading unified feed:', err);
      if (!silent) {
        setError('Failed to load content. Please try again.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [mergeFeed]);

  // Load unified feed data (initial & deferred full feed)
  useEffect(() => {
    let cancelled = false;
    let idleHandle = null;

    loadFeed({ limit: INITIAL_FEED_LIMIT }).then(() => {
      siteAnalytics.trackFeatureStart('landing_feed', 'page_load', { feed_count: INITIAL_FEED_LIMIT });
      idleHandle = scheduleIdleTask(() => {
        if (cancelled) return;
        loadFeed({ limit: FULL_FEED_LIMIT, silent: true });
      }, { timeout: 900 });
    });

    return () => {
      cancelled = true;
      cancelIdleTask(idleHandle);
    };
  }, [loadFeed]);

  let feedMarkup;

  if (loading) {
    feedMarkup = (
      <FeedContainer>
        <LoadingContainer>
          {[0, 1, 2].map((idx) => (
            <SkeletonRow key={`skeleton-${idx}`}>
              <SkeletonImage />
              <SkeletonText>
                <SkeletonLine />
                <SkeletonLine $short />
              </SkeletonText>
            </SkeletonRow>
          ))}
        </LoadingContainer>
      </FeedContainer>
    );
  } else if (error) {
    feedMarkup = (
      <FeedContainer>
        <ErrorContainer>
          <ErrorText>{error}</ErrorText>
          <RetryButton onClick={() => loadFeed({ limit: INITIAL_FEED_LIMIT })}>
            RETRY
          </RetryButton>
        </ErrorContainer>
      </FeedContainer>
    );
  } else if (unifiedFeed.length === 0) {
    feedMarkup = (
      <FeedContainer>
        <EmptyState>
          <EmptyText>NO PUBLISHED CONTENT YET</EmptyText>
          <EmptySubtext>Check back soon for curated selections.</EmptySubtext>
        </EmptyState>
      </FeedContainer>
    );
  } else {
    feedMarkup = (
      <FeedContainer>
        <FeedContent>
          <UnifiedFeed>
            {unifiedFeed.map((item, index) => (
              <FeedItem
                key={`${item.contentType}-${item.id}`}
                $index={index}
                onClick={() => siteAnalytics.trackClick('landing_feed', `${item.contentType}_card_click`, { content_type: item.contentType, content_id: String(item.id) })}
              >
                {item.contentType === 'post' ? (
                  <BlogPostCard post={item} />
                ) : item.contentType === 'feature' ? (
                  <FeaturePieceFeedCard piece={item} />
                ) : item.contentType === 'link' ? (
                  <FeedLinkCard link={item} genreLookup={genreLookup} />
                ) : item.contentType === 'release' ? (
                  <FeedReleaseCard release={item} genreLookup={genreLookup} />
                ) : (
                  <FeedPlaylistCard playlist={item} genreLookup={genreLookup} />
                )}
              </FeedItem>
            ))}
          </UnifiedFeed>
        </FeedContent>
      </FeedContainer>
    );
  }

  // Generate structured data for SEO
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      generateWebsiteSchema(),
      generateOrganizationSchema()
    ]
  };

  return (
    <PageContainer>
      <SEO
        title="Playlists By People"
        description="Cross-platform, curated, by people. Handpicked playlists for every platform."
        canonical="/home"
        keywords={[
          'curated playlists',
          'music discovery',
          'human curated music',
          'cross-platform playlists',
          'Spotify playlists',
          'Apple Music playlists',
          'music curation'
        ]}
        structuredData={structuredData}
      />
      <LandingHeader />
      <ScrollRegion>
        {feedMarkup}
      </ScrollRegion>
    </PageContainer>
  );
};

// Styled Components
const PageContainer = styled.div`
  height: calc(var(--vh, 1vh) * 100);
  min-height: calc(var(--vh, 1vh) * 100);
  width: 100%;
  background: ${theme.colors.black};
  color: ${theme.colors.white};
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
  background: ${theme.colors.black};
  padding-bottom: ${theme.spacing.lg};
  scrollbar-gutter: stable;

  ${mediaQuery.mobile} {
    padding-bottom: ${theme.spacing.md};
  }
`;
const FeedContainer = styled.main`
  max-width: 1200px;
  margin: ${theme.spacing.sm} auto 0;
  padding: 0 calc(${theme.spacing.xs} * 1.5) ${theme.spacing.sm};
  padding-top: ${theme.spacing.md};
  background: #dbdbda;
  position: relative;
  z-index: 1;

  ${mediaQuery.mobile} {
    margin-top: ${theme.spacing.sm};
    padding-top: ${theme.spacing.lg};
    padding: calc(${theme.spacing.sm} * 1.5) ${theme.spacing.sm};
  }
`;

const FeedContent = styled.div`
  /* Content styling handled by child components */
`;

const UnifiedFeed = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};

  ${mediaQuery.mobile} {
    gap: ${theme.spacing.sm};
  }
`;

const FeedItem = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$index'
})`
  ${props => props.$index < 4 ? css`
    animation: ${fadeInUp} 0.6s ease-out forwards;
    animation-delay: ${props.$index * 0.1}s;
    opacity: 0;
    transform: translateY(20px);
  ` : `opacity: 1;`}

  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.2);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    opacity: 1;
    transform: none;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  justify-content: center;
  align-items: stretch;
  min-height: 60vh;
  padding: ${theme.spacing.xl};
`;

const SkeletonRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  width: 100%;
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
`;

const SkeletonImage = styled.div`
  width: 96px;
  height: 96px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.05);
  animation: ${pulse} 1.8s ease-in-out infinite;
`;

const SkeletonText = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SkeletonLine = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$short'
})`
  height: 14px;
  width: ${props => (props.$short ? '60%' : '100%')};
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  animation: ${pulse} 1.8s ease-in-out infinite;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
  padding: ${theme.spacing.xl};
  text-align: center;
`;

const ErrorText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.red};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${theme.spacing.lg};
`;

const RetryButton = styled.button`
  background: none;
  border: ${theme.borders.dashed} ${theme.colors.white};
  color: ${theme.colors.white};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  
  &:hover {
    background: ${theme.colors.white};
    color: ${theme.colors.black};
    transform: translateY(-2px);
  }
  
  &:focus {
    outline: 2px dashed ${theme.colors.white};
    outline-offset: 2px;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl} ${theme.spacing.lg};
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  background: ${theme.colors.black};
`;

const EmptyText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.gray[500]};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: ${theme.spacing.md};
`;

const EmptySubtext = styled.div`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
  line-height: 1.4;
`;

export default LandingPage;
