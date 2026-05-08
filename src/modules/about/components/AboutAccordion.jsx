import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import DOMPurify from 'isomorphic-dompurify';
import DSPFlowAnimation from './DSPFlowAnimation';

const AccordionWrapper = styled.div`
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  border-top: 1px solid ${theme.colors.black};
`;

const AccordionItem = styled.div`
  border-bottom: 1px solid ${theme.colors.black};
  background: ${theme.colors.white};
  overflow: hidden;
`;

const AccordionButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['isOpen'].includes(prop)
})`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: ${theme.spacing.lg} 0;
  background: transparent;
  border: none;
  cursor: pointer;
  margin-left: 1em;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  text-align: left;
  transition: all ${theme.transitions.fast};
  position: relative;


  &:hover {
    color: ${theme.colors.primary};
    padding-left: ${theme.spacing.xs};
  }

  &:focus {
    outline: none;
  }

  ${props => props.isOpen && `
    border-bottom: 1px solid rgba(0,0,0,0.05);
    box-shadow: 0 4px 12px -8px rgba(0,0,0,0.1);
  `}

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.md} 0;
    font-size: ${theme.fontSizes.hx};
  }
`;

const AccordionTitle = styled.h3`
  flex: 1;
  overflow-wrap: break-word;
  word-break: normal;
  padding-right: ${theme.spacing.md};
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.02em;

  
`;

const AccordionChevron = styled.span.withConfig({
  shouldForwardProp: (prop) => !['isOpen'].includes(prop)
})`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 12px;
  opacity: 0.5;
  transform: ${props => props.isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};
  transition: all ${theme.transitions.normal};
  flex-shrink: 0;
  color: ${theme.colors.black};
`;

const AccordionPanel = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isOpen'].includes(prop)
})`
  max-height: ${props => props.isOpen ? '5000px' : '0'};
  overflow: hidden;
  opacity: ${props => props.isOpen ? '1' : '0'};
  transition: max-height 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
  background: #f5f5f5;
`;

const AccordionContent = styled.div.withConfig({
  shouldForwardProp: (prop) => !['customSpacing', 'mediaPosition'].includes(prop)
})`
  padding: ${theme.spacing.xl} ${theme.spacing.md};
  padding-top: ${props => props.customSpacing?.paddingTop || theme.spacing.lg};
  padding-bottom: ${props => props.customSpacing?.paddingBottom || theme.spacing.xxl};
  padding-left: ${props => props.customSpacing?.paddingLeft || theme.spacing.md};
  padding-right: ${props => props.customSpacing?.paddingRight || theme.spacing.md};
  margin-left: 0;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  line-height: ${props => props.customSpacing?.lineHeight || '1'};
  text-align: left; /* Force left alignment */

  ${props => (props.mediaPosition === 'left' || props.mediaPosition === 'right') && `
    display: flex;
    flex-direction: ${props.mediaPosition === 'left' ? 'row' : 'row-reverse'};
    gap: ${theme.spacing.xl};
    align-items: flex-start;
  `}

  ${props => (props.mediaPosition === 'left' || props.mediaPosition === 'right') && mediaQuery.mobile} {
    flex-direction: column;
    gap: ${theme.spacing.lg};
  }

  ${mediaQuery.mobile} {
    padding-left: ${props => props.customSpacing?.paddingLeft || theme.spacing.sm};
    padding-right: ${props => props.customSpacing?.paddingRight || theme.spacing.sm};
  }

  * {
    font-family: ${theme.fonts.primary} !important;
  }

  p {
    margin: 0 0 ${theme.spacing.sm} 0;

    &:last-child {
      margin-bottom: 0;
    }
  }

  ul, ol {
    margin: 0 0 ${theme.spacing.md} 0;
    padding-left: ${theme.spacing.xl};

    &:last-child {
      margin-bottom: 0;
    }
  }

  li {
    margin-bottom: ${theme.spacing.sm};
  }

  h1, h2, h3 {
    margin: ${theme.spacing.sm} 0 ${theme.spacing.sm} 0;
    font-family: ${theme.fonts.primary} !important;
    font-weight: bold !important;

    &:first-child {
      margin-top: 0;
    }
  }

  h1 {
    font-size: ${theme.fontSizes.h1} !important;
  }

  h2 {
    font-size: ${theme.fontSizes.h2} !important;
  }

  h3 {
    font-size: ${theme.fontSizes.h3} !important;
  }

  a {
    color: ${theme.colors.fpblue};
    text-decoration: underline;
    font-family: ${theme.fonts.primary} !important;

    &:hover {
      color: ${theme.colors.hoverPrimary};
    }
  }

  strong, b {
    font-weight: 600 !important;
    font-family: ${theme.fonts.primary} !important;
  }

  em, i {
    font-style: italic;
    font-family: ${theme.fonts.primary} !important;
  }

  s, del {
    text-decoration: line-through;
    font-family: ${theme.fonts.primary} !important;
  }

  sub {
    vertical-align: sub;
    font-size: smaller;
  }

  sup {
    vertical-align: super;
    font-size: smaller;
  }

  mark {
    background-color: #fef08a;
    padding: 2px 4px;
    border-radius: 2px;
  }

  code {
    background: rgba(15, 23, 42, 0.08);
    color: #e74c3c;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ${theme.fonts.mono};
    font-size: 0.9em;
  }

  pre {
    background: rgba(15, 23, 42, 0.95);
    color: #f8f9fa;
    padding: ${theme.spacing.lg};
    border-radius: 8px;
    overflow-x: auto;
    margin: ${theme.spacing.lg} 0;

    code {
      background: none;
      color: inherit;
      padding: 0;
      font-size: 0.875em;
    }
  }

  blockquote {
    border-left: 4px solid ${theme.colors.fpblue};
    padding-left: ${theme.spacing.lg};
    margin: ${theme.spacing.lg} 0;
    font-style: italic;
    color: rgba(15, 23, 42, 0.8);
  }

  hr {
    border: none;
    border-top: 2px solid rgba(15, 23, 42, 0.1);
    margin: ${theme.spacing.xl} 0;
  }

  img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: ${theme.spacing.lg} 0;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: ${theme.spacing.lg} 0;
    overflow: hidden;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

    th, td {
      border: 1px solid rgba(15, 23, 42, 0.15);
      padding: 12px 16px;
      text-align: left;
    }

    th {
      background: rgba(15, 23, 42, 0.05);
      font-weight: 700;
      color: ${theme.colors.black};
    }

    tr:nth-child(even) {
      background: rgba(15, 23, 42, 0.02);
    }
  }

  /* Text alignment support */
  [style*="text-align: center"] {
    text-align: center;
  }

  [style*="text-align: right"] {
    text-align: right;
  }

  [style*="text-align: justify"] {
    text-align: justify;
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.md};
  }
`;

const MediaContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => !['mediaPosition', 'aspectRatio'].includes(prop)
})`
  width: ${props => (props.mediaPosition === 'left' || props.mediaPosition === 'right') ? '40%' : '100%'};
  min-width: ${props => (props.mediaPosition === 'left' || props.mediaPosition === 'right') ? '280px' : 'auto'};
  margin-bottom: ${props => props.mediaPosition === 'top' ? theme.spacing.xl : '0'};
  margin-top: ${props => props.mediaPosition === 'bottom' ? theme.spacing.xl : '0'};
  border-radius: 0;
  overflow: hidden;
  aspect-ratio: ${props => props.aspectRatio || 'auto'};
  border: 3px solid rgba(15, 23, 42, 0.1);
  box-shadow: none;

  ${mediaQuery.mobile} {
    width: 100%;
    min-width: auto;
    margin-bottom: ${props => (props.mediaPosition === 'top' || props.mediaPosition === 'left' || props.mediaPosition === 'right') ? theme.spacing.lg : '0'};
    margin-top: ${props => props.mediaPosition === 'bottom' ? theme.spacing.lg : '0'};
  }
`;

const MediaVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 0;
`;

const MediaImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 0;
`;

const TextContent = styled.div.withConfig({
  shouldForwardProp: (prop) => !['mediaPosition'].includes(prop)
})`
  flex: ${props => (props.mediaPosition === 'left' || props.mediaPosition === 'right') ? '1' : 'auto'};
  min-width: 0; /* Allow text to shrink */

  p {
    margin: 0 0 ${theme.spacing.md} 0;

    &:last-child {
      margin-bottom: 0;
    }
  }

  ul, ol {
    margin: 0 0 ${theme.spacing.md} 0;
    padding-left: ${theme.spacing.xl};

    &:last-child {
      margin-bottom: 0;
    }
  }

  li {
    margin-bottom: ${theme.spacing.sm};
  }

  h1, h2, h3 {
    margin: ${theme.spacing.lg} 0 ${theme.spacing.md} 0;
    font-family: ${theme.fonts.primary} !important;
    font-weight: bold !important;

    &:first-child {
      margin-top: 0;
    }
  }

  h1 {
    font-size: ${theme.fontSizes.h1} !important;
  }

  h2 {
    font-size: ${theme.fontSizes.h2} !important;
  }

  h3 {
    font-size: ${theme.fontSizes.h3} !important;
  }

  a {
    color: ${theme.colors.fpblue};
    text-decoration: underline;
    font-family: ${theme.fonts.primary} !important;

    &:hover {
      color: ${theme.colors.hoverPrimary};
    }
  }

  strong, b {
    font-weight: 600 !important;
    font-family: ${theme.fonts.primary} !important;
  }

  em, i {
    font-style: italic;
    font-family: ${theme.fonts.primary} !important;
  }
`;

