import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { getImageUrl, formatPostDate } from '../services/blogService';

// Utility function to strip HTML tags and decode entities
const stripHtml = (html) => {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

const BlogPostCard = ({ post }) => {
  const navigate = useNavigate();
  if (!post) return null;

  // Check for actual image value (not empty string or whitespace)
  const hasImage = post.featured_image && post.featured_image.trim() !== '';
  const primaryImage = hasImage ? getImageUrl(post.featured_image) : null;
  const postDate = formatPostDate(post.published_at || post.created_at);
  const plainTextExcerpt = stripHtml(post.excerpt);

  return (
    <CardLink to={`/posts/${post.slug}`}>
      <Card $hasImage={hasImage}>
        {hasImage && primaryImage && (
          <ImageSection>
            <ImageContainer>
              <img
                src={primaryImage}
                alt={post.title}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </ImageContainer>
          </ImageSection>
        )}

        <ContentSection $hasImage={hasImage}>
          <TopContent>
            <PostDate>{postDate}</PostDate>
            <PostTitle data-length={
              post.title.length > 60 ? 'very-long' :
                post.title.length > 35 ? 'long' :
                  'normal'
            }>
              {post.title}
            </PostTitle>
          </TopContent>

          {plainTextExcerpt && (
            <ExcerptContainer>
              <Excerpt>{plainTextExcerpt}</Excerpt>
              <ReadMore>Read More →</ReadMore>
            </ExcerptContainer>
          )}
        </ContentSection>

        {Array.isArray(post?.flags) && post.flags.length > 0 && (
          <FlagsContainer>
            {post.flags.map((flag) => {
              if (!flag) return null;
              const slug = flag.url_slug;
              return (
                <FlagButton
                  key={`${flag.id}-${slug || 'tag'}`}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (slug) {
                      navigate(`/content-tag/${slug}`);
                    }
                  }}
                  $bgColor={flag.color}
                  $textColor={flag.text_color}
                  disabled={!slug}
                  aria-label={slug ? `View ${flag.text} tag` : undefined}
                >
                  {flag.text}
                </FlagButton>
              );
            })}
          </FlagsContainer>
        )}
      </Card>
    </CardLink>
  );
};

export default BlogPostCard;

// STYLES

const CardLink = styled(Link)`
  text-decoration: none;
  color: inherit;
  display: block;
  transition: all ${theme.transitions.normal};

  &:hover {
    transform: translateY(-1px);
    opacity: 0.95;
  }
`;

const Card = styled.article`
  position: relative;
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  overflow: visible;
  transition: all ${theme.transitions.fast};
  display: flex;
  align-items: ${props => props.$hasImage ? 'center' : 'stretch'};
  padding-top: ${props => props.$hasImage ? theme.spacing.md : '0'};
  padding-bottom: ${props => props.$hasImage ? theme.spacing.xs : '0'};
  z-index: 1;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.04);

  gap: ${theme.spacing.xxs};

  &:hover {
    border-color: ${theme.colors.black};
  }
`;

// Image Section
const ImageSection = styled.div`
  flex-shrink: 0;
  padding: calc(${theme.spacing.md}*0.8);
  margin-left: calc(${theme.spacing.md} * 1.2);
  position: relative;
  z-index: 1;

  @media (max-width: 700px) {
    margin-left: calc(${theme.spacing.xl} * 0.9);
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
    margin-left: 0;
  }
`;

const ImageContainer = styled.div`
  position: relative;
  width: 150px;
  height: 150px;
  border: 1px solid rgba(0, 0, 0, 0.9);
  overflow: hidden;
  flex-shrink: 0;
  border-radius: 1px;
  transition: all 0.3s ease;

  @media (min-width: 1200px) {
    width: 200px;
    height: 200px;
  }

  @media (min-width: 1600px) {
    width: 210px;
    height: 210px;
  }

  ${mediaQuery.mobile} {
    width: 120px;
    height: 120px;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
    transition: transform ${theme.transitions.slow};
  }

  ${Card}:hover & {
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.16),
      0 4px 12px rgba(0, 0, 0, 0.12),
      0 8px 24px rgba(0, 0, 0, 0.06);
    transform: translateY(-1px);
  }

  ${Card}:hover & img {
    transform: scale(1.05);
  }
`;

// Content Section
const ContentSection = styled.div`
  padding: ${theme.spacing.lg} ${theme.spacing.xl} ${theme.spacing.lg} ${props => props.$hasImage ? theme.spacing.md : theme.spacing.xl};
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  min-width: 0;
  flex: 1;
  height: 100%;
  margin-left: ${props => props.$hasImage ? `calc(${theme.spacing.lg} * 0.1)` : '0'};

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.lg} ${theme.spacing.md} ${theme.spacing.md} ${theme.spacing.xs};
    justify-content: flex-start;
    margin-left: 0;
  }
`;

