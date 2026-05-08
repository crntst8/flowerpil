import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import LandingHeader from './LandingHeader';
import SEO, { generateWebsiteSchema, generateItemListSchema } from '@shared/components/SEO';
import LazyImage from '@shared/components/LazyImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';

const DiscoverPage = () => {
  const [playlists, setPlaylists] = useState([]);
  const [curators, setCurators] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [playlistsRes, curatorsRes] = await Promise.all([
          fetch('/api/v1/playlists?limit=12', { credentials: 'include' }),
          fetch('/api/v1/curators?limit=8', { credentials: 'include' })
        ]);

        if (playlistsRes.ok) {
          const data = await playlistsRes.json();
          setPlaylists(data.success ? data.data || data.playlists || [] : []);
        }

        if (curatorsRes.ok) {
          const data = await curatorsRes.json();
          setCurators(data.success ? data.data || [] : []);
        }
      } catch (error) {
        console.error('Error fetching discover data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Generate structured data for SEO
  const playlistSchemaItems = playlists.slice(0, 10).map(p => ({
    type: 'MusicPlaylist',
    name: p.title,
    url: `https://flowerpil.io/playlists/${p.id}`
  }));

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      generateWebsiteSchema(),
      generateItemListSchema(playlistSchemaItems, 'Featured Curated Playlists')
    ]
  };

  return (
    <PageContainer>
      <SEO
        title="Discover New Music & Curated Playlists 2025 2026"
        description="Cross-platform, curated, by people. Discover new music and playlists."
        canonical="/discover"
        keywords={[
          'music discovery',
          'new music playlists 2026',
          'discover new music',
          'curated playlists',
          'best music discovery websites',
          'new music 2025 2026',
          'music discovery platforms',
          'great playlist websites'
        ]}
        structuredData={structuredData}
      />

      <LandingHeader />

      <ScrollRegion>
        <ContentContainer>
          <HeroSection>
            <HeroLabel>Music Discovery</HeroLabel>
            <HeroTitle>Discover New Music Through Curated Playlists</HeroTitle>
            <HeroDescription>
              Find your next favorite songs through playlists curated by real people, not algorithms.
              Cross-platform playlists for Spotify, Apple Music, TIDAL, and more.
            </HeroDescription>
            <HeroCTAs>
              <PrimaryCTA to="/playlists">Browse Playlists</PrimaryCTA>
              <SecondaryCTA to="/curators">Meet the Curators</SecondaryCTA>
            </HeroCTAs>
          </HeroSection>

          <Section>
            <SectionHeader>
              <SectionLabel>Featured</SectionLabel>
              <SectionTitle>Latest Curated Playlists</SectionTitle>
              <SectionDescription>
                Fresh selections from our community of music curators. Updated weekly with new discoveries.
              </SectionDescription>
            </SectionHeader>

            {loading ? (
              <LoadingGrid>
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <SkeletonCard key={i} />
                ))}
              </LoadingGrid>
            ) : (
              <PlaylistGrid>
                {playlists.map(playlist => (
                  <PlaylistCard key={playlist.id} to={`/playlists/${playlist.id}`}>
                    <PlaylistImage>
                      {playlist.artwork_url ? (
                        <LazyImage
                          src={playlist.artwork_url}
                          alt={playlist.title}
                          width={200}
                          height={200}
                        />
                      ) : (
                        <PlaceholderArtwork itemId={playlist.id} size="medium" />
                      )}
                    </PlaylistImage>
                    <PlaylistInfo>
                      <PlaylistTitle>{playlist.title}</PlaylistTitle>
                      <PlaylistCurator>by {playlist.curator_name || 'Unknown'}</PlaylistCurator>
                      {playlist.track_count > 0 && (
                        <PlaylistMeta>{playlist.track_count} tracks</PlaylistMeta>
                      )}
                    </PlaylistInfo>
                  </PlaylistCard>
                ))}
              </PlaylistGrid>
            )}

            <ViewAllLink to="/playlists">View All Playlists</ViewAllLink>
          </Section>

          <Section $alt>
            <SectionHeader>
              <SectionLabel>Community</SectionLabel>
              <SectionTitle>Music Curators</SectionTitle>
              <SectionDescription>
                Real people sharing their music taste. Follow curators to discover new artists and tracks.
              </SectionDescription>
            </SectionHeader>

            {!loading && (
              <CuratorGrid>
                {curators.map(curator => (
                  <CuratorCard key={curator.id} to={`/curator/${encodeURIComponent(curator.name)}`}>
                    <CuratorImage>
                      {curator.profile_image ? (
                        <LazyImage
                          src={curator.profile_image}
                          alt={curator.name}
                          width={80}
                          height={80}
                        />
                      ) : (
                        <PlaceholderArtwork
                          itemId={curator.id}
                          colorIndex={curator.fallback_flower_color_index}
                          size="small"
                        />
                      )}
                    </CuratorImage>
                    <CuratorInfo>
                      <CuratorName>{curator.name}</CuratorName>
                      {curator.location && <CuratorLocation>{curator.location}</CuratorLocation>}
                    </CuratorInfo>
                  </CuratorCard>
                ))}
              </CuratorGrid>
            )}

            <ViewAllLink to="/curators">Meet All Curators</ViewAllLink>
          </Section>

          <Section>
            <SectionHeader>
              <SectionLabel>Why Flowerpil</SectionLabel>
              <SectionTitle>Music Discovery, Reimagined</SectionTitle>
            </SectionHeader>

            <FeatureGrid>
              <FeatureCard>
                <FeatureTitle>Human Curation</FeatureTitle>
                <FeatureDescription>
                  Every playlist is crafted by real music lovers, not generated by algorithms.
                  Discover music through genuine human taste and expertise.
                </FeatureDescription>
              </FeatureCard>

              <FeatureCard>
                <FeatureTitle>Cross-Platform</FeatureTitle>
                <FeatureDescription>
                  Export playlists to Spotify, Apple Music, TIDAL, YouTube Music, and more.
                  Your music, on your preferred platform.
                </FeatureDescription>
              </FeatureCard>

              <FeatureCard>
                <FeatureTitle>Fresh Weekly</FeatureTitle>
                <FeatureDescription>
                  New playlists and releases every week. Stay ahead of the curve with
                  the latest discoveries from our curator community.
                </FeatureDescription>
              </FeatureCard>

              <FeatureCard>
                <FeatureTitle>Community Driven</FeatureTitle>
                <FeatureDescription>
                  Connect with curators who share your taste. Follow your favorites
                  and never miss their latest selections.
                </FeatureDescription>
              </FeatureCard>
            </FeatureGrid>
          </Section>

          <Footer>
            <FooterBrand>Flowerpil</FooterBrand>
            <FooterTagline>Playlists by people, not platforms.</FooterTagline>
          </Footer>
        </ContentContainer>
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
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
  background: ${theme.colors.black};
  scrollbar-gutter: stable;
