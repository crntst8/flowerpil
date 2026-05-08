import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import PlaylistCard from '@modules/playlists/components/PlaylistCard';
import BlogPostCard from '@modules/blog/components/BlogPostCard';
import FeaturePieceFeedCard from '@modules/features/components/FeaturePieceFeedCard';
import { safeJson } from '@shared/utils/jsonUtils';

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
  max-width: 1400px;
  margin: 0 auto;
  padding: ${theme.spacing.md} ${theme.spacing.xl};

  ${mediaQuery.tablet} {
    padding: ${theme.spacing.lg} ${theme.spacing.md};
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.md} ${theme.spacing.sm};
  }
`;

const HeroSection = styled.section`

display: grid;
  gap: ${theme.spacing.md};
`;

const TagBadge = styled.div.withConfig({ shouldForwardProp: (prop) => !['$bgColor', '$textColor'].includes(prop) })`
  display: inline-flex;
  justify-self: center;
  text-align: center;
  padding-left: 10%;
  padding-right: 10%;
  gap: 3px;
  padding-top: 0%;
  text-transform: none;
  border-radius: 1px;
  letter-spacing: -0.9px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h2};
  font-weight: ${theme.fontWeights.bold};
  background: ${(p) => p.$bgColor || theme.colors.black};
  color: ${(p) => p.$textColor || theme.colors.fpwhite};
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

  border: 2px solidThin rgba(0, 0, 0, 0.67);
    box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.04);

  ${mediaQuery.mobile} {
    font-size: ${theme.fontSizes.h2};
    padding: ${theme.spacing.xs} ${theme.spacing.md};
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.3px;
  }
`;

const Description = styled.p`
 display: inline-flex;
 justify-self: center;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  text-transform: none;
  letter-spacing: -0.9px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  border-bottom: ${theme.borders.solidThin} black;
`;

const CountMeta = styled.p`
  margin: 0;
  justify-self: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.62);
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;



const PageName = styled.p`
  display: inline-flex;
  padding-left: 100%;
  height: 100%;
    padding-right: 100%;
  justify-self: center;
  text-transform: none;
  letter-spacing: -0.9px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.p};
  font-weight: ${theme.fontWeights.bold};
  background: ${(p) => p.$bgColor || theme.colors.bgGreen};
  color: ${(p) => p.$textColor || theme.colors.fpwhite};
  gap: 3px;
`;

const ContentSection = styled.section`
  margin-top: ${theme.spacing.xl};
`;

const SectionTitle = styled.h2`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.md};
  padding-bottom: ${theme.spacing.sm};
  border-bottom: ${theme.borders.solid} ${theme.colors.black};
`;

const PostsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const PlaylistGrid = styled.div`
  display: grid;
  padding-top: 10px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: ${theme.spacing.sm};

  ${mediaQuery.tablet} {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: ${theme.spacing.md};
  }

  ${mediaQuery.mobile} {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
`;

const StatusMessage = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$variant' })`
  padding: ${theme.spacing.xxl};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.medium};
  color: ${(p) => {
    if (p.$variant === 'error') return theme.colors.danger;
    return theme.colors.black[400];
  }};
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.xxl};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.medium};
  color: ${theme.colors.black[400]};
`;

const PageBreadcrumb = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${theme.spacing.lg};

  a {
    color: ${theme.colors.black};
    text-decoration: none;

    &:hover {
      color: ${theme.colors.red};
    }
  }
`;

const ContentTagPage = () => {
  const { slug } = useParams();
  const [tag, setTag] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [posts, setPosts] = useState([]);
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadTagData = async () => {
      if (!slug) return;

      setLoading(true);
      setError('');
      setTag(null);
      setPlaylists([]);
      setPosts([]);
      setFeatures([]);

      try {
        const response = await fetch(`/api/v1/content-tag/${encodeURIComponent(slug)}`);

        let json = null;
        try {
          json = await safeJson(response, { context: 'Load content tag page', fallbackValue: null });
        } catch (parseError) {
          if (response.ok) {
            throw parseError;
          }
          console.warn('Failed to parse content tag response:', parseError);
        }

        if (!response.ok) {
          const message = json?.error || json?.message || (response.status === 404 ? 'Tag not found' : 'Failed to load tag page');
          throw new Error(message);
        }

        if (!cancelled) {
          setTag(json?.tag || null);
          setPlaylists(Array.isArray(json?.playlists) ? json.playlists : []);
          setPosts(Array.isArray(json?.posts) ? json.posts : []);
          setFeatures(Array.isArray(json?.features) ? json.features : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load tag page');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTagData();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const contentCountLabel = useMemo(() => {
    const playlistCount = tag?.playlist_count ?? playlists.length;
    const postCount = tag?.post_count ?? posts.length;
    const featureCount = tag?.feature_count ?? features.length;
    const total = playlistCount + postCount + featureCount;

    if (total === 0) return 'No content';

    const parts = [];
    if (playlistCount > 0) parts.push(`${playlistCount} playlist${playlistCount === 1 ? '' : 's'}`);
    if (postCount > 0) parts.push(`${postCount} post${postCount === 1 ? '' : 's'}`);
    if (featureCount > 0) parts.push(`${featureCount} feature${featureCount === 1 ? '' : 's'}`);

    return parts.join(' • ');
  }, [tag?.playlist_count, tag?.post_count, tag?.feature_count, playlists.length, posts.length, features.length]);

  return (
    <PageContainer>
      <ReusableHeader />
      <ScrollRegion>
        <PageBreadcrumb>
          <Link to="/home">Home</Link> / Collections
        </PageBreadcrumb>

        {loading && (
          <StatusMessage>Loading tag…</StatusMessage>
        )}

        {!loading && error && (
          <StatusMessage $variant="error">{error}</StatusMessage>
        )}

        {!loading && !error && (
          <>
            <HeroSection>
              <PageName>Collection</PageName>

              <TagBadge $bgColor={tag?.color} $textColor={tag?.text_color}>
                {tag?.text || slug}
              </TagBadge>
              {tag?.description && <Description>{tag.description}</Description>}
              <CountMeta>{contentCountLabel}</CountMeta>
            </HeroSection>

            {(playlists.length > 0 || posts.length > 0 || features.length > 0) ? (
              <>
                {posts.length > 0 && (
                  <ContentSection>
                    <SectionTitle>Posts</SectionTitle>
                    <PostsList>
                      {posts.map((post) => (
                        <BlogPostCard key={post.id} post={post} />
                      ))}
                    </PostsList>
                  </ContentSection>
                )}

                {features.length > 0 && (
                  <ContentSection>
                    <SectionTitle>Writing</SectionTitle>
                    <PostsList>
                      {features.map((feature) => (
                        <FeaturePieceFeedCard key={feature.id} piece={feature} />
                      ))}
                    </PostsList>
                  </ContentSection>
                )}

                {playlists.length > 0 && (
                  <ContentSection>
                    <SectionTitle>Playlists</SectionTitle>
                    <PlaylistGrid>
                      {playlists.map((playlist) => (
                        <PlaylistCard key={playlist.id} playlist={playlist} />
                      ))}
                    </PlaylistGrid>
                  </ContentSection>
                )}
              </>
            ) : (
              <EmptyState>No content found with this tag.</EmptyState>
            )}
          </>
        )}
      </ScrollRegion>
    </PageContainer>
  );
};

export default ContentTagPage;
