import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
import PropTypes from 'prop-types';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ResponsiveImage from '@shared/components/ResponsiveImage';
import { IMAGE_SIZES } from '@shared/utils/imageUtils';
import { getImageUrl, formatDate } from '../services/featurePiecesService.js';

const FeaturePieceFeedCard = ({ piece }) => {
  const navigate = useNavigate();
  if (!piece) return null;

  const imageUrl = piece.hero_image ? getImageUrl(piece.hero_image, 'medium') : null;
  const dateLabel = piece.metadata_date
    ? formatDate(piece.metadata_date, 'short')
    : formatDate(piece.published_at || piece.created_at, 'short');

  return (
    <CardLink to={`/features/${piece.slug}`}>
      <Card>
        {imageUrl && (
          <ImageSection>
            <ImageWrap>
              <ResponsiveImage
                src={imageUrl}
                alt={piece.title}
                sizes={IMAGE_SIZES.CARD_MEDIUM}
                loading="lazy"
              />
            </ImageWrap>
          </ImageSection>
        )}
        <ContentSection $hasImage={Boolean(imageUrl)}>
          <MetaDate>{dateLabel}</MetaDate>
          <MetaAttribution>{piece.author_name || piece.curator_name || 'Flowerpil'}</MetaAttribution>
          <Title>{piece.title}</Title>
          {(piece.excerpt || piece.subtitle) && (
            <Excerpt>{piece.excerpt || piece.subtitle}</Excerpt>
          )}
        </ContentSection>

        {Array.isArray(piece?.flags) && piece.flags.length > 0 && (
          <FlagsContainer>
            {piece.flags.map((flag) => {
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

export default FeaturePieceFeedCard;

FeaturePieceFeedCard.propTypes = {
  piece: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    slug: PropTypes.string,
    title: PropTypes.string,
    subtitle: PropTypes.string,
    excerpt: PropTypes.string,
    hero_image: PropTypes.string,
    metadata_date: PropTypes.string,
    published_at: PropTypes.string,
    created_at: PropTypes.string,
    author_name: PropTypes.string,
    curator_name: PropTypes.string,
    flags: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      text: PropTypes.string,
      color: PropTypes.string,
      text_color: PropTypes.string,
      url_slug: PropTypes.string
    }))
  })
};

const CardLink = styled(Link)`
  display: block;
  text-decoration: none;
  color: inherit;
`;

const Card = styled.article`
  position: relative;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  overflow: visible;
`;

const ImageSection = styled.div`
  flex-shrink: 0;
  padding: ${theme.spacing.md};

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
  }
`;

const ImageWrap = styled.div`
  width: 150px;
  height: 150px;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  overflow: hidden;

  ${mediaQuery.mobile} {
    width: 120px;
    height: 120px;
  }
`;

const ContentSection = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$hasImage'
})`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
  padding: ${theme.spacing.md} ${theme.spacing.lg} ${theme.spacing.md} ${({ $hasImage }) => ($hasImage ? theme.spacing.sm : theme.spacing.lg)};
`;

const MetaDate = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
`;

const MetaAttribution = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: -0.4px;
`;

const Title = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.6rem, 3.2vw, ${theme.fontSizes.h3});
  line-height: 1.1;
  letter-spacing: -0.03em;
`;

const Excerpt = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  line-height: 1.5;
  color: rgba(0, 0, 0, 0.72);
`;

const FlagsContainer = styled.div`
  position: absolute;
  top: 0;
  right: ${theme.spacing.md};
  display: flex;
  gap: ${theme.spacing.xs};
  z-index: 4;
  pointer-events: none;
`;

const FlagButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['$bgColor', '$textColor'].includes(prop)
})`
  pointer-events: auto;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${({ $bgColor }) => $bgColor || theme.colors.black};
  color: ${({ $textColor }) => $textColor || theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 8px;
  cursor: pointer;
`;
