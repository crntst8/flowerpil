/**
 * EditorToolbar Component
 *
 * Toolbar with tabs for adding different block types.
 * Tabs: Header | Body | Quote | Line | Image
 */

import React from 'react';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';

const BLOCK_TYPES = [
  { type: 'section_heading', label: 'Header' },
  { type: 'body', label: 'Body' },
  { type: 'pull_quote', label: 'Quote' },
  { type: 'divider', label: 'Line' },
  { type: 'image', label: 'Image' }
];

const EditorToolbar = ({ onAddBlock }) => {
  return (
    <ToolbarContainer>
      <ToolbarInner>
        {BLOCK_TYPES.map(({ type, label }) => (
          <ToolbarTab
            key={type}
            onClick={() => onAddBlock(type)}
            title={`Add ${label.toLowerCase()} block`}
          >
            {label}
          </ToolbarTab>
        ))}
      </ToolbarInner>
    </ToolbarContainer>
  );
};

const ToolbarContainer = styled.div`
  position: sticky;
  top: 80px;
  z-index: 50;
  background: ${theme.colors.fpwhite};
  border-bottom: 1px solid ${theme.colors.black};
  padding: 0 20px;

  ${mediaQuery.mobile} {
    top: 60px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

const ToolbarInner = styled.div`
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  gap: 0;

  ${mediaQuery.mobile} {
    min-width: max-content;
  }
`;

const ToolbarTab = styled.button`
  padding: 16px 24px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  white-space: nowrap;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    border-bottom-color: ${theme.colors.black};
  }

  &:active {
    background: rgba(0, 0, 0, 0.1);
  }

  ${mediaQuery.mobile} {
    padding: 14px 16px;
  }
`;

export default EditorToolbar;