`;

const ContentContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 ${theme.spacing.md};

  ${mediaQuery.mobile} {
    padding: 0 ${theme.spacing.sm};
  }
`;

const HeroSection = styled.section`
  padding: ${theme.spacing.xxl} 0;
  text-align: center;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xl} 0;
  }
`;

const HeroLabel = styled.span`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: ${theme.colors.gray[500]};
  margin-bottom: ${theme.spacing.md};
`;

const HeroTitle = styled.h1`
  font-family: ${theme.fonts.primary};
  font-size: clamp(2rem, 6vw, 3.5rem);
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0 0 ${theme.spacing.lg};
  color: ${theme.colors.white};
`;

const HeroDescription = styled.p`
  font-size: ${theme.fontSizes.large};
  color: ${theme.colors.gray[400]};
  max-width: 600px;
  margin: 0 auto ${theme.spacing.xl};
  line-height: 1.5;

  ${mediaQuery.mobile} {
    font-size: ${theme.fontSizes.body};
  }
`;

const HeroCTAs = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  justify-content: center;
  flex-wrap: wrap;
`;

const PrimaryCTA = styled(Link)`
  display: inline-block;
  padding: ${theme.spacing.md} ${theme.spacing.xl};
  background: ${theme.colors.white};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-decoration: none;
  transition: all 0.2s ease;

  &:hover {
    background: ${theme.colors.gray[200]};
    transform: translateY(-2px);
  }
