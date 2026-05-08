import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalBody,
  ModalTitle,
  ModalCloseButton,
} from '@shared/components/Modal';
import { theme } from '@shared/styles/GlobalStyles';

const SignupSurface = styled(ModalSurface)`
  --modal-surface-padding: 0;
  --modal-surface-gap: 0;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  max-width: 560px;
  width: 100%;
  overflow: hidden;
`;

const CloseButton = styled(ModalCloseButton)`
  color: ${theme.colors.fpwhite};

`;

const Hero = styled.header`
  background: linear-gradient(135deg, #111111 0%, #1e1e1e 100%);
  color: ${theme.colors.fpwhite};
  padding: clamp(1.5rem, 4vw, 2.25rem);
  border-bottom: ${theme.borders.solid} ${theme.colors.black};
`;

const HeroTop = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
`;

const Logo = styled.img`
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: brightness(0) invert(1);
`;

const Eyebrow = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.85;
`;

const Heading = styled(ModalTitle)`
  margin: 0;
  color: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.4rem, 4vw, 1.9rem);
  line-height: 1.15;
`;

const Description = styled.p`
  margin: ${theme.spacing.sm} 0 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.88);
`;

const Body = styled(ModalBody)`
  padding: clamp(1.25rem, 3vw, 1.75rem);
  display: grid;
  gap: ${theme.spacing.md};
`;

const PrimaryButton = styled.button`
  width: 100%;
  min-height: 48px;
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: transform ${theme.transitions.fast}, opacity ${theme.transitions.fast};

  &:hover {
    transform: translateY(-1px);
    opacity: 0.95;
  }

  &:active {
    transform: translateY(0);
  }
`;

const SignupModal = ({ isOpen, onClose, onSuccess }) => {
  const navigate = useNavigate();

  const handleGoToSignup = useCallback(() => {
    onSuccess?.();
    onClose?.();
    navigate('/signup');
  }, [navigate, onClose, onSuccess]);

  if (!isOpen) {
    return null;
  }

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      align="center"
      labelledBy="signup-modal-title"
      overlayProps={{
        $backdrop: 'rgba(0, 0, 0, 0.74)',
        $backdropBlur: 'blur(6px)',
      }}
    >
      <SignupSurface size="sm">
        <CloseButton aria-label="Close signup modal" />
        <Hero>
          <HeroTop>
            <Logo src="/logo-nobg.png" alt="Flowerpil" />
            <Eyebrow> </Eyebrow>
          </HeroTop>
          <Heading id="signup-modal-title">sign up to save playlists</Heading>
          <Description>
            doesnt take too long, not trying to sell you anything!
          </Description>
        </Hero>
        <Body>
          <PrimaryButton type="button" onClick={handleGoToSignup}>
            Go to Signup
          </PrimaryButton>
        </Body>
      </SignupSurface>
    </ModalRoot>
  );
};

export default SignupModal;
