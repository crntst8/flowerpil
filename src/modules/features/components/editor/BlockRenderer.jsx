/**
 * BlockRenderer Component
 *
 * Renders the appropriate editor block component based on block type.
 */

import React from 'react';
import SectionHeadingBlock from './blocks/SectionHeadingBlock.jsx';
import BodyBlock from './blocks/BodyBlock.jsx';
import PullQuoteBlock from './blocks/PullQuoteBlock.jsx';
import ImageBlock from './blocks/ImageBlock.jsx';
import DividerBlock from './blocks/DividerBlock.jsx';

const BlockRenderer = ({ block, onUpdate, onDelete, onInsertInlineQuote, inlineWrapAlignment = null }) => {
  switch (block.type) {
    case 'section_heading':
      return (
        <SectionHeadingBlock
          block={block}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      );

    case 'body':
      return (
        <BodyBlock
          block={block}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onInsertInlineQuote={onInsertInlineQuote}
          inlineWrapAlignment={inlineWrapAlignment}
        />
      );

    case 'pull_quote':
      return (
        <PullQuoteBlock
          block={block}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      );

    case 'image':
      return (
        <ImageBlock
          block={block}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      );

    case 'divider':
      return (
        <DividerBlock
          block={block}
          onDelete={onDelete}
        />
      );

    default:
      console.warn('Unknown block type:', block.type);
      return null;
  }
};

export default BlockRenderer;
