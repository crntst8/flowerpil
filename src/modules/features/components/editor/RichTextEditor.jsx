/**
 * RichTextEditor Component
 *
 * Lexical-based rich text editor with formatting toolbar.
 * Supports Bold, Italic, Underline, Strikethrough.
 */

import React, { useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { typography } from '../../styles/featureStyles.js';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  $createParagraphNode,
  $createTextNode,
  SELECTION_CHANGE_COMMAND
} from 'lexical';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';

// Theme for Lexical editor
const editorTheme = {
  paragraph: 'editor-paragraph',
  text: {
    bold: 'editor-bold',
    italic: 'editor-italic',
    underline: 'editor-underline',
    strikethrough: 'editor-strikethrough'
  }
};

// Error handler
function onError(error) {
  console.error('Lexical error:', error);
}

// Floating toolbar component
const FloatingToolbar = ({ containerRef }) => {
  const [editor] = useLexicalComposerContext();
  const [isVisible, setIsVisible] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const [activeFormats, setActiveFormats] = React.useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false
  });

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection) && !selection.isCollapsed()) {
      const nativeSelection = window.getSelection();
      if (nativeSelection && nativeSelection.rangeCount > 0) {
        const range = nativeSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = containerRef?.current?.getBoundingClientRect();

        if (containerRect) {
          // Position relative to container, not viewport
          setPosition({
            top: rect.top - containerRect.top - 45,
            left: rect.left - containerRect.left + rect.width / 2
          });
        }
        setIsVisible(true);

        setActiveFormats({
          bold: selection.hasFormat('bold'),
          italic: selection.hasFormat('italic'),
          underline: selection.hasFormat('underline'),
          strikethrough: selection.hasFormat('strikethrough')
        });
      }
    } else {
      setIsVisible(false);
    }
  }, [containerRef]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor, updateToolbar]);

  // Also update on mouseup for drag selections
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const handleMouseUp = () => {
      setTimeout(() => {
        editor.getEditorState().read(() => {
          updateToolbar();
        });
      }, 10);
    };

    container.addEventListener('mouseup', handleMouseUp);
    return () => container.removeEventListener('mouseup', handleMouseUp);
  }, [editor, updateToolbar, containerRef]);

  const formatText = (format) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    editor.focus();
  };

  if (!isVisible) return null;

  return (
    <Toolbar style={{ top: position.top, left: position.left }}>
      <FormatButton
        $active={activeFormats.bold}
        onMouseDown={(e) => { e.preventDefault(); formatText('bold'); }}
        title="Bold (Cmd+B)"
      >
        <strong>B</strong>
      </FormatButton>
      <FormatButton
        $active={activeFormats.italic}
        onMouseDown={(e) => { e.preventDefault(); formatText('italic'); }}
        title="Italic (Cmd+I)"
      >
        <em>I</em>
      </FormatButton>
      <FormatButton
        $active={activeFormats.underline}
        onMouseDown={(e) => { e.preventDefault(); formatText('underline'); }}
        title="Underline (Cmd+U)"
      >
        <span style={{ textDecoration: 'underline' }}>U</span>
      </FormatButton>
      <FormatButton
        $active={activeFormats.strikethrough}
        onMouseDown={(e) => { e.preventDefault(); formatText('strikethrough'); }}
        title="Strikethrough"
      >
        <span style={{ textDecoration: 'line-through' }}>S</span>
      </FormatButton>
    </Toolbar>
  );
};

// Plugin to sync content with parent
const SyncPlugin = ({ value, onChange }) => {
  const [editor] = useLexicalComposerContext();
  const isInternalChange = React.useRef(false);

  // Initialize editor with value
  useEffect(() => {
    if (value && !isInternalChange.current) {
      editor.update(() => {
        const root = $getRoot();

        // Check if content is HTML or plain text
        if (value.startsWith('<') && value.includes('</')) {
          // Parse HTML
          const parser = new DOMParser();
          const dom = parser.parseFromString(value, 'text/html');
          const nodes = $generateNodesFromDOM(editor, dom);
          root.clear();
          nodes.forEach(node => root.append(node));
        } else {
          // Plain text - split by newlines for paragraphs
          root.clear();
          const paragraphs = value.split('\n\n');
          paragraphs.forEach(text => {
            const paragraph = $createParagraphNode();
            // Handle single newlines within paragraphs
            const lines = text.split('\n');
            lines.forEach((line, idx) => {
              paragraph.append($createTextNode(line));
              if (idx < lines.length - 1) {
                paragraph.append($createTextNode('\n'));
              }
            });
            root.append(paragraph);
          });
        }
      });
    }
    isInternalChange.current = false;
  }, [editor, value]);

  // Handle changes
  const handleChange = useCallback((editorState) => {
    editorState.read(() => {
      isInternalChange.current = true;
      const html = $generateHtmlFromNodes(editor, null);
      onChange(html);
    });
  }, [editor, onChange]);

  return <OnChangePlugin onChange={handleChange} />;
};

// Main editor component
const RichTextEditor = ({ value, onChange, placeholder }) => {
  const containerRef = React.useRef(null);

  const initialConfig = {
    namespace: 'FeatureEditor',
    theme: editorTheme,
    onError,
    nodes: []
  };

  return (
    <EditorWrapper ref={containerRef}>
      <LexicalComposer initialConfig={initialConfig}>
        <EditorContainer>
          <RichTextPlugin
            contentEditable={<StyledContentEditable />}
            placeholder={<Placeholder>{placeholder}</Placeholder>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <SyncPlugin value={value} onChange={onChange} />
          <FloatingToolbar containerRef={containerRef} />
        </EditorContainer>
      </LexicalComposer>
    </EditorWrapper>
  );
};

// Styled components
const EditorWrapper = styled.div`
  position: relative;
  isolation: isolate;
`;

const EditorContainer = styled.div`
  position: relative;
`;

const StyledContentEditable = styled(ContentEditable)`
  min-height: 60px;
  outline: none;

  font-family: ${typography.body.fontFamily};
  font-weight: ${typography.body.fontWeight};
  font-size: ${typography.body.fontSize};
  line-height: ${typography.body.lineHeight};
  letter-spacing: ${typography.body.letterSpacing};
  color: ${theme.colors.black};

  &:focus {
    background: rgba(0, 0, 0, 0.02);
  }

  .editor-paragraph {
    margin: 0 0 1em 0;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .editor-bold {
    font-weight: 600;
  }

  .editor-italic {
    font-style: italic;
  }

  .editor-underline {
    text-decoration: underline;
  }

  .editor-strikethrough {
    text-decoration: line-through;
  }
`;

const Placeholder = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  color: rgba(0, 0, 0, 0.3);
  pointer-events: none;
  font-family: ${typography.body.fontFamily};
  font-size: ${typography.body.fontSize};
  line-height: ${typography.body.lineHeight};
`;

const Toolbar = styled.div`
  position: absolute;
  z-index: 1000;
  display: flex;
  gap: 2px;
  padding: 4px;
  background: ${theme.colors.black};
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transform: translateX(-50%);

  &::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid ${theme.colors.black};
  }
`;

const FormatButton = styled.button`
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ $active }) => $active ? 'rgba(255, 255, 255, 0.2)' : 'transparent'};
  border: none;
  color: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.primary};
  font-size: 14px;
  cursor: pointer;
  border-radius: 3px;
  transition: background ${theme.transitions.fast};

  &:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  &:active {
    background: rgba(255, 255, 255, 0.25);
  }
`;

export default RichTextEditor;
