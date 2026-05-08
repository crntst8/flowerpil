import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme, Container, DashedBox, SolidBox, Button } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import LazyImage from '@shared/components/LazyImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';
import { getCuratorTypeOptions, getCuratorTypeLabel } from '@shared/constants/curatorTypes';
import SEO, { generateItemListSchema } from '@shared/components/SEO';

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
`;

const CuratorListHeader = styled.div`
  margin-bottom: ${theme.spacing.xl};
  text-align: left;

  h1 {
    margin: 0 0 ${theme.spacing.sm} 0;
    font-family: ${theme.fonts.primary};
    text-transform: capitalize;
    letter-spacing: -1px;
    color: ${theme.colors.black};
    font-size: calc(${theme.fontSizes.h1}*1.3);
  }

  p {
    margin: 0;
    font-size: ${theme.fontSizes.medium};
    color: ${theme.colors.black};
    opacity: 0.7;
  }
`;

const SearchAndFilters = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.xl};
  flex-wrap: wrap;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
  }
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  &::placeholder {
    color: rgba(0, 0, 0, 0.5);
  }

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const FilterSelect = styled.select`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  min-width: 150px;

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
`;

const CuratorGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.xl};
  
  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  }
  
  @media (min-width: 1200px) {
    grid-template-columns: repeat(auto-fit, minmax(600px, 1fr));
  }
`;

const CuratorCard = styled(SolidBox)`
  padding: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  transition: all 0.3s ease;
  text-decoration: none;
  border-color: ${theme.colors.black};
  color: inherit;
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.md};

  /* Subtle shadow effects for slickness */
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;

  &:hover {
    border-color: rgba(0, 0, 0, 0.6);
    background: rgba(177, 173, 173, 1);
    transform: translateY(-2px);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.2);
  }
`;

const CuratorContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const CuratorImage = styled.div`
  flex-shrink: 0;
  width: 80px;
  height: 80px;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 70px;
    height: 70px;
  }
`;

const CuratorHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.md};
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: flex-start;
    gap: ${theme.spacing.xs};
  }
`;

const CuratorName = styled.h3`
  margin: 0;
  font-size: clamp(${theme.fontSizes.medium}, 3vw, ${theme.fontSizes.large});
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  text-transform: Capitalize;
  letter-spacing: -1px;
  font-weight: ${theme.fontWeights.bold};
  line-height: 1.2;
  padding-bottom: ${theme.spacing.m};
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    font-size: clamp(${theme.fontSizes.small}, 4vw, ${theme.fontSizes.medium});
  }
`;

const CuratorMeta = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.sm};
  flex-wrap: wrap;
  align-items: center;
`;

const MetaTag = styled.span`
  padding: 2px ${theme.spacing.xs};
  border: 1px solid ${props => {
    if (props.type === 'curator-type' && props.borderColor) {
      return props.borderColor;
    }
    return theme.colors.black;
  }};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  background: ${theme.colors.fpwhite};
  text-transform: uppercase;
`;

const CuratorBio = styled.p`
  margin: 0;
  font-size: ${theme.fontSizes.md};
  color: ${theme.colors.black};
  font-weight: ${theme.fontWeights.medium};
  opacity: 0.9;
  line-height: 1.5;
  
  /* Limit to 2 lines */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ViewProfileLink = styled.div`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  opacity: 0.7;
  font-family: ${theme.fonts.mono};
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    align-self: flex-start;
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

  p {
    margin: 0;
    font-size: ${theme.fontSizes.medium};
  }
