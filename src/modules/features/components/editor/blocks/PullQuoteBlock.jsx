/**
 * PullQuoteBlock Component
 *
 * Inline editable pull quote block with attribution and alignment toggle.
 */

import React, { useRef, useEffect } from 'react';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { typography } from '../../../styles/featureStyles.js';

const PullQuoteBlock = ({ block, onUpdate, onDelete }) => {
  const quoteRef = useRef(null);
  const attributionRef = useRef(null);
  const alignment = block.alignment || 'left';

  // Auto-resize textareas
  useEffect(() => {
    if (quoteRef.current) {
      quoteRef.current.style.height = 'auto';
      quoteRef.current.style.height = `${quoteRef.current.scrollHeight}px`;
    }
  }, [block.content]);

  useEffect(() => {
    if (attributionRef.current) {
      attributionRef.current.style.height = 'auto';
      attributionRef.current.style.height = `${attributionRef.current.scrollHeight}px`;
    }
  }, [block.attribution]);

  const handleQuoteChange = (e) => {
    onUpdate(block.id, { content: e.target.value });
  };

  const handleAttributionChange = (e) => {
    onUpdate(block.id, { attribution: e.target.value });
  };

  const handleAlignmentChange = (newAlignment) => {
    onUpdate(block.id, { alignment: newAlignment });
  };

  return (
    <Container $alignment={alignment} $inline={Boolean(block.inline)}>
      <ControlsRow>
        <AlignmentToggle>
          <AlignButton
            $active={alignment === 'left'}
            onClick={() => handleAlignmentChange('left')}
            title="Align left"
          >
            L
          </AlignButton>
          <AlignButton
            $active={alignment === 'right'}
            onClick={() => handleAlignmentChange('right')}
            title="Align right"
          >
            R
          </AlignButton>
        </AlignmentToggle>
        <DeleteButton onClick={() => onDelete(block.id)} title="Delete block">
          x
        </DeleteButton>
      </ControlsRow>
      {block.inline && (
        <InlineWrapTag>
          Inline quote
        </InlineWrapTag>
      )}
      <QuoteTextarea
        ref={quoteRef}
        $alignment={alignment}
        value={block.content || ''}
        onChange={handleQuoteChange}
        placeholder="Quote text..."
        rows={2}
      />
      <AttributionInput
        ref={attributionRef}
        $alignment={alignment}
        value={block.attribution || ''}
        onChange={handleAttributionChange}
        placeholder="Attribution (optional)"
        rows={1}
      />
    </Container>
  );
};

const Container = styled.div`
  position: relative;
  padding: 12px 0;
  ${({ $inline, $alignment }) => $inline && `
    float: ${$alignment === 'right' ? 'right' : 'left'};
    width: 40%;
    margin: 4px ${$alignment === 'right' ? '0 10px 12px' : '10px 12px 0'};
    border: 1px dashed rgba(0, 0, 0, 0.22);
    background: rgba(255, 255, 255, 0.5);
    padding: 8px 8px 10px;
  `}

  ${mediaQuery.mobile} {
    ${({ $inline }) => $inline && `
      float: none;
      width: 100%;
      margin: 8px 0 12px;
      padding: 8px 8px 10px;
    `}
  }

  &:hover > div {
    opacity: 1;
  }
`;

const InlineWrapTag = styled.span`
  display: inline-block;
  margin-bottom: 6px;
  padding: 2px 6px;
  border: 1px solid rgba(0, 0, 0, 0.16);
  background: rgba(255, 255, 255, 0.72);
  font-family: ${theme.fonts.mono};
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.62);
`;

const ControlsRow = styled.div`
  position: absolute;
  top: 12px;
  right: -32px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity ${theme.transitions.fast};
`;

const AlignmentToggle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const AlignButton = styled.button`
  width: 24px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ $active }) => $active ? theme.colors.black : 'transparent'};
  border: 1px solid ${({ $active }) => $active ? theme.colors.black : 'rgba(0, 0, 0, 0.3)'};
  color: ${({ $active }) => $active ? theme.colors.fpwhite : 'rgba(0, 0, 0, 0.5)'};
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.black};
    color: ${theme.colors.fpwhite};
    border-color: ${theme.colors.black};
  }
`;

const DeleteButton = styled.button`
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid ${theme.colors.danger};
  color: ${theme.colors.danger};
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.danger};
    color: ${theme.colors.fpwhite};
  }
`;

const QuoteTextarea = styled.textarea`
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  text-align: ${({ $alignment }) => $alignment || 'left'};

  font-family: ${typography.pullQuote.fontFamily};
  font-weight: ${typography.pullQuote.fontWeight};
  font-style: ${typography.pullQuote.fontStyle};
  font-size: ${typography.pullQuote.fontSize};
  line-height: ${typography.pullQuote.lineHeight};
  color: ${theme.colors.black};

  &::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }

  &:focus {
    background: rgba(0, 0, 0, 0.02);
  }
`;

const AttributionInput = styled.textarea`
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  text-align: ${({ $alignment }) => $alignment || 'left'};
  margin-top: 6px;

  font-family: ${typography.quoteAttribution.fontFamily};
  font-weight: ${typography.quoteAttribution.fontWeight};
  font-size: ${typography.quoteAttribution.fontSize};
  line-height: ${typography.quoteAttribution.lineHeight};
  color: rgba(0, 0, 0, 0.7);

  &::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }

  &:focus {
    background: rgba(0, 0, 0, 0.02);
  }
`;

export default PullQuoteBlock;
