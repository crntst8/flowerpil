import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ResponsiveImage from '@shared/components/ResponsiveImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';
import { IMAGE_SIZES } from '@shared/utils/imageUtils';
import { parseGenreTags } from '@shared/utils/genreUtils';

const FeedReleaseCard = ({ release, genreLookup }) => {
  if (!release) return null;

  const tags = useMemo(() => parseGenreTags(release?.genres), [release?.genres]);

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
      return { id: key, label, color };
    }).filter(Boolean);
  }, [genreLookup, tags]);

  const imageUrl = release.artwork_url;
  const releaseDate = release.release_date
    ? new Date(release.release_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
    : null;

  const releaseTypeLabel = release.release_type
    ? release.release_type.toUpperCase()
    : 'RELEASE';

  return (
    <CardLink to={`/r/${release.id}`}>
      <Card>
        <ImageSection>
          <StyledImageContainer>
            {imageUrl ? (
              <ResponsiveImage
                src={imageUrl}
                alt={release.title}
                sizes={IMAGE_SIZES.CARD_MEDIUM}
                loading="lazy"
                placeholder="NO IMAGE"
              />
            ) : (
              <PlaceholderArtwork
                itemId={release.id}
                size="medium"
                borderRadius="0"
              />
            )}
          </StyledImageContainer>
        </ImageSection>

        <ContentSection>
          <TopContent>
            <MetaInfo>
              <TypeDate>
                {releaseTypeLabel}
                {releaseDate && <span> / {releaseDate}</span>}
              </TypeDate>
            </MetaInfo>

            <ArtistName>{release.artist_name}</ArtistName>
            <ReleaseTitle $isLong={release.title?.length > 20}>
              {release.title}
            </ReleaseTitle>
          </TopContent>

          {resolvedTags.length > 0 && (
            <GenreTagList>
              {resolvedTags.slice(0, 3).map(tag => (
                <GenreTag key={tag.id} $color={tag.color}>
                  {tag.label.toUpperCase()}
                </GenreTag>
              ))}
            </GenreTagList>
          )}
        </ContentSection>

        <FlagsContainer>
          <ReleaseBadge>New Music</ReleaseBadge>
        </FlagsContainer>
      </Card>
    </CardLink>
  );
};

// STYLES

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
  gap: ${theme.spacing.xxs};

  &:hover {
    border-color: ${theme.colors.black};
  }
`;

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

const ContentSection = styled.div`
  padding: ${theme.spacing.md} ${theme.spacing.md} ${theme.spacing.md} ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  min-width: 0;
  flex: 1;
  height: 100%;
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

const TypeDate = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: clamp(0.6rem, 1vw, 0.75rem);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.5);

  span {
    color: rgba(0, 0, 0, 0.4);
  }
`;

const ArtistName = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: clamp(1rem, 1.6vw, 1.25rem);
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.91px;
  color: ${theme.colors.black};
  opacity: 0.8;
  margin-bottom: 2px;
  text-shadow:
    0 1px 3px rgba(0, 0, 0, 0),
    0 2px 6px rgba(0, 0, 0, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.04);
  word-break: break-word;
  overflow-wrap: anywhere;
  hyphens: none;
  min-width: 0;
  overflow: hidden;
  white-space: normal;

  ${mediaQuery.mobile} {
    font-size: clamp(0.95rem, 3vw, 1.1rem);
  }
`;

const ReleaseTitle = styled.h2.withConfig({
  shouldForwardProp: (prop) => prop !== '$isLong'
})`
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: clamp(1.2rem, 2.5vw, 2.6rem);
  font-weight: ${theme.fontWeights.bold};
  line-height: 1.05;
  letter-spacing: -0.991px;
  color: ${theme.colors.black};
  margin: 2px 0 14px 0;
  word-break: break-word;
  overflow-wrap: anywhere;
  hyphens: auto;
  max-width: 100%;
  display: block;
  padding-bottom: 2px;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  ${mediaQuery.tablet} {
    font-size: clamp(1.05rem, 3.6vw, 2rem);
    font-weight: ${theme.fontWeights.black};
    margin: 1px 0 10px 0;
    letter-spacing: -0.98px;
  }

  ${mediaQuery.mobile} {
    font-size: clamp(1rem, 4vw, 1.5rem);
    font-weight: ${theme.fontWeights.black};
    margin-right: 0;
    max-width: 100%;

    ${props => props.$isLong && `
      font-size: clamp(0.95rem, 3.5vw, 1.25rem);
    `}
  }
`;

const GenreTagList = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  margin-bottom: 1px;
  align-items: baseline;
`;

const GenreTag = styled.span.withConfig({
  shouldForwardProp: (prop) => prop !== '$color'
})`
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
    font-size: clamp(0.5rem, 1.2vw, 1rem);
    padding: 2px 4px;
    opacity: 0.9;
  }
`;

const FlagsContainer = styled.div`
  position: absolute;
  top: 0;
  right: calc(${theme.spacing.xl} + calc(${theme.spacing.md} * 0.8));
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
    right: ${theme.spacing.sm};
    top: 0;
  }
`;

const ReleaseBadge = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: 14.5px;
  font-weight: ${theme.fontWeights.bold};
  text-transform: capitalize;
  letter-spacing: -0.9px;
  border-left: ${theme.borders.solidThin} ${theme.colors.black};
  border-right: ${theme.borders.solidThin} ${theme.colors.black};
  border-bottom: ${theme.borders.solidThin} ${theme.colors.black};
  border-top: none;
  text-align: center;
  padding: 10px 8px 10px 8px;
  pointer-events: auto;
  text-shadow: 0 1px 2px rgba(153, 150, 150, 0.4);
  white-space: nowrap;
  line-height: 1;
  background: #b11717;
  color: ${theme.colors.fpwhite};
  position: relative;
  transition: padding ${theme.transitions.fast};

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

  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.64),
    0 2px 6px rgba(27, 27, 29, 0.08),
    0 1px 3px rgba(108, 108, 119, 0.67);

  

  ${mediaQuery.mobile} {
    font-size: 9.3px;
    font-weight: ${theme.fontWeights.bold};
    letter-spacing: -0.3px;
  padding: 10px 8px 10px 8px;
    text-align: center;

  }
`;

export default FeedReleaseCard;
