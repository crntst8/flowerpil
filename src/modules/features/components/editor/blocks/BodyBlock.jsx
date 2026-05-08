/**
 * BodyBlock Component
 *
 * Inline editable body text block for the feature editor.
 * Uses Lexical for rich text editing with live formatting.
 * Side "+" buttons insert inline pull quotes that float left/right.
 */

import React, { useCallback } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import RichTextEditor from '../RichTextEditor.jsx';

const BodyBlock = ({ block, onUpdate, onDelete, onInsertInlineQuote, inlineWrapAlignment = null }) => {
  const handleChange = useCallback((html) => {
    onUpdate(block.id, { content: html });
  }, [block.id, onUpdate]);

  return (
    <Container $inlineWrapAlignment={inlineWrapAlignment}>
      {onInsertInlineQuote && (
        <InlineQuoteButton
          $side="left"
          onClick={() => onInsertInlineQuote('left')}
          title="Insert inline quote (left)"
        >
          +
        </InlineQuoteButton>
      )}
      <RightControls>
        {onInsertInlineQuote && (
          <InlineQuoteButton
            $side="right"
            onClick={() => onInsertInlineQuote('right')}
            title="Insert inline quote (right)"
          >
            +
          </InlineQuoteButton>
        )}
        <DeleteButton onClick={() => onDelete(block.id)} title="Delete block">
          x
        </DeleteButton>
      </RightControls>
      {inlineWrapAlignment && (
        <InlineWrapHint>
          Wrapping with {inlineWrapAlignment} quote
        </InlineWrapHint>
      )}
      <RichTextEditor
        value={block.content || ''}
        onChange={handleChange}
        placeholder="Write your content here..."
      />
    </Container>
  );
};

const Container = styled.div`
  position: relative;
  padding: 4px 0;
  ${({ $inlineWrapAlignment }) => $inlineWrapAlignment && `
    padding: 8px 10px 10px;
    border: 1px dashed rgba(0, 0, 0, 0.22);
    background: rgba(255, 255, 255, 0.55);
    ${$inlineWrapAlignment === 'right'
      ? 'border-right: 2px solid rgba(0, 0, 0, 0.45);'
      : 'border-left: 2px solid rgba(0, 0, 0, 0.45);'}
  `}

  &:hover > button,
  &:hover > div {
    opacity: 1;
  }
`;

const InlineWrapHint = styled.span`
  display: inline-block;
  margin-bottom: 6px;
  padding: 2px 6px;
  border: 1px solid rgba(0, 0, 0, 0.16);
  background: rgba(255, 255, 255, 0.7);
  font-family: ${theme.fonts.mono};
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.62);
`;

const InlineQuoteButton = styled.button`
  position: absolute;
  top: 4px;
  ${({ $side }) => $side === 'left' ? 'left: -32px;' : ''}
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.25);
  color: rgba(0, 0, 0, 0.4);
  font-family: ${theme.fonts.mono};
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: all ${theme.transitions.fast};
  z-index: 1;

  &:hover {
    background: ${theme.colors.black};
    color: ${theme.colors.fpwhite};
    border-color: ${theme.colors.black};
  }
`;

const RightControls = styled.div`
  position: absolute;
  top: 4px;
  right: -32px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity ${theme.transitions.fast};
  z-index: 1;
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

export default BodyBlock;
