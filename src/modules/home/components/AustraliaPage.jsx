import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import LandingHeader from './LandingHeader';
import SEO, { generateWebsiteSchema, generateItemListSchema } from '@shared/components/SEO';
import LazyImage from '@shared/components/LazyImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';

const AustraliaPage = () => {
  const [curators, setCurators] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [curatorsRes, playlistsRes] = await Promise.all([
          fetch('/api/v1/curators', { credentials: 'include' }),
          fetch('/api/v1/playlists?limit=50', { credentials: 'include' })
        ]);

        if (curatorsRes.ok) {
          const data = await curatorsRes.json();
          const allCurators = data.success ? data.data || [] : [];
          // Filter curators with Australian locations
          const auCurators = allCurators.filter(c =>
            c.location && (
              c.location.toLowerCase().includes('australia') ||
              c.location.toLowerCase().includes('sydney') ||
              c.location.toLowerCase().includes('melbourne') ||
              c.location.toLowerCase().includes('brisbane') ||
              c.location.toLowerCase().includes('perth') ||
              c.location.toLowerCase().includes('adelaide') ||
              c.location.toLowerCase().includes('canberra') ||
              c.location.toLowerCase().includes('hobart') ||
              c.location.toLowerCase().includes('darwin')
            )
          );
          setCurators(auCurators);
        }

        if (playlistsRes.ok) {
          const data = await playlistsRes.json();
          const allPlaylists = data.success ? data.data || data.playlists || [] : [];
          // Filter playlists from Australian curators
          const auPlaylists = allPlaylists.filter(p =>
            p.curator_location && (
              p.curator_location.toLowerCase().includes('australia') ||
              p.curator_location.toLowerCase().includes('sydney') ||
              p.curator_location.toLowerCase().includes('melbourne') ||
              p.curator_location.toLowerCase().includes('brisbane') ||
              p.curator_location.toLowerCase().includes('perth') ||
              p.curator_location.toLowerCase().includes('adelaide')
            )
          );
          setPlaylists(auPlaylists.slice(0, 12));
        }
      } catch (error) {
        console.error('Error fetching Australian data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Generate structured data for SEO
  const curatorSchemaItems = curators.slice(0, 10).map(c => ({
    type: 'Person',
    name: c.name,
    url: `https://flowerpil.io/curator/${encodeURIComponent(c.name)}`
  }));

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      generateWebsiteSchema(),
      generateItemListSchema(curatorSchemaItems, 'Australian Music Curators')
    ]
  };

  return (
    <PageContainer>
      <SEO
        title="Australian Music Releases & Curators 2025 2026"
        description="Cross-platform, curated, by people. Australian playlists and releases."
        canonical="/australia"
        keywords={[
          'Australian music releases 2026',
          'Australian music releases 2025',
          'new music Australia',
          'Australian music blogs',
          'Australian music curators',
          'Sydney music scene',
          'Melbourne music',
          'Australian indie music',
          'Australian new releases'
        ]}
        structuredData={structuredData}
      />

      <LandingHeader />

      <ScrollRegion>
        <ContentContainer>
          <HeroSection>
            <HeroLabel>Australian Music</HeroLabel>
            <HeroTitle>New Music from Australia</HeroTitle>
            <HeroDescription>
              Discover the best new music from Australia. Curated playlists and releases from
              Sydney, Melbourne, Brisbane, Perth, and across the country.
            </HeroDescription>
            <HeroCTAs>
              <PrimaryCTA to="/curators?location=Australia">Browse AU Curators</PrimaryCTA>
              <SecondaryCTA to="/playlists?location=Australia">AU Playlists</SecondaryCTA>
            </HeroCTAs>
          </HeroSection>

          <Section>
            <SectionHeader>
              <SectionLabel>Local Curators</SectionLabel>
              <SectionTitle>Australian Music Curators</SectionTitle>
              <SectionDescription>
                Meet the curators championing Australian music. Local experts sharing the best of the Australian music scene.
              </SectionDescription>
            </SectionHeader>

            {loading ? (
              <LoadingGrid>
                {[0, 1, 2, 3].map(i => (
                  <SkeletonCard key={i} />
                ))}
              </LoadingGrid>
            ) : curators.length === 0 ? (
              <EmptyState>
                <EmptyText>No Australian curators yet</EmptyText>
                <EmptySubtext>Check back soon as our community grows.</EmptySubtext>
              </EmptyState>
            ) : (
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
                      {curator.bio_short && <CuratorBio>{curator.bio_short}</CuratorBio>}
                    </CuratorInfo>
                  </CuratorCard>
                ))}
              </CuratorGrid>
            )}

            <ViewAllLink to="/curators?location=Australia">View All Australian Curators</ViewAllLink>
          </Section>

          {playlists.length > 0 && (
            <Section $alt>
              <SectionHeader>
                <SectionLabel>From Down Under</SectionLabel>
                <SectionTitle>Australian Curated Playlists</SectionTitle>
                <SectionDescription>
                  Playlists curated by Australian music lovers. Featuring local and international artists.
                </SectionDescription>
              </SectionHeader>

              <PlaylistGrid>
                {playlists.map(playlist => (
                  <PlaylistCard key={playlist.id} to={`/playlists/${playlist.id}`}>
                    <PlaylistImage>
                      {playlist.artwork_url || playlist.image ? (
                        <LazyImage
                          src={playlist.artwork_url || playlist.image}
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

              <ViewAllLink to="/playlists?location=Australia">View All Australian Playlists</ViewAllLink>
            </Section>
          )}

          <Section>
            <SectionHeader>
              <SectionLabel>The Scene</SectionLabel>
              <SectionTitle>Australian Music Scene</SectionTitle>
            </SectionHeader>

            <FeatureGrid>
              <FeatureCard>
                <FeatureTitle>Sydney</FeatureTitle>
                <FeatureDescription>
                  Australia's largest city with a thriving music scene. From indie rock to electronic,
                  Sydney's diverse venues host everything from intimate shows to major festivals.
                </FeatureDescription>
              </FeatureCard>

              <FeatureCard>
                <FeatureTitle>Melbourne</FeatureTitle>
                <FeatureDescription>
                  The cultural capital of Australia. Melbourne's laneway bars and legendary venues
                  have launched countless artists onto the world stage.
                </FeatureDescription>
              </FeatureCard>

              <FeatureCard>
                <FeatureTitle>Brisbane</FeatureTitle>
                <FeatureDescription>
                  A growing hub for Australian music with a vibrant local scene and major festivals
                  bringing international acts to Queensland.
                </FeatureDescription>
              </FeatureCard>

              <FeatureCard>
                <FeatureTitle>Perth</FeatureTitle>
                <FeatureDescription>
                  Isolated but innovative. Perth's music scene punches above its weight, producing
                  globally recognized artists and hosting unique festivals.
                </FeatureDescription>
              </FeatureCard>
            </FeatureGrid>
          </Section>

          <Footer>
            <FooterBrand>Flowerpil</FooterBrand>
            <FooterTagline>Australian music, curated with love.</FooterTagline>
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
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: ${theme.spacing.md};
`;

const SkeletonCard = styled.div`
  height: 100px;
  background: ${theme.colors.gray[800]};
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
  }
`;

const CuratorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: ${theme.spacing.md};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

const CuratorCard = styled(Link)`
  display: flex;
  align-items: flex-start;
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
  flex: 1;
`;

const CuratorName = styled.h4`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.medium};
  margin: 0 0 ${theme.spacing.xs};
`;

const CuratorLocation = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.gray[500]};
  margin: 0 0 ${theme.spacing.xs};
`;

const CuratorBio = styled.p`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[400]};
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
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

export default AustraliaPage;
