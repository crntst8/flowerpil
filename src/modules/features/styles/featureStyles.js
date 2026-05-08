/**
 * Feature Pieces Typography System
 *
 * Premium typography tokens and styled components for editorial content.
 * Uses meticulous font choices and responsive sizing.
 */

import styled, { css } from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';

// ============================================
// Typography Tokens
// ============================================

export const typography = {
  // Page Title: Helvetica Neue, bold, centered
  pageTitle: {
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontWeight: 700,
    fontSize: 'clamp(2rem, 5vw, 3.5rem)',
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    textAlign: 'center'
  },

  // Subtitle: Source Serif 4, italic, centered
  subtitle: {
    fontFamily: "'Source Serif 4', 'Times New Roman', Times, Georgia, serif",
    fontWeight: 400,
    fontStyle: 'italic',
    fontSize: 'clamp(1.1rem, 2vw, 1.5rem)',
    lineHeight: 1.4,
    letterSpacing: '0',
    textAlign: 'center'
  },

  // Metadata: Paper Mono, uppercase, centered
  metadata: {
    fontFamily: "'Paper Mono', 'Courier New', monospace",
    fontWeight: 400,
    fontSize: 'clamp(0.65rem, 1vw, 0.75rem)',
    lineHeight: 1.4,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    textAlign: 'center'
  },

  // Section Header: Helvetica Neue, bold, left-aligned
  sectionHeading: {
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontWeight: 700,
    fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)',
    lineHeight: 1.2,
    letterSpacing: '-0.01em',
    textAlign: 'left'
  },

  // Body: Source Serif 4, left-aligned
  body: {
    fontFamily: "'Source Serif 4', 'Times New Roman', Times, Georgia, serif",
    fontWeight: 400,
    fontWeightBold: 600,
    fontSize: 'clamp(1rem, 1.5vw, 1.125rem)',
    lineHeight: 1.7,
    letterSpacing: '0',
    textAlign: 'left'
  },

  // Pull Quote: Helvetica Neue, italic, right-aligned
  pullQuote: {
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontWeight: 400,
    fontStyle: 'italic',
    fontSize: 'clamp(1.25rem, 2vw, 1.5rem)',
    lineHeight: 1.4,
    letterSpacing: '0',
    textAlign: 'right'
  },

  // Quote Attribution: Source Serif 4, right-aligned
  quoteAttribution: {
    fontFamily: "'Source Serif 4', 'Times New Roman', Times, Georgia, serif",
    fontWeight: 400,
    fontSize: 'clamp(0.875rem, 1.2vw, 1rem)',
    lineHeight: 1.4,
    letterSpacing: '0',
    textAlign: 'right'
  },

  // Image Caption: Source Serif 4
  imageCaption: {
    fontFamily: "'Source Serif 4', 'Times New Roman', Times, Georgia, serif",
    fontWeight: 400,
    fontStyle: 'italic',
    fontSize: 'clamp(0.8rem, 1vw, 0.875rem)',
    lineHeight: 1.4,
    letterSpacing: '0',
    textAlign: 'left'
  }
};

// ============================================
// Spacing Tokens
// ============================================

export const spacing = {
  // Vertical spacing between major sections
  sectionGap: {
    desktop: '48px',
    tablet: '40px',
    mobile: '32px'
  },

  // Vertical spacing between blocks
  blockGap: {
    desktop: '20px',
    tablet: '16px',
    mobile: '14px'
  },

  // Article content max-width
  articleWidth: {
    desktop: '720px',
    tablet: '90%',
    mobile: '100%'
  },

  // Hero image max-width (narrower than full)
  heroWidth: {
    desktop: '900px',
    tablet: '90%',
    mobile: '100%'
  },

  // Horizontal padding
  contentPadding: {
    desktop: '0',
    tablet: '24px',
    mobile: '20px'
  }
};

// ============================================
// Visual Tokens
// ============================================

