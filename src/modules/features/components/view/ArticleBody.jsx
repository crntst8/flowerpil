/**
 * ArticleBody Component
 *
 * Renders the content blocks of a feature piece with proper typography.
 * Supports: section_heading, body, pull_quote, image, divider
 * Supports float layouts for images and quotes via position/alignment props.
 */

import React from 'react';
import styled from 'styled-components';
import {
  ArticleContainer,
  SectionHeading,
  BodyText,
  PullQuoteContainer,
  PullQuoteText,
  PullQuoteAttribution,
  ImageContainer,
  ArticleImage,
  ImageCaption,
  Divider,
  typography,
  spacing
} from '../../styles/featureStyles.js';
import { mediaQuery } from '@shared/styles/GlobalStyles';
import { getImageUrl } from '../../services/featurePiecesService.js';

/**
 * Render a single content block based on its type
 */
const BlockRenderer = ({ block }) => {
  switch (block.type) {
    case 'section_heading':
      return (
        <SectionHeading key={block.id}>
          {block.content}
        </SectionHeading>
      );

    case 'body':
      // Content is now HTML from Lexical editor
      const content = block.content || '';
      // Check if content is HTML or plain text
      if (content.startsWith('<') && content.includes('</')) {
        return (
          <BodyContent
            key={block.id}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        );
      }
      // Fallback for legacy plain text content
      const paragraphs = content.split(/\n\n+/);
      return (
        <>
          {paragraphs.map((paragraph, idx) => (
            <BodyText key={`${block.id}-${idx}`}>
              {paragraph.split('\n').map((line, lineIdx) => (
                <React.Fragment key={lineIdx}>
                  {line}
                  {lineIdx < paragraph.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </BodyText>
          ))}
        </>
      );

    case 'pull_quote':
      return (
        <PullQuoteContainer
          key={block.id}
          $alignment={block.alignment || 'left'}
        >
          <PullQuoteText>{block.content}</PullQuoteText>
          {block.attribution && (
            <PullQuoteAttribution>{block.attribution}</PullQuoteAttribution>
          )}
        </PullQuoteContainer>
      );

    case 'image':
      const position = block.position || 'full';
      const imageSize = position === 'full' ? 'large' : 'medium';
      return (
        <ImageContainer key={block.id} $position={position}>
          <ArticleImage
            src={getImageUrl(block.url, imageSize)}
            alt={block.caption || 'Article image'}
            loading="lazy"
          />
          {block.caption && (
            <ImageCaption>{block.caption}</ImageCaption>
          )}
        </ImageContainer>
      );

    case 'divider':
      return <Divider key={block.id} />;

    default:
      console.warn('Unknown block type:', block.type);
      return null;
  }
};

const ArticleBody = ({ contentBlocks = [] }) => {
  if (!contentBlocks.length) {
    return null;
  }

  return (
    <ArticleContainer>
      {contentBlocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
      <ClearFloat />
    </ArticleContainer>
  );
};

const ClearFloat = styled.div`
  clear: both;
`;

// Styled container for HTML content from Lexical
const BodyContent = styled.div`
  font-family: ${typography.body.fontFamily};
  font-weight: ${typography.body.fontWeight};
  font-size: ${typography.body.fontSize};
  line-height: ${typography.body.lineHeight};
  letter-spacing: ${typography.body.letterSpacing};
  color: #000000;
  margin-bottom: ${spacing.blockGap.desktop};

  &:last-child {
    margin-bottom: 0;
  }

  ${mediaQuery.tablet} {
    margin-bottom: ${spacing.blockGap.tablet};
  }

  ${mediaQuery.mobile} {
    margin-bottom: ${spacing.blockGap.mobile};
  }

  p {
    margin: 0 0 1em 0;

    &:last-child {
      margin-bottom: 0;
    }
  }

  strong, b {
    font-weight: 600;
  }

  em, i {
    font-style: italic;
  }

  u {
    text-decoration: underline;
  }

  s, strike {
    text-decoration: line-through;
  }
`;

export default ArticleBody;