/**
 * AboutAccordion component for the About page
 * Renders multiple accordion items with single-open mode (only one panel open at a time)
 *
 * @param {Object} props
 * @param {Array} props.items - Array of accordion items
 * @param {string} props.items[].id - Unique item ID
 * @param {string} props.items[].title - Item title
 * @param {string} props.items[].bodyHtml - Rich HTML content
 */
const AboutAccordion = ({ items = [] }) => {
  const [openItemId, setOpenItemId] = useState(null);

  const handleToggle = useCallback((itemId) => {
    setOpenItemId(prevId => {
      const newId = prevId === itemId ? null : itemId;

      // Scroll to accordion item on mobile after state update
      if (newId && window.innerWidth <= 768) {
        setTimeout(() => {
          const element = document.getElementById(`accordion-header-${itemId}`);
          if (element) {
            const headerOffset = 80; // Account for sticky header
            const elementPosition = element.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
              top: offsetPosition,
              behavior: 'smooth'
            });
          }
        }, 100); // Small delay to ensure accordion animation starts
      }

      return newId;
    });
  }, []);

  const handleKeyDown = useCallback((event, itemId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleToggle(itemId);
    }
  }, [handleToggle]);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <AccordionWrapper>
      {items.map((item, index) => {
        const isOpen = openItemId === item.id;
        const headerId = `accordion-header-${item.id}`;
        const panelId = `accordion-panel-${item.id}`;

        // Sanitize HTML content
        const sanitizedHtml = DOMPurify.sanitize(item.bodyHtml, {
          ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3',
            'span', 'div', 's', 'del', 'mark', 'sub', 'sup', 'code', 'pre',
            'blockquote', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
          ],
          ALLOWED_ATTR: [
            'href', 'target', 'rel', 'style', 'class', 'src', 'alt', 'width', 'height',
            'colspan', 'rowspan', 'align'
          ],
          ALLOW_DATA_ATTR: false
        });

        // Extract media and positioning data
        const hasMedia = item.mediaUrl && item.mediaType;
        const mediaPosition = item.mediaPosition || 'top';
        const mediaAspectRatio = item.mediaAspectRatio && item.mediaAspectRatio !== 'auto' ? item.mediaAspectRatio : null;

        // Prepare custom spacing
        const customSpacing = {
          paddingTop: item.paddingTop,
          paddingBottom: item.paddingBottom,
          paddingLeft: item.paddingLeft,
          paddingRight: item.paddingRight,
          lineHeight: item.lineHeight
        };

        // Helper to render media
        const renderMedia = () => {
          if (!hasMedia) return null;

          return (
            <MediaContainer mediaPosition={mediaPosition} aspectRatio={mediaAspectRatio}>
              {item.mediaType === 'video' ? (
                <MediaVideo
                  src={item.mediaUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster={item.mediaFallbackUrl}
                >
                  {item.mediaFallbackUrl && (
                    <source src={item.mediaFallbackUrl} type="image/jpeg" />
                  )}
                </MediaVideo>
              ) : (
                <MediaImage src={item.mediaUrl} alt={item.title} />
              )}
            </MediaContainer>
          );
        };

        return (
          <AccordionItem key={item.id}>
            <AccordionButton
              onClick={() => handleToggle(item.id)}
              onKeyDown={(e) => handleKeyDown(e, item.id)}
              isOpen={isOpen}
              aria-expanded={isOpen}
              aria-controls={panelId}
              id={headerId}
              type="button"
            >
              <AccordionTitle>{item.title}</AccordionTitle>
              <AccordionChevron isOpen={isOpen} aria-hidden="true">
                ▼
              </AccordionChevron>
            </AccordionButton>

            <AccordionPanel
              isOpen={isOpen}
              id={panelId}
              aria-labelledby={headerId}
              role="region"
            >
              <AccordionContent
                customSpacing={customSpacing}
                mediaPosition={hasMedia ? mediaPosition : null}
              >
                {/* DSP flow animation for the first accordion item */}
                {index === 0 && <DSPFlowAnimation isOpen={isOpen} />}

                {/* Render media at top */}
                {hasMedia && mediaPosition === 'top' && renderMedia()}

                {/* Render text content */}
                {(mediaPosition === 'left' || mediaPosition === 'right') ? (
                  <TextContent
                    mediaPosition={mediaPosition}
                    dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                  />
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                )}

                {/* Render media for left/right positioning (handled by flex order) */}
                {hasMedia && (mediaPosition === 'left' || mediaPosition === 'right') && renderMedia()}

                {/* Render media at bottom */}
                {hasMedia && mediaPosition === 'bottom' && renderMedia()}
              </AccordionContent>
            </AccordionPanel>
          </AccordionItem>
        );
      })}
    </AccordionWrapper>
  );
};

export default AboutAccordion;
