import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import LandingHeader from './LandingHeader';
import SEO, { generateWebsiteSchema, generateItemListSchema } from '@shared/components/SEO';
import LazyImage from '@shared/components/LazyImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';

const ReleasesPage = () => {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReleases = async () => {
      try {
        const response = await fetch('/api/v1/releases/feed?limit=50', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setReleases(data.success ? data.data || [] : []);
        }
      } catch (error) {
        console.error('Error fetching releases:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();
  }, []);

  // Group releases by month/year for archive navigation
  const groupedReleases = releases.reduce((acc, release) => {
    const date = new Date(release.post_date || release.published_at || release.created_at);
    const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!acc[monthYear]) {
      acc[monthYear] = [];
    }
    acc[monthYear].push(release);
    return acc;
  }, {});

  // Generate structured data for SEO
  const releaseSchemaItems = releases.slice(0, 10).map(r => ({
    type: 'MusicRelease',
    name: `${r.artist_name} - ${r.title}`,
    url: `https://flowerpil.io/releases/${r.id}`
  }));

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      generateWebsiteSchema(),
      generateItemListSchema(releaseSchemaItems, 'New Music Releases 2026')
    ]
  };

  const formatReleaseDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getReleaseTypeLabel = (type) => {
    const labels = {
      'single': 'Single',
      'double-single': 'Double Single',
      'EP': 'EP',
      'album': 'Album',
      'live album': 'Live Album',
      'remix': 'Remix',
      'remaster': 'Remaster'
    };
    return labels[type] || type;
  };

  return (
    <PageContainer>
      <SEO
        title="Best New Music 2026"
        description="Cross-platform, curated, by people. New singles, EPs, and albums."
        canonical="/releases"
        keywords={[
          'new music releases 2026',
          'new music releases 2025',
          'weekly new music',
          'new album releases',
          'new singles',
          'new EPs',
          'music release calendar',
          'upcoming music releases',
          'new tracks this week'
        ]}
        structuredData={structuredData}
      />

      <LandingHeader />

      <ScrollRegion>
        <ContentContainer>
          <HeroSection>
            <HeroLabel>New Releases</HeroLabel>
            <HeroTitle>NEW MUSIC WORTH YOUR TIME</HeroTitle>
            <HeroDescription>
              Stay up to date with the latest music releases. New singles, EPs, and albums
              from artists featured by our curators, updated regularly.
            </HeroDescription>
            <HeroCTAs>
              <PrimaryCTA to="/playlists">Browse Playlists</PrimaryCTA>
              <SecondaryCTA to="/discover">Discover More</SecondaryCTA>
            </HeroCTAs>
          </HeroSection>

          {loading ? (
            <Section>
              <LoadingGrid>
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <SkeletonCard key={i} />
                ))}
              </LoadingGrid>
            </Section>
          ) : releases.length === 0 ? (
            <Section>
              <EmptyState>
                <EmptyText>No releases available yet</EmptyText>
                <EmptySubtext>Check back soon for new music releases.</EmptySubtext>
              </EmptyState>
            </Section>
          ) : (
            Object.entries(groupedReleases).map(([monthYear, monthReleases]) => (
              <Section key={monthYear}>
                <SectionHeader>
                  <SectionLabel>Released</SectionLabel>
                  <SectionTitle>{monthYear}</SectionTitle>
                  <SectionDescription>
                    {monthReleases.length} release{monthReleases.length !== 1 ? 's' : ''}
                  </SectionDescription>
                </SectionHeader>

                <ReleaseGrid>
                  {monthReleases.map(release => (
                    <ReleaseCard key={release.id} to={`/releases/${release.id}`}>
                      <ReleaseImage>
                        {release.artwork_url ? (
                          <LazyImage
                            src={release.artwork_url}
                            alt={`${release.artist_name} - ${release.title}`}
                            width={200}
                            height={200}
                          />
                        ) : (
                          <PlaceholderArtwork itemId={release.id} size="medium" />
                        )}
                        <ReleaseType>{getReleaseTypeLabel(release.release_type)}</ReleaseType>
                      </ReleaseImage>
                      <ReleaseInfo>
                        <ReleaseArtist>{release.artist_name}</ReleaseArtist>
                        <ReleaseTitle>{release.title}</ReleaseTitle>
                        {release.release_date && (
                          <ReleaseMeta>{formatReleaseDate(release.release_date)}</ReleaseMeta>
                        )}
                        {release.curator_name && (
                          <ReleaseCurator>via {release.curator_name}</ReleaseCurator>
                        )}
                      </ReleaseInfo>
                    </ReleaseCard>
                  ))}
                </ReleaseGrid>
              </Section>
            ))
          )}

          <Section $alt>
            <SectionHeader>
              <SectionLabel>Stay Updated</SectionLabel>
              <SectionTitle>Never Miss a Release</SectionTitle>
              <SectionDescription>
                Follow your favorite curators and artists to get notified about new releases.
              </SectionDescription>
            </SectionHeader>

            <FeatureGrid>
              <FeatureCard>
                <FeatureTitle>Curator Picks</FeatureTitle>
                <FeatureDescription>
                  Releases featured by our community of music curators. Quality over quantity.
                </FeatureDescription>
              </FeatureCard>

              <FeatureCard>
                <FeatureTitle>All Genres</FeatureTitle>
                <FeatureDescription>
                  From electronic to indie, hip-hop to classical. Diverse releases across all genres.
                </FeatureDescription>
              </FeatureCard>

              <FeatureCard>
                <FeatureTitle>Weekly Updates</FeatureTitle>
                <FeatureDescription>
                  Fresh releases added regularly. New music every week from emerging and established artists.
                </FeatureDescription>
              </FeatureCard>
            </FeatureGrid>

            <ViewAllLink to="/curators">Follow Curators</ViewAllLink>
          </Section>

          <Footer>
            <FooterBrand>Flowerpil</FooterBrand>
            <FooterTagline>New music, curated by people.</FooterTagline>
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

const ReleaseGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${theme.spacing.lg};

  ${mediaQuery.mobile} {
    grid-template-columns: repeat(2, 1fr);
    gap: ${theme.spacing.md};
  }
`;

const ReleaseCard = styled(Link)`
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-4px);
  }
`;

const ReleaseImage = styled.div`
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: ${theme.spacing.sm};
  position: relative;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const ReleaseType = styled.span`
  position: absolute;
  top: ${theme.spacing.xs};
  left: ${theme.spacing.xs};
  padding: 2px ${theme.spacing.xs};
  background: rgba(0, 0, 0, 0.7);
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 2px;
`;

const ReleaseInfo = styled.div``;

const ReleaseArtist = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[400]};
  margin: 0 0 ${theme.spacing.xs};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ReleaseTitle = styled.h3`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.medium};
  margin: 0 0 ${theme.spacing.xs};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ReleaseMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[600]};
`;

const ReleaseCurator = styled.p`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
  margin: ${theme.spacing.xs} 0 0;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xxl};
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

export default ReleasesPage;
