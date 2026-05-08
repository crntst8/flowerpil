/**
 * HeroSection Component
 *
 * Displays the hero image, title, subtitle, and metadata for a feature piece.
 * Full-width hero image with centered text below.
 */

import React from 'react';
import {
  HeroContainer,
  HeroImage,
  HeroCaption,
  HeaderSection,
  ArticleContainer,
  PageTitle,
  Subtitle,
  Metadata
} from '../../styles/featureStyles.js';
import { getImageUrl, formatDate } from '../../services/featurePiecesService.js';

const HeroSection = ({
  heroImage,
  heroImageCaption,
  title,
  subtitle,
  metadataType,
  metadataDate
}) => {
  return (
    <>
      {heroImage && (
        <HeroContainer>
          <HeroImage
            src={getImageUrl(heroImage, 'original')}
            alt={title || 'Feature image'}
            loading="eager"
          />
          {heroImageCaption && (
            <HeroCaption>{heroImageCaption}</HeroCaption>
          )}
        </HeroContainer>
      )}

      <ArticleContainer>
        <HeaderSection>
          {title && <PageTitle>{title}</PageTitle>}
          {subtitle && <Subtitle>{subtitle}</Subtitle>}
          {(metadataType || metadataDate) && (
            <Metadata>
              {metadataType}
              {metadataType && metadataDate && ' / '}
              {metadataDate && formatDate(metadataDate, 'short')}
            </Metadata>
          )}
        </HeaderSection>
      </ArticleContainer>
    </>
  );
};

export default HeroSection;
