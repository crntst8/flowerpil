import PropTypes from 'prop-types';
import styled from 'styled-components';
import { Button, tokens, theme } from './ui/index.jsx';
import CuratorModalShell, {
  CuratorModalHint,
  CuratorModalSection,
  CuratorModalSectionTitle,
  CuratorModalStack,
  CuratorModalStatus,
} from './ui/CuratorModalShell.jsx';

const Hero = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: ${tokens.spacing[3]};
  align-items: center;
`;

const Logo = styled.img`
  width: 64px;
  height: 64px;
  object-fit: contain;
`;

const HeroTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  letter-spacing: -0.03em;
`;

const HeroText = styled.p`
  margin: ${tokens.spacing[1]} 0 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  line-height: 1.5;
`;

const StepList = styled.ol`
  margin: 0;
  padding-left: ${tokens.spacing[4]};
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};

  li {
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.small};
    line-height: 1.5;
  }
`;

export default function FirstVisitBioModal({ isOpen, onClose }) {
  return (
    <CuratorModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Pil.bio quick start"
      size="md"
      footer={<Button $variant="primary" onClick={onClose}>Start editing</Button>}
    >
      <CuratorModalStack>
        <Hero>
          <Logo src="/logo-nobg.png" alt="Flowerpil" />
          <div>
            <HeroTitle>Pil.bio is your public link hub.</HeroTitle>
            <HeroText>
              Add links, preview changes, then publish when you are ready.
            </HeroText>
          </div>
        </Hero>

        <CuratorModalSection>
          <CuratorModalSectionTitle>How it works</CuratorModalSectionTitle>
          <StepList>
            <li>Add featured links and update colors/layout.</li>
            <li>Use preview to verify mobile and desktop.</li>
            <li>Publish to make it live at your `name.pil.bio` URL.</li>
          </StepList>
        </CuratorModalSection>

        <CuratorModalSection>
          <CuratorModalSectionTitle>Publishing note</CuratorModalSectionTitle>
          <CuratorModalHint>
            Your draft changes are private until you publish.
          </CuratorModalHint>
        </CuratorModalSection>

        <CuratorModalStatus>
          <p>Pil.bio is still evolving. Share feedback so we can prioritize improvements.</p>
        </CuratorModalStatus>
      </CuratorModalStack>
    </CuratorModalShell>
  );
}

FirstVisitBioModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
};