export const visuals = {
  // Image shadow
  imageShadow: '8px 12px 24px rgba(0, 0, 0, 0.40)',

  // Divider
  dividerColor: 'rgba(0, 0, 0, 0.2)',
  dividerWidth: '1px',

  // Colors
  textPrimary: '#000000',
  textSecondary: 'rgba(0, 0, 0, 0.7)',
  background: 'rgba(219, 219, 218, 1)'
};

// ============================================
// Styled Component Mixins
// ============================================

export const applyTypography = (tokenKey) => css`
  font-family: ${typography[tokenKey].fontFamily};
  font-weight: ${typography[tokenKey].fontWeight};
  font-size: ${typography[tokenKey].fontSize};
  line-height: ${typography[tokenKey].lineHeight};
  letter-spacing: ${typography[tokenKey].letterSpacing};
  text-align: ${typography[tokenKey].textAlign};
  ${typography[tokenKey].fontStyle ? `font-style: ${typography[tokenKey].fontStyle};` : ''}
  ${typography[tokenKey].textTransform ? `text-transform: ${typography[tokenKey].textTransform};` : ''}
`;

// ============================================
// Base Styled Components
// ============================================

export const ArticleContainer = styled.article`
  width: 100%;
  max-width: ${spacing.articleWidth.desktop};
  margin: 0 auto;
  padding: 0 ${spacing.contentPadding.desktop};

  ${mediaQuery.tablet} {
    max-width: ${spacing.articleWidth.tablet};
    padding: 0 ${spacing.contentPadding.tablet};
  }

  ${mediaQuery.mobile} {
    max-width: ${spacing.articleWidth.mobile};
    padding: 0 ${spacing.contentPadding.mobile};
  }
`;

export const PageTitle = styled.h1`
  ${applyTypography('pageTitle')}
  color: ${visuals.textPrimary};
  margin: 0 0 8px 0;
`;

export const Subtitle = styled.h2`
  ${applyTypography('subtitle')}
  color: ${visuals.textSecondary};
  margin: 0 0 12px 0;
`;

export const Metadata = styled.div`
  ${applyTypography('metadata')}
  color: ${visuals.textSecondary};
  margin: 0;
`;

export const SectionHeading = styled.h3`
  ${applyTypography('sectionHeading')}
  color: ${visuals.textPrimary};
  margin: ${spacing.sectionGap.desktop} 0 ${spacing.blockGap.desktop} 0;
  clear: both;

  &:first-child {
    margin-top: 0;
  }

  ${mediaQuery.tablet} {
    margin: ${spacing.sectionGap.tablet} 0 ${spacing.blockGap.tablet} 0;
  }

  ${mediaQuery.mobile} {
    margin: ${spacing.sectionGap.mobile} 0 ${spacing.blockGap.mobile} 0;
  }
`;

export const BodyText = styled.p`
  ${applyTypography('body')}
  color: ${visuals.textPrimary};
  margin: 0 0 ${spacing.blockGap.desktop} 0;

  &:last-child {
    margin-bottom: 0;
  }

  ${mediaQuery.tablet} {
    margin-bottom: ${spacing.blockGap.tablet};
  }

  ${mediaQuery.mobile} {
    margin-bottom: ${spacing.blockGap.mobile};
  }
`;

// Clearfix for float layouts
export const ClearFloat = styled.div`
  clear: both;
`;

// Float position helper
const getFloatStyles = (position) => {
  if (position === 'left') {
    return css`
      float: left;
      width: 45%;
      margin: 8px 24px 16px 0;

      ${mediaQuery.mobile} {
        width: 40%;
        margin: 4px 16px 12px 0;
      }
    `;
  }
  if (position === 'right') {
    return css`
      float: right;
      width: 45%;
      margin: 8px 0 16px 24px;

      ${mediaQuery.mobile} {
        width: 40%;
        margin: 4px 0 12px 16px;
      }
    `;
  }
  return '';
};

