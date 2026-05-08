import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const EditorWrapper = styled.div`
  border: 1px solid ${theme.colors.black};
  background: white;
  transition: all ${theme.transitions.normal};

  &:focus-within {
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
  }
`;

const MenuBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: ${theme.colors.white};
  border-bottom: 1px solid ${theme.colors.black};
  align-items: center;
`;

const MenuGroup = styled.div`
  display: flex;
  gap: 4px;
  padding: 0 8px;
  border-right: 1px solid ${theme.colors.gray[300]};

  &:last-child {
    border-right: none;
  }

  &:first-child {
    padding-left: 0;
  }
`;

const MenuButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['isActive'].includes(prop)
})`
  padding: 6px 10px;
  background: ${props => props.isActive ? theme.colors.black : 'transparent'};
  color: ${props => props.isActive ? theme.colors.white : theme.colors.black};
  border: 1px solid ${props => props.isActive ? theme.colors.black : 'transparent'};
  border-radius: 4px;
  cursor: pointer;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: 500;
  transition: all ${theme.transitions.fast};
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: ${props => props.isActive ? theme.colors.black : theme.colors.gray[100]};
  }
`;

const ColorInput = styled.input`
  width: 32px;
  height: 32px;
  border: 1px solid ${theme.colors.gray[300]};
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  background: none;

  &:hover {
    border-color: ${theme.colors.black};
  }
`;

const EditorContainer = styled.div`
  .ProseMirror {
    min-height: 300px;
    max-height: 600px;
    overflow-y: auto;
    padding: 30px;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    line-height: 1.7;
    color: ${theme.colors.black};
    outline: none;

    &::-webkit-scrollbar {
      width: 8px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: ${theme.colors.gray[300]};
      border-radius: 4px;

      &:hover {
        background: ${theme.colors.gray[500]};
      }
    }

    > * + * {
      margin-top: 1.5em;
    }

    p {
      margin: 0 0 1.5em 0;
      line-height: 1.7;
      font-size: 1.125rem;
    }

    h1, h2, h3, h4 {
      font-family: ${theme.fonts.primary};
      font-weight: ${theme.fontWeights.bold};
      color: ${theme.colors.black};
      line-height: 1.2;
      margin: 2em 0 0.75em 0;
      
      &:first-child {
        margin-top: 0;
      }
    }

    h1 {
      font-size: 2.5em; /* Fallback/Relative */
      letter-spacing: -0.02em;
    }

    h2 {
      font-size: ${theme.fontSizes.h2};
      letter-spacing: -0.02em;
    }

    h3 {
      font-size: ${theme.fontSizes.h3};
      letter-spacing: -0.01em;
    }
    
    h4 {
      font-size: ${theme.fontSizes.hx};
    }

    ul, ol {
      padding-left: 1.5em;
      margin: 0 0 1.5em 0;
    }

    li {
      margin-bottom: 0.5em;
      line-height: 1.6;
      font-size: 1.125rem;
    }

    code {
      font-family: ${theme.fonts.mono};
      font-size: 0.9em;
      background: ${theme.colors.gray[100]};
      padding: 2px 5px;
      border-radius: 3px;
      color: ${theme.colors.black};
    }

    pre {
      background: ${theme.colors.black};
      color: ${theme.colors.white};
      padding: ${theme.spacing.lg};
      border-radius: ${theme.radii.md};
      overflow-x: auto;
      margin: 2em 0;

      code {
        background: none;
        color: inherit;
        padding: 0;
        font-size: 0.875em;
      }
    }

    blockquote {
      margin: 2em 0;
      padding: 0 0 0 1.5em;
      border-left: 4px solid ${theme.colors.black};
      font-style: italic;
      color: ${theme.colors.black};
      font-size: 1.25rem;
      line-height: 1.5;

      p {
        margin-bottom: 0.5em;
      }
    }

    hr {
      border: none;
      border-top: 1px solid ${theme.colors.gray[300]};
      margin: 3em 0;
    }

    a {
      color: ${theme.colors.black};
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 3px;
      cursor: pointer;

      &:hover {
        opacity: 0.6;
      }
    }

    img {
      max-width: 100%;
      height: auto;
      border-radius: ${theme.radii.sm};
      margin: 2em 0;
    }
    
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 2em 0;
    }
    
    th, td {
      border: 1px solid ${theme.colors.gray[300]};
      padding: 8px 12px;
      text-align: left;
    }
    
    th {
      background: ${theme.colors.gray[100]};
      font-weight: bold;
    }

    &.ProseMirror-focused {
      outline: none;
    }
  }

  .ProseMirror p.is-editor-empty:first-child::before {
    color: ${theme.colors.gray[400]};
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
    font-style: italic;
  }
