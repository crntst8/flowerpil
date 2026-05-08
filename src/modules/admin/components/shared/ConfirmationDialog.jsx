import React from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: ${theme.spacing.md};
  animation: fadeIn 0.2s ease;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const Dialog = styled.div`
  background: ${theme.colors.fpwhite};
  border-radius: 12px;
  padding: ${theme.spacing.xl};
  max-width: 500px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.2s ease;

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;

const DialogTitle = styled.h3`
  margin: 0 0 ${theme.spacing.md} 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.medium};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const DialogMessage = styled.p`
  margin: 0 0 ${theme.spacing.lg} 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  line-height: 1.6;
`;

const DialogActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
  flex-wrap: wrap;
`;

const ConfirmationDialog = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger' }) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <Overlay onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <Dialog>
        <DialogTitle id="dialog-title">{title}</DialogTitle>
        <DialogMessage>{message}</DialogMessage>
        <DialogActions>
          <Button variant="secondary" size="small" onClick={onClose}>
            {cancelText}
          </Button>
          <Button variant={variant} size="small" onClick={onConfirm}>
            {confirmText}
          </Button>
        </DialogActions>
      </Dialog>
    </Overlay>
  );
};

export default ConfirmationDialog;

