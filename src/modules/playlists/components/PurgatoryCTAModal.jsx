import { useCallback } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalBody,
  ModalCloseButton,
} from '@shared/components/Modal';
import { theme } from '@shared/styles/GlobalStyles';

const SNOOZE_KEY = 'fp:purgatory-cta:snoozeUntil';
const SNOOZE_HOURS = 24;

/**
 * Check if the purgatory CTA modal should be shown
 * (returns false if user dismissed within the snooze period)
 */
export const shouldShowPurgatoryCTA = () => {
  const snoozeUntil = localStorage.getItem(SNOOZE_KEY);
  if (!snoozeUntil) return true;
  return Date.now() > parseInt(snoozeUntil, 10);
};

const CTASurface = styled(ModalSurface)`
  --modal-surface-padding: clamp(1.5rem, 4vw, 2rem);
  --modal-surface-gap: clamp(0.75rem, 3vw, 1rem);
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: clamp(12px, 3vw, 18px);
  max-width: 420px;
  width: 100%;
  text-align: center;
`;

const CloseButton = styled(ModalCloseButton)`
  background: rgba(0, 0, 0, 0.05);
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.35);
  color: ${theme.colors.black};

  &:hover {
    background: rgba(0, 0, 0, 0.12);
  }
`;

const Body = styled(ModalBody)`
  gap: clamp(1rem, 3vw, 1.5rem);
  align-items: center;
`;

const Title = styled.h2`
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.25rem, 3vw, 1.5rem);
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  margin: 0;
  line-height: 1.3;
`;

const Message = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.black};
  line-height: 1.6;
  margin: 0;
`;

const DismissButton = styled.button`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: ${theme.spacing.md} ${theme.spacing.xl};
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.darkGrey};
  }
`;

const PurgatoryCTAModal = ({ isOpen, onClose }) => {
  const handleDismiss = useCallback(() => {
    const snoozeUntil = Date.now() + SNOOZE_HOURS * 60 * 60 * 1000;
    localStorage.setItem(SNOOZE_KEY, snoozeUntil.toString());
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <ModalRoot isOpen={isOpen} onClose={handleDismiss}>
      <CTASurface>
        <CloseButton onClick={handleDismiss} />
        <Body>
          <Title>want to make playlists?</Title>
          <Message>
            we&apos;ve sent a referral code to your inbox (check junk if not there).
          </Message>
          <DismissButton onClick={handleDismiss}>
            got it
          </DismissButton>
        </Body>
      </CTASurface>
    </ModalRoot>
  );
};

PurgatoryCTAModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default PurgatoryCTAModal;