`;

const CuratorListPage = () => {
  const navigate = useNavigate();
  const [curators, setCurators] = useState([]);
  const [filteredCurators, setFilteredCurators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [curatorTypeColors, setCuratorTypeColors] = useState({});

  useEffect(() => {
    const fetchCurators = async () => {
      setIsLoading(true);
      try {
        // Fetch curator data and curator type colors in parallel
        const [curatorsResponse, colorsResponse] = await Promise.all([
          fetch('/api/v1/curators', { credentials: 'include' }),
          fetch('/api/v1/admin/site-admin/curator-types', { credentials: 'include' }).catch(() => null)
        ]);
        
        if (!curatorsResponse.ok) throw new Error('Failed to fetch curators');
        const data = await curatorsResponse.json();
        const curatorList = data.success ? data.data : [];
        setCurators(curatorList);
        
        // Load curator type colors if available
        if (colorsResponse && colorsResponse.ok) {
          const colorsData = await colorsResponse.json();
          setCuratorTypeColors(colorsData.colors || {});
        }
      } catch (error) {
        console.error('Error fetching curators:', error);
        setCurators([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurators();
  }, []);

  // Generate structured data for SEO
  const curatorSchemaItems = useMemo(() => {
    return curators.slice(0, 10).map(c => ({
      type: 'Person',
      name: c.name,
      url: `https://flowerpil.io/curator/${encodeURIComponent(c.name)}`
    }));
  }, [curators]);

  // Filter curators based on search and filters
  useEffect(() => {
    let filtered = curators;

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(curator => 
        curator.name.toLowerCase().includes(searchLower) ||
        (curator.bio_short && curator.bio_short.toLowerCase().includes(searchLower)) ||
        (curator.location && curator.location.toLowerCase().includes(searchLower))
      );
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(curator => curator.profile_type === typeFilter);
    }

    // Apply verification filter
    if (verificationFilter !== 'all') {
      filtered = filtered.filter(curator => curator.verification_status === verificationFilter);
    }

    setFilteredCurators(filtered);
  }, [curators, searchTerm, typeFilter, verificationFilter]);

  if (isLoading) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <ContentWrapper>
            <LoadingState>
              <p>Loading curators...</p>
            </LoadingState>
          </ContentWrapper>
        </ScrollRegion>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SEO
        title="Music Curators & Playlist Creators"
        description="Cross-platform, curated, by people. Meet the curators behind the playlists."
        canonical="/curators"
        keywords={[
          'music curators',
          'playlist creators',
          'music tastemakers',
          'playlist curators',
          'music bloggers',
          'music influencers'
        ]}
        structuredData={generateItemListSchema(curatorSchemaItems, 'Music Curators')}
      />
      <ReusableHeader />
      <ScrollRegion>
        <ContentWrapper>
        {/* Page Breadcrumb */}
        <PageBreadcrumb>
          <Link to="/home">Home</Link> / Curators
        </PageBreadcrumb>
      
      <CuratorListHeader>
        <h1>Curator Profiles</h1>
        <p>{curators.length} curator{curators.length !== 1 ? 's' : ''}</p>
      </CuratorListHeader>

      <SearchAndFilters>
        <SearchInput
          type="text"
          placeholder="Search curators by name, bio, or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        
        <FilterSelect
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          {getCuratorTypeOptions().map(option => (
            option.isHeader ? (
              <option 
                key={option.value} 
                value={option.value} 
                disabled 
                className="category-header"
              >
                {option.label}
              </option>
            ) : (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            )
          ))}
        </FilterSelect>
        

      </SearchAndFilters>

      {filteredCurators.length > 0 ? (
        <CuratorGrid>
          {filteredCurators.map((curator) => (
            <CuratorCard 
              as={Link} 
              to={`/curator/${encodeURIComponent(curator.name)}`} 
              key={curator.id}
            >
              <CuratorImage>
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
                    size="small"
                    borderRadius="4px"
                  />
                )}
              </CuratorImage>
              
              <CuratorContent>
                <CuratorHeader>
                  <CuratorName>{curator.name}</CuratorName>
                  <ViewProfileLink>
                    View profile →
                  </ViewProfileLink>
                </CuratorHeader>
                
                <CuratorMeta>

                  <MetaTag 
                    type="curator-type" 
                    borderColor={curatorTypeColors[curator.profile_type]}
                  >
                    {getCuratorTypeLabel(curator.profile_type)}
                  </MetaTag>
                                    {curator.location && (
                    <MetaTag>{curator.location}</MetaTag>
                  )}
                </CuratorMeta>

                {curator.bio_short && (
                  <CuratorBio>{curator.bio_short}</CuratorBio>
                )}
              </CuratorContent>
            </CuratorCard>
          ))}
        </CuratorGrid>
      ) : (
        <EmptyState>
          <p>No curators found</p>
        </EmptyState>
      )}
        </ContentWrapper>
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


export default CuratorListPage;