`;

const TipTapEditor = ({ value, onChange, placeholder = 'Start writing...' }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'editor-image',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Subscript,
      Superscript,
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        'data-placeholder': placeholder,
      },
    },
  });

  const addLink = useCallback(() => {
    const url = window.prompt('Enter URL');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const addImage = useCallback(() => {
    const url = window.prompt('Enter image URL');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <EditorWrapper>
      <MenuBar>
        {/* Text Formatting */}
        <MenuGroup>
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="Bold"
          >
            <strong>B</strong>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title="Italic"
          >
            <em>I</em>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive('underline')}
            title="Underline"
          >
            <u>U</u>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
            title="Strikethrough"
          >
            <s>S</s>
          </MenuButton>
        </MenuGroup>

        {/* Headings */}
        <MenuGroup>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            H1
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            H2
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            H3
          </MenuButton>
        </MenuGroup>

        {/* Text Alignment */}
        <MenuGroup>
          <MenuButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            isActive={editor.isActive({ textAlign: 'left' })}
            title="Align Left"
          >
            ⇤
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            isActive={editor.isActive({ textAlign: 'center' })}
            title="Align Center"
          >
            ⇋
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            isActive={editor.isActive({ textAlign: 'right' })}
            title="Align Right"
          >
            ⇥
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            isActive={editor.isActive({ textAlign: 'justify' })}
            title="Justify"
          >
            ≡
          </MenuButton>
        </MenuGroup>

        {/* Lists */}
        <MenuGroup>
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="Bullet List"
          >
            •
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="Numbered List"
          >
            1.
          </MenuButton>
        </MenuGroup>

        {/* Advanced Formatting */}
        <MenuGroup>
          <MenuButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            title="Blockquote"
          >
            "
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive('codeBlock')}
            title="Code Block"
          >
            {'<>'}
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Rule"
          >
            ―
          </MenuButton>
        </MenuGroup>

        {/* Script */}
        <MenuGroup>
          <MenuButton
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            isActive={editor.isActive('subscript')}
            title="Subscript"
          >
            X₂
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            isActive={editor.isActive('superscript')}
            title="Superscript"
          >
            X²
          </MenuButton>
        </MenuGroup>

        {/* Colors */}
        <MenuGroup>
          <ColorInput
            type="color"
            onInput={(e) => editor.chain().focus().setColor(e.target.value).run()}
            value={editor.getAttributes('textStyle').color || '#000000'}
            title="Text Color"
          />
          <ColorInput
            type="color"
            onInput={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
            value={editor.getAttributes('highlight').color || '#fef08a'}
            title="Highlight Color"
          />
        </MenuGroup>

        {/* Insert Elements */}
        <MenuGroup>
          <MenuButton onClick={addLink} title="Add Link">
            🔗
          </MenuButton>
          <MenuButton onClick={addImage} title="Add Image">
            🖼
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="Insert Table"
          >
            ⊞
          </MenuButton>
        </MenuGroup>

        {/* Clear Formatting */}
        <MenuGroup>
          <MenuButton
            onClick={() => editor.chain().focus().unsetAllMarks().run()}
            title="Clear Formatting"
          >
            ✕
          </MenuButton>
        </MenuGroup>
      </MenuBar>

      <EditorContainer>
        <EditorContent editor={editor} />
      </EditorContainer>
    </EditorWrapper>
  );
};

export default TipTapEditor;
