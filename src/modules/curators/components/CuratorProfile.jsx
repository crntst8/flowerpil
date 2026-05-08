import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme, DashedBox } from '@shared/styles/GlobalStyles';
import PlatformIcon from '@shared/components/PlatformIcon';
import ReusableHeader from '@shared/components/ReusableHeader';
import SEO from '@shared/components/SEO';
import LazyImage from '@shared/components/LazyImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';
import Accordion from '@shared/components/Accordion';
import ReleaseCard from '@shared/components/ReleaseCard';
import ShowCard from '@shared/components/ShowCard';
import PlaylistCard from '../../playlists/components/PlaylistCard';
import { useAuth } from '@shared/contexts/AuthContext';

const CuratorShareModal = React.lazy(() => import('./CuratorShareModal'));

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
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y; /* Allow horizontal gestures for browser navigation */
  background: ${theme.colors.fpwhite};
  padding-bottom: ${theme.spacing.lg};
  scrollbar-gutter: stable;
`;

const ContentWrapper = styled.div`
  max-width: ${theme.layout.maxWidth};
  margin: 0 auto;
  padding: ${theme.spacing.md} ${theme.layout.containerPadding} 0 ${theme.layout.containerPadding};
  background: ${theme.colors.fpwhite};
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
`;


const CuratorHeader = styled.div`
  position: relative;

`;



const CuratorInfo = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-auto-columns: 1fr;
      flex-direction: column;
    align-items: center;
    text-align: center;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
`;

const ProfileImageContainer = styled.div`
  flex-shrink: 0;
  width: 250px;
  height: 250px;
  overflow: hidden;
  justify-self: center;
  margin-bottom: ${theme.spacing.xs};
    margin-top: ${theme.spacing.xs};

    box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.67),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 120px;
    height: 120px;
  }
`;

const CuratorDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const CuratorName = styled.h1`
  margin: 0 0 ${theme.spacing.sm} 0;
  font-size: calc(${theme.fontSizes.h1}*1.8);
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  text-transform: capitalize;
  letter-spacing: -1px;
  margin-top: 0.2em;


`;

const CuratorActions = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: ${theme.spacing.sm};
  padding-top: 1em;
`;

const InstagramShareButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: 6px 12px;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);

  &:hover {
    background: rgba(255, 255, 255, 0.7);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }
`;

const InstagramShareIcon = styled.img`
  width: 16px;
  height: 16px;
  opacity: 0.75;
`;

const CuratorMeta = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
  margin-bottom: ${theme.spacing.sm};
      justify-content: center;

  
  @media (max-width: ${theme.breakpoints.mobile}) {
    justify-content: center;
  }
`;

const MetaTag = styled.span`
  padding: 3px ${theme.spacing.xs};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  background: ${theme.colors.fpwhite};
  text-transform: uppercase;
`;

const CuratorBio = styled.div`
  margin-bottom: ${theme.spacing.md};

  .bio-short {
    font-size: ${theme.fontSizes.medium};
    padding: 10px;
    color: ${theme.colors.black};
    margin-bottom: ${theme.spacing.sm};
    font-weight: 800;


  .bio-full {
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    opacity: 0.9;
    line-height: 1.6;
    white-space: pre-wrap;
  }
`;

const CuratorLinks = styled.div`
  display: flex;
  background: #d6d4d4;
  padding: ${theme.spacing.md};
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  border-radius: 1px;
  margin-bottom: ${theme.spacing.xl};
      box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.67),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);

    text-transform: uppercase;
    justify-content: center;

  
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    justify-content: center;
  }
`;

const LinkButton = styled.a`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  text-decoration: none;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  transition: all 0.2s ease;

  option {
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};

    &.category-header {
      font-weight: bold;
      color: rgba(0, 0, 0, 0.6);
      font-style: italic;
    }

    &:disabled {
      color: rgba(0, 0, 0, 0.5);
    }
  }

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
  &:hover {
    border-color: ${theme.colors.black};
    background: 'rgba(177, 173, 173, 0.3)';
  }
`;

const PlaylistSection = styled.div`
  margin-bottom: ${theme.spacing.md};
