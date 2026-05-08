import React from 'react';
import styled, { keyframes, css } from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

// Pre-defined animation styles to avoid interpolation issues
const spinAnimation = css`animation: ${spin} 0.8s linear infinite;`;

const OverlayContainer = styled.div`
  position: relative;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.xl};
  background: linear-gradient(135deg, rgba(248, 250, 252, 0.95) 0%, rgba(255, 255, 255, 1) 100%);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
`;

const ProgressContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.md};
  max-width: 500px;
  width: 100%;
`;

const ProgressTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.lg};
  font-weight: ${theme.fontWeights.bold};
  color: #0f172a;
  text-align: center;
`;

const ProgressDescription = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.bold};
  color: rgba(15, 23, 42, 0.7);
  text-align: center;
  line-height: 1.6;
  white-space: pre-line;
`;


const AnimatedSpinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid rgba(49, 130, 206, 0.2);
  border-top-color: #3182ce;
  border-radius: 50%;
  ${spinAnimation}
  margin-bottom: ${theme.spacing.md};
  box-shadow: 0 0 20px rgba(49, 130, 206, 0.3);
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-top: ${theme.spacing.md};
`;

const ImportProgressOverlay = ({
  phase = 'fetching',
  platform = null,
  onCancel,
  trackCount = 0
}) => {
  const platformLabels = {
    spotify: 'Spotify',
    apple: 'Apple Music',
    tidal: 'TIDAL',
    qobuz: 'Qobuz',
    soundcloud: 'SoundCloud',
    youtube_music: 'YouTube Music'
  };
  const platformLabel = platform
    ? (platformLabels[platform] || platform.charAt(0).toUpperCase() + platform.slice(1))
    : 'platform';

  return (
    <OverlayContainer>
      <ProgressContent>
        <AnimatedSpinner />
        <ProgressTitle>
          {phase === 'fetching' && `Importing from ${platformLabel}`}
          {phase === 'resolving' && 'Resolving playlist URL'}
          {phase === 'matching' && 'Matching tracks'}
          {phase === 'saving' && platform === 'qobuz' && 'Matching and saving tracks'}
          {phase === 'saving' && platform !== 'qobuz' && 'Importing and linking tracks'}
          {phase === 'linking' && 'Linking tracks'}
        </ProgressTitle>

        <ProgressDescription>
          {phase === 'fetching' && platform !== 'qobuz' && `Takes 1-3 seconds per song so sit tight!`}
          {phase === 'resolving' && 'Fetching playlist information...'}
          {phase === 'matching' && 'Finding track matches in our database...'}
          {phase === 'saving' && platform === 'qobuz' && 'This may take a moment for larger playlists'}
          {phase === 'saving' && platform !== 'qobuz' && 'This can take a sec, be patient!'}
          {phase === 'linking' && trackCount > 0
            ? `Finding matches for ${trackCount} track${trackCount === 1 ? '' : 's'}...`
            : '...'}
        </ProgressDescription>

        {onCancel && (
          <ActionRow>
            <Button variant="fpwhite" onClick={onCancel}>
              Cancel import
            </Button>
          </ActionRow>
        )}
      </ProgressContent>
    </OverlayContainer>
  );
};

export default ImportProgressOverlay;





