import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import CuratorTypeDisplay from '@shared/components/CuratorTypeDisplay';
import { parseGenreTags } from '@shared/utils/genreUtils';
import ResponsiveImage from '@shared/components/ResponsiveImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';
import { IMAGE_SIZES } from '@shared/utils/imageUtils';

const FeedPlaylistCard = ({ playlist, genreLookup }) => {
  const navigate = useNavigate();
  if (!playlist) return null;
  const tags = useMemo(() => parseGenreTags(playlist?.tags), [playlist?.tags]);

  const resolvedTags = useMemo(() => {
    if (!tags.length) return [];
    const resolve = genreLookup?.resolve;
    const seen = new Set();
    return tags.map(tag => {
      const match = typeof resolve === 'function' ? resolve(tag) : null;
      const label = match?.label || tag;
      const color = match?.color || '#000000';
      const key = (match?.id || label || tag).toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: key,
        label,
        color
      };
    }).filter(Boolean);
  }, [genreLookup, tags]);

  // Use the appropriate size URL from API, or fall back to the stored image URL
  // For older images that don't have size variants, playlist.image will be the original
  const imageUrl = playlist.image_url_large || playlist.image_url_medium || playlist.image;
  const fallbackUrl = playlist.image; // Always keep original as ultimate fallback

  return (
    <CardLink to={`/playlists/${playlist.id}`}>
      <Card>
        <ImageSection>
          <StyledImageContainer>
            {imageUrl ? (
              <ResponsiveImage
                src={imageUrl}
                alt={playlist.title}
                sizes={IMAGE_SIZES.CARD_MEDIUM}
                loading="lazy"
                placeholder="NO IMAGE"
                fallback={fallbackUrl}
              />
            ) : (
              <PlaceholderArtwork
                itemId={playlist.id}
                size="medium"
                borderRadius="0"
              />
            )}
          </StyledImageContainer>
        </ImageSection>

        <ContentSection>
          <TopContent>
          <MetaInfo>
            <CuratorInfo>
              <CuratorName>{playlist.curator_name}</CuratorName>
              <StyledCuratorTypeDisplay
                type={playlist.curator_type}
                prefix=" | "
                uppercase={true}
                fallback="CURATOR"
              />
            </CuratorInfo>
          </MetaInfo>

            <PlaylistTitle $isLong={playlist.title.length > 20}>
              {playlist.title}
            </PlaylistTitle>
          </TopContent>

          {resolvedTags.length > 0 && (
            <GenreTagList>
              {resolvedTags.map(tag => (
                <GenreTag key={tag.id} $color={tag.color}>
                  {tag.label.toUpperCase()}
                </GenreTag>
              ))}
            </GenreTagList>
          )}


        </ContentSection>

        {Array.isArray(playlist?.flags) && playlist.flags.length > 0 && (
          <FlagsContainer>
            {playlist.flags.map((flag) => {
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


// STYLE

const CardLink = styled(Link)`
  text-decoration: none;
  color: inherit;
  display: block;
  transition: transform ${theme.transitions.normal}, opacity ${theme.transitions.normal};

  &:hover {
    transform: translateY(-1px);
    opacity: 0.95;
  }
`;


// Card

const Card = styled.article`
  position: relative;
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  overflow: visible;
  transition: border-color ${theme.transitions.fast};
  display: flex;
  align-items: center;
  padding-top: ${theme.spacing.md};
  padding-bottom: ${theme.spacing.xs};
  z-index: 1;
    box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 2px 6px rgba(0, 0, 0, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.04);

  gap: ${theme.spacing.xxs}; /* Reduced from md (16px) to sm (12px) for tighter layout */

  &:hover {
    border-color: ${theme.colors.black};
  }
`;


// Image 

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

const StyledImageContainer = styled.div`
  position: relative;
  width: 150px;
  height: 150px;
  border: 1px solid rgba(0, 0, 0, 0.9);
  overflow: hidden;
  flex-shrink: 0;


  border-radius: 1px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;

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

  img, picture {
    width: 100%;
    height: 100%;
  }

  img {
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

// Content

const ContentSection = styled.div`
  padding: ${theme.spacing.md} ${theme.spacing.md} ${theme.spacing.md} ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  justify-content: flex-start; /* Start from top */
  align-items: flex-start; /* Keep text left-aligned */
  min-width: 0;
  flex: 1;
  height: 100%; /* Take full height for proper alignment */
  margin-left: calc(${theme.spacing.lg} * 0.1);

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

const MetaInfo = styled.div`
  margin-bottom: 2px;
`;


// Text
const CuratorInfo = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  align-items: center;
  font-family: ${theme.fonts.primary};
  font-size: clamp(1rem, 1.6vw, 1.25rem);
  font-weight: ${theme.fontWeights.medium};
  text-transform: capitalize;
  letter-spacing: -0.91px;
  word-break: break-word;
  overflow-wrap: anywhere;
  hyphens: none;
  min-width: 0;
  overflow: hidden;
  white-space: normal;
  opacity: 0.8;
  text-shadow:
      0 1px 3px rgba(0, 0, 0, 0),
    0 2px 6px rgba(0, 0, 0, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.04);
`;

const CuratorName = styled.span`
  color: ${theme.colors.black};
  font-weight: ${theme.fontWeights.bold};
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  white-space: normal;
  overflow-wrap: anywhere;

  ${mediaQuery.mobile} {
    font-size: clamp(0.95rem, 3vw, 1.1rem);
  }
`;


// Apply the same styling to CuratorTypeDisplay component
const StyledCuratorTypeDisplay = styled(CuratorTypeDisplay)`
  color: ${theme.colors.black};
  flex-shrink: 0;
  margin-top: 0px;
  white-space: nowrap;
  font-size: clamp(1rem, 1.4vw, ${theme.fontSizes.small});
  letter-spacing: -0.8px;

  ${mediaQuery.mobile} {
    font-size: clamp(0.7rem, 1.2vw, ${theme.fontSizes.small});
  }
`;





{/* TITLE */ }

const PlaylistTitle = styled.h2.withConfig({
  shouldForwardProp: (prop) => prop !== '$isLong'
})`
  /* Typography */
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: clamp(1.2rem, 2.5vw, 2.6rem);
  font-weight: ${theme.fontWeights.bold};
  line-height: 1.05;

  /* Kerning and spacing */
  letter-spacing: -0.991px;
  word-spacing: tight;

  /* Color and layout */
  color: ${theme.colors.black};
  margin: 2px 0 14px 0;

  /* Text handling */
  word-break: break-word;
  overflow-wrap: anywhere;
  hyphens: auto;
  max-width: 100%;
  display: block;
  padding-bottom: 2px;

  /* Text rendering optimization */
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* Tablet and below - single line with spacing */
  ${mediaQuery.tablet} {
    font-size: clamp(1.05rem, 3.6vw, 2rem);
    font-weight: ${theme.fontWeights.black};
    margin: 1px 0 10px 0;
    letter-spacing: -0.98px;
    word-spacing: tight;

    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    max-width: 100%;
  }

  /* Mobile - default font size for short titles */
  ${mediaQuery.mobile} {
    font-size: clamp(1rem, 4vw, 1.5rem);
    font-weight: ${theme.fontWeights.black};
    margin-right: 0;
    max-width: 100%;
    white-space: normal;
    overflow: visible;
    text-overflow: unset;

    /* Only reduce font size for long titles (>24 chars) */
    ${props => props.$isLong && `
      font-size: clamp(0.95rem, 3.5vw, 1.25rem);
    `}
  }
`;





{/* GENRE TAGS */ }

const GenreTagList = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  margin-bottom: 1px;
  align-items: baseline;
`;

const GenreTag = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$color' })`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid ${props => props.$color};
  color: ${props => props.$color};
  font-family: ${theme.fonts.primary};
  font-size: clamp(0.5rem, 1.2vw, 0.7rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: 0;
  background: rgba(255, 255, 255, 0);
  white-space: nowrap;

  ${mediaQuery.mobile} {
    border: 1px solid ${props => props.$color};
      font-size: clamp(0.5rem, 1.2vw, 1rem);
        padding: 2px 4px;
        opacity: 0.9;


  }
`;


{/* FLAGS */ }

const FlagsContainer = styled.div`
  position: absolute;
  top: 0;
  /* Align with top-right corner of artwork */
  right: calc(${theme.spacing.xl}  + calc(${theme.spacing.md} * 0.8));
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
  opacity: 10%;
  border-left: ${theme.borders.solidThin} black;
  border-right: ${theme.borders.solidThin} black;
  border-bottom: ${theme.borders.solidThin} black;
  border-top: none;

  text-align: center;
  //top right bottom left
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
  cursor: pointer;
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
    font-size: 9.3px;
    font-weight: ${theme.fontWeights.bold};
    letter-spacing: -0.3px;
    padding: 1px 7px 1px 7px;

    text-align: center;
    &:hover:not(:disabled) {
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.91),
        0 2px 6px rgba(27, 27, 29, 0.08),
        0 1px 3px rgba(108, 108, 119, 0.67);
      padding: 8px 8px 10px 8px;

      transition: padding ${theme.transitions.fast};
    }
  }
`;

export default FeedPlaylistCard;
