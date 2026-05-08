import PropTypes from 'prop-types';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from '@shared/components/Modal';
import { mediaQuery, theme } from '@shared/styles/GlobalStyles';
import { tokens } from './index.jsx';

export const CuratorModalSurface = styled(ModalSurface)`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 0;
  box-shadow: ${tokens.shadows.modal};
  padding: ${tokens.spacing[6]};

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
  }
`;

export const CuratorModalHeader = styled(ModalHeader)`
  border-bottom: ${theme.borders.solidThin} ${theme.colors.black};
  margin-bottom: 0;
  padding: 0 0 ${tokens.spacing[3]} 0;
`;

export const CuratorModalTitle = styled(ModalTitle)`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
  text-transform: uppercase;
`;

export const CuratorModalBody = styled(ModalBody)`
  gap: ${tokens.spacing[4]};
  padding-right: ${tokens.spacing[1]};
`;

export const CuratorModalFooter = styled(ModalFooter)`
  margin-top: ${tokens.spacing[2]};
  border-top: ${theme.borders.solidThin} ${theme.colors.black};
  padding-top: ${tokens.spacing[3]};
`;

export const CuratorModalStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[4]};
`;

export const CuratorModalSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  padding: ${tokens.spacing[3]};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: rgba(0, 0, 0, 0.02);
`;

export const CuratorModalSectionTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

export const CuratorModalHint = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.72);
`;

export const CuratorModalStatus = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$variant'].includes(prop),
})`
  border: ${theme.borders.solidThin} ${({ $variant }) => {
    if ($variant === 'error') return theme.colors.danger;
    if ($variant === 'success') return theme.colors.success;
    return theme.colors.black;
  }};
  background: ${({ $variant }) => {
    if ($variant === 'error') return 'rgba(220, 38, 38, 0.12)';
    if ($variant === 'success') return 'rgba(16, 185, 129, 0.12)';
    return 'rgba(0, 0, 0, 0.03)';
  }};
  color: ${({ $variant }) => {
    if ($variant === 'error') return '#7f1d1d';
    if ($variant === 'success') return '#065f46';
    return theme.colors.black;
  }};
  padding: ${tokens.spacing[3]};

  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    line-height: 1.5;
  }
`;

export default function CuratorModalShell({
  isOpen,
  onClose,
  title,
  size = 'lg',
  children,
  footer,
  align = 'center',
  mobileAlign = 'top',
  labelledBy,
}) {
  if (!isOpen) return null;

  const titleId = labelledBy || 'curator-modal-title';

  return (
    <ModalRoot isOpen={isOpen} onClose={onClose} align={align} mobileAlign={mobileAlign} labelledBy={titleId}>
      <CuratorModalSurface $size={size}>
        <ModalCloseButton />
        {title ? (
          <CuratorModalHeader>
            <CuratorModalTitle id={titleId}>{title}</CuratorModalTitle>
          </CuratorModalHeader>
        ) : null}
        <CuratorModalBody>{children}</CuratorModalBody>
        {footer ? <CuratorModalFooter>{footer}</CuratorModalFooter> : null}
      </CuratorModalSurface>
    </ModalRoot>
  );
}

CuratorModalShell.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  size: PropTypes.string,
  children: PropTypes.node,
  footer: PropTypes.node,
  align: PropTypes.string,
  mobileAlign: PropTypes.string,
  labelledBy: PropTypes.string,
};