display: grid;
justify-content: center;
  `;

const SectionHeader = styled.div`

  h2, h3 {
    margin: 0 0 ${theme.spacing.sm} 0;
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: -1px;
    color: ${theme.colors.black};
    font-size: ${theme.fontSizes.small};
    padding: 1px;
  }

  p {
    margin: 0;
    font-size: ${theme.fontSizes.medium};
    color: ${theme.colors.black};
    opacity: 0.7;
  }
`;

const PlaylistGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  width: 100%;
  
  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  }
  
  @media (min-width: 1200px) {
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  }
`;



// Featured links styling (matches bio preview containers)
const FeaturedGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  }
`;

const FeaturedCard = styled.a`
  display: flex;
  gap: ${theme.spacing.md};
  align-items: center;
  padding: ${theme.spacing.md};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.4);
  background: rgba(255, 255, 255, 0.02);
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${theme.colors.black};
    background: rgba(189, 189, 189, 0.06);
  }
`;

const FeaturedImage = styled.div`
  width: 80px;
  height: 80px;
  border: ${theme.borders.solid} ${theme.colors.black};
  overflow: hidden;
  background: ${theme.colors.fpwhite};
  flex-shrink: 0;
  border-radius: 4px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
  }
`;

const FeaturedContent = styled.div`
  flex: 1; 
  display: flex; 
  flex-direction: column; 
  justify-content: center;
`;

const FeaturedTitle = styled.h3`
  margin: 0 0 4px 0; 
  font-size: 0.95rem; 
  font-weight: 700; 
  color: ${theme.colors.black};
`;

const FeaturedDesc = styled.p`
  margin: 0 0 4px 0; 
  font-size: 0.8rem; 
  opacity: 0.85; 
  line-height: 1.3;
  color: ${theme.colors.black};
`;

const FeaturedUrl = styled.div`
  font-size: 0.75rem; 
  opacity: 0.6; 
  color: ${theme.colors.black};
`;

const ReleasesGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  
  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  }
  
  @media (min-width: 1200px) {
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  }
`;

const ShowsGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  
  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  }
  
  @media (min-width: 1200px) {
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  }
`;

const EmptyState = styled(DashedBox)`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.black};
  opacity: 0.6;

  p {
    margin: 0;
    font-size: ${theme.fontSizes.medium};
  }
`;

const LoadingState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.black};
  opacity: 0.8;
`;

const ErrorState = styled(DashedBox)`
  text-align: center;
  padding: ${theme.spacing.xl};
  border-color: ${theme.colors.danger};
  background: rgba(229, 62, 62, 0.1);

  h2 {
    margin: 0 0 ${theme.spacing.sm} 0;
    color: ${theme.colors.black};
  }

  p {
    margin: 0;
    color: ${theme.colors.black};
    opacity: 0.8;
  }
`;

const ShareModalFallback = styled.div`
  text-align: center;
  padding: ${theme.spacing.lg};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
`;

