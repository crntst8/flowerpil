import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ResponsiveImage from '@shared/components/ResponsiveImage';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';
import { IMAGE_SIZES } from '@shared/utils/imageUtils';

/**
 * Compact playlist card for end-scroll section
 * Vertical layout with square image on top, minimal info below
 */
const CompactPlaylistCard = ({ playlist }) => {
  if (!playlist) return null;

  const imageUrl = playlist.image_url_medium || playlist.image_url_large || playlist.image;

  return (
    <CardLink to={`/playlists/${playlist.id}`}>
      <Card>
        <ImageContainer>
          {imageUrl ? (
            <ResponsiveImage
              src={imageUrl}
              alt={playlist.title}
              sizes={IMAGE_SIZES.CARD_MEDIUM}
              loading="lazy"
              placeholder="NO IMAGE"
              fallback={playlist.image}
            />
          ) : (
            <PlaceholderArtwork
              itemId={playlist.id}
              size="small"
              borderRadius="0"
            />
          )}
        </ImageContainer>

        <CardContent>
          <PlaylistTitle>{playlist.title}</PlaylistTitle>

          {playlist.curator_name && (
            <CuratorName>{playlist.curator_name}</CuratorName>
          )}

          {playlist.flags && playlist.flags.length > 0 && (
            <FlagsContainer>
              {playlist.flags.slice(0, 2).map((flag) => (
                <Flag
                  key={flag.id}
                  $bgColor={flag.color}
                  $textColor={flag.text_color}
                >
                  {flag.text}
                </Flag>
              ))}
            </FlagsContainer>
          )}
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
  height: 100%;
  transition: all ${theme.transitions.normal};
`;

const Card = styled.article`
  position: relative;
  border: ${theme.borders.solid} ${theme.colors.black};
  overflow: hidden;
  transition: all ${theme.transitions.fast};
  display: flex;
  padding: 1em;
  flex-direction: row;
  align-items: center;
  border-radius: 2px;
  border: solid 1px black;
  gap: ${theme.spacing.sm};
  min-height: 112px;
  height: 100%;

  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.5),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(2px);

  &::after {
    content: '';
    position: absolute;
    inset: 6px;
    border-radius: 2px;
    opacity: 0.85;
    pointer-events: none;
    transition: opacity ${theme.transitions.fast};
  }

  &:hover {
    border-color: rgba(95, 93, 93, 1);
    transform: translateY(-2px);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.2);
    &::after {
      opacity: 1;
    }
  }
`;

const ImageContainer = styled.div`
  position: relative;
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.02);
  overflow: hidden;
  margin-left: 1em;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const CardContent = styled.div`
  padding: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  flex: 1;
  min-width: 0;
  justify-content: center;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs};
  }
`;

const PlaylistTitle = styled.h3`
  font-size: 13px;
  font-weight: 600;
  color: ${theme.colors.black};
  margin: 0;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  text-wrap: balance;

  ${mediaQuery.mobile} {
    font-size: 12px;
    -webkit-line-clamp: 2;
  }
`;

const CuratorName = styled.p`
  font-size: 11px;
  color: ${theme.colors.darkgrey};
  margin: 0;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;

  ${mediaQuery.mobile} {
    font-size: 10px;
  }
`;

const FlagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
`;

const Flag = styled.span`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-radius: 2px;
  background-color: ${props => props.$bgColor || theme.colors.black};
  color: ${props => props.$textColor || theme.colors.white};
  white-space: nowrap;
`;

export default CompactPlaylistCard;
