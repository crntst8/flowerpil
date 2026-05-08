import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '../styles/GlobalStyles';
import LazyImage from './LazyImage';
import PlaceholderArtwork from './PlaceholderArtwork';
import { formatDateForDisplay } from '../../utils/curatorValidation';

/**
 * Release card component for curator profiles.
 *
 * @param {Object} props
 * @param {Object} props.release - Release data
 * @param {function} props.onInfoClick - Optional info click handler
 */
const ReleaseCard = ({ release, onInfoClick }) => {
  if (!release) return null;

  const releaseDate = formatDateForDisplay(release.release_date || release.post_date, false);
  const releaseType = release.release_type ? String(release.release_type).toUpperCase() : null;
  const isPublished = release.is_published === 1 || release.is_published === true;

  const handleInfoClick = (event) => {
    if (!onInfoClick) return;
    event.preventDefault();
    event.stopPropagation();
    onInfoClick(release);
  };

  return (
    <CardLink to={`/r/${release.id}`}>
      <Card>
        <ImageSection>
          <ImageFrame>
            {release.artwork_url ? (
              <LazyImage
                src={release.artwork_url}
                alt={`${release.title} artwork`}
              />
            ) : (
              <PlaceholderArtwork
                itemId={release.id}
                size="small"
                borderRadius="2px"
              />
            )}
          </ImageFrame>
        </ImageSection>

        <CardContent>
          <ReleaseTitle>{release.title}</ReleaseTitle>
          <ReleaseArtist>{release.artist_name}</ReleaseArtist>
          <ReleaseMeta>
            {releaseDate && <MetaTag>{releaseDate}</MetaTag>}
            {releaseType && <MetaTag>{releaseType}</MetaTag>}
          </ReleaseMeta>
        </CardContent>

        <CardFooter>
          {!isPublished && <StatusBadge>PRIVATE</StatusBadge>}
          {onInfoClick && (
            <InfoButton type="button" onClick={handleInfoClick}>
              INFO
            </InfoButton>
          )}
        </CardFooter>
      </Card>
    </CardLink>
  );
};

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
  border-radius: 4px;
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  min-height: 160px;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.15);
  transition: all ${theme.transitions.fast};

  &:hover {
    border-color: rgba(95, 93, 93, 1);
    background: rgba(222, 222, 222, 0.5);
    transform: translateY(-2px);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.15),
      0 8px 32px rgba(0, 0, 0, 0.08),
      0 2px 4px rgba(0, 0, 0, 0.2);
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 110px 1fr;
    min-height: 140px;
  }
`;

const ImageSection = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ImageFrame = styled.div`
  width: 120px;
  height: 120px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.02);
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 90px;
    height: 90px;
  }
`;

const CardContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: ${theme.spacing.xs};
`;

const ReleaseTitle = styled.h3`
  margin: 0;
  font-size: ${theme.fontSizes.h3};
  font-family: ${theme.fonts.primary};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: -0.02em;
`;

const ReleaseArtist = styled.div`
  font-size: ${theme.fontSizes.small};
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.black};
  opacity: 0.8;
  text-transform: uppercase;
`;

const ReleaseMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
`;

const MetaTag = styled.span`
  padding: 2px 6px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  font-size: ${theme.fontSizes.tiny};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  opacity: 0.7;
`;

const CardFooter = styled.div`
  position: absolute;
  right: ${theme.spacing.md};
  bottom: ${theme.spacing.md};
  display: flex;
  gap: ${theme.spacing.xs};
  align-items: center;

  @media (max-width: ${theme.breakpoints.mobile}) {
    position: static;
    justify-content: flex-start;
  }
`;

const StatusBadge = styled.span`
  padding: 2px 6px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.3);
  font-size: ${theme.fontSizes.tiny};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  opacity: 0.7;
`;

const InfoButton = styled.button`
  padding: 4px 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.3);
  background: transparent;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  color: ${theme.colors.black};

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
`;

export default ReleaseCard;
