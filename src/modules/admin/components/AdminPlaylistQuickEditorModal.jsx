import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import AdminPlaylistQuickEditor from './AdminPlaylistQuickEditor.jsx';

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 1100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: ${theme.spacing.lg};
  overflow-y: auto;

  @media (max-width: ${theme.breakpoints.tablet}) {
    padding: ${theme.spacing.md};
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.sm};
  }
`;

const ModalContent = styled.div`
  width: 100%;
  max-width: 1400px;
  margin: ${theme.spacing.xl} auto;
  position: relative;

  @media (max-width: ${theme.breakpoints.mobile}) {
    margin: ${theme.spacing.md} auto;
  }
`;

const CloseButton = styled.button`
  position: sticky;
  top: ${theme.spacing.md};
  right: 0;
  margin-left: auto;
  margin-bottom: ${theme.spacing.md};
  display: block;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  z-index: 10;

  &:hover {
    background: ${theme.colors.danger};
    border-color: ${theme.colors.danger};
    color: ${theme.colors.fpwhite};
  }
`;

const AdminPlaylistQuickEditorModal = ({ isOpen, playlistId, onClose, onSaved }) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSaved = (playlist) => {
    if (onSaved) {
      onSaved(playlist);
    }
    // Auto-close modal after successful save
    // Uncomment if you want auto-close behavior:
    // setTimeout(() => onClose(), 1500);
  };

  return (
    <ModalOverlay onClick={handleOverlayClick}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <CloseButton onClick={onClose}>
          Close Editor
        </CloseButton>
        <AdminPlaylistQuickEditor
          playlistId={playlistId}
          onSaved={handleSaved}
          onCancel={onClose}
        />
      </ModalContent>
    </ModalOverlay>
  );
};

export default AdminPlaylistQuickEditorModal;