export const PullQuoteContainer = styled.blockquote`
  margin: ${spacing.blockGap.desktop} 0;
  padding: 0;
  border: none;
  text-align: ${({ $alignment }) => $alignment || 'left'};

  ${mediaQuery.tablet} {
    margin: ${spacing.blockGap.tablet} 0;
  }

  ${mediaQuery.mobile} {
    margin: ${spacing.blockGap.mobile} 0;
  }

  ${({ $alignment }) => ($alignment === 'left' || $alignment === 'right') && getFloatStyles($alignment)}

  ${mediaQuery.mobile} {
    float: none;
    width: 100%;
  }
`;

export const PullQuoteText = styled.p`
  ${applyTypography('pullQuote')}
  color: ${visuals.textPrimary};
  margin: 0 0 8px 0;
  text-align: inherit;

  &::before {
    content: '"';
  }

  &::after {
    content: '"';
  }
`;

export const PullQuoteAttribution = styled.cite`
  ${applyTypography('quoteAttribution')}
  color: ${visuals.textSecondary};
  display: block;
  font-style: normal;
  text-align: inherit;

  &::before {
    content: '\\2014\\00a0';
  }
`;

export const ImageContainer = styled.figure`
  margin: ${spacing.blockGap.desktop} 0;
  padding: 0;

  ${mediaQuery.tablet} {
    margin: ${spacing.blockGap.tablet} 0;
  }

  ${mediaQuery.mobile} {
    margin: ${spacing.blockGap.mobile} 0;
  }

  ${({ $position }) => $position && getFloatStyles($position)}
`;

export const ArticleImage = styled.img`
  width: 100%;
  height: auto;
  display: block;
  box-shadow: ${visuals.imageShadow};
`;

export const ImageCaption = styled.figcaption`
  ${applyTypography('imageCaption')}
  color: ${visuals.textSecondary};
  margin-top: 8px;
`;

export const Divider = styled.hr`
  border: none;
  border-top: ${visuals.dividerWidth} solid ${visuals.dividerColor};
  margin: ${spacing.sectionGap.desktop} 0;
  clear: both;

  ${mediaQuery.tablet} {
    margin: ${spacing.sectionGap.tablet} 0;
  }

  ${mediaQuery.mobile} {
    margin: ${spacing.sectionGap.mobile} 0;
  }
`;

// ============================================
// Hero Section Styles
// ============================================

export const HeroContainer = styled.div`
  width: 100%;
  max-width: ${spacing.heroWidth.desktop};
  margin: 0 auto;
  position: relative;
  padding: 0 ${spacing.contentPadding.desktop};

  ${mediaQuery.tablet} {
    max-width: ${spacing.heroWidth.tablet};
    padding: 0 ${spacing.contentPadding.tablet};
  }

  ${mediaQuery.mobile} {
    max-width: ${spacing.heroWidth.mobile};
    padding: 0;
  }

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: linear-gradient(to bottom, transparent, ${visuals.background});
    pointer-events: none;
  }
`;

export const HeroImage = styled.img`
  width: 100%;
  height: auto;
  display: block;
  max-height: 65vh;
  object-fit: cover;
`;

export const HeroCaption = styled.figcaption`
  ${applyTypography('imageCaption')}
  color: ${visuals.textSecondary};
  max-width: ${spacing.articleWidth.desktop};
  margin: 8px auto 0;
  padding: 0 ${spacing.contentPadding.desktop};
  text-align: center;

  ${mediaQuery.tablet} {
    max-width: ${spacing.articleWidth.tablet};
    padding: 0 ${spacing.contentPadding.tablet};
  }

  ${mediaQuery.mobile} {
    max-width: ${spacing.articleWidth.mobile};
    padding: 0 ${spacing.contentPadding.mobile};
  }
`;

export const HeaderSection = styled.header`
  text-align: center;
  padding: 20px 0 ${spacing.sectionGap.desktop};

  ${mediaQuery.tablet} {
    padding: 16px 0 ${spacing.sectionGap.tablet};
  }

  ${mediaQuery.mobile} {
    padding: 12px 0 ${spacing.sectionGap.mobile};
  }
`;
