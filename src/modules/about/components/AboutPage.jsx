import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { mediaQuery, theme } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import ResponsiveImage from '@shared/components/ResponsiveImage';
import AboutAccordion from './AboutAccordion';
import DOMPurify from 'isomorphic-dompurify';

const CACHE_KEY = 'flowerpil_about_content';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Module-level cache
let memoryCache = null;
let cacheTimestamp = null;

const getAboutContent = async () => {
  // Check memory cache first
  if (memoryCache && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL) {
    return memoryCache;
  }

  // Check sessionStorage cache
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) {
        memoryCache = data;
        cacheTimestamp = timestamp;
        return data;
      }
    }
  } catch (err) {
    console.warn('Failed to read about content from cache:', err);
  }

  // Fetch fresh data
  const response = await fetch('/api/v1/about-content');
  if (!response.ok) {
    throw new Error('Failed to fetch about content');
  }
  const data = await response.json();

  // Update both caches
  memoryCache = data;
  cacheTimestamp = Date.now();

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: cacheTimestamp
    }));
  } catch (err) {
    console.warn('Failed to cache about content:', err);
  }

  return data;
};

// Export cache clearing function for admin use
export const clearAboutContentCache = () => {
  memoryCache = null;
  cacheTimestamp = null;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch (err) {
    console.warn('Failed to clear about content cache:', err);
  }
};

const AboutPage = () => {
  const [content, setContent] = useState({
    topText: '',
    items: [],
    headerConfig: {
      title: '',
      subtitle: '',
      backgroundColor: '',
      showHeader: false
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const data = await getAboutContent();
        setContent(data);
      } catch (err) {
        console.error('Error fetching about content:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, []);

  // Sanitize top text HTML
  const sanitizedTopText = content.topText
    ? DOMPurify.sanitize(content.topText, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3',
          'span', 'div', 's', 'del', 'mark', 'sub', 'sup', 'code', 'pre',
          'blockquote', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
        ],
        ALLOWED_ATTR: [
          'href', 'target', 'rel', 'style', 'class', 'src', 'alt', 'width', 'height',
          'colspan', 'rowspan', 'align'
        ],
        ALLOW_DATA_ATTR: false
      })
    : '';

  return (
    <PageContainer>
      <ReusableHeader />
      <ContentContainer>
        {/* Custom Header Section (if enabled) */}
        {content.headerConfig?.showHeader && (
          <CustomHeaderSection backgroundColor={content.headerConfig.backgroundColor}>
            {content.headerConfig.title && (
              <CustomHeaderTitle>{content.headerConfig.title}</CustomHeaderTitle>
            )}
            {content.headerConfig.subtitle && (
              <CustomHeaderSubtitle>{content.headerConfig.subtitle}</CustomHeaderSubtitle>
            )}
          </CustomHeaderSection>
        )}

        {/* Page Breadcrumb */}
        <PageBreadcrumb>
          <Link to="/home">Home</Link> / About
        </PageBreadcrumb>

        {loading && (
          <LoadingMessage>Loading...</LoadingMessage>
        )}

        {error && (
          <ErrorMessage>Unable to load content. Please try again later.</ErrorMessage>
        )}

        {!loading && !error && (
          <>
            {sanitizedTopText && (
              <TopTextSection>
                <TopTextLogo
                  src="/logo-bg.png"
                  alt="Flowerpil"
                  loading="eager"
                  placeholder=""
                  sizes={`(max-width: ${theme.breakpoints.mobile}) 3rem, 4rem`}
                />
                <TopTextBody dangerouslySetInnerHTML={{ __html: sanitizedTopText }} />
              </TopTextSection>
            )}

            {content.items && content.items.length > 0 && (
              <AboutAccordion items={content.items} />
            )}

            {!sanitizedTopText && (!content.items || content.items.length === 0) && (
              <EmptyMessage>Content coming soon.</EmptyMessage>
            )}
          </>
        )}
      </ContentContainer>
    </PageContainer>
  );
};

const PageContainer = styled.div`
  min-height: calc(var(--vh, 1vh) * 100);
  width: 100%;
  background: ${theme.colors.fpwhite};
  display: flex;
  flex-direction: column;
`;

const ContentContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${theme.spacing.xl} ${theme.spacing.md};
  max-width: 1000px;
  margin: 0 auto;

  width: 100%;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.md} ${theme.spacing.md};
  }
`;

const PageBreadcrumb = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.blackLess};
  margin-bottom: ${theme.spacing.xl};
  
  a {
    color: ${theme.colors.black};
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color ${theme.transitions.fast};

    &:hover {
      border-bottom-color: ${theme.colors.black};
    }
  }
`;

const TopTextSection = styled.section`
  max-width: 800px;
  margin: 0 auto ${theme.spacing.xl} auto;
  padding: ${theme.spacing.md};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.hx};
  line-height: 1.2;
  text-align: left;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
    font-size: ${theme.fontSizes.body};
  }
`;

const TopTextLogo = styled(ResponsiveImage)`
  width: calc(${theme.spacing.xl} + ${theme.spacing.xl});
  height: calc(${theme.spacing.xl} + ${theme.spacing.xl});
  margin: 0 0 ${theme.spacing.md} 0;
  background: transparent;

  img {
    object-fit: contain;
  }

  ${mediaQuery.mobile} {
    width: calc(${theme.spacing.lg} + ${theme.spacing.lg});
    height: calc(${theme.spacing.lg} + ${theme.spacing.lg});
    margin-bottom: ${theme.spacing.sm};
  }
`;

const TopTextBody = styled.div`
  p {
    margin-bottom: ${theme.spacing.md};
  }

  h1, h2, h3 {
    margin: ${theme.spacing.md} 0;
    font-weight: ${theme.fontWeights.bold};
    letter-spacing: -0.01em;
  }

  ul, ol {
    margin: 0 0 ${theme.spacing.md} 0;
    padding-left: ${theme.spacing.xl};
  }

  li {
    margin-bottom: ${theme.spacing.sm};
  }

  a {
    color: ${theme.colors.primary};
    text-decoration: underline;
    text-underline-offset: 3px;

    &:hover {
      color: ${theme.colors.hoverPrimary};
    }
  }
`;

const CustomHeaderSection = styled.div`
  width: 100vw;
  margin-left: calc(-50vw + 50%);
  padding: ${theme.spacing.xxl} ${theme.spacing.xl};
  background: ${props => props.backgroundColor || theme.colors.black};
  color: ${theme.colors.white};
  text-align: center;
  margin-bottom: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm} ${theme.spacing.sm};
    margin-bottom: ${theme.spacing.xl};
  }
`;

const CustomHeaderTitle = styled.h1`
  font-family: ${theme.fonts.primary};
  font-size: clamp(2rem, 5vw, 4rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  max-width: 900px;
  margin: 0 0 ${theme.spacing.md} 0;
`;

const CustomHeaderSubtitle = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: clamp(0.9rem, 2vw, 1.1rem);
  font-weight: 400;
  opacity: 0.9;
  max-width: 600px;
  line-height: 1.5;
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: ${theme.spacing.xxl};
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.blackLess};
`;

const ErrorMessage = styled.div`
  text-align: center;
  padding: ${theme.spacing.xxl};
  color: ${theme.colors.danger};
  font-family: ${theme.fonts.primary};
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: ${theme.spacing.xxl};
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.blackLess};
`;

export default AboutPage;
