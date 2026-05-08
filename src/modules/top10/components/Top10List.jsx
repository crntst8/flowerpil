/**
 * Top10List Component
 *
 * Public browse page for all published Top 10 playlists
 * Styled to match CuratorList page pattern
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme, SolidBox, DashedBox, Button } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';

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
  touch-action: pan-x pan-y;
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

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${theme.spacing.xl};
  gap: ${theme.spacing.md};

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
  }
`;

const HeaderLeft = styled.div`
  h1 {
    margin: 0 0 ${theme.spacing.sm} 0;
    font-family: ${theme.fonts.primary};
    text-transform: none;
    letter-spacing: -1px;
    color: ${theme.colors.black};
    font-size: calc(${theme.fontSizes.h1} * 1.3);
  }

  p {
    margin: 0;
    font-size: ${theme.fontSizes.medium};
    color: ${theme.colors.black};
    opacity: 0.7;
  }
`;

const MakeYourOwnButton = styled(Link)`
  display: inline-flex;
  align-items: center;
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: ${theme.borders.solid} ${theme.colors.black};
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
    justify-content: center;
  }
`;

const Top10Grid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.xl};

  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  }

  @media (min-width: 1200px) {
    grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  }
`;

const Top10Card = styled(SolidBox)`
  padding: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  transition: all 0.3s ease;
  text-decoration: none;
  border-color: ${theme.colors.black};
  color: inherit;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};

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

const CardImage = styled.div`
  flex-shrink: 0;
  width: 80px;
  height: 80px;

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 70px;
    height: 70px;
  }
`;

const CardContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.xs};
`;

const ArtistList = styled.div`
  font-size: 10px;
  color: ${theme.colors.black};
  opacity: 0.5;
  font-family: ${theme.fonts.mono};
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const DisplayName = styled.h3`
  margin: 0;
  font-size: clamp(${theme.fontSizes.medium}, 3vw, ${theme.fontSizes.large});
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  text-transform: capitalize;
  letter-spacing: -1px;
  font-weight: ${theme.fontWeights.bold};
  line-height: 1.2;

  @media (max-width: ${theme.breakpoints.mobile}) {
    font-size: clamp(${theme.fontSizes.small}, 4vw, ${theme.fontSizes.medium});
  }
`;

const ViewLink = styled.div`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  opacity: 0.7;
  font-family: ${theme.fonts.mono};
`;

const EmptyState = styled(DashedBox)`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.black};

  h2 {
    margin: 0 0 ${theme.spacing.sm} 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.large};
  }

  p {
    margin: 0 0 ${theme.spacing.lg} 0;
    font-size: ${theme.fontSizes.medium};
    opacity: 0.7;
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

const Top10List = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [top10s, setTop10s] = useState([]);

  useEffect(() => {
    document.title = 'Top 10 - flowerpil.io';
    return () => {
      document.title = 'flowerpil.io';
    };
  }, []);

  useEffect(() => {
    const fetchTop10s = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/v1/top10/browse');

        if (!response.ok) {
          throw new Error('Failed to fetch Top 10 list');
        }

        const data = await response.json();
        setTop10s(data.top10s || []);
      } catch (err) {
        console.error('Error fetching Top 10 list:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTop10s();
  }, []);

  if (loading) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <ContentWrapper>
            <LoadingState>
              <p>Loading Top 10s...</p>
            </LoadingState>
          </ContentWrapper>
        </ScrollRegion>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ReusableHeader />
      <ScrollRegion>
        <ContentWrapper>
          <PageBreadcrumb>
            <Link to="/home">Home</Link> / Top 10
          </PageBreadcrumb>

          <PageHeader>
            <HeaderLeft>
              <h1>what was yr top 10?</h1>
              <p>{top10s.length} list{top10s.length !== 1 ? 's' : ''}</p>
            </HeaderLeft>
            <MakeYourOwnButton to="/top10/start">
              Make your own →
            </MakeYourOwnButton>
          </PageHeader>

          {top10s.length > 0 ? (
            <Top10Grid>
              {top10s.map((top10) => (
                <Top10Card
                  as={Link}
                  to={`/top10/${top10.slug}`}
                  key={top10.slug}
                >
                  <CardImage>
                    <PlaceholderArtwork
                      itemId={top10.slug}
                      size="small"
                      borderRadius="4px"
                    />
                  </CardImage>
                  <CardContent>
                    <CardHeader>
                      <DisplayName>{top10.display_name}</DisplayName>
                      <ViewLink>View →</ViewLink>
                    </CardHeader>
                    {top10.artists && top10.artists.length > 0 && (
                      <ArtistList>
                        {top10.artists.join(' · ')}
                      </ArtistList>
                    )}
                  </CardContent>
                </Top10Card>
              ))}
            </Top10Grid>
          ) : (
            <EmptyState>
              <h2>No Top 10s yet</h2>
              <p>Be the first to create your Top 10 of 2025!</p>
              <MakeYourOwnButton to="/top10/start">
                Get started →
              </MakeYourOwnButton>
            </EmptyState>
          )}
        </ContentWrapper>
      </ScrollRegion>
    </PageContainer>
  );
};

export default Top10List;