`;

const SecondaryCTA = styled(Link)`
  display: inline-block;
  padding: ${theme.spacing.md} ${theme.spacing.xl};
  border: 1px solid ${theme.colors.white};
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-decoration: none;
  transition: all 0.2s ease;

  &:hover {
    background: ${theme.colors.white};
    color: ${theme.colors.black};
  }
`;

const Section = styled.section`
  padding: ${theme.spacing.xxl} 0;
  ${props => props.$alt && `
    background: ${theme.colors.gray[900]};
    margin: 0 -${theme.spacing.md};
    padding-left: ${theme.spacing.md};
    padding-right: ${theme.spacing.md};
  `}
`;

const SectionHeader = styled.div`
  text-align: center;
  margin-bottom: ${theme.spacing.xl};
`;

const SectionLabel = styled.span`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: ${theme.colors.gray[500]};
  margin-bottom: ${theme.spacing.sm};
`;

const SectionTitle = styled.h2`
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.02em;
  margin: 0 0 ${theme.spacing.md};
`;

const SectionDescription = styled.p`
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.gray[400]};
  max-width: 500px;
  margin: 0 auto;
  line-height: 1.5;
`;

const LoadingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${theme.spacing.lg};
`;

const SkeletonCard = styled.div`
  aspect-ratio: 1;
  background: ${theme.colors.gray[800]};
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
  }
`;

const PlaylistGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${theme.spacing.lg};

  ${mediaQuery.mobile} {
    grid-template-columns: repeat(2, 1fr);
    gap: ${theme.spacing.md};
  }
`;

const PlaylistCard = styled(Link)`
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-4px);
  }
`;

const PlaylistImage = styled.div`
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: ${theme.spacing.sm};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const PlaylistInfo = styled.div``;

const PlaylistTitle = styled.h3`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.medium};
  margin: 0 0 ${theme.spacing.xs};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PlaylistCurator = styled.p`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
  margin: 0;
`;

const PlaylistMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[600]};
`;

const CuratorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: ${theme.spacing.md};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

const CuratorCard = styled(Link)`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: ${theme.colors.gray[800]};
  border-radius: 4px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;

  &:hover {
    background: ${theme.colors.gray[700]};
    transform: translateY(-2px);
  }
`;

const CuratorImage = styled.div`
  width: 60px;
  height: 60px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const CuratorInfo = styled.div`
  min-width: 0;
`;

const CuratorName = styled.h4`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.medium};
  margin: 0 0 ${theme.spacing.xs};
`;

const CuratorLocation = styled.p`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
  margin: 0;
`;

const ViewAllLink = styled(Link)`
  display: block;
  text-align: center;
  margin-top: ${theme.spacing.xl};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: ${theme.colors.white};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const FeatureGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: ${theme.spacing.lg};
`;

const FeatureCard = styled.div`
  padding: ${theme.spacing.lg};
  border: 1px dashed ${theme.colors.gray[700]};
  border-radius: 4px;
`;

const FeatureTitle = styled.h3`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.large};
  font-weight: ${theme.fontWeights.medium};
  margin: 0 0 ${theme.spacing.sm};
`;

const FeatureDescription = styled.p`
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.gray[400]};
  margin: 0;
  line-height: 1.5;
`;

const Footer = styled.footer`
  padding: ${theme.spacing.xxl} 0;
  text-align: center;
  border-top: 1px dashed ${theme.colors.gray[800]};
  margin-top: ${theme.spacing.xl};
`;

const FooterBrand = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: ${theme.fontWeights.bold};
  margin-bottom: ${theme.spacing.sm};
`;

const FooterTagline = styled.p`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
  margin: 0;
`;

export default DiscoverPage;