const CuratorProfile = () => {
  const { name } = useParams();
  const navigate = useNavigate();
  const [curator, setCurator] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [upcomingReleases, setUpcomingReleases] = useState([]);
  const [upcomingShows, setUpcomingShows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const { isAuthenticated } = useAuth();

  // Navigation handlers
  const handleBack = () => {
    // Check if we have history to go back to, otherwise go to home
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    const fetchCuratorData = async () => {
      if (!name) {
        setError('No curator specified');
        setIsLoading(false);
        return;
      }

      // Basic validation for curator name
      if (name.length > 100 || name.trim() === '') {
        setError('Invalid curator name');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const curatorResponse = await fetch(`/api/v1/curators/by-name/${encodeURIComponent(name)}`, {
          credentials: 'include'
        });

        if (!curatorResponse.ok) {
          if (curatorResponse.status === 404) {
            throw new Error('Curator not found');
          }
          throw new Error('Failed to load curator profile');
        }

        const data = await curatorResponse.json();

        if (data.success) {
          setCurator(data.data.curator);
          setPlaylists(data.data.playlists || []);
          setUpcomingReleases(data.data.upcomingReleases || []);
          setUpcomingShows(data.data.upcomingShows || []);
        } else {
          throw new Error('API returned error response');
        }
      } catch (err) {
        console.error('Failed to fetch curator data:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCuratorData();
  }, [name]);

  if (isLoading) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <ContentWrapper>
            <PageBreadcrumb>
              <Link to="/home">Home</Link> / <Link to="/curators">Curators</Link> / Loading...
            </PageBreadcrumb>
            <LoadingState>
              <p>Loading curator profile...</p>
            </LoadingState>
          </ContentWrapper>
        </ScrollRegion>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <ContentWrapper>
            <PageBreadcrumb>
              <Link to="/home">Home</Link> / <Link to="/curators">Curators</Link> / Error
            </PageBreadcrumb>
            <ErrorState>
              <h2>Profile Not Found</h2>
              <p>{error}</p>
            </ErrorState>
          </ContentWrapper>
        </ScrollRegion>
      </PageContainer>
    );
  }

  if (!curator) return null;

  const curatorSlug = encodeURIComponent(curator.name);
  const seoTitle = `${curator.name} Playlists`;
  const seoDescription = `Cross-platform, curated, by people. Playlists by ${curator.name}.`;
  const seoKeywords = [
    'flowerpil',
    'cross-platform',
    'curated',
    'by people',
    'playlist curator',
    curator.name,
    curator.type
  ].filter(Boolean);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: curator.name,
    description: seoDescription,
    url: `https://flowerpil.io/curator/${curatorSlug}`,
    image: curator.profile_image || undefined
  };

  const renderSocialLinks = () => {
    const links = [];

    // Website link
    if (curator.website_url) {
      links.push(
        <LinkButton
          key="website"
          href={curator.website_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <PlatformIcon platform="website" size={18} inline /> Website
        </LinkButton>
      );
    }

    // DSP (Streaming Platform) links
    if (curator.spotify_url) {
      links.push(
        <LinkButton
          key="spotify"
          href={curator.spotify_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <PlatformIcon platform="spotify" size={18} inline /> Spotify
        </LinkButton>
      );
    }

    if (curator.apple_url) {
      links.push(
        <LinkButton
          key="apple"
          href={curator.apple_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <PlatformIcon platform="apple" size={18} inline /> Apple Music
        </LinkButton>
      );
    }

    if (curator.tidal_url) {
      links.push(
        <LinkButton
          key="tidal"
          href={curator.tidal_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <PlatformIcon platform="tidal" size={18} inline /> Tidal
        </LinkButton>
      );
    }

    if (curator.bandcamp_url) {
      links.push(
        <LinkButton
          key="bandcamp"
          href={curator.bandcamp_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <PlatformIcon platform="bandcamp" size={18} inline /> Bandcamp
        </LinkButton>
      );
    }

    // Social media links with defensive parsing
    const parseLinks = (linksData) => {
      if (!linksData) return [];
      if (Array.isArray(linksData)) return linksData;
      if (typeof linksData === 'string') {
        try {
          const parsed = JSON.parse(linksData);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const socialLinks = parseLinks(curator.social_links);
    if (Array.isArray(socialLinks) && socialLinks.length > 0) {
      socialLinks.forEach((link, index) => {
        if (link && link.platform && link.url) {
          links.push(
            <LinkButton
              key={`social-${index}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <PlatformIcon platform={link.platform} size={18} inline /> {link.platform}
            </LinkButton>
          );
        }
      });
    }

    // External links with defensive parsing
    const externalLinks = parseLinks(curator.external_links);
    if (Array.isArray(externalLinks) && externalLinks.length > 0) {
      externalLinks.forEach((link, index) => {
        if (link && link.title && link.url) {
          links.push(
            <LinkButton
              key={`external-${index}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <PlatformIcon platform="website" size={18} inline /> {link.title}
            </LinkButton>
          );
        }
      });
    }

    return links;
  };

  const getProfileFeaturedLinks = () => {
    try {
      const cfg = curator?.custom_fields?.profile_featured_links;
      if (!cfg || !cfg.enabled) return [];
      const items = Array.isArray(cfg.data) ? cfg.data : [];
      return items.filter(i => i && (i.title || i.url));
    } catch (_) { return []; }
  };

  const handleReleaseInfoClick = (release) => {
    // Handle release info click - could show modal, navigate, etc.
    // Currently no action needed
  };

  const handleShowInfoClick = (show) => {
    // Handle show info click - could show modal, navigate, etc.
    // Currently no action needed
  };

  // Helper to create section configurations with defaults
  const getSectionConfig = (sectionName, defaultOrder) => {
    if (!curator) return { enabled: true, displayOrder: defaultOrder, openOnLoad: false };
    
    // Parse custom_fields for section preferences
    const parseCustomFields = (customFields) => {
      if (!customFields) return {};
      if (typeof customFields === 'string') {
        try {
          return JSON.parse(customFields);
        } catch {
          return {};
        }
      }
      return customFields;
    };

    const customFields = parseCustomFields(curator.custom_fields);
    
    const configMap = {
      releases: {
        enabled: curator.upcoming_releases_enabled !== false,
        displayOrder: customFields.upcoming_releases_display_order || defaultOrder,
        openOnLoad: customFields.upcoming_releases_open_on_load === true
      },
      shows: {
        enabled: curator.upcoming_shows_enabled !== false,
        displayOrder: customFields.upcoming_shows_display_order || defaultOrder,
        openOnLoad: customFields.upcoming_shows_open_on_load === true
      }
    };
    
    return configMap[sectionName] || { enabled: true, displayOrder: defaultOrder, openOnLoad: false };
  };

  // Helper to sort sections by display order
  const createSortedSections = () => {
    const releasesConfig = getSectionConfig('releases', 1, false);
    const showsConfig = getSectionConfig('shows', 2, false);
    
    const sections = [];
    
    // Only show sections if they are enabled and have data
    if (releasesConfig.enabled && upcomingReleases.length > 0) {
      sections.push({
        type: 'releases',
        config: releasesConfig,
        component: (
          <Accordion
            key="releases"
            title="Upcoming Releases"
            config={releasesConfig}
            storageKey={`curator-${curator?.name}-releases`}
            isEmpty={false}
            emptyMessage="No upcoming releases"
            ariaLabel="Toggle upcoming releases section"
          >
            <ReleasesGrid>
              {upcomingReleases.map((release) => (
                <ReleaseCard
                  key={release.id}
                  release={release}
                  onInfoClick={handleReleaseInfoClick}
                />
              ))}
            </ReleasesGrid>
          </Accordion>
        )
      });
    }
    
    if (showsConfig.enabled && upcomingShows.length > 0) {
      sections.push({
        type: 'shows',
        config: showsConfig,
        component: (
          <Accordion
            key="shows"
            title="Upcoming Shows"
            config={showsConfig}
            storageKey={`curator-${curator?.name}-shows`}
            isEmpty={false}
            emptyMessage="No upcoming shows"
            ariaLabel="Toggle upcoming shows section"
          >
            <ShowsGrid>
              {upcomingShows.map((show) => (
                <ShowCard
                  key={show.id}
                  show={show}
                  onInfoClick={handleShowInfoClick}
                />
              ))}
            </ShowsGrid>
          </Accordion>
        )
      });
    }
    
    return sections.sort((a, b) => a.config.displayOrder - b.config.displayOrder);
  };

  return (
    <PageContainer>
      <SEO
        title={seoTitle}
        description={seoDescription}
        canonical={`/curator/${curatorSlug}`}
        image={curator.profile_image}
        keywords={seoKeywords}
        structuredData={structuredData}
      />
      <ReusableHeader />
      <ScrollRegion>
        <ContentWrapper>
        {/* Page Breadcrumb */}
        <PageBreadcrumb>
          <Link to="/home">Home</Link> / <Link to="/curators">Curators</Link> / {curator.name}
        </PageBreadcrumb>
      
      <CuratorHeader>
        
        <CuratorInfo>
                                              
                        <CuratorMeta>
              {curator.location && (
                <MetaTag>{curator.location}</MetaTag>
              )}
            </CuratorMeta>
          <ProfileImageContainer>
            {curator.profile_image ? (
              <LazyImage
                src={curator.profile_image}
                alt={`${curator.name} profile`}
                width={80}
                height={80}
                style={{ 
                  borderRadius: '4px',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            ) : (
              <PlaceholderArtwork
                itemId={curator.id}
                colorIndex={curator.fallback_flower_color_index}
                size="large"
                borderRadius="4px"
              />
            )}

          </ProfileImageContainer>


          <CuratorDetails>
            
          {isAuthenticated && (
                                    <CuratorActions>
                                      <InstagramShareButton
                                        type="button"
                                        onClick={() => setShowShareModal(true)}
                                        aria-label="Share curator profile to Instagram"
                                      >
                                        <InstagramShareIcon
                                          src="/assets/playlist-actions/instagram.svg"
                                          alt=""
                                          aria-hidden="true"
                                        />
                                        Share
                                      </InstagramShareButton>
                                    </CuratorActions>
                                  )}
                                  <CuratorName>{curator.name}</CuratorName>



            {(curator.bio_short || curator.bio) && (
              <CuratorBio>
                {curator.bio_short && (
                  <div className="bio-short">{curator.bio_short}</div>
                )}
                {curator.bio && (
                  <div className="bio-full">{curator.bio}</div>
                )}
              </CuratorBio>
            )}
            
            {(() => {
              const socialLinks = renderSocialLinks();
              return socialLinks.length > 0 ? (
                <CuratorLinks>
                  {socialLinks}
                </CuratorLinks>
              ) : null;
            })()}

          </CuratorDetails>
        </CuratorInfo>
      </CuratorHeader>

      {/* Upcoming Releases and Shows Sections */}
      {createSortedSections().map(section => section.component)}

  <PlaylistSection>
    <SectionHeader>
      <h3>playlists </h3>
    </SectionHeader>

        {playlists.length > 0 ? (
          <PlaylistGrid>
            {playlists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                showCurator={false}
              />
            ))}
          </PlaylistGrid>
        ) : (
          <EmptyState>
            <p>No published playlists yet</p>
          </EmptyState>
        )}
  </PlaylistSection>

      {/* Featured Links Section (from pil.bio selection) */}
      {(() => {
        const featured = getProfileFeaturedLinks();
        if (featured.length === 0) return null;
        return (
          <PlaylistSection>
            <SectionHeader>
              <h3>featured</h3>
              <p>{featured.length} link{featured.length !== 1 ? 's' : ''}</p>
            </SectionHeader>
            <FeaturedGrid>
              {featured.map((item, idx) => {
                const title = (item.title || '').toLowerCase();
                let href = item.url || '#';
                let target = '_blank';
                let rel = 'noopener noreferrer';
                if (title.includes('playlist')) {
                  href = `https://flowerpil.io/curator/${curator.name}#playlists`;
                  target = '_self'; rel = '';
                } else if (title.includes('show')) {
                  href = `https://flowerpil.io/curator/${curator.name}#shows`;
                  target = '_self'; rel = '';
                } else if (title.includes('release')) {
                  href = `https://flowerpil.io/curator/${curator.name}#releases`;
                  target = '_self'; rel = '';
                } else if (title.includes('music') || title.includes('profile')) {
                  href = `https://flowerpil.io/curator/${curator.name}`;
                  target = '_self'; rel = '';
                }
                return (
                <FeaturedCard key={`${item.position}-${idx}`} href={href} target={target} rel={rel}>
                  {item.image_url && (
                    <FeaturedImage>
                      <img src={item.image_url} alt={item.title || 'Featured'} />
                    </FeaturedImage>
                  )}
                  <FeaturedContent>
                    <FeaturedTitle>{item.title || (item.url || 'Link')}</FeaturedTitle>
                    {item.description && (
                      <FeaturedDesc>{item.description}</FeaturedDesc>
                    )}
                    {item.url && (
                      <FeaturedUrl>{String(item.url).replace(/^https?:\/\//i, '')}</FeaturedUrl>
                    )}
                  </FeaturedContent>
                </FeaturedCard>
              );})}
            </FeaturedGrid>
          </PlaylistSection>
        );
      })()}
        </ContentWrapper>
        {showShareModal && (
          <Suspense fallback={<ShareModalFallback>Preparing share tools...</ShareModalFallback>}>
            <CuratorShareModal
              isOpen={showShareModal}
              onClose={() => setShowShareModal(false)}
              curator={curator}
            />
          </Suspense>
        )}
      </ScrollRegion>
    </PageContainer>
  );
};


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



export default CuratorProfile;
