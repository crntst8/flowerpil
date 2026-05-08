import React from 'react';
import styled from 'styled-components';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import { ModalRoot, ModalSurface, ModalHeader, ModalTitle, ModalBody, ModalCloseButton } from '@shared/components/Modal/Modal';
import { theme } from '@shared/styles/GlobalStyles';

const QRWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${theme.spacing.lg};
  background: ${theme.colors.white};
`;

const QRCodeModal = ({ url, onClose, title = 'Scan QR Code' }) => {
  return (
    <ModalRoot isOpen={true} onClose={onClose}>
      <ModalSurface $size="xs">
        <ModalCloseButton onClick={onClose} />
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <QRWrapper>
            <QRCode value={url} size={256} />
          </QRWrapper>
        </ModalBody>
      </ModalSurface>
    </ModalRoot>
  );
};

export default QRCodeModal;
