import React, { useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const EditorWrapper = styled.div`
  .quill {
    font-family: ${theme.fonts.primary};
  }

  .ql-container {
    border: ${theme.borders.solid} ${theme.colors.black} !important;
    border-top: none !important;
    border-radius: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    min-height: 200px;
    background: ${theme.colors.white};
  }

  .ql-toolbar {
    border: ${theme.borders.solid} ${theme.colors.black} !important;
    border-radius: 0;
    background: ${theme.colors.white};
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px;
  }

  .ql-toolbar .ql-formats {
    margin-right: 8px;
    border-right: 1px solid ${theme.colors.gray[300]};
    padding-right: 8px;
  }
  
  .ql-toolbar .ql-formats:last-child {
    border-right: none;
    padding-right: 0;
  }

  .ql-toolbar button,
  .ql-toolbar .ql-picker {
    width: 32px;
    height: 32px;
  }

  .ql-toolbar button svg,
  .ql-toolbar .ql-picker svg {
    width: 18px;
    height: 18px;
  }
  
  .ql-toolbar button:hover,
  .ql-toolbar button.ql-active {
    background: ${theme.colors.black};
    color: ${theme.colors.white};
  }
  
  .ql-toolbar button:hover svg path,
  .ql-toolbar button.ql-active svg path {
    fill: ${theme.colors.white};
    stroke: ${theme.colors.white};
  }

  .ql-editor {
    min-height: 200px;
    font-family: ${theme.fonts.primary};
    color: ${theme.colors.black};
    text-align: left;
    font-size: 1.125rem;
    line-height: 1.7;
    padding: 20px;
  }

  /* Reduce excessive paragraph spacing in editor */
  .ql-editor p {
    margin-bottom: 1.5em;
    line-height: 1.7;
  }

  .ql-editor p:last-child {
    margin-bottom: 0;
  }

  .ql-editor h1,
  .ql-editor h2,
  .ql-editor h3 {
    font-family: ${theme.fonts.primary};
    font-weight: ${theme.fontWeights.bold};
    color: ${theme.colors.black};
    margin-top: 2em;
    margin-bottom: 0.75em;
    line-height: 1.2;
  }

  .ql-editor h1:first-child,
  .ql-editor h2:first-child,
  .ql-editor h3:first-child {
    margin-top: 0;
  }
  
  .ql-editor h1 {
    font-size: 2.5em;
    letter-spacing: -0.02em;
  }

  .ql-editor h2 {
    font-size: ${theme.fontSizes.h2};
    letter-spacing: -0.02em;
  }

  .ql-editor h3 {
    font-size: ${theme.fontSizes.h3};
    letter-spacing: -0.01em;
  }

  .ql-editor ul,
  .ql-editor ol {
    margin-bottom: 1.5em;
    padding-left: 1.5em;
  }

  .ql-editor ul:last-child,
  .ql-editor ol:last-child {
    margin-bottom: 0;
  }
  
  .ql-editor li {
    margin-bottom: 0.5em;
    line-height: 1.6;
  }

  /* Prevent double spacing from empty paragraphs */
  .ql-editor p:empty {
    display: none;
  }

  .ql-editor br {
    content: '';
    display: block;
    margin-bottom: 0.25em;
  }

  .ql-editor.ql-blank::before {
    color: ${theme.colors.gray[400]};
    font-style: italic;
    font-family: ${theme.fonts.primary};
    text-align: left;
    left: 20px;
    right: 20px;
  }

  /* Text selection/highlight styling */
  .ql-editor ::selection {
    background-color: ${theme.colors.black};
    color: ${theme.colors.white};
  }

  .ql-editor ::-moz-selection {
    background-color: ${theme.colors.black};
    color: ${theme.colors.white};
  }

  /* Mobile: compact toolbar */
  @media (max-width: ${theme.breakpoints.mobile}) {
    .ql-toolbar {
      gap: 4px;
      padding: 8px;
    }

    .ql-toolbar .ql-formats {
      margin-right: 4px;
      padding-right: 4px;
    }

    .ql-toolbar button,
    .ql-toolbar .ql-picker {
      width: 30px;
      height: 30px;
      padding: 4px;
    }

    .ql-editor {
      text-align: left;
      font-size: 1rem;
      padding: 16px;
    }

    .ql-editor.ql-blank::before {
      text-align: left;
      left: 16px;
    }
  }
`;

const RichTextEditor = ({ value, onChange, placeholder = 'Enter description...' }) => {
  const modules = useMemo(
    () => ({
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean'],
      ],
    }),
    []
  );

  const formats = [
    'header',
    'bold',
    'italic',
    'underline',
    'list',
    'bullet',
    'link',
  ];

  return (
    <EditorWrapper>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
      />
    </EditorWrapper>
  );
};

export default RichTextEditor;