const TopContent = styled.div`
  display: flex;
  flex-direction: column;
`;

const PostDate = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  letter-spacing: 0.05em;
  margin-bottom: 4px;
  font-weight: ${theme.fontWeights.medium};
`;

const PostTitle = styled.h2`
  font-family: ${theme.fonts.primary};
  font-size: clamp(2.1rem, 4vw, ${theme.fontSizes.h3});
  font-weight: ${theme.fontWeights.bold};
  line-height: 1.2;
  letter-spacing: -0.025em;
  color: ${theme.colors.black};
  margin: 0 0 ${theme.spacing.xs} 0;
  text-decoration: none;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;

  &[data-length="long"] {
    font-size: clamp(1.8rem, 3.6vw, 2.5rem);
  }

  &[data-length="very-long"] {
    font-size: clamp(1.6rem, 3.2vw, 2.2rem);
  }

  ${mediaQuery.mobile} {
    font-size: clamp(1.8rem, 5vw, 2.2rem);

    &[data-length="long"] {
      font-size: clamp(1.6rem, 4.5vw, 2rem);
    }

    &[data-length="very-long"] {
      font-size: clamp(1.4rem, 4vw, 1.8rem);
    }
  }
`;

const ExcerptContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.xs};
`;

const Excerpt = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  line-height: 1.5;
  color: ${theme.colors.black};
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  ${mediaQuery.mobile} {
    font-size: ${theme.fontSizes.small};
    -webkit-line-clamp: 3;
  }
`;

const ReadMore = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  letter-spacing: 0.05em;
  font-weight: ${theme.fontWeights.medium};
  transition: transform ${theme.transitions.fast};

  ${Card}:hover & {
    transform: translateX(4px);
  }
`;

const FlagsContainer = styled.div`
  position: absolute;
  top: 0;
  /* Align with top-left corner of artwork */
  right: calc(${theme.spacing.xl} + calc(${theme.spacing.xxl} * 0.8));
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  gap: ${theme.spacing.xs};
  z-index: 10;
  pointer-events: none;
  opacity: 97%;

  @media (max-width: 700px) {
    right: calc(${theme.spacing.sm} * 0.5 + ${theme.spacing.sm});
  }

  ${mediaQuery.mobile} {
    /* Mobile: align with artwork left edge */
    right: ${theme.spacing.sm};
    top: 0;
  }
`;

const FlagButton = styled.button.withConfig({ shouldForwardProp: (prop) => !['$bgColor', '$textColor'].includes(prop) })`
  font-family: ${theme.fonts.primary};
  font-size: 14.5px;
  font-weight: ${theme.fontWeights.bold};
  text-transform: Capitalise;
  letter-spacing: -0.9px;
  border-left: ${theme.borders.solidThin} black;
  border-right: ${theme.borders.solidThin} black;
  border-bottom: ${theme.borders.solidThin} black;
  border-top: none;
  text-align: center;
  /* top right bottom left */
  padding: 10px 8px 10px 8px;
  pointer-events: auto;
  text-shadow: 0 1px 2px rgba(153, 150, 150, 0.4);
  white-space: nowrap;
  line-height: 1;
  background: ${(p) => p.$bgColor || '#666'};
  opacity: 1;
  position: relative;

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

  color: ${(p) => p.$textColor || '#ffffff'};
  cursor: ${props => props.disabled ? 'default' : 'pointer'};
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.64),
    0 2px 6px rgba(27, 27, 29, 0.08),
    0 1px 3px rgba(108, 108, 119, 0.67);

  &:hover:not(:disabled) {
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.91),
      0 2px 6px rgba(27, 27, 29, 0.08),
      0 1px 3px rgba(108, 108, 119, 0.67);
    padding: 20px 8px 14px 8px;
    transition: padding ${theme.transitions.slow};
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.black};
    outline-offset: 2px;
  }

  &:disabled {
    cursor: default;
    opacity: 0.65;
  }

  ${mediaQuery.mobile} {
    font-size: 8px;
    font-weight: ${theme.fontWeights.bold};
    letter-spacing: -0.3px;
    /* top right bottom left (scaled down proportionally) */
    padding: 12px 8px 8px 8px;
    text-align: center;

    &:hover:not(:disabled) {
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.91),
        0 2px 6px rgba(27, 27, 29, 0.08),
        0 1px 3px rgba(108, 108, 119, 0.67);
      padding: 14px 8px 10px 8px;
      transition: padding ${theme.transitions.fast};
    }
  }
`;
