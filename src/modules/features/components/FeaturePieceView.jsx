/**
 * FeaturePieceView Component
 *
 * Public view for a published feature piece with premium typography.
 * Route: /features/:slug
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import SEO from '@shared/components/SEO';
import HeroSection from './view/HeroSection.jsx';
import ArticleBody from './view/ArticleBody.jsx';
import { fetchBySlug, fetchSidebarItems } from '../services/featurePiecesService.js';
import { visuals } from '../styles/featureStyles.js';

const FeaturePieceView = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [piece, setPiece] = useState(null);
  const [sidebarItems, setSidebarItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadPiece = async () => {
      if (!slug) {
        setError('No feature specified');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await fetchBySlug(slug);
        setPiece(response.data);
      } catch (err) {
        console.error('Failed to load feature piece:', err);
        if (err.status === 404) {
          setError('Feature not found');
        } else {
          setError('Failed to load feature');
        }
      } finally {
        setLoading(false);
      }
    };

    loadPiece();
  }, [slug]);

  useEffect(() => {
    const loadSidebar = async () => {
      try {
        const response = await fetchSidebarItems(8);
        setSidebarItems(Array.isArray(response?.data) ? response.data : []);
      } catch (sidebarError) {
        console.warn('Failed to load feature sidebar items:', sidebarError);
        setSidebarItems([]);
      }
    };

    loadSidebar();
  }, []);

  if (loading) {
    return (
      <PageContainer>
        <ReusableHeader />
        <LoadingContainer>
          <LoadingText>Loading...</LoadingText>
        </LoadingContainer>
      </PageContainer>
    );
  }

  if (error || !piece) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ErrorContainer>
          <ErrorText>{error || 'Feature not found'}</ErrorText>
          <BackButton onClick={() => navigate('/features')}>
            Back to Features
          </BackButton>
        </ErrorContainer>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SEO
        title={piece.seo_title || piece.title}
        description={piece.seo_description || piece.excerpt || piece.subtitle || 'Long-form editorial on Flowerpil.'}
        canonical={piece.canonical_url || `/features/${piece.slug}`}
        keywords={['music writing', 'editorial', 'feature piece', 'flowerpil']}
      />
      <ReusableHeader />
      <MainContent>
        <ContentLayout>
          <ArticleColumn>
            <HeroSection
              heroImage={piece.hero_image}
              heroImageCaption={piece.hero_image_caption}
              title={piece.title}
              subtitle={piece.subtitle}
              metadataType={piece.metadata_type}
              metadataDate={piece.metadata_date}
            />
            <ArticleBody contentBlocks={piece.content_blocks} />
            {piece.newsletter_cta_url && (
              <CtaBox>
                <CtaLabel>{piece.newsletter_cta_label || 'Subscribe for updates'}</CtaLabel>
                <CtaLink href={piece.newsletter_cta_url} target="_blank" rel="noreferrer noopener">
                  Open Newsletter
                </CtaLink>
              </CtaBox>
            )}
            <Footer />
          </ArticleColumn>
          {sidebarItems.length > 0 && (
            <Sidebar>
              <SidebarTitle>More Writing</SidebarTitle>
              <SidebarList>
                {sidebarItems.map((item) => (
                  <SidebarItem key={item.id}>
                    <SidebarLink
                      onClick={() => navigate(`/features/${item.slug}`)}
                      $active={item.slug === piece.slug}
                    >
                      <span>{item.title}</span>
                      <small>{item.author_name || 'Flowerpil'}</small>
                    </SidebarLink>
                  </SidebarItem>
                ))}
              </SidebarList>
            </Sidebar>
          )}
        </ContentLayout>
      </MainContent>
    </PageContainer>
  );
};

// ============================================
// Styled Components
// ============================================

const PageContainer = styled.div`
  min-height: 100vh;
  background: ${visuals.background};
`;

const MainContent = styled.main`
  padding-bottom: 120px;
`;

const ContentLayout = styled.div`
  max-width: 1260px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 32px;
  padding: 0 20px;

  ${mediaQuery.tablet} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const ArticleColumn = styled.div`
  min-width: 0;
`;

const Sidebar = styled.aside`
  position: sticky;
  top: 96px;
  align-self: start;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.24);
  background: rgba(255, 255, 255, 0.72);
  padding: 16px;

  ${mediaQuery.tablet} {
    position: static;
  }
`;

const SidebarTitle = styled.h3`
  margin: 0 0 12px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const SidebarList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SidebarItem = styled.li`
  margin: 0;
`;

const SidebarLink = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$active'
})`
  width: 100%;
  border: ${theme.borders.solidThin} ${({ $active }) => ($active ? theme.colors.black : 'rgba(0, 0, 0, 0.16)')};
  background: ${({ $active }) => ($active ? '#f2f2f2' : '#ffffff')};
  text-align: left;
  padding: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};

  small {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    opacity: 0.68;
  }
`;

const CtaBox = styled.div`
  max-width: 720px;
  margin: 30px auto 0;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.24);
  background: #ffffff;
  padding: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const CtaLabel = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
`;

const CtaLink = styled.a`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 10px 14px;
  border: 1px solid ${theme.colors.black};
  color: ${theme.colors.black};
  text-decoration: none;
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
`;

const LoadingText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 24px;
  padding: 40px 20px;
`;

const ErrorText = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  color: ${theme.colors.black};
  text-align: center;
`;

const BackButton = styled.button`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 12px 24px;
  border: 2px solid ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.black};
    color: ${theme.colors.fpwhite};
  }
`;

const Footer = styled.div`
  height: 80px;

  ${mediaQuery.mobile} {
    height: 60px;
  }
`;

export default FeaturePieceView;
