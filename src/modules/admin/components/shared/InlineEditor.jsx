import { useState } from 'react';
import styled from 'styled-components';
import { theme, Input, Button } from '@shared/styles/GlobalStyles';

const EditorContainer = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  width: 100%;
`;

const EditorInput = styled(Input)`
  flex: 1;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const EditorActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-shrink: 0;
`;

const DisplayValue = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
`;

const ValueText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  flex: 1;
`;

const EditButton = styled.button`
  background: transparent;
  border: none;
  padding: ${theme.spacing.xs};
  cursor: pointer;
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  opacity: 0;
  transition: opacity 0.2s ease;

  ${DisplayValue}:hover & {
    opacity: 1;
  }

  &:hover {
    color: ${theme.colors.black};
  }
`;

const InlineEditor = ({
  value,
  onSave,
  onCancel,
  placeholder = 'Enter value...',
  isEditing: controlledEditing,
  onEditingChange,
  autoFocus = true
}) => {
  const [localEditing, setLocalEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  const isEditing = controlledEditing !== undefined ? controlledEditing : localEditing;
  const setIsEditing = onEditingChange || setLocalEditing;

  const handleEdit = () => {
    setDraft(value || '');
    setIsEditing(true);
  };

  const handleSave = () => {
    onSave(draft);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(value || '');
    setIsEditing(false);
    onCancel?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <EditorContainer>
        <EditorInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
        <EditorActions>
          <Button onClick={handleSave} disabled={!draft.trim()}>
            Save
          </Button>
          <Button onClick={handleCancel}>
            Cancel
          </Button>
        </EditorActions>
      </EditorContainer>
    );
  }

  return (
    <DisplayValue onClick={handleEdit}>
      <ValueText>{value || placeholder}</ValueText>
      <EditButton onClick={(e) => { e.stopPropagation(); handleEdit(); }}>
        ✎
      </EditButton>
    </DisplayValue>
  );
};

export default InlineEditor;
