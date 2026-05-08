/**
 * SectionHeadingBlock Component
 *
 * Inline editable section heading block for the feature editor.
 */

import React, { useRef, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { typography } from '../../../styles/featureStyles.js';

const SectionHeadingBlock = ({ block, onUpdate, onDelete }) => {
  const inputRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [block.content]);

  const handleChange = (e) => {
    onUpdate(block.id, { content: e.target.value });
  };

  return (
    <Container>
      <DeleteButton onClick={() => onDelete(block.id)} title="Delete block">
        x
      </DeleteButton>
      <HeadingInput
        ref={inputRef}
        value={block.content || ''}
        onChange={handleChange}
        placeholder="Section heading..."
        rows={1}
      />
    </Container>
  );
};

const Container = styled.div`
  position: relative;
  padding: 8px 0;

  &:hover > button {
    opacity: 1;
  }
`;

const DeleteButton = styled.button`
  position: absolute;
  top: 8px;
  right: -32px;
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
  opacity: 0;
  transition: opacity ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.danger};
    color: ${theme.colors.fpwhite};
  }
`;

const HeadingInput = styled.textarea`
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;

  font-family: ${typography.sectionHeading.fontFamily};
  font-weight: ${typography.sectionHeading.fontWeight};
  font-size: ${typography.sectionHeading.fontSize};
  line-height: ${typography.sectionHeading.lineHeight};
  letter-spacing: ${typography.sectionHeading.letterSpacing};
  color: ${theme.colors.black};

  &::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }

  &:focus {
    background: rgba(0, 0, 0, 0.02);
  }
`;

export default SectionHeadingBlock;
