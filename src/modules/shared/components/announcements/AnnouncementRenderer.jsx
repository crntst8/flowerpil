import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import {
  HeadingBlock,
  ParagraphBlock,
  ButtonBlock,
  ButtonGroupBlock,
  IconGridBlock,
  FlowDiagramBlock,
  InfoBoxBlock,
  DividerBlock,
  SpacerBlock,
  ImageBlock,
} from './blocks';

const blockComponentMap = {
  heading: HeadingBlock,
  paragraph: ParagraphBlock,
  button: ButtonBlock,
  button_group: ButtonGroupBlock,
  icon_grid: IconGridBlock,
  flow_diagram: FlowDiagramBlock,
  info_box: InfoBoxBlock,
  divider: DividerBlock,
  spacer: SpacerBlock,
  image: ImageBlock,
};

// Check visibility based on breakpoint
function isVisibleAtBreakpoint(visible, breakpoint) {
  if (!visible) return true; // Default to visible
  if (typeof visible === 'boolean') return visible;
  return visible[breakpoint] !== false;
}

export default function AnnouncementRenderer({ blocks = [], onAction, breakpoint = 'desktop' }) {
  return (
    <BlockContainer>
      {blocks.map((block, index) => {
        // Check visibility for current breakpoint
        if (!isVisibleAtBreakpoint(block.visible, breakpoint)) {
          return null;
        }

        const BlockComponent = blockComponentMap[block.type];

        if (!BlockComponent) {
          console.warn(`Unknown block type: ${block.type}`);
          return null;
        }

        // Extract per-block styling
        const blockStyle = block.style || {};
        const wrapperStyle = {};
        if (blockStyle.backgroundColor) {
          wrapperStyle.backgroundColor = blockStyle.backgroundColor;
        }

        // Merge textColor into block for components that support $color prop
        const blockWithStyle = blockStyle.textColor
          ? { ...block, color: blockStyle.textColor }
          : block;

        return (
          <BlockWrapper
            key={block.id || index}
            style={Object.keys(wrapperStyle).length > 0 ? wrapperStyle : undefined}
          >
            <BlockComponent block={blockWithStyle} onAction={onAction} />
          </BlockWrapper>
        );
      })}
    </BlockContainer>
  );
}

const BlockContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const BlockWrapper = styled.div`
  /* Wrapper for per-block styling */
  padding: ${theme.spacing.xs};
  border-radius: 4px;
`;
