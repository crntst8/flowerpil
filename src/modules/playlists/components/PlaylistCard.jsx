import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { getImageUrl, formatDate } from '../services/playlistService';
import CuratorTypeDisplay from '@shared/components/CuratorTypeDisplay';
import { parseGenreTags } from '@shared/utils/genreUtils';
import ResponsiveImage from '@shared/components/ResponsiveImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';
import { IMAGE_SIZES } from '@shared/utils/imageUtils';

const PlaylistCard = ({ playlist, showCurator = true, genreLookup }) => {
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
      const color = match?.color || '#8a8a8a';
      const key = (match?.id || label || tag).toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);
      return { id: key, label, color };
    }).filter(Boolean);
  }, [genreLookup, tags]);

  // Use the image URL directly - ResponsiveImage will handle size variants
  const imageUrl = playlist.image;

  return (
    <CardLink to={`/playlists/${playlist.id}`}>
      <Card>
        <ImageSection>
          <StyledImageContainer>
            {imageUrl ? (
              <ResponsiveImage
                src={imageUrl}
                alt={playlist.title}
                sizes={IMAGE_SIZES.CARD_SMALL}
                loading="lazy"
                placeholder="NO IMAGE"
                fallback={playlist.image} // Fallback to original if size variants don't exist
              />
            ) : (
              <PlaceholderArtwork
                itemId={playlist.id}
                size="small"
                borderRadius="0"
              />
            )}
          </StyledImageContainer>
        </ImageSection>
        
        <CardContent>
          <div>
            <PlaylistTitle>{playlist.title}</PlaylistTitle>
            {showCurator && (
              <CuratorInfo>
                <CuratorName>{playlist.curator_name}</CuratorName>
                <StyledCuratorTypeDisplay
                  type={playlist.curator_type}
                  prefix="/ "
                  uppercase={true}
                  fallback="CURATOR"
                />
              </CuratorInfo>
            )}
          </div>

          <GenreTagList>
            {resolvedTags.slice(0, 3).map(tag => (
              <GenreTag key={tag.id} $color={tag.color}>
                {tag.label.toUpperCase()}
              </GenreTag>
            ))}
            {resolvedTags.length > 3 && (
              <GenreTag $color="#8a8a8a">
                +{resolvedTags.length - 3}
              </GenreTag>
            )}
          </GenreTagList>
        </CardContent>
      </Card>
    </CardLink>
  );
};

// Styled Components
const CardLink = styled(Link)`
  text-decoration: none;
  color: inherit;
  display: block;
  transition: all ${theme.transitions.normal};
`;

const Card = styled.article`
  position: relative;
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  overflow: hidden;
  transition: all ${theme.transitions.fast};
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr auto;
  height: 150px;

  /* Subtle shadow effects for slickness */
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  border-radius: 4px;

  &:hover {
    border-color: rgba(95, 93, 93, 1);
    background: rgba(222, 222, 222, 0.5);
    transform: translateY(-2px);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.2);
  }

  @media (min-width: 768px) {
    height: 140px;
  }

  @media (min-width: 1200px) {
    height: 150px;
  }

  ${mediaQuery.mobile} {
    height: 130px;
  }
`;

const ImageSection = styled.div`
  grid-row: 1 / -1;
  grid-column: 1;
  background: rgba(0, 0, 0, 0.02);
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.md};

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs};
  }
`;

const StyledImageContainer = styled.div`
  position: relative;
  width: 100px;
  height: 100px;
  overflow: hidden;
  flex-shrink: 0;

  @media (min-width: 768px) {
    width: 90px;
    height: 90px;
  }

  @media (min-width: 1200px) {
    width: 100px;
    height: 100px;
  }

  @media (min-width: 1600px) {
    width: 110px;
    height: 110px;
  }

  ${mediaQuery.mobile} {
    width: 80px;
    height: 80px;
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

  ${Card}:hover & img {
    transform: scale(1.05);
  }
`;

