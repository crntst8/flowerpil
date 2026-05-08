import React, { useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import PlatformIcon from '@shared/components/PlatformIcon';

const InlineEditorRow = styled.div`
  display: grid;
  grid-template-columns: 2.8fr 1.6fr 1fr 1fr 1.4fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  border-bottom: ${theme.borders.solidThin} ${theme.colors.borderGray};
  align-items: center;
  background: ${props => props.$editing ? theme.colors.gray[50] : 'transparent'};
  transition: background ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.gray[50]};
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.xs};
  }
`;

const QuickEditField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const Label = styled.label`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.textGray};
  font-family: ${theme.fonts.mono};
`;

const InputGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  align-items: center;
`;

const Input = styled.input`
  flex: 1;
  padding: ${theme.spacing.sm};
  background: ${theme.colors.focusoutText};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  &:focus {
    outline: none;
    background: ${theme.colors.focusinText};
    border-color: ${theme.colors.primary};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ActionButton = styled.button`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  background: ${props => {
    if (props.$variant === 'danger') return theme.colors.danger;
    if (props.$variant === 'primary') return theme.colors.primary;
    if (props.$variant === 'success') return theme.colors.success;
    return theme.colors.action;
  }};
  color: ${props => {
    if (props.$variant === 'danger') return theme.colors.white;
    if (props.$variant === 'primary' || props.$variant === 'success') return theme.colors.white;
    return theme.colors.black;
  }};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${props => {
      if (props.$variant === 'danger') return theme.colors.hoverDanger;
      if (props.$variant === 'primary') return theme.colors.hoverPrimary;
      if (props.$variant === 'success') return theme.colors.success;
      return theme.colors.hoverAction;
    }};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const AppleMusicButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$hasUrl'
})`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${props => props.$hasUrl ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)'};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  box-shadow: ${props => props.$hasUrl 
    ? '0 0 8px rgba(34, 197, 94, 0.4), 0 0 16px rgba(34, 197, 94, 0.2)' 
    : '0 0 8px rgba(234, 179, 8, 0.4), 0 0 16px rgba(234, 179, 8, 0.2)'};

  &:hover:not(:disabled) {
    background: ${props => props.$hasUrl 
      ? 'rgba(34, 197, 94, 0.2)' 
      : 'rgba(234, 179, 8, 0.2)'};
    box-shadow: ${props => props.$hasUrl 
      ? '0 0 12px rgba(34, 197, 94, 0.6), 0 0 24px rgba(34, 197, 94, 0.3)' 
      : '0 0 12px rgba(234, 179, 8, 0.6), 0 0 24px rgba(234, 179, 8, 0.3)'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StatusBadge = styled.span`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  background: ${props => {
    if (props.$status === 'completed') return theme.colors.stateSaved;
    if (props.$status === 'failed') return theme.colors.dangerBG;
    if (props.$status === 'pending' || props.$status === 'in_progress') return theme.colors.yellow;
    return theme.colors.gray[100];
  }};
  color: ${props => {
    if (props.$status === 'completed') return theme.colors.success;
    if (props.$status === 'failed') return theme.colors.danger;
    return theme.colors.black;
  }};
  border: ${theme.borders.solidThin} ${theme.colors.borderGray};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border-radius: 3px;
  white-space: nowrap;
`;

const WarningBadge = styled.div`
  padding: ${theme.spacing.xs};
  background: ${theme.colors.warning};
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border-radius: 3px;
  margin-top: ${theme.spacing.xs};
`;

const StaticText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const ActionsColumn = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: ${theme.spacing.md};
`;

const ModalContent = styled.div`
  background: ${theme.colors.fpwhite};
  border-radius: 12px;
  padding: ${theme.spacing.lg};
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
`;

const ModalHeader = styled.h3`
  margin: 0 0 ${theme.spacing.md} 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.medium};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const ModalActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
  margin-top: ${theme.spacing.md};
`;

export const PlaylistInlineEditor = ({
  playlist,
  onSave,
  onCancel,
  onOpenModal,
  onOpenExportModal,
  onDelete
}) => {
  const [showAppleModal, setShowAppleModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [appleUrl, setAppleUrl] = useState(playlist.apple_url || '');
  const [error, setError] = useState(null);

  const handleOpenAppleModal = () => {
    setAppleUrl(playlist.apple_url || '');
    setError(null);
    setShowAppleModal(true);
  };

  const handleCloseAppleModal = () => {
    setShowAppleModal(false);
    setAppleUrl(playlist.apple_url || '');
    setError(null);
  };

  const handleSaveAppleUrl = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await onSave(playlist.id, {
        apple_url: appleUrl,
        updated_at: playlist.updated_at
      });
      setShowAppleModal(false);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveAppleUrl();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCloseAppleModal();
    }
  };

  const handleOpenExportModal = () => {
    if (onOpenExportModal) {
      onOpenExportModal(playlist);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const confirmed = window.confirm(`Delete playlist "${playlist.title}"? This action cannot be undone.`);
    if (!confirmed) return;
    
    try {
      await onDelete(playlist.id);
    } catch (err) {
      alert(err.message || 'Failed to delete playlist');
    }
  };

  const renderExportStatus = () => {
    if (!playlist.export_status) {
      return <StatusBadge $status="none">No exports</StatusBadge>;
    }

    const statusMap = {
      completed: 'Exported',
      failed: 'Failed',
      pending: 'Queued',
      in_progress: 'Exporting',
      auth_required: 'Auth needed'
    };

    return (
      <StatusBadge $status={playlist.export_status}>
        {statusMap[playlist.export_status] || playlist.export_status}
      </StatusBadge>
    );
  };

  const hasAppleUrl = Boolean(playlist.apple_url?.trim());

  return (
    <>
      <InlineEditorRow>
        <StaticText>{playlist.title}</StaticText>
        <StaticText>{playlist.curator_name}</StaticText>
        <StaticText>{playlist.track_count || 0}</StaticText>
        <div>
          {renderExportStatus()}
        </div>
        <ActionsColumn>
          <AppleMusicButton 
            $hasUrl={hasAppleUrl}
            onClick={handleOpenAppleModal}
            title={hasAppleUrl ? 'Edit Apple Music URL' : 'Add Apple Music URL'}
          >
            <span>+</span>
            <PlatformIcon platform="apple" size={16} inline />
          </AppleMusicButton>
          {playlist.published && (
            <ActionButton onClick={handleOpenExportModal} $variant="primary">
              Export
            </ActionButton>
          )}
          {onOpenModal && (
            <ActionButton onClick={() => onOpenModal(playlist.id)}>
              Edit All
            </ActionButton>
          )}
          {onDelete && (
            <ActionButton onClick={handleDelete} $variant="danger">
              Delete
            </ActionButton>
          )}
        </ActionsColumn>
      </InlineEditorRow>

      {showAppleModal && (
        <ModalOverlay onClick={handleCloseAppleModal}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>Apple Music URL</ModalHeader>
            <QuickEditField>
              <Label>URL</Label>
              <Input
                type="text"
                value={appleUrl}
                onChange={(e) => setAppleUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://music.apple.com/..."
                disabled={isSaving}
                autoFocus
              />
              {error && <WarningBadge>{error}</WarningBadge>}
            </QuickEditField>
            <ModalActions>
              <ActionButton
                onClick={handleSaveAppleUrl}
                disabled={isSaving}
                $variant="success"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </ActionButton>
              <ActionButton
                onClick={handleCloseAppleModal}
                disabled={isSaving}
                $variant="danger"
              >
                Cancel
              </ActionButton>
            </ModalActions>
          </ModalContent>
        </ModalOverlay>
      )}
    </>
  );
};

export default PlaylistInlineEditor;
