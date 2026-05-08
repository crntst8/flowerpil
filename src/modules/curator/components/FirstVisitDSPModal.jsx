import PropTypes from 'prop-types';
import styled from 'styled-components';
import PlatformIcon from '@shared/components/PlatformIcon';
import { Button, tokens, theme, mediaQuery } from './ui/index.jsx';
import CuratorModalShell, {
  CuratorModalHint,
  CuratorModalSection,
  CuratorModalSectionTitle,
  CuratorModalStack,
} from './ui/CuratorModalShell.jsx';

const Hero = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: ${tokens.spacing[3]};
  align-items: center;

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }
`;

const Logo = styled.img`
  width: 72px;
  height: 72px;
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

const FlowRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${tokens.spacing[2]};
  flex-wrap: wrap;
  padding: ${tokens.spacing[3]};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
`;

const FlowNode = styled.span`
  width: 44px;
  height: 44px;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${theme.colors.fpwhite};
`;

const FlowArrow = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  opacity: 0.8;
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${tokens.spacing[3]};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

const PlatformRow = styled.div`
  display: flex;
  gap: ${tokens.spacing[2]};
  align-items: center;
  flex-wrap: wrap;
`;

const InfoText = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  line-height: 1.6;
`;

export default function FirstVisitDSPModal({ isOpen, onClose, onNavigateToDSP }) {
  const handleConfigure = () => {
    if (onNavigateToDSP) {
      onNavigateToDSP();
    }
    onClose();
  };

  return (
    <CuratorModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Connect your DSP workflow"
      size="lg"
      footer={(
        <>
          <Button $variant="default" onClick={onClose}>Skip for now</Button>
          <Button $variant="primary" onClick={handleConfigure}>Configure DSP settings</Button>
        </>
      )}
    >
      <CuratorModalStack>
        <Hero>
          <Logo src="/logo-nobg.png" alt="Flowerpil" />
          <div>
            <HeroTitle>Import once, export anywhere.</HeroTitle>
            <HeroText>
              Connect your accounts now or keep using Flowerpil defaults. You can change this later in DSP Settings.
            </HeroText>
          </div>
        </Hero>

        <FlowRow aria-label="workflow preview">
          <FlowNode><PlatformIcon platform="spotify" size={24} /></FlowNode>
          <FlowArrow>→</FlowArrow>
          <FlowNode><img src="/logo.png" alt="Flowerpil" width="24" height="24" /></FlowNode>
          <FlowArrow>→</FlowArrow>
          <FlowNode><PlatformIcon platform="apple" size={22} /></FlowNode>
          <FlowNode><PlatformIcon platform="tidal" size={22} /></FlowNode>
          <FlowNode><PlatformIcon platform="instagram" size={22} /></FlowNode>
        </FlowRow>

        <Columns>
          <CuratorModalSection>
            <CuratorModalSectionTitle>Connect directly</CuratorModalSectionTitle>
            <CuratorModalHint>Use your own credentials for Apple Music and TIDAL exports.</CuratorModalHint>
            <PlatformRow>
              <PlatformIcon platform="apple" size={30} />
              <PlatformIcon platform="tidal" size={30} />
            </PlatformRow>
          </CuratorModalSection>

          <CuratorModalSection>
            <CuratorModalSectionTitle>Paste URLs anytime</CuratorModalSectionTitle>
            <CuratorModalHint>Import from public links even before connecting accounts.</CuratorModalHint>
            <PlatformRow>
              <PlatformIcon platform="spotify" size={30} />
              <PlatformIcon platform="youtube" size={30} />
              <img src="/assets/playlist-actions/qobiz.png" alt="Qobuz" width="30" height="30" />
              <img src="/assets/playlist-actions/soundcloud.svg" alt="SoundCloud" width="30" height="30" />
            </PlatformRow>
          </CuratorModalSection>
        </Columns>

        <CuratorModalSection>
          <CuratorModalSectionTitle>Default export behavior</CuratorModalSectionTitle>
          <InfoText>
            Exports use Flowerpil-managed accounts by default. Spotify and YouTube always use Flowerpil accounts due to API constraints.
          </InfoText>
        </CuratorModalSection>
      </CuratorModalStack>
    </CuratorModalShell>
  );
}

FirstVisitDSPModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onNavigateToDSP: PropTypes.func,
};