const CardContent = styled.div`
  grid-column: 2;
  grid-row: 1 / -1;
  padding: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
  margin-top: 1em;
  
  overflow: hidden;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs} ${theme.spacing.xs};
  }
`;

const CuratorInfo = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  font-family: ${theme.fonts.primary};
  font-size: clamp(0.6rem, 1.2vw, 0.8rem);
  font-weight: ${theme.fontWeights.medium};
  text-transform: none;
  letter-spacing: -0.5px;
  word-break: keep-all;
  hyphens: none;
  min-width: 0;
  white-space: nowrap;
  opacity: 0.7;
  margin-bottom: ${theme.spacing.xs};
`;

const CuratorName = styled.span`
  color: ${theme.colors.black};
  font-weight: ${theme.fontWeights.bold};
  flex-shrink: 1;
  min-width: 0;
    font-size: clamp(0.8rem, 0.9vw, 0.65rem);

  white-space: nowrap;
`;

const CuratorType = styled.span`
  color: ${theme.colors.black};
  opacity: 0.7;
  white-space: nowrap;
  font-size: clamp(0.45rem, 0.9vw, 0.65rem);

  ${mediaQuery.mobile} {
    font-size: clamp(0.4rem, 0.7vw, 0.55rem);
  }
`;

// Apply the same styling to CuratorTypeDisplay component
const StyledCuratorTypeDisplay = styled(CuratorTypeDisplay)`
  color: ${theme.colors.black};
  opacity: 0.7;
  white-space: nowrap;
  font-size: clamp(0.8rem, 0.9vw, 0.65rem);

  ${mediaQuery.mobile} {
  font-size: clamp(0.8rem, 0.9vw, 0.65rem);
  }
`;

const PlaylistTitle = styled.h2`
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: clamp(1.3rem, 1.5vw, 1rem);
  font-weight: ${theme.fontWeights.bold};
  text-transform: none;
  letter-spacing: -0.9px;
  color: ${theme.colors.black};
  margin: 1em 0 ${theme.spacing.xs} 0;
  word-break: keep-all;
  overflow-wrap: break-word;
  hyphens: none;


  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;

  ${mediaQuery.mobile} {
    font-size: clamp(1rem, 1.7vw, 1rem);
    -webkit-line-clamp: 2;
  }
`;

const GenreTagList = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  margin: 0;
  padding: ${theme.spacing.xs} 0 0;
  min-height: 4em;
  align-items: flex-start;
`;

const GenreTag = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$color' })`
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border: 1px solid ${props => props.$color};
  color: black;
  font-family: ${theme.fonts.primary};
  font-size: clamp(0.5rem, 1.1vw, 0.6rem);
  letter-spacing: 0.05em;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  border-radius: 0;
  background: ${theme.colors.fpwhite};
  white-space: nowrap;
`;

const FlagsOverlay = styled.div`
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 1;
`;

const FlagButton = styled.button.withConfig({ shouldForwardProp: (prop) => !['$bgColor', '$textColor'].includes(prop) })`
  font-family: ${theme.fonts.primary};
  font-size: 7px;
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 2px 2px;
  border-radius: 1px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  max-width: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.1;
  background-color: ${(p) => p.$bgColor || '#666'};
  color: ${(p) => p.$textColor || '#ffffff'};
  border: none;
  cursor: pointer;
  transition: opacity ${theme.transitions.fast};

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:focus-visible {
    outline: 1px solid ${theme.colors.black};
    outline-offset: 2px;
  }

  &:disabled {
    cursor: default;
    opacity: 0.7;
  }
  
  @media (min-width: 768px) {
    font-size: 8px;
    padding: 2px 2px;
    max-width: 50px;
  }
  
  @media (min-width: 1200px) {
    font-size: 9px;
    padding: 2px 4px;
    max-width: 60px;
  }
  
  ${mediaQuery.mobile} {
    font-size: 6px;
    padding: 5px 5px;
    max-width: 35px;
  }
`;

export default PlaylistCard;
